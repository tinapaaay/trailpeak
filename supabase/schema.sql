-- TrailPeak light backend: accounts, trips, dates and bookings.
-- Direct DP receipts are recorded by organizers; TrailPeak does not move money.
-- Organizers and ID checks are approved by hand; see supabase/SETUP.md.
-- Run this in the Supabase SQL editor, then run seed.sql. Safe to run again after changes.
--
-- Privacy model (Row Level Security):
--   * Everyone can read published trips and their dates.
--   * You can read and change only your own profile, and never your own organizer or
--     verification status (only the owner can approve those).
--   * Joiners see only their own bookings; organizers see bookings on their own trips.
--   * Bookings are created, moved and cancelled only through the functions below,
--     which check slots and the cancellation policy on the server.
--   * "Who's going" shows first name + last initial of opted-in joiners, and only
--     to people who are booked on the same date. Phone numbers never leave the organizer.
--   * Reviews: one per booking, written after the trip date by the joiner who went.
--     Everyone sees the stars, text and "Ana R."; never who wrote it beyond that.

-- ---------------------------------------------------------------------------
-- Profiles: one per account
-- ---------------------------------------------------------------------------
-- Who may change what (TP-001):
--   * You can edit your own name, phone, organizer name and payout.
--   * role, id_verified, business and organizer_status are status fields. Nobody can set
--     them on their own profile: not the website, not a direct API call. Organizer sign-up
--     calls apply_as_organizer(), which only marks the application "pending".
--   * The owner approves or revokes organizers in the Supabase SQL editor with
--     approve_organizer() and revoke_organizer() (see supabase/SETUP.md).
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  name         text not null default '',
  phone        text,
  role         text not null default 'joiner' check (role in ('joiner', 'organizer')),
  org          text,
  id_verified  boolean not null default false,   -- set only by the owner after checking an ID
  business     text not null default 'none' check (business in ('none', 'review', 'verified')),
  payout       jsonb,                              -- { wallet, number }
  created_at   timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- Organizer applications (added Nov 2026, TP-001). none -> pending (applied) -> approved,
-- or revoked. `application` keeps what the applicant told us: { idType, businessDocs, dot }.
-- The first time this runs on an older database it also undoes the old shortcut, where
-- sign-up made people organizers and "ID verified" on the spot: those organizers go back
-- to pending, and every simulated ID or business check is cleared. Later runs skip this.
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'profiles' and column_name = 'organizer_status') then
    alter table public.profiles
      add column organizer_status text not null default 'none'
        check (organizer_status in ('none', 'pending', 'approved', 'revoked')),
      add column application jsonb,
      add column applied_at timestamptz;
    update public.profiles
       set organizer_status = case when role = 'organizer' then 'pending' else 'none' end,
           applied_at       = case when role = 'organizer' then created_at end,
           role = 'joiner', id_verified = false, business = 'none';
  end if;
end $$;

drop policy if exists "Read own profile" on public.profiles;
create policy "Read own profile" on public.profiles
  for select using (auth.uid() = id);
drop policy if exists "Create own profile" on public.profiles;
create policy "Create own profile" on public.profiles
  for insert with check (auth.uid() = id);
drop policy if exists "Update own profile" on public.profiles;
create policy "Update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Second lock on the status fields. The column grants at the end of this file already stop
-- the website's roles from writing them; this trigger also stops them if a grant is ever
-- widened by mistake. The owner's SQL editor, the service role and the functions below
-- (which run as the table owner) are not the website's roles, so they pass.
create or replace function public.protect_profile_status()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if tg_op = 'INSERT' then
    if new.role <> 'joiner' or new.id_verified or new.business <> 'none'
       or new.organizer_status <> 'none' or new.application is not null or new.applied_at is not null then
      raise exception 'Organizer and verification status can only be set by TrailPeak.' using errcode = '42501';
    end if;
  elsif new.role is distinct from old.role or new.id_verified is distinct from old.id_verified
        or new.business is distinct from old.business or new.organizer_status is distinct from old.organizer_status
        or new.application is distinct from old.application or new.applied_at is distinct from old.applied_at
        or new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'Organizer and verification status can only be set by TrailPeak.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists protect_profile_status on public.profiles;
create trigger protect_profile_status
  before insert or update on public.profiles
  for each row execute function public.protect_profile_status();

-- Make a profile automatically when someone signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, phone)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''), new.raw_user_meta_data ->> 'phone')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Is the signed-in person an approved organizer? Used by the trip and date rules below.
create or replace function public.is_organizer()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'organizer');
$$;

-- Organizer sign-up: saves the applicant's details and marks them "pending". It never makes
-- anyone an organizer or verified; the owner does that with approve_organizer().
create or replace function public.apply_as_organizer(
  p_name text, p_phone text, p_org text, p_payout jsonb, p_application jsonb default null)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); p public.profiles;
begin
  if me is null then raise exception 'Please sign in again.'; end if;
  select * into p from public.profiles where id = me for update;
  if not found then raise exception 'Please sign in again.'; end if;
  if p.role = 'organizer' then raise exception 'You''re already an organizer.'; end if;
  if p.organizer_status = 'revoked' then
    raise exception 'Your organizer access was turned off. Contact TrailPeak to apply again.';
  end if;
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_org), '') = '' or coalesce(trim(p_phone), '') = '' then
    raise exception 'Enter your name, organizer name and mobile number.';
  end if;
  if p_payout is null or coalesce(trim(p_payout ->> 'number'), '') = '' or coalesce(p_payout ->> 'wallet', '') not in ('GCash', 'Maya') then
    raise exception 'Add a GCash or Maya payout number.';
  end if;
  update public.profiles
     set name = left(trim(p_name), 100), phone = left(trim(p_phone), 20), org = left(trim(p_org), 100),
         payout = jsonb_build_object('wallet', p_payout ->> 'wallet', 'number', left(trim(p_payout ->> 'number'), 20)),
         organizer_status = 'pending', applied_at = coalesce(applied_at, now()),
         application = jsonb_build_object(
           'idType', left(coalesce(p_application ->> 'idType', ''), 40),
           'businessDocs', coalesce((p_application ->> 'businessDocs')::boolean, false),
           'dot', left(coalesce(p_application ->> 'dot', ''), 40))
   where id = me returning * into p;
  return p;
end $$;

-- Pilot approval checklist (TP-003). Every item must be confirmed (true) before someone becomes
-- an organizer for the first time; the approval is logged in organizer_approvals with who
-- approved, when, the checklist and a note. Changing an approved organizer's labels later
-- (ID or business) doesn't need the checklist again. See supabase/SETUP.md for the wording.
create table if not exists public.organizer_approvals (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  action     text not null check (action in ('approve', 'update', 'revoke')),
  approver   text not null,
  checklist  jsonb,
  note       text,
  id_verified boolean,
  business   text,
  at         timestamptz not null default now()
);
alter table public.organizer_approvals enable row level security;   -- no policies: SQL editor only
revoke all on public.organizer_approvals from anon, authenticated;

create or replace function public.approval_checklist()
returns table (key text, item text) language sql immutable as $$
  values ('id_checked',       'Saw their government ID on a video call; the name matches their TrailPeak profile'),
         ('payout_matches',   'Their GCash or Maya account name matches that ID'),
         ('track_record',     'They have run joiner trips before (posts, reviews or a reference you checked)'),
         ('permits_known',    'They know the registration and permit steps for the mountains they will post'),
         ('safety_plan',      'They have a guide ratio and an emergency plan (who to call, nearest hospital)'),
         ('pilot_rules',      'They agreed to the pilot rules: outside bookings within 1 hour, confirm DPs within 24 hours, check the list 2 days before');
$$;

-- Owner only (SQL editor or service role). First approval needs the checklist and your name:
--   select approve_organizer('<user id>', p_approver => 'Christine',
--     p_checklist => '{"id_checked":true,"payout_matches":true,"track_record":true,"permits_known":true,"safety_plan":true,"pilot_rules":true}');
-- Later label changes on an approved organizer (safe to run again):
--   select approve_organizer('<user id>', true, p_approver => 'Christine');             -- ID verified badge
--   select approve_organizer('<user id>', true, 'verified', p_approver => 'Christine'); -- plus Business verified
drop function if exists public.approve_organizer(uuid, boolean, text);
create or replace function public.approve_organizer(
  p_user uuid, p_id_verified boolean default false, p_business text default 'none',
  p_checklist jsonb default null, p_approver text default null, p_note text default null)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare p public.profiles; missing text; who text := trim(coalesce(p_approver, ''));
begin
  if p_business not in ('none', 'review', 'verified') then raise exception 'business must be none, review or verified'; end if;
  if who = '' then raise exception 'Add p_approver => ''your name'' so the approval is on record.'; end if;
  select * into p from public.profiles where id = p_user for update;
  if not found then raise exception 'No profile with id %', p_user; end if;
  if p.organizer_status <> 'approved' or p.role <> 'organizer' then
    select string_agg('  - ' || c.key || ': ' || c.item, E'\n') into missing
      from public.approval_checklist() c where (p_checklist -> c.key) is distinct from 'true'::jsonb;  -- only a real true counts
    if missing is not null then
      raise exception E'Confirm every checklist item before approving (p_checklist => ''{"key": true, ...}''). Still missing:\n%', missing;
    end if;
  end if;
  insert into public.organizer_approvals (user_id, action, approver, checklist, note, id_verified, business)
  values (p_user, case when p.organizer_status = 'approved' and p.role = 'organizer' then 'update' else 'approve' end,
          who, p_checklist, nullif(trim(coalesce(p_note, '')), ''), coalesce(p_id_verified, false), p_business);
  update public.profiles
     set role = 'organizer', organizer_status = 'approved', id_verified = coalesce(p_id_verified, false), business = p_business
   where id = p_user returning * into p;
  if not found then raise exception 'No profile with id %', p_user; end if;
  update public.trips set details = details where organizer_id = p_user;   -- refresh the trips' verified seal
  return p;
end $$;

-- Owner only. Turn organizer access off: they can no longer post, edit trips or change dates.
-- Their published trips stay up; unpublish them with: update trips set published = false where organizer_id = '<user id>';
drop function if exists public.revoke_organizer(uuid);
create or replace function public.revoke_organizer(p_user uuid, p_approver text default null, p_note text default null)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  if trim(coalesce(p_approver, '')) = '' then raise exception 'Add p_approver => ''your name'' so the change is on record.'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'No profile with id %', p_user; end if;
  insert into public.organizer_approvals (user_id, action, approver, note) values (p_user, 'revoke', trim(p_approver), nullif(trim(coalesce(p_note, '')), ''));
  update public.profiles
     set role = 'joiner', organizer_status = 'revoked', id_verified = false, business = 'none'
   where id = p_user returning * into p;
  if not found then raise exception 'No profile with id %', p_user; end if;
  update public.trips set details = details where organizer_id = p_user;
  return p;
