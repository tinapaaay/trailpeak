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

-- Owner only (SQL editor or service role). Approve an organizer, optionally recording an ID
-- you checked yourself and the business check result. Safe to run again to change them.
--   select approve_organizer('<user id>');                          -- organizer, not ID verified
--   select approve_organizer('<user id>', true);                    -- organizer, ID verified
--   select approve_organizer('<user id>', true, 'verified');        -- plus Business verified
create or replace function public.approve_organizer(
  p_user uuid, p_id_verified boolean default false, p_business text default 'none')
returns public.profiles language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  if p_business not in ('none', 'review', 'verified') then raise exception 'business must be none, review or verified'; end if;
  update public.profiles
     set role = 'organizer', organizer_status = 'approved', id_verified = coalesce(p_id_verified, false), business = p_business
   where id = p_user returning * into p;
  if not found then raise exception 'No profile with id %', p_user; end if;
  update public.trips set details = details where organizer_id = p_user;   -- refresh the trips' verified seal
  return p;
end $$;

-- Owner only. Turn organizer access off: they can no longer post, edit trips or change dates.
-- Their published trips stay up; unpublish them with: update trips set published = false where organizer_id = '<user id>';
create or replace function public.revoke_organizer(p_user uuid)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
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
                    where b.trip_id = p_trip and b.date = p_date and b.status = 'confirmed'), 0)
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
create or replace function public.clean_details(p_companions jsonb, p_size int, p_emergency jsonb)
returns jsonb language plpgsql immutable as $$
declare c jsonb; out jsonb := '[]'::jsonb;
begin
  if p_companions is null or jsonb_typeof(p_companions) <> 'array' then p_companions := '[]'::jsonb; end if;
  if jsonb_array_length(p_companions) > p_size - 1 then raise exception 'More names than joiners in this booking.'; end if;
  for c in select * from jsonb_array_elements(p_companions) loop
    if coalesce(trim(c ->> 'name'), '') = '' then raise exception 'Enter each joiner''s full name, or add them later.'; end if;
    if coalesce(c ->> 'age', '') not in ('adult', 'minor') then raise exception 'Choose 18 or older, or under 18, for each joiner.'; end if;
    out := out || jsonb_build_array(jsonb_build_object('name', left(trim(c ->> 'name'), 100), 'age', c ->> 'age',
                                                        'phone', nullif(left(trim(coalesce(c ->> 'phone', '')), 20), '')));
  end loop;
  if p_emergency is null or coalesce(trim(p_emergency ->> 'name'), '') = '' or coalesce(trim(p_emergency ->> 'phone'), '') = '' then
    raise exception 'Add an emergency contact: someone not on the hike, with a mobile number.';
  end if;
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
create or replace function public.book_trip(
  p_trip text, p_date date, p_size int, p_pickup text, p_pickup_time text,
  p_wallet text, p_wallet_number text, p_names text, p_listed boolean,
  p_companions jsonb default '[]'::jsonb, p_emergency jsonb default null)
returns public.bookings language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  dep public.departures;
  t public.trips;
  who public.profiles;
  b public.bookings;
  people jsonb;
begin
  if me is null then raise exception 'Sign in to reserve.'; end if;
  people := public.clean_details(p_companions, p_size, p_emergency);
  perform public.clear_old_details();
  select * into dep from public.departures where trip_id = p_trip and date = p_date for update;
  if not found or dep.status <> 'open' then raise exception 'This date is not open for booking.'; end if;
  if p_date < public.ph_today() then raise exception 'This date has passed.'; end if;
  if public.slots_left(p_trip, p_date) < p_size then raise exception 'Not enough slots left on this date.'; end if;
  select * into t from public.trips where id = p_trip;
  select * into who from public.profiles where id = me;
  insert into public.bookings (ref, trip_id, date, user_id, size, pickup, pickup_time, dp, balance,
                               wallet, wallet_number, names, listed, display_name, companions, emergency)
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
                             'phone', left(trim(p_emergency ->> 'phone'), 20)))
  returning * into b;
  return b;
end $$;

-- Add or change joiner names and the emergency contact, any time before the trip date.
create or replace function public.update_booking_details(p_ref text, p_companions jsonb, p_emergency jsonb)
returns public.bookings language plpgsql security definer set search_path = public as $$
declare b public.bookings; people jsonb;
begin
  select * into b from public.bookings where ref = p_ref and user_id = auth.uid() and status = 'confirmed' for update;
  if not found then raise exception 'Booking not found.'; end if;
  if b.date < public.ph_today() then raise exception 'This trip date has passed.'; end if;
  people := public.clean_details(p_companions, b.size, p_emergency);
  update public.bookings set companions = people,
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
          nullif(left(trim(coalesce(p_pickup_time, '')), 20), ''), nullif(left(trim(coalesce(p_phone, '')), 20), ''), p_source)
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
    select exists (select 1 from public.bookings
                   where trip_id = p_trip and date = p_date and user_id = auth.uid() and status = 'confirmed') as booked)
  select case when (select booked from mine) and (b.listed or b.user_id = auth.uid()) then b.display_name end,
         b.size,
         b.user_id = auth.uid()
  from public.bookings b
  where b.trip_id = p_trip and b.date = p_date and b.status = 'confirmed';
$$;

-- Organizer dashboard: bookings on the caller's trips, with the joiner's name and phone,
-- the other joiners' names and ages, and the emergency contact (until 30 days after the trip).
drop function if exists public.organizer_bookings();
create or replace function public.organizer_bookings()
returns table (ref text, trip_id text, date date, size int, pickup text, pickup_time text, dp int, balance int,
               wallet text, joiner_name text, joiner_phone text, status text, created_at timestamptz,
               companions jsonb, emergency jsonb)
language sql stable security definer set search_path = public as $$
  select b.ref, b.trip_id, b.date, b.size, b.pickup, b.pickup_time, b.dp, b.balance, b.wallet,
         p.name, p.phone, b.status, b.created_at,
         case when b.date >= public.ph_today() - 30 then b.companions else '[]'::jsonb end,
         case when b.date >= public.ph_today() - 30 then b.emergency end
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

create or replace function public.record_dp_receipt(
  p_request uuid, p_booking text, p_outside uuid, p_previous uuid,
  p_amount int, p_method text, p_received timestamptz, p_reason text)
returns public.dp_receipts language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); trip text; due int; latest public.dp_receipts;
  saved public.dp_receipts; why text := trim(p_reason);
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
       or saved.reason is distinct from why or saved.previous_id is distinct from p_previous then
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
  insert into public.dp_receipts(request_id, booking_ref, outside_id, trip_id, previous_id,
    amount, method, received_at, recorded_by, reason)
  values(p_request, p_booking, p_outside, trip, p_previous, p_amount, p_method, p_received, me, why)
  returning * into saved;
  return saved;
end $$;
revoke all on function public.record_dp_receipt from public, anon;
grant execute on function public.record_dp_receipt to authenticated;