end $$;

-- ---------------------------------------------------------------------------
-- Trips and their dates
-- ---------------------------------------------------------------------------
-- A trip keeps its page content (photos, itinerary, inclusions...) in `details`,
-- in the same shape trips.js uses, so the pages need no rewrite.
create table if not exists public.trips (
  id            text primary key,
  organizer_id  uuid references public.profiles (id) on delete set null,  -- null = sample trip
  org_name      text not null,
  details       jsonb not null,
  published     boolean not null default true,
  created_at    timestamptz not null default now()
);
alter table public.trips enable row level security;

drop policy if exists "Anyone reads published trips" on public.trips;
create policy "Anyone reads published trips" on public.trips
  for select using (published or organizer_id = auth.uid());
drop policy if exists "Organizers add their own trips" on public.trips;
create policy "Organizers add their own trips" on public.trips
  for insert with check (organizer_id = auth.uid() and public.is_organizer());
drop policy if exists "Organizers edit their own trips" on public.trips;
create policy "Organizers edit their own trips" on public.trips
  for update using (organizer_id = auth.uid() and public.is_organizer())
  with check (organizer_id = auth.uid() and public.is_organizer());

-- The verified seal and business status on a trip come from its organizer's profile, never
-- from what the organizer typed into the trip. Sample trips (no organizer) keep their seed value.
-- The website shows both with a "Demo: not a real check" tag until real checks exist (TP-002).
create or replace function public.trip_verified_from_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.organizer_id is not null then
    new.details := new.details || jsonb_build_object(
      'verified', coalesce((select id_verified from public.profiles where id = new.organizer_id), false),
      'business', coalesce((select business from public.profiles where id = new.organizer_id), 'none'));
  end if;
  return new;
end $$;
drop trigger if exists trip_verified_from_profile on public.trips;
create trigger trip_verified_from_profile
  before insert or update on public.trips
  for each row execute function public.trip_verified_from_profile();
-- Bring existing organizer trips in line (cheap, and safe to repeat).
update public.trips set details = details
 where organizer_id is not null
   and (details -> 'verified' is distinct from to_jsonb(coalesce((select p.id_verified from public.profiles p where p.id = organizer_id), false))
     or details ->> 'business' is distinct from coalesce((select p.business from public.profiles p where p.id = organizer_id), 'none'));

create table if not exists public.departures (
  trip_id        text not null references public.trips (id) on delete cascade,
  date           date not null,
  capacity       int  not null check (capacity > 0),
  sample_booked  int  not null default 0 check (sample_booked >= 0),  -- seats taken in the sample data
  status         text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  primary key (trip_id, date)
);
alter table public.departures enable row level security;

drop policy if exists "Anyone reads dates" on public.departures;
create policy "Anyone reads dates" on public.departures for select using (true);
drop policy if exists "Organizers manage their dates" on public.departures;
create policy "Organizers manage their dates" on public.departures
  for all using (public.is_organizer() and exists (select 1 from public.trips t where t.id = trip_id and t.organizer_id = auth.uid()))
  with check (public.is_organizer() and exists (select 1 from public.trips t where t.id = trip_id and t.organizer_id = auth.uid()));

-- Date states (TP-012). Stored: open, closed (no new bookings; existing ones stay) and
-- cancelled (final). Derived on the page, never stored: full (open, no slots left) and
-- completed (the date has passed).
--
-- Capacity guard: a date's capacity can never drop below the seats already taken
-- (seats_taken, below). The check runs inside the UPDATE, which holds the date's row lock,
-- the same lock book_trip and move_booking take before they count seats. So a booking and
-- a capacity edit on the same date run one after the other, never interleaved, and the
-- second one sees what the first did. This holds for the website, direct API calls and the
-- SQL editor alike.
-- Not security definer: it needs to know who is really making the change (current_user).
create or replace function public.guard_departure()
returns trigger language plpgsql set search_path = public as $$
declare taken int;
begin
  if tg_op = 'UPDATE' then
    if current_user in ('anon', 'authenticated') and old.status = 'cancelled' and new.status <> 'cancelled' then
      raise exception 'This date was cancelled, so it can''t be reopened. Add it again as a new date.' using errcode = '23514';
    end if;
    if new.capacity < old.capacity or new.sample_booked is distinct from old.sample_booked then
      -- seats_taken reads the stored sample seats; swap in the new value being written.
      taken := public.seats_taken(new.trip_id, new.date) - old.sample_booked + new.sample_booked;
      if new.capacity < taken then
        raise exception 'Can''t lower this date to % slots: % % already taken. Choose % or more, or close the date to stop new bookings.',
          new.capacity, taken, case when taken = 1 then 'is' else 'are' end, taken using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_departure on public.departures;
create trigger guard_departure
  before update on public.departures
  for each row execute function public.guard_departure();

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------
create table if not exists public.bookings (
  ref            text primary key,
  trip_id        text not null references public.trips (id) on delete cascade,
  date           date not null,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  size           int  not null check (size between 1 and 20),
  pickup         text not null,
  pickup_time    text not null,
  dp             int  not null,
  balance        int  not null,
  wallet         text not null check (wallet in ('GCash', 'Maya')),
  wallet_number  text not null,
  names          text,
  listed         boolean not null default false,   -- opted in to "Who's going"
  display_name   text,                              -- "Ana R."
  status         text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  moved          boolean not null default false,
  note           text,
  created_at     timestamptz not null default now(),
  foreign key (trip_id, date) references public.departures (trip_id, date) on update cascade
);
alter table public.bookings enable row level security;

-- Safety details (added Nov 2026). companions: the other joiners in this booking, as
-- [{ "name": "Ana Reyes", "age": "adult" | "minor", "phone": "+63 917 …" }]; the booker is joiner 1.
-- emergency: someone not on the hike, { "name", "relation", "phone" }.
-- Only the booker and the trip's organizer can read them, and they're cleared 30 days after the trip.
alter table public.bookings add column if not exists companions jsonb not null default '[]'::jsonb;
alter table public.bookings add column if not exists emergency jsonb;

-- No insert/update policies: bookings change only through the functions below.
drop policy if exists "Joiners read their bookings, organizers read bookings on their trips" on public.bookings;
create policy "Joiners read their bookings, organizers read bookings on their trips" on public.bookings
  for select using (
    user_id = auth.uid()
    or exists (select 1 from public.trips t where t.id = trip_id and t.organizer_id = auth.uid()));

-- Today in the Philippines. The database clock runs on UTC, which is still "yesterday"
-- until 8 AM Manila time, so every date rule uses this instead of current_date.
create or replace function public.ph_today()
returns date language sql stable as $$ select (now() at time zone 'Asia/Manila')::date $$;

-- DP hold (TP-011, Nov 2026). A new pilot booking holds its slots until hold_until (6 hours,
-- or 2 when the trip is within 3 days; see app_settings below). Entering the GCash/Maya
-- reference (dp_reference, dp_sent_at) stops the clock: the slots stay held while the organizer
-- checks. With no reference by hold_until the slots are free again at once (booking_holds_seat
-- below) and expire_holds() marks the booking 'expired'. Bookings made before this update have
-- no hold_until and never expire.
alter table public.bookings add column if not exists hold_until timestamptz;
alter table public.bookings add column if not exists dp_reference text check (dp_reference is null or char_length(dp_reference) between 1 and 40);
alter table public.bookings add column if not exists dp_sent_at timestamptz;
alter table public.bookings add column if not exists dp_reminded_at timestamptz;
alter table public.bookings add column if not exists expired_at timestamptz;
alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings add constraint bookings_status_check check (status in ('confirmed', 'cancelled', 'expired'));

-- Does this booking use its slots right now? Confirmed, and either no hold (older bookings),
-- the DP reference already sent, or the hold still running. One rule for every count.
create or replace function public.booking_holds_seat(p_status text, p_hold_until timestamptz, p_dp_sent_at timestamptz)
returns boolean language sql stable as $$
  select p_status = 'confirmed' and (p_hold_until is null or p_dp_sent_at is not null or p_hold_until > now());
$$;

-- ---------------------------------------------------------------------------
-- Outside bookings (TP-008): joiners who booked through Messenger, in person or another
-- way, recorded by the trip's organizer so they use the same slots. They aren't accounts:
-- just a name, group size, pick-up and source (and a mobile number if the organizer has one).
-- Only the trip's organizer can read them, and they never appear in Who's going or the
-- public slot list beyond the count. Recording one says nothing about payment: a DP is
-- recorded separately (TP-010). Edit and cancel come later (TP-009).
-- ---------------------------------------------------------------------------
create table if not exists public.outside_bookings (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null unique,                -- one per submit, so a retry can't add it twice
  trip_id      text not null,
  date         date not null,
  created_by   uuid not null references public.profiles (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 100),
  size         int  not null check (size between 1 and 20),
  pickup       text not null check (char_length(pickup) between 1 and 100),
  pickup_time  text,
  phone        text check (phone is null or char_length(phone) <= 20),
  source       text not null check (source in ('messenger', 'in_person', 'other')),
  status       text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_at   timestamptz not null default now(),
  foreign key (trip_id, date) references public.departures (trip_id, date)
);
alter table public.outside_bookings enable row level security;

drop policy if exists "Organizers read outside bookings on their trips" on public.outside_bookings;
create policy "Organizers read outside bookings on their trips" on public.outside_bookings
  for select using (exists (select 1 from public.trips t where t.id = trip_id and t.organizer_id = auth.uid()));
-- No insert/update policies: they're added only through add_outside_booking() below.

-- Seats taken on a date: everything that uses up a slot: sample seats, confirmed bookings
-- and confirmed outside bookings. The capacity guard, slots_left and every booking path
-- count through this one function.
create or replace function public.seats_taken(p_trip text, p_date date)
returns int language sql stable security definer set search_path = public as $$
  select (coalesce((select d.sample_booked from public.departures d where d.trip_id = p_trip and d.date = p_date), 0)
        + coalesce((select sum(b.size) from public.bookings b
                    where b.trip_id = p_trip and b.date = p_date
                      and public.booking_holds_seat(b.status, b.hold_until, b.dp_sent_at)), 0)
        + coalesce((select sum(o.size) from public.outside_bookings o
                    where o.trip_id = p_trip and o.date = p_date and o.status = 'confirmed'), 0))::int;
$$;

-- Seats left on a date: capacity minus seats taken (never below zero for display).
create or replace function public.slots_left(p_trip text, p_date date)
returns int language sql stable security definer set search_path = public as $$
  select greatest(0, d.capacity - public.seats_taken(p_trip, p_date))::int
  from public.departures d where d.trip_id = p_trip and d.date = p_date;
$$;

-- Seats left for every date of every trip, for the search page.
create or replace function public.all_slots()
returns table (trip_id text, date date, left_count int, status text)
language sql stable security definer set search_path = public as $$
  select d.trip_id, d.date, public.slots_left(d.trip_id, d.date), d.status from public.departures d;
$$;

-- Checks and tidies joiner details. Fewer names than joiners is fine (they can be added later).
-- Under-18 hikers (TP-015, ADR-007). `booker` records the booker's own age group and, if they
-- are under 18, who in the booking is their guardian. Companions carry the same `guardian` (the
-- joiner number of an adult in the booking, 1 = the booker) and `relation` when under 18.
-- Bookings made before this have no booker age and count as 18 or older.
alter table public.bookings add column if not exists booker jsonb not null default '{"age":"adult"}'::jsonb;
-- One online booking per submit (TP-013): the page sends a fresh id per Reserve; retries reuse it.
alter table public.bookings add column if not exists request_id uuid unique;

-- Every under-18 hiker needs a parent or guardian 18 or older in the same booking. Checks the
-- booker and the companions together (people = the cleaned companions, joiners 2+) and returns
-- the tidied booker value. Used when booking and on every later edit of names.
create or replace function public.check_guardians(p_booker jsonb, people jsonb)
returns jsonb language plpgsql immutable as $$
declare bk jsonb := coalesce(nullif(p_booker, 'null'::jsonb), '{"age":"adult"}'::jsonb);
        adults int[] := '{}'; c jsonb; i int := 1; g int; rel text;
        rels text[] := array['parent', 'guardian', 'permitted_adult'];
begin
  if coalesce(bk ->> 'age', 'adult') not in ('adult', 'minor') then raise exception 'Choose 18 or older, or under 18, for yourself.'; end if;
  if coalesce(bk ->> 'age', 'adult') = 'adult' then adults := adults || 1; end if;
  for c in select * from jsonb_array_elements(people) loop
    i := i + 1;
    if c ->> 'age' = 'adult' then adults := adults || i; end if;
  end loop;
  if bk ->> 'age' = 'minor' then
    g := case when coalesce(bk ->> 'guardian', '') ~ '^[0-9]+$' then (bk ->> 'guardian')::int end;
    if g is null or g = 1 or not g = any (adults) then
      raise exception 'You''re under 18, so a parent or guardian 18 or older needs to be in this booking. Add them as a joiner and choose them as your guardian.';
    end if;
    rel := bk ->> 'relation';
    if rel is null or not rel = any (rels) then raise exception 'Choose how your guardian is related to you.'; end if;
  end if;
  i := 1;
  for c in select * from jsonb_array_elements(people) loop
    i := i + 1;
    if c ->> 'age' = 'minor' then
      g := case when coalesce(c ->> 'guardian', '') ~ '^[0-9]+$' then (c ->> 'guardian')::int end;
      if g is null or g = i or not g = any (adults) then
        raise exception '% is under 18, so choose their parent or guardian (18 or older) from this booking.', coalesce(nullif(c ->> 'name', ''), 'Joiner ' || i);
      end if;
      if coalesce(c ->> 'relation', '') <> all (rels) then
        raise exception 'Choose how % is related to their guardian.', coalesce(nullif(c ->> 'name', ''), 'joiner ' || i);
      end if;
    end if;
  end loop;
  return case when bk ->> 'age' = 'minor'
    then jsonb_build_object('age', 'minor', 'guardian', (bk ->> 'guardian')::int, 'relation', bk ->> 'relation')
    else '{"age":"adult"}'::jsonb end;
end $$;

-- A Philippine mobile number, tidied to "+63 917 123 4567". Accepts 0917..., 917... or +63 917...
-- with any spaces or dashes; anything else (too long, too short, not starting with 9) is
-- refused with a message that names the field. Blank means "no number" (null).
create or replace function public.ph_mobile(p_value text, p_label text)
returns text language plpgsql immutable as $$
declare d text := regexp_replace(coalesce(p_value, ''), '\D', '', 'g');
begin
  if trim(coalesce(p_value, '')) = '' then return null; end if;
  if length(d) = 12 and left(d, 2) = '63' then d := substr(d, 3); end if;
  if length(d) = 11 and left(d, 1) = '0' then d := substr(d, 2); end if;
  if d !~ '^9[0-9]{9}$' then
    raise exception '% must be a Philippine mobile number: 10 digits starting with 9, like 0917 123 4567.', p_label;
  end if;
  return '+63 ' || substr(d, 1, 3) || ' ' || substr(d, 4, 3) || ' ' || substr(d, 7);
end $$;

create or replace function public.clean_details(p_companions jsonb, p_size int, p_emergency jsonb)
returns jsonb language plpgsql immutable as $$
declare c jsonb; out jsonb := '[]'::jsonb; n int := 1;
begin
  if p_companions is null or jsonb_typeof(p_companions) <> 'array' then p_companions := '[]'::jsonb; end if;
  if jsonb_array_length(p_companions) > p_size - 1 then raise exception 'More names than joiners in this booking.'; end if;
  for c in select * from jsonb_array_elements(p_companions) loop
    if coalesce(trim(c ->> 'name'), '') = '' then raise exception 'Enter each joiner''s full name, or add them later.'; end if;
    if coalesce(c ->> 'age', '') not in ('adult', 'minor') then raise exception 'Choose 18 or older, or under 18, for each joiner.'; end if;
    n := n + 1;
    out := out || jsonb_build_array(jsonb_build_object('name', left(trim(c ->> 'name'), 100), 'age', c ->> 'age',
                                                        'guardian', case when c ->> 'age' = 'minor' then c -> 'guardian' end,
                                                        'relation', case when c ->> 'age' = 'minor' then c ->> 'relation' end,
                                                        'phone', public.ph_mobile(c ->> 'phone', 'Joiner ' || n || '''s mobile')));
  end loop;
  if p_emergency is null or coalesce(trim(p_emergency ->> 'name'), '') = '' or coalesce(trim(p_emergency ->> 'phone'), '') = '' then
    raise exception 'Add an emergency contact: someone not on the hike, with a mobile number.';
  end if;
  perform public.ph_mobile(p_emergency ->> 'phone', 'The emergency contact''s mobile');
  return out;
end $$;

-- Joiner and emergency details are kept only while they help: cleared 30 days after the trip.
create or replace function public.clear_old_details()
returns void language sql security definer set search_path = public as $$
  update public.bookings set companions = '[]'::jsonb, emergency = null
   where date < public.ph_today() - 30 and (emergency is not null or companions <> '[]'::jsonb);
$$;

-- Reserve: checks the date is open and has room, then records the booking.
-- The DP and balance come from the trip on the server, not from the browser.
drop function if exists public.book_trip(text, date, int, text, text, text, text, text, boolean);
drop function if exists public.book_trip(text, date, int, text, text, text, text, text, boolean, jsonb, jsonb);
drop function if exists public.book_trip(text, date, int, text, text, text, text, text, boolean, jsonb, jsonb, jsonb);
create or replace function public.book_trip(
  p_trip text, p_date date, p_size int, p_pickup text, p_pickup_time text,
  p_wallet text, p_wallet_number text, p_names text, p_listed boolean,
  p_companions jsonb default '[]'::jsonb, p_emergency jsonb default null, p_booker jsonb default null,
  p_request uuid default null)
returns public.bookings language plpgsql security definer set search_path = public as $$
declare
  bk jsonb;
  me uuid := auth.uid();
  dep public.departures;
  t public.trips;
  who public.profiles;
  b public.bookings;
  people jsonb;
begin
  if me is null then raise exception 'Sign in to reserve.'; end if;
  people := public.clean_details(p_companions, p_size, p_emergency);
  bk := public.check_guardians(p_booker, people);
  -- Joiner details rule (TP-014, ADR-006): from the due date on, every joiner's full name is
  -- needed before the booking confirms. Earlier bookings may add names later in My trips.
  if public.details_required(p_date) and jsonb_array_length(people) < p_size - 1 then
    raise exception 'This trip is % days away or less, so add every joiner''s full name now (% of % still missing).',
      public.app_setting('details_due_days')::int, p_size - 1 - jsonb_array_length(people), p_size - 1;
  end if;
  perform public.clear_old_details();
  perform public.expire_holds();
  select * into dep from public.departures where trip_id = p_trip and date = p_date for update;
  if not found or dep.status <> 'open' then raise exception 'This date is not open for booking.'; end if;
  -- One booking per submit (TP-013): the same request id again (a double click, a retry after a
  -- dropped connection) returns the booking already made. Checked after the date lock, so two
  -- identical requests at once can't both get past it.
  if p_request is not null then
    select * into b from public.bookings where request_id = p_request;
    if found then
      if b.user_id <> me or b.trip_id <> p_trip or b.date <> p_date then raise exception 'Reload the page and try again.'; end if;
      return b;
    end if;
  end if;
  if p_date < public.ph_today() then raise exception 'This date has passed.'; end if;
  if public.slots_left(p_trip, p_date) < p_size then raise exception 'Not enough slots left on this date.'; end if;
  select * into t from public.trips where id = p_trip;
  if t.organizer_id is null then raise exception 'This is a demo trip. Try the separate demo; no live reservation or payment is created.'; end if;
  select * into who from public.profiles where id = me;
  insert into public.bookings (ref, trip_id, date, user_id, size, pickup, pickup_time, dp, balance,
                               wallet, wallet_number, names, listed, display_name, companions, emergency, hold_until, booker, request_id)
  values ('TP-' || upper(substr(md5(random()::text), 1, 6)), p_trip, p_date, me, p_size, p_pickup, p_pickup_time,
          (t.details ->> 'dp')::int * p_size,
          ((t.details ->> 'fee')::int - (t.details ->> 'dp')::int) * p_size,
          p_wallet, p_wallet_number,
          nullif(coalesce((select string_agg(x ->> 'name', ', ') from jsonb_array_elements(people) x), p_names), ''),
          coalesce(p_listed, false),
          -- "Ana Reyes" -> "Ana R."
          case when position(' ' in trim(who.name)) > 0
               then split_part(trim(who.name), ' ', 1) || ' ' || left(regexp_replace(trim(who.name), '^.* ', ''), 1) || '.'
               else trim(who.name) end,
          people,
          jsonb_build_object('name', left(trim(p_emergency ->> 'name'), 100), 'relation', left(trim(coalesce(p_emergency ->> 'relation', '')), 40),
                             'phone', left(trim(p_emergency ->> 'phone'), 20)),
          public.dp_hold_until(p_date), bk, p_request)
  returning * into b;
  return b;
end $$;

-- Add or change joiner names and the emergency contact, any time before the trip date.
drop function if exists public.update_booking_details(text, jsonb, jsonb);
create or replace function public.update_booking_details(p_ref text, p_companions jsonb, p_emergency jsonb, p_booker jsonb default null)
returns public.bookings language plpgsql security definer set search_path = public as $$
declare b public.bookings; people jsonb; bk jsonb;
begin
  select * into b from public.bookings where ref = p_ref and user_id = auth.uid() and status = 'confirmed' for update;
  if not found then raise exception 'Booking not found.'; end if;
  if b.date < public.ph_today() then raise exception 'This trip date has passed.'; end if;
  people := public.clean_details(p_companions, b.size, p_emergency);
  -- No booker value sent (an older page): keep the one on record, and check it still holds.
  bk := public.check_guardians(coalesce(p_booker, b.booker), people);
  update public.bookings set companions = people, booker = bk,
         names = nullif((select string_agg(x ->> 'name', ', ') from jsonb_array_elements(people) x), ''),
         emergency = jsonb_build_object('name', left(trim(p_emergency ->> 'name'), 100), 'relation', left(trim(coalesce(p_emergency ->> 'relation', '')), 40),
                                        'phone', left(trim(p_emergency ->> 'phone'), 20))
   where ref = p_ref returning * into b;
  perform public.clear_old_details();
  return b;
end $$;

-- Organizer records an outside booking. Same rules as book_trip: lock the date, check it's
-- open, upcoming and has room, then save. p_request is a fresh id per form submit: sending
-- the same one again (a double click, a retry after a dropped connection) returns the
-- booking already saved instead of adding another.
create or replace function public.add_outside_booking(
  p_request uuid, p_trip text, p_date date, p_name text, p_size int, p_pickup text,
  p_pickup_time text, p_source text, p_phone text default null)
returns public.outside_bookings language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); dep public.departures; o public.outside_bookings;
begin
  if me is null then raise exception 'Please sign in again.'; end if;
  if p_request is null then raise exception 'Missing request id. Reload the page and try again.'; end if;
  if not public.is_organizer() or not exists (select 1 from public.trips where id = p_trip and organizer_id = me) then
    raise exception 'Only this trip''s organizer can add bookings to it.';
  end if;
  select * into dep from public.departures where trip_id = p_trip and date = p_date for update;
  if not found then raise exception 'That date isn''t on this trip.'; end if;
  -- Checked after the lock, so two identical submits can't both get past it.
  select * into o from public.outside_bookings where request_id = p_request;
  if found then
    if o.created_by <> me or o.trip_id <> p_trip or o.date <> p_date then raise exception 'Reload the page and try again.'; end if;
    return o;   -- already saved: nothing more to do
  end if;
  if dep.status = 'cancelled' then raise exception 'This date was cancelled.'; end if;
  if dep.status = 'closed' then raise exception 'This date is closed. Reopen it first to add a booking.'; end if;
  if p_date < public.ph_today() then raise exception 'This date has passed.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Enter the booker''s name.'; end if;
  if p_size is null or p_size not between 1 and 20 then raise exception 'Joiners must be between 1 and 20.'; end if;
  if coalesce(trim(p_pickup), '') = '' then raise exception 'Choose a pick-up point.'; end if;
  if p_source not in ('messenger', 'in_person', 'other') then raise exception 'Choose how they booked.'; end if;
  if public.slots_left(p_trip, p_date) < p_size then
    raise exception 'Only % % left on this date.', public.slots_left(p_trip, p_date),
      case when public.slots_left(p_trip, p_date) = 1 then 'slot' else 'slots' end;
  end if;
  insert into public.outside_bookings (request_id, trip_id, date, created_by, name, size, pickup, pickup_time, phone, source)
  values (p_request, p_trip, p_date, me, left(trim(p_name), 100), p_size, left(trim(p_pickup), 100),
          nullif(left(trim(coalesce(p_pickup_time, '')), 20), ''), public.ph_mobile(p_phone, 'The mobile number'), p_source)
  returning * into o;
  return o;
end $$;

-- Move a booking: free once, only 7+ days before, to an open date with room.
create or replace function public.move_booking(p_ref text, p_new_date date)
returns public.bookings language plpgsql security definer set search_path = public as $$
declare b public.bookings;
begin
  select * into b from public.bookings where ref = p_ref and user_id = auth.uid() for update;
  if not found or b.status <> 'confirmed' then raise exception 'Booking not found.'; end if;
  if not exists (select 1 from public.trips where id = b.trip_id and organizer_id is not null) then
    raise exception 'Demo bookings cannot be moved into live inventory. Use the separate demo.';
  end if;
  if b.moved then raise exception 'This booking was already moved once.'; end if;
  if b.date - public.ph_today() < 7 then raise exception 'Dates can only be moved 7 or more days before.'; end if;
  if p_new_date - public.ph_today() < 7 then raise exception 'Pick a date at least 7 days away.'; end if;
  perform 1 from public.departures where trip_id = b.trip_id and date = p_new_date and status = 'open' for update;
  if not found then raise exception 'That date is not open.'; end if;
  if public.slots_left(b.trip_id, p_new_date) < b.size then raise exception 'Not enough slots on that date.'; end if;
  update public.bookings set date = p_new_date, moved = true,
         note = 'Moved from ' || to_char(b.date, 'Dy, Mon FMDD') || '. The organizer was told.'
   where ref = p_ref returning * into b;
  return b;
end $$;

-- Cancel a booking. Under the standard policy the DP isn't refunded.
create or replace function public.cancel_booking(p_ref text)
returns public.bookings language plpgsql security definer set search_path = public as $$
declare b public.bookings;
begin
  select * into b from public.bookings where ref = p_ref and user_id = auth.uid() and status = 'confirmed' for update;
  if not found then raise exception 'Booking not found.'; end if;
  if b.date < public.ph_today() then raise exception 'This trip date has passed, so it can''t be cancelled.'; end if;
  update public.bookings set status = 'cancelled',
         note = 'You cancelled this booking. The organizer was told and your slot was released.'
   where ref = p_ref returning * into b;
  return b;
end $$;

-- Who's going on a date. Everyone gets the rows (for the count and solo/group mix),
-- but names are filled in only if the caller is booked on that date, and only for
-- joiners who opted in.
create or replace function public.whos_going(p_trip text, p_date date)
returns table (display_name text, size int, is_you boolean)
language sql stable security definer set search_path = public as $$
  with mine as (
    -- "Booked on that date" = a booking that still holds its seat: not cancelled, expired or a
    -- lapsed unpaid hold (TP-005). Only then do you see other joiners' opted-in names.
    select exists (select 1 from public.bookings
                   where trip_id = p_trip and date = p_date and user_id = auth.uid()
                     and public.booking_holds_seat(status, hold_until, dp_sent_at)) as booked)
  select case when (select booked from mine) and (b.listed or b.user_id = auth.uid()) then b.display_name end,
         b.size,
         b.user_id = auth.uid()
  from public.bookings b
  where b.trip_id = p_trip and b.date = p_date and public.booking_holds_seat(b.status, b.hold_until, b.dp_sent_at);
$$;

-- Organizer dashboard: bookings on the caller's trips, with the joiner's name and phone,
-- the other joiners' names and ages, and the emergency contact (until 30 days after the trip).
drop function if exists public.organizer_bookings();
create or replace function public.organizer_bookings()
returns table (ref text, trip_id text, date date, size int, pickup text, pickup_time text, dp int, balance int,
               wallet text, joiner_name text, joiner_phone text, status text, created_at timestamptz,
               companions jsonb, emergency jsonb, hold_until timestamptz, dp_reference text, dp_sent_at timestamptz,
               expired_at timestamptz, booker jsonb)
language sql stable security definer set search_path = public as $$
  select b.ref, b.trip_id, b.date, b.size, b.pickup, b.pickup_time, b.dp, b.balance, b.wallet,
         p.name, p.phone, b.status, b.created_at,
         case when b.date >= public.ph_today() - 30 then b.companions else '[]'::jsonb end,
         case when b.date >= public.ph_today() - 30 then b.emergency end,
         b.hold_until, b.dp_reference, b.dp_sent_at, b.expired_at, b.booker
  from public.bookings b
  join public.trips t on t.id = b.trip_id and t.organizer_id = auth.uid()
  join public.profiles p on p.id = b.user_id
  order by b.date, b.created_at;
$$;

-- ---------------------------------------------------------------------------
-- Reviews: one per booking, only after the trip date, only by the joiner who booked
-- ---------------------------------------------------------------------------
create table if not exists public.reviews (
  booking_ref   text primary key references public.bookings (ref) on delete cascade,
  trip_id       text not null references public.trips (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  stars         int  not null check (stars between 1 and 5),
  body          text not null check (char_length(body) between 1 and 1000),
  display_name  text not null,                       -- "Ana R.", never the full name
  created_at    timestamptz not null default now()
);
alter table public.reviews enable row level security;

-- You read your own reviews directly; everyone reads all reviews through all_reviews(),
-- which leaves out who wrote them (no user ids or booking numbers).
drop policy if exists "Read own reviews" on public.reviews;
create policy "Read own reviews" on public.reviews for select using (user_id = auth.uid());

create or replace function public.add_review(p_ref text, p_stars int, p_body text)
returns public.reviews language plpgsql security definer set search_path = public as $$
declare b public.bookings; r public.reviews;
begin
  select * into b from public.bookings where ref = p_ref and user_id = auth.uid();
  if not found then raise exception 'Booking not found.'; end if;
  if b.status <> 'confirmed' then raise exception 'Cancelled bookings can''t be reviewed.'; end if;
  if b.date >= public.ph_today() then raise exception 'You can review this trip after the hike date.'; end if;
  if exists (select 1 from public.reviews where booking_ref = p_ref) then raise exception 'You already reviewed this trip.'; end if;
  if p_stars is null or p_stars not between 1 and 5 then raise exception 'Choose 1 to 5 stars.'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'Write a few words about the trip.'; end if;
  insert into public.reviews (booking_ref, trip_id, user_id, stars, body, display_name)
  values (p_ref, b.trip_id, auth.uid(), p_stars, left(trim(p_body), 1000), coalesce(b.display_name, 'Joiner'))
  returning * into r;
  return r;
end $$;

create or replace function public.all_reviews()
returns table (trip_id text, display_name text, stars int, body text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.trip_id, r.display_name, r.stars, r.body, r.created_at from public.reviews r order by r.created_at desc;
$$;

-- Only signed-in people can call the functions that change or reveal bookings.
revoke all on function public.book_trip, public.move_booking, public.cancel_booking, public.organizer_bookings, public.add_review, public.update_booking_details, public.clear_old_details from public, anon;
grant execute on function public.book_trip, public.move_booking, public.cancel_booking, public.organizer_bookings, public.add_review, public.update_booking_details to authenticated;
grant execute on function public.slots_left, public.all_slots, public.whos_going, public.all_reviews, public.ph_today, public.seats_taken to anon, authenticated;
revoke all on function public.guard_departure from public, anon, authenticated;
revoke all on function public.add_outside_booking from public, anon;
grant execute on function public.add_outside_booking to authenticated;

-- Organizer status: anyone signed in can apply; only the owner (SQL editor / service role) approves or revokes.
revoke all on function public.apply_as_organizer, public.approve_organizer, public.revoke_organizer,
  public.protect_profile_status, public.trip_verified_from_profile from public, anon, authenticated;
grant execute on function public.apply_as_organizer, public.is_organizer to authenticated;
grant execute on function public.approve_organizer, public.revoke_organizer to service_role;

-- ---------------------------------------------------------------------------
-- Table access for the website's API roles (the project has "automatically expose
-- new tables" turned off, so each table is opened on purpose here). Row Level
-- Security above still decides which rows each person sees.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on public.trips, public.departures to anon, authenticated;
-- Profiles: column by column, so the status fields (role, id_verified, business,
-- organizer_status, application, applied_at) can't be written by the website at all.
revoke all on public.profiles from anon;
revoke insert, update on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant insert (id, name, phone, org, payout) on public.profiles to authenticated;
grant update (name, phone, org, payout) on public.profiles to authenticated;
grant insert, update on public.trips to authenticated;
-- Departures: organizers add dates and change capacity or status, nothing else. The date
-- itself can't be edited (that would silently move joiners' bookings), and sample seats are
-- seed data only. Deleting a date with bookings fails (bookings point at it).
revoke insert, update on public.departures from authenticated;
grant insert (trip_id, date, capacity, status) on public.departures to authenticated;
grant update (capacity, status) on public.departures to authenticated;
grant delete on public.departures to authenticated;
grant select on public.bookings to authenticated;   -- changes go through the functions only
grant select on public.reviews to authenticated;    -- own rows only; writes go through add_review
grant select on public.outside_bookings to authenticated;   -- organizer's own trips only (RLS); writes via add_outside_booking

-- Direct DP receipts (TP-010). Expected DP remains bookings.dp; old simulated values
-- are never receipts. Each row replaces the cumulative amount, retaining its history.
alter table public.outside_bookings add column if not exists expected_dp int;
alter table public.outside_bookings add column if not exists total_fee int;
update public.outside_bookings o set
  expected_dp = (t.details ->> 'dp')::int * o.size,
  total_fee = (t.details ->> 'fee')::int * o.size
from public.trips t where t.id = o.trip_id and o.total_fee is null;

create or replace function public.snapshot_outside_price()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select (details ->> 'dp')::int * new.size, (details ->> 'fee')::int * new.size
    into new.expected_dp, new.total_fee from public.trips where id = new.trip_id;
  if new.expected_dp is null or new.expected_dp < 0 or new.total_fee is null or new.total_fee < new.expected_dp then
    raise exception 'This trip needs a valid fee and DP before booking.';
  end if;
  return new;
end $$;
drop trigger if exists snapshot_outside_price on public.outside_bookings;
create trigger snapshot_outside_price before insert on public.outside_bookings
for each row execute function public.snapshot_outside_price();
revoke all on function public.snapshot_outside_price from public, anon, authenticated;

create table if not exists public.dp_receipts (
  id uuid primary key default gen_random_uuid(),
  revision bigint generated always as identity unique,
  request_id uuid not null unique,
  booking_ref text references public.bookings(ref),
  outside_id uuid references public.outside_bookings(id),
  trip_id text not null references public.trips(id),
  previous_id uuid references public.dp_receipts(id),
  amount int not null check (amount >= 0),
  method text check (method in ('GCash', 'Maya', 'Cash', 'Bank transfer')),
  received_at timestamptz,
  recorded_by uuid not null references public.profiles(id),
  recorded_at timestamptz not null default now(),
  reason text not null check (char_length(trim(reason)) between 1 and 300),
  check (num_nonnulls(booking_ref, outside_id) = 1),
  check ((amount = 0 and method is null and received_at is null)
      or (amount > 0 and method is not null and received_at is not null))
);
-- Transaction reference (added Nov 2026): the GCash / Maya / bank reference number the
-- organizer sees on the transfer, so both sides can match the payment. Optional.
alter table public.dp_receipts add column if not exists reference text
  check (reference is null or char_length(reference) between 1 and 40);
create index if not exists dp_receipts_booking on public.dp_receipts(booking_ref, revision desc);
create index if not exists dp_receipts_outside on public.dp_receipts(outside_id, revision desc);
alter table public.dp_receipts enable row level security;
drop policy if exists "Booker and owning organizer read receipt history" on public.dp_receipts;
create policy "Booker and owning organizer read receipt history" on public.dp_receipts
for select using (
  exists (select 1 from public.bookings b where b.ref = booking_ref and b.user_id = auth.uid())
  or (public.is_organizer() and exists (
    select 1 from public.trips t where t.id = trip_id and t.organizer_id = auth.uid()))
);
revoke all on public.dp_receipts from anon, authenticated;
grant select on public.dp_receipts to authenticated;

-- The reference is a new last argument, so drop the old 8-argument version first (two
-- versions would make the website's call ambiguous).
drop function if exists public.record_dp_receipt(uuid, text, uuid, uuid, int, text, timestamptz, text);
create or replace function public.record_dp_receipt(
  p_request uuid, p_booking text, p_outside uuid, p_previous uuid,
  p_amount int, p_method text, p_received timestamptz, p_reason text, p_reference text default null)
returns public.dp_receipts language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); trip text; due int; latest public.dp_receipts;
  saved public.dp_receipts; why text := trim(p_reason);
  v_ref text := case when coalesce(p_amount, 0) > 0 then nullif(trim(coalesce(p_reference, '')), '') end;
begin
  if me is null or not public.is_organizer() then raise exception 'Only the trip organizer can record a DP.'; end if;
  if p_request is null or num_nonnulls(p_booking, p_outside) <> 1 then raise exception 'Choose one booking and reload the receipt form.'; end if;
  -- Serialize receipt changes per booking. Receipt writes never change capacity/status.
  if p_booking is not null then
    select trip_id, dp into trip, due from public.bookings where ref = p_booking for update;
  else
    select trip_id, expected_dp into trip, due from public.outside_bookings where id = p_outside for update;
  end if;
  if trip is null or not exists (select 1 from public.trips where id = trip and organizer_id = me) then
    raise exception 'Only this trip''s organizer can record its DP.';
  end if;
  -- Authorization precedes replay, so a request id never reveals another booking.
  select * into saved from public.dp_receipts where request_id = p_request;
  if found then
    if saved.booking_ref is distinct from p_booking or saved.outside_id is distinct from p_outside
       or saved.recorded_by <> me or saved.amount is distinct from p_amount
       or saved.method is distinct from p_method or saved.received_at is distinct from p_received
       or saved.reason is distinct from why or saved.previous_id is distinct from p_previous
       or saved.reference is distinct from v_ref then
      raise exception 'This request was already used. Reload the receipt form.';
    end if;
    return saved;
  end if;
  select * into latest from public.dp_receipts
    where (p_booking is not null and booking_ref = p_booking)
       or (p_outside is not null and outside_id = p_outside)
    order by revision desc limit 1;
  if latest.id is distinct from p_previous then
    raise exception 'Another receipt change was saved. Refresh before correcting it.';
  end if;
  if due is null or p_amount is null or p_amount < 0 or p_amount > due then
    raise exception 'Enter the total DP received, from zero up to the expected DP.';
  end if;
  if why is null or char_length(why) not between 1 and 300 then raise exception 'Add a receipt note or correction reason (up to 300 characters).'; end if;
  if p_amount > 0 and (p_method is null or p_method not in ('GCash','Maya','Cash','Bank transfer')
       or p_received is null or p_received > now() + interval '5 minutes') then
    raise exception 'Choose the payment method and a received time that is not in the future.';
  end if;
  if p_amount = 0 and (p_method is not null or p_received is not null) then
    raise exception 'A zero receipt must have no payment method or received time.';
  end if;
  if v_ref is not null and char_length(v_ref) > 40 then raise exception 'The transaction reference can be up to 40 characters.'; end if;
  insert into public.dp_receipts(request_id, booking_ref, outside_id, trip_id, previous_id,
    amount, method, received_at, recorded_by, reason, reference)
  values(p_request, p_booking, p_outside, trip, p_previous, p_amount, p_method, p_received, me, why, v_ref)
  returning * into saved;
  return saved;
end $$;
revoke all on function public.record_dp_receipt from public, anon;
grant execute on function public.record_dp_receipt to authenticated;

-- ---------------------------------------------------------------------------
-- Organizer activity (added Nov 2026): a short feed of what joiners did on an organizer's
-- trips (booked, cancelled, moved a date), so the organizer can follow up quickly, for
-- example to send payment details for a new booking's DP. Written by triggers on bookings,
-- never by the website; the organizer can only read their own feed and mark it read.
-- Demo trips (no organizer) get no activity.
-- ---------------------------------------------------------------------------
create table if not exists public.organizer_activity (
  id            bigint generated always as identity primary key,
  organizer_id  uuid not null references public.profiles (id) on delete cascade,
  trip_id       text not null,
  date          date,
  booking_ref   text,
  kind          text not null,
  summary       text not null,
  created_at    timestamptz not null default now(),
  read_at       timestamptz
);
alter table public.organizer_activity drop constraint if exists organizer_activity_kind_check;
alter table public.organizer_activity add constraint organizer_activity_kind_check
  check (kind in ('booked', 'cancelled', 'moved', 'dp_sent', 'reminder', 'expired', 'rebooked', 'details_overdue', 'released'));
create index if not exists organizer_activity_feed on public.organizer_activity (organizer_id, created_at desc);
alter table public.organizer_activity enable row level security;
drop policy if exists "Organizers read their own activity" on public.organizer_activity;
create policy "Organizers read their own activity" on public.organizer_activity
  for select using (organizer_id = auth.uid());
revoke all on public.organizer_activity from anon, authenticated;
grant select on public.organizer_activity to authenticated;

create or replace function public.log_booking_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare org uuid; title text; who text := coalesce(nullif(new.display_name, ''), 'A joiner');
        n text := new.size || case when new.size = 1 then ' joiner' else ' joiners' end;
begin
  select t.organizer_id, coalesce(t.details ->> 'title', t.id) into org, title from public.trips t where t.id = new.trip_id;
  if org is null then return new; end if;
  if tg_op = 'INSERT' then
    insert into public.organizer_activity (organizer_id, trip_id, date, booking_ref, kind, summary)
    values (org, new.trip_id, new.date, new.ref, 'booked',
      who || ' booked ' || n || ' on ' || title || ', ' || to_char(new.date, 'Dy, Mon FMDD')
      || '. DP of ₱' || to_char(new.dp, 'FM999,999') || ' pending: send your payment details.'
      || coalesce(' Slots held until ' || to_char(new.hold_until at time zone 'Asia/Manila', 'Mon FMDD, FMHH12:MI AM') || '.', ''));
  elsif new.status = 'expired' and old.status <> 'expired' then
    insert into public.organizer_activity (organizer_id, trip_id, date, booking_ref, kind, summary)
    values (org, new.trip_id, new.date, new.ref, 'expired',
      who || '''s hold on ' || title || ', ' || to_char(new.date, 'Dy, Mon FMDD') || ' expired: DP not sent. '
      || n || ' released.');
  elsif new.status = 'confirmed' and old.status = 'expired' then
    insert into public.organizer_activity (organizer_id, trip_id, date, booking_ref, kind, summary)
    values (org, new.trip_id, new.date, new.ref, 'rebooked',
      who || ' was rebooked on ' || title || ', ' || to_char(new.date, 'Dy, Mon FMDD') || ' after paying late.');
  elsif new.dp_reference is distinct from old.dp_reference and new.dp_reference is not null then
    insert into public.organizer_activity (organizer_id, trip_id, date, booking_ref, kind, summary)
    values (org, new.trip_id, new.date, new.ref, 'dp_sent',
      who || case when old.dp_reference is null then ' sent the ₱' else ' changed the reference for the ₱' end
      || to_char(new.dp, 'FM999,999') || ' DP for ' || title || ', ' || to_char(new.date, 'Dy, Mon FMDD')
      || ' (ref ' || new.dp_reference || '). Check your wallet and record it.');
  elsif new.details_alerted_at is not null and old.details_alerted_at is null then
    insert into public.organizer_activity (organizer_id, trip_id, date, booking_ref, kind, summary)
    values (org, new.trip_id, new.date, new.ref, 'details_overdue',
      who || '''s booking on ' || title || ', ' || to_char(new.date, 'Dy, Mon FMDD') || ' is missing '
      || public.missing_details_text(public.booking_details_missing(new.companions, new.size, new.emergency, new.booker))
      || '. Details were due ' || to_char(public.details_due_date(new.date), 'Dy, Mon FMDD') || ': contact them, or release the slots under your policy.');
  elsif new.released_at is not null and old.released_at is null then
    insert into public.organizer_activity (organizer_id, trip_id, date, booking_ref, kind, summary)
    values (org, new.trip_id, new.date, new.ref, 'released',
      'You released ' || case when new.status = 'cancelled' then 'all of ' || who || '''s booking' else 'the unnamed slots in ' || who || '''s booking' end
      || ' on ' || title || ', ' || to_char(new.date, 'Dy, Mon FMDD') || '.');
  elsif new.dp_reminded_at is not null and old.dp_reminded_at is null then
    insert into public.organizer_activity (organizer_id, trip_id, date, booking_ref, kind, summary)
    values (org, new.trip_id, new.date, new.ref, 'reminder',
      'Reminder: ' || who || ' sent the DP for ' || title || ', ' || to_char(new.date, 'Dy, Mon FMDD')
      || ' over a day ago (ref ' || coalesce(new.dp_reference, '-') || '). Record it or contact them.');
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then
    insert into public.organizer_activity (organizer_id, trip_id, date, booking_ref, kind, summary)
    values (org, new.trip_id, new.date, new.ref, 'cancelled',
      who || ' cancelled ' || n || ' on ' || title || ', ' || to_char(new.date, 'Dy, Mon FMDD') || '. Their slots are open again.');
  elsif new.date <> old.date then
    insert into public.organizer_activity (organizer_id, trip_id, date, booking_ref, kind, summary)
    values (org, new.trip_id, new.date, new.ref, 'moved',
      who || ' moved ' || n || ' on ' || title || ' from ' || to_char(old.date, 'Dy, Mon FMDD') || ' to ' || to_char(new.date, 'Dy, Mon FMDD') || '.');
  end if;
  return new;
end $$;
drop trigger if exists log_booking_activity on public.bookings;
create trigger log_booking_activity
  after insert or update on public.bookings
  for each row execute function public.log_booking_activity();

-- Mark the signed-in organizer's activity as read: all of it, or only the ids given.
create or replace function public.mark_activity_read(p_ids bigint[] default null)
returns int language sql security definer set search_path = public as $$
  with done as (
    update public.organizer_activity set read_at = now()
     where organizer_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids))
    returning 1)
  select count(*)::int from done;
$$;
revoke all on function public.log_booking_activity, public.mark_activity_read from public, anon, authenticated;
grant execute on function public.mark_activity_read to authenticated;


-- ---------------------------------------------------------------------------
-- DP hold and expiry (TP-011, Nov 2026). Rule from issue #13, to confirm in interviews:
-- reserve -> slots held for dp_hold_hours (dp_hold_hours_soon when the trip is within
-- dp_hold_soon_days, Manila time); the joiner enters the GCash/Maya reference -> "DP sent,
-- waiting for organizer", the clock stops; the organizer is reminded after dp_reminder_hours
-- unconfirmed; no reference by the deadline -> slots released, booking "Expired: DP not sent";
-- paid after release -> the organizer rebooks if slots remain, otherwise refunds.
-- Change a number with: update app_settings set value = 8 where key = 'dp_hold_hours';
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  key    text primary key,
  value  numeric not null check (value > 0),
  note   text
);
alter table public.app_settings enable row level security;
drop policy if exists "Anyone reads settings" on public.app_settings;
create policy "Anyone reads settings" on public.app_settings for select using (true);
revoke all on public.app_settings from anon, authenticated;
grant select on public.app_settings to anon, authenticated;
-- Only adds missing keys: re-running this file never undoes a change you made.
insert into public.app_settings (key, value, note) values
  ('dp_hold_hours', 6, 'Hours a new booking holds its slots before the DP reference is sent'),
  ('dp_hold_hours_soon', 2, 'Hold hours when the trip is within dp_hold_soon_days'),
  ('dp_hold_soon_days', 3, 'Days before the trip when the shorter hold applies (Manila time)'),
  ('dp_reminder_hours', 24, 'Hours after the DP reference before the organizer is reminded')
on conflict (key) do nothing;

create or replace function public.app_setting(p_key text)
returns numeric language sql stable security definer set search_path = public as $$
  select value from public.app_settings where key = p_key;
$$;

-- When a booking made now for p_date stops holding its slots (unless the DP reference is sent).
create or replace function public.dp_hold_until(p_date date)
returns timestamptz language sql stable security definer set search_path = public as $$
  select now() + (case when p_date - public.ph_today() <= public.app_setting('dp_hold_soon_days')
                       then public.app_setting('dp_hold_hours_soon') else public.app_setting('dp_hold_hours') end)::float8
               * interval '1 hour';
$$;

-- Every change to the joiner's DP reference, so edits stay traceable.
create table if not exists public.dp_reference_log (
  id           bigint generated always as identity primary key,
  booking_ref  text not null references public.bookings (ref) on delete cascade,
  reference    text not null,
  previous     text,
  changed_by   uuid not null references public.profiles (id),
  changed_at   timestamptz not null default now()
);
alter table public.dp_reference_log enable row level security;
drop policy if exists "Booker and organizer read reference history" on public.dp_reference_log;
create policy "Booker and organizer read reference history" on public.dp_reference_log
  for select using (exists (select 1 from public.bookings b where b.ref = booking_ref
    and (b.user_id = auth.uid() or exists (select 1 from public.trips t where t.id = b.trip_id and t.organizer_id = auth.uid()))));
revoke all on public.dp_reference_log from anon, authenticated;
grant select on public.dp_reference_log to authenticated;

-- Joiner: "I've sent the DP", with the reference from their GCash/Maya receipt. Stops the
-- clock and keeps the slots. Changing it later is allowed and logged; clearing it isn't.
create or replace function public.send_dp_reference(p_ref text, p_reference text)
returns public.bookings language plpgsql security definer set search_path = public as $$
declare b public.bookings; r text := trim(coalesce(p_reference, ''));
begin
  if auth.uid() is null then raise exception 'Please sign in again.'; end if;
  -- Lock the date first, then the booking: the same order as every booking path (TP-013), so a
  -- reference can't land while someone else is taking the seats this hold just freed.
  perform 1 from public.departures d join public.bookings x on x.trip_id = d.trip_id and x.date = d.date
   where x.ref = p_ref and x.user_id = auth.uid() for update of d;
  select * into b from public.bookings where ref = p_ref and user_id = auth.uid() for update;
  if not found or b.status = 'cancelled' then raise exception 'Booking not found.'; end if;
  -- clock_timestamp(), not now(): a slow connection may have started its transaction before the
  -- deadline, but what counts is when the reference actually arrives.
  if b.status = 'expired' or (b.status = 'confirmed' and b.dp_sent_at is null and b.hold_until is not null and b.hold_until <= clock_timestamp()) then
    raise exception 'This reservation expired: the DP wasn''t sent in time, so its slots were released. Book again if slots remain, or contact the organizer.';
  end if;
  if r = '' then raise exception 'Enter the reference number from your GCash or Maya receipt.'; end if;
  if char_length(r) > 40 then raise exception 'The reference can be up to 40 characters.'; end if;
  if b.dp_reference = r then return b; end if;   -- the same reference again: nothing changes
  insert into public.dp_reference_log (booking_ref, reference, previous, changed_by) values (b.ref, r, b.dp_reference, auth.uid());
  update public.bookings set dp_reference = r, dp_sent_at = coalesce(dp_sent_at, now()) where ref = b.ref returning * into b;
  return b;
end $$;

-- Marks overdue holds expired (their slots are already free) and reminds organizers about DPs
-- sent over dp_reminder_hours ago and still not recorded. Safe to run any time, as often as
-- you like: each booking expires and is reminded at most once. Runs every 5 minutes (pg_cron,
-- below) and whenever someone books or opens My trips or the dashboard.
create or replace function public.expire_holds()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.bookings set status = 'expired', expired_at = hold_until
   where status = 'confirmed' and dp_sent_at is null and hold_until is not null and hold_until <= now();
  get diagnostics n = row_count;
  update public.bookings b set dp_reminded_at = now()
   where b.status = 'confirmed' and b.dp_sent_at is not null and b.dp_reminded_at is null
     and b.dp_sent_at <= now() - public.app_setting('dp_reminder_hours')::float8 * interval '1 hour'
     and not exists (select 1 from public.dp_receipts r where r.booking_ref = b.ref);
  perform public.flag_overdue_details();
  return n;
end $$;

-- Organizer: a joiner paid after their hold expired. Rebook them if the date still has room;
-- otherwise the DP is refunded under the trip's policy (outside TrailPeak).
create or replace function public.rebook_expired(p_ref text)
returns public.bookings language plpgsql security definer set search_path = public as $$
declare b public.bookings; dep public.departures; left_now int;
begin
  select * into b from public.bookings where ref = p_ref;
  if not found or not public.is_organizer()
     or not exists (select 1 from public.trips where id = b.trip_id and organizer_id = auth.uid()) then
    raise exception 'Only this trip''s organizer can rebook it.';
  end if;
  -- Date first, then the booking (ADR-009).
  select * into dep from public.departures where trip_id = b.trip_id and date = b.date for update;
  select * into b from public.bookings where ref = p_ref for update;
  if b.status = 'confirmed' then return b; end if;  -- already rebooked
  if b.status <> 'expired' then raise exception 'Only an expired booking can be rebooked.'; end if;
  if b.date < public.ph_today() then raise exception 'This date has passed.'; end if;
  if dep.status <> 'open' then raise exception 'This date is %. Reopen it first, or refund the DP.', dep.status; end if;
  left_now := public.slots_left(b.trip_id, b.date);
  if left_now < b.size then
    raise exception 'Only % % left, so this booking can''t come back. Refund the DP under the trip''s policy.',
      left_now, case when left_now = 1 then 'slot is' else 'slots are' end;
  end if;
  update public.bookings set status = 'confirmed', hold_until = null,
         note = 'Rebooked by the organizer after the hold expired.'
   where ref = p_ref returning * into b;
  return b;
end $$;

revoke all on function public.send_dp_reference, public.expire_holds, public.rebook_expired from public, anon;
grant execute on function public.send_dp_reference, public.expire_holds, public.rebook_expired to authenticated;
grant execute on function public.app_setting, public.dp_hold_until to anon, authenticated;

-- Run expire_holds every 5 minutes with pg_cron when the project has it (Supabase does).
-- Without it the slots are still released on time; only the "Expired" label waits until the
-- next booking or page load.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('trailpeak-expire-holds', '*/5 * * * *', 'select public.expire_holds()');
  end if;
exception when others then
  raise notice 'pg_cron not set up (%). Turn it on under Database > Extensions, then run this file again.', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- Edit and cancel outside bookings (TP-009, Nov 2026). Only the trip's organizer, and only
-- through the two functions below. Each locks the date first and then the booking (the same
-- order as add_outside_booking and book_trip), so changes and new bookings on one date run one
-- at a time. `revision` goes up with every change: an edit sent from an out-of-date screen is
-- refused instead of overwriting someone else's change. Every change keeps who, when, why and
-- the before/after values. DP receipts are never touched: a size change rescales the expected
-- DP and fee, and a cancel leaves any recorded DP as it is (refunds are handled outside).
-- ---------------------------------------------------------------------------
alter table public.outside_bookings add column if not exists revision int not null default 1;
alter table public.outside_bookings add column if not exists updated_at timestamptz;
alter table public.outside_bookings add column if not exists cancelled_at timestamptz;
alter table public.outside_bookings add column if not exists cancel_reason text;

create table if not exists public.outside_booking_changes (
  id           bigint generated always as identity primary key,
  outside_id   uuid not null references public.outside_bookings (id) on delete cascade,
  action       text not null check (action in ('edit', 'cancel')),
  reason       text not null check (char_length(reason) between 1 and 300),
  before       jsonb not null,
  after        jsonb not null,
  changed_by   uuid not null references public.profiles (id),
  changed_at   timestamptz not null default now()
);
create index if not exists outside_booking_changes_by_booking on public.outside_booking_changes (outside_id, id);
alter table public.outside_booking_changes enable row level security;
drop policy if exists "Organizers read changes on their trips" on public.outside_booking_changes;
create policy "Organizers read changes on their trips" on public.outside_booking_changes
  for select using (exists (select 1 from public.outside_bookings o join public.trips t on t.id = o.trip_id
                            where o.id = outside_id and t.organizer_id = auth.uid()));
revoke all on public.outside_booking_changes from anon, authenticated;
grant select on public.outside_booking_changes to authenticated;

-- The fields people can change, as one value for the history.
create or replace function public.outside_snapshot(o public.outside_bookings)
returns jsonb language sql immutable as $$
  select jsonb_build_object('name', o.name, 'size', o.size, 'pickup', o.pickup, 'pickup_time', o.pickup_time,
                            'phone', o.phone, 'source', o.source, 'status', o.status,
                            'expected_dp', o.expected_dp, 'total_fee', o.total_fee);
$$;

-- Check the caller owns the trip, then lock the date and then the booking (locks last until the
-- end of the calling function's transaction). Anything else gets the same "only the organizer"
-- message, so an id never reveals whether someone else's booking exists.
drop function if exists public.lock_outside_booking(uuid);
create or replace function public.lock_outside_booking(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t text; d date;
begin
  if auth.uid() is null then raise exception 'Please sign in again.'; end if;
  select trip_id, date into t, d from public.outside_bookings where id = p_id;
  if t is null or not public.is_organizer() or not exists (select 1 from public.trips where id = t and organizer_id = auth.uid()) then
    raise exception 'Only this trip''s organizer can change this booking.';
  end if;
  perform 1 from public.departures where trip_id = t and date = d for update;
  perform 1 from public.outside_bookings where id = p_id for update;
end $$;

create or replace function public.edit_outside_booking(
  p_id uuid, p_revision int, p_name text, p_size int, p_pickup text, p_pickup_time text,
  p_source text, p_phone text, p_reason text)
returns public.outside_bookings language plpgsql security definer set search_path = public as $$
declare o public.outside_bookings; dep public.departures; before jsonb; why text := trim(coalesce(p_reason, ''));
        nm text := left(trim(coalesce(p_name, '')), 100); pk text := left(trim(coalesce(p_pickup, '')), 100);
        pt text := nullif(left(trim(coalesce(p_pickup_time, '')), 20), ''); ph text; per_dp int; per_fee int; free int;
begin
  perform public.lock_outside_booking(p_id);
  select * into o from public.outside_bookings where id = p_id;
  select * into dep from public.departures where trip_id = o.trip_id and date = o.date;
  if o.status <> 'confirmed' then raise exception 'This booking was cancelled, so it can''t be edited.'; end if;
  ph := public.ph_mobile(p_phone, 'The mobile number');
  -- The same values again (a double click, a retry): nothing changes, nothing is logged.
  if o.name = nm and o.size = p_size and o.pickup = pk and o.pickup_time is not distinct from pt
     and o.phone is not distinct from ph and o.source = p_source then return o; end if;
  if p_revision is distinct from o.revision then
    raise exception 'This booking was changed since you opened it. Refresh and try again.';
  end if;
  if dep.date < public.ph_today() then raise exception 'This date has passed.'; end if;
  if nm = '' then raise exception 'Enter the booker''s name.'; end if;
  if p_size is null or p_size not between 1 and 20 then raise exception 'Joiners must be between 1 and 20.'; end if;
  if pk = '' then raise exception 'Choose a pick-up point.'; end if;
  if p_source not in ('messenger', 'in_person', 'other') then raise exception 'Choose how they booked.'; end if;
  if why = '' or char_length(why) > 300 then raise exception 'Add a short reason for the change (up to 300 characters).'; end if;
  if p_size > o.size then
    if dep.status <> 'open' then raise exception 'This date is %, so no joiners can be added. Reopen it first.', dep.status; end if;
    free := public.slots_left(o.trip_id, o.date);
    if free < p_size - o.size then
      raise exception 'Only % % left, so this booking can''t grow by %.', free, case when free = 1 then 'slot is' else 'slots are' end, p_size - o.size;
    end if;
  end if;
  before := public.outside_snapshot(o);
  per_dp := o.expected_dp / o.size; per_fee := o.total_fee / o.size;
  update public.outside_bookings
     set name = nm, size = p_size, pickup = pk, pickup_time = pt, phone = ph, source = p_source,
         expected_dp = per_dp * p_size, total_fee = per_fee * p_size, revision = revision + 1, updated_at = now()
   where id = p_id returning * into o;
  insert into public.outside_booking_changes (outside_id, action, reason, before, after, changed_by)
  values (p_id, 'edit', why, before, public.outside_snapshot(o), auth.uid());
  return o;
end $$;

-- Cancelling releases the booking's slots (seats_taken counts confirmed ones only). Cancelling
-- again returns the cancelled booking unchanged: nothing is released or logged twice.
create or replace function public.cancel_outside_booking(p_id uuid, p_reason text)
returns public.outside_bookings language plpgsql security definer set search_path = public as $$
declare o public.outside_bookings; dep public.departures; before jsonb; why text := trim(coalesce(p_reason, ''));
begin
  perform public.lock_outside_booking(p_id);
  select * into o from public.outside_bookings where id = p_id;
  select * into dep from public.departures where trip_id = o.trip_id and date = o.date;
  if o.status = 'cancelled' then return o; end if;
  if why = '' or char_length(why) > 300 then raise exception 'Add a short reason for cancelling (up to 300 characters).'; end if;
  before := public.outside_snapshot(o);
  update public.outside_bookings
     set status = 'cancelled', cancelled_at = now(), cancel_reason = why, revision = revision + 1, updated_at = now()
   where id = p_id returning * into o;
  insert into public.outside_booking_changes (outside_id, action, reason, before, after, changed_by)
  values (p_id, 'cancel', why, before, public.outside_snapshot(o), auth.uid());
  return o;
end $$;

revoke all on function public.lock_outside_booking, public.edit_outside_booking, public.cancel_outside_booking from public, anon;
revoke all on function public.lock_outside_booking from authenticated;
grant execute on function public.edit_outside_booking, public.cancel_outside_booking to authenticated;

-- ---------------------------------------------------------------------------
-- Organizer contact for booked joiners (TP-018, Nov 2026). A trip page shows the mobile number
-- the organizer typed in Post a trip (details.contact). Trips posted before that field existed
-- have none, so a joiner who has booked one sees the organizer's profile mobile in My trips.
-- Only for trips the caller has a booking on; never the organizer's other details.
-- ---------------------------------------------------------------------------
create or replace function public.my_booking_contacts()
returns table (trip_id text, org_name text, phone text)
language sql stable security definer set search_path = public as $$
  select distinct t.id, t.org_name, coalesce(nullif(t.details ->> 'contact', ''), p.phone)
  from public.bookings b
  join public.trips t on t.id = b.trip_id and t.organizer_id is not null
  join public.profiles p on p.id = t.organizer_id
  where b.user_id = auth.uid();
$$;
revoke all on function public.my_booking_contacts from public, anon;
grant execute on function public.my_booking_contacts to authenticated;


-- ---------------------------------------------------------------------------
-- Joiner details cut-off (TP-014, ADR-006). Names are due `details_due_days` (3) days before the
-- trip, on the Manila calendar: from that day on (trip date minus 3, inclusive) a new booking
-- needs every joiner's full name and the emergency contact before it confirms. The pages use
-- the same setting and Manila dates, so they agree with this function.
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value, note) values
  ('details_due_days', 3, 'Joiner names are due this many days before the trip (Manila dates); bookings made from then on need every name')
on conflict (key) do nothing;

-- The Manila calendar date of a moment (the database clock runs on UTC).
create or replace function public.ph_date(p_at timestamptz)
returns date language sql stable as $$ select (p_at at time zone 'Asia/Manila')::date $$;

-- The last moment to add names without them being required at booking: the due date.
create or replace function public.details_due_date(p_trip_date date)
returns date language sql stable security definer set search_path = public as $$
  select p_trip_date - public.app_setting('details_due_days')::int;
$$;

-- Are every joiner's details required now for a trip on p_trip_date? p_today defaults to
-- today in Manila; tests pass it explicitly to check the boundaries.
create or replace function public.details_required(p_trip_date date, p_today date default null)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p_today, public.ph_today()) >= public.details_due_date(p_trip_date);
$$;
grant execute on function public.ph_date, public.details_due_date, public.details_required to anon, authenticated;


-- ---------------------------------------------------------------------------
-- Overdue joiner details (TP-016, ADR-008). From the due date (ADR-006), a booking that still
-- misses a joiner's name, the emergency contact or a guardian for an under-18 is "overdue".
-- The organizer gets one Activity alert per booking (no texts); the booker sees exactly what's
-- missing in My trips. Nothing is released automatically: the organizer may release the
-- unnamed slots (keeping the named joiners) or the whole booking, with a reason. Recorded DPs
-- are never touched: any refund follows the trip's policy, outside TrailPeak.
-- ---------------------------------------------------------------------------
alter table public.bookings add column if not exists details_alerted_at timestamptz;
alter table public.bookings add column if not exists released_at timestamptz;
alter table public.bookings add column if not exists release_reason text;
alter table public.bookings add column if not exists size_released int;   -- slots let go in a partial release

-- What's still missing, as a list the pages and alerts can name:
-- [{"item":"names","count":2}, {"item":"emergency"}, {"item":"guardian"}].
create or replace function public.booking_details_missing(p_companions jsonb, p_size int, p_emergency jsonb, p_booker jsonb)
returns jsonb language plpgsql immutable as $$
declare out jsonb := '[]'::jsonb; n int := p_size - 1 - coalesce(jsonb_array_length(p_companions), 0);
begin
  if n > 0 then out := out || jsonb_build_array(jsonb_build_object('item', 'names', 'count', n)); end if;
  if p_emergency is null or coalesce(trim(p_emergency ->> 'name'), '') = '' or coalesce(trim(p_emergency ->> 'phone'), '') = '' then
    out := out || '[{"item":"emergency"}]'::jsonb;
  end if;
  begin
    perform public.check_guardians(p_booker, coalesce(p_companions, '[]'::jsonb));
  exception when others then out := out || '[{"item":"guardian"}]'::jsonb;
  end;
  return out;
end $$;

create or replace function public.missing_details_text(p_missing jsonb)
returns text language sql immutable as $$
  select coalesce(string_agg(case m ->> 'item'
      when 'names' then (m ->> 'count') || case when (m ->> 'count')::int = 1 then ' joiner''s name' else ' joiners'' names' end
      when 'emergency' then 'the emergency contact'
      when 'guardian' then 'a guardian for someone under 18' end, ', '), 'nothing')
  from jsonb_array_elements(p_missing) m;
$$;

-- Alert organizers once per overdue booking. Runs inside expire_holds() (every 5 minutes).
create or replace function public.flag_overdue_details()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.bookings b set details_alerted_at = now()
   where b.details_alerted_at is null and b.date >= public.ph_today()
     and public.booking_holds_seat(b.status, b.hold_until, b.dp_sent_at)
     and exists (select 1 from public.trips t where t.id = b.trip_id and t.organizer_id is not null)
     and public.details_required(b.date)
     and jsonb_array_length(public.booking_details_missing(b.companions, b.size, b.emergency, b.booker)) > 0;
  get diagnostics n = row_count;
  return n;
end $$;

-- Organizer: release an overdue booking's slots. p_whole = false releases only the unnamed
-- slots (the booking shrinks to the booker plus the named joiners; only when the emergency
-- contact and guardians are in place); p_whole = true cancels the whole booking. Needs a reason.
-- Releasing again is refused. DP receipts are untouched.
create or replace function public.release_overdue_booking(p_ref text, p_reason text, p_whole boolean)
returns public.bookings language plpgsql security definer set search_path = public as $$
declare b public.bookings; missing jsonb; why text := trim(coalesce(p_reason, '')); keep int; per_dp int; per_bal int;
begin
  select * into b from public.bookings where ref = p_ref;
  if not found or not public.is_organizer()
     or not exists (select 1 from public.trips where id = b.trip_id and organizer_id = auth.uid()) then
    raise exception 'Only this trip''s organizer can release these slots.';
  end if;
  perform 1 from public.departures where trip_id = b.trip_id and date = b.date for update;   -- same lock order as bookings
  select * into b from public.bookings where ref = p_ref for update;
  if b.status <> 'confirmed' then raise exception 'This booking is no longer active.'; end if;
  if b.date < public.ph_today() then raise exception 'This trip date has passed.'; end if;
  if not public.details_required(b.date) then
    raise exception 'Details aren''t due yet (due %). You can release slots only after that.', to_char(public.details_due_date(b.date), 'Dy, Mon FMDD');
  end if;
  missing := public.booking_details_missing(b.companions, b.size, b.emergency, b.booker);
  if jsonb_array_length(missing) = 0 then raise exception 'This booking''s details are complete, so its slots can''t be released this way.'; end if;
  if why = '' or char_length(why) > 300 then raise exception 'Add a short reason (up to 300 characters).'; end if;
  if coalesce(p_whole, false) then
    update public.bookings set status = 'cancelled', released_at = now(), release_reason = why, size_released = size,
           note = 'Released by the organizer: joiner details weren''t complete by ' || to_char(public.details_due_date(date), 'Dy, Mon FMDD')
                  || '. Reason: ' || why || '. Any DP refund follows the trip''s policy.'
     where ref = p_ref returning * into b;
  else
    if missing @> '[{"item":"emergency"}]'::jsonb or missing @> '[{"item":"guardian"}]'::jsonb then
      raise exception 'The emergency contact or a guardian is missing, so only the whole booking can be released.';
    end if;
    keep := 1 + jsonb_array_length(b.companions);
    per_dp := b.dp / b.size; per_bal := b.balance / b.size;
    update public.bookings set released_at = now(), release_reason = why, size_released = size - keep,
           size = keep, dp = per_dp * keep, balance = per_bal * keep,
           note = 'The organizer released ' || (size - keep) || ' unnamed ' || case when size - keep = 1 then 'slot' else 'slots' end
                  || ': names weren''t in by ' || to_char(public.details_due_date(date), 'Dy, Mon FMDD') || '. Reason: ' || why
                  || '. Any DP refund follows the trip''s policy.'
     where ref = p_ref returning * into b;
  end if;
  return b;
end $$;

-- Organizer: what's missing on each booking of theirs that's past its details due date.
create or replace function public.organizer_overdue()
returns table (ref text, details_missing jsonb, due date)
language sql stable security definer set search_path = public as $$
  select b.ref, public.booking_details_missing(b.companions, b.size, b.emergency, b.booker), public.details_due_date(b.date)
  from public.bookings b join public.trips t on t.id = b.trip_id and t.organizer_id = auth.uid()
  where b.date >= public.ph_today() and public.details_required(b.date)
    and public.booking_holds_seat(b.status, b.hold_until, b.dp_sent_at)
    and jsonb_array_length(public.booking_details_missing(b.companions, b.size, b.emergency, b.booker)) > 0;
$$;

revoke all on function public.flag_overdue_details, public.release_overdue_booking, public.organizer_overdue from public, anon;
grant execute on function public.organizer_overdue to authenticated;
revoke all on function public.flag_overdue_details from authenticated;
grant execute on function public.release_overdue_booking to authenticated;
grant execute on function public.booking_details_missing, public.missing_details_text to anon, authenticated;
