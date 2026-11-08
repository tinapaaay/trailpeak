-- TrailPeak light backend: accounts, trips, dates and bookings.
-- Payments and ID checks are still simulated; see supabase/SETUP.md.
-- Run this in the Supabase SQL editor, then run seed.sql. Safe to run again after changes.
--
-- Privacy model (Row Level Security):
--   * Everyone can read published trips and their dates.
--   * You can read and change only your own profile.
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
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  name         text not null default '',
  phone        text,
  role         text not null default 'joiner' check (role in ('joiner', 'organizer')),
  org          text,
  id_verified  boolean not null default false,   -- simulated ID check for now
  business     text not null default 'none' check (business in ('none', 'review', 'verified')),
  payout       jsonb,                              -- { wallet, number }
  created_at   timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists "Read own profile" on public.profiles;
create policy "Read own profile" on public.profiles
  for select using (auth.uid() = id);
drop policy if exists "Create own profile" on public.profiles;
create policy "Create own profile" on public.profiles
  for insert with check (auth.uid() = id);
drop policy if exists "Update own profile" on public.profiles;
create policy "Update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

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
  for insert with check (
    organizer_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'organizer'));
drop policy if exists "Organizers edit their own trips" on public.trips;
create policy "Organizers edit their own trips" on public.trips
  for update using (organizer_id = auth.uid()) with check (organizer_id = auth.uid());

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
  for all using (exists (select 1 from public.trips t where t.id = trip_id and t.organizer_id = auth.uid()))
  with check (exists (select 1 from public.trips t where t.id = trip_id and t.organizer_id = auth.uid()));

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

-- Seats left on a date: capacity minus sample seats minus confirmed bookings.
create or replace function public.slots_left(p_trip text, p_date date)
returns int language sql stable security definer set search_path = public as $$
  select greatest(0, d.capacity - d.sample_booked - coalesce((
    select sum(b.size) from public.bookings b
    where b.trip_id = p_trip and b.date = p_date and b.status = 'confirmed'), 0))::int
  from public.departures d where d.trip_id = p_trip and d.date = p_date;
$$;

-- Seats left for every date of every trip, for the search page.
create or replace function public.all_slots()
returns table (trip_id text, date date, left_count int, status text)
language sql stable security definer set search_path = public as $$
  select d.trip_id, d.date, public.slots_left(d.trip_id, d.date), d.status from public.departures d;
$$;

-- Reserve: checks the date is open and has room, then records the booking.
-- The DP and balance come from the trip on the server, not from the browser.
create or replace function public.book_trip(
  p_trip text, p_date date, p_size int, p_pickup text, p_pickup_time text,
  p_wallet text, p_wallet_number text, p_names text, p_listed boolean)
returns public.bookings language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  dep public.departures;
  t public.trips;
  who public.profiles;
  b public.bookings;
begin
  if me is null then raise exception 'Sign in to reserve.'; end if;
  select * into dep from public.departures where trip_id = p_trip and date = p_date for update;
  if not found or dep.status <> 'open' then raise exception 'This date is not open for booking.'; end if;
  if p_date < public.ph_today() then raise exception 'This date has passed.'; end if;
  if public.slots_left(p_trip, p_date) < p_size then raise exception 'Not enough slots left on this date.'; end if;
  select * into t from public.trips where id = p_trip;
  select * into who from public.profiles where id = me;
  insert into public.bookings (ref, trip_id, date, user_id, size, pickup, pickup_time, dp, balance,
                               wallet, wallet_number, names, listed, display_name)
  values ('TP-' || upper(substr(md5(random()::text), 1, 6)), p_trip, p_date, me, p_size, p_pickup, p_pickup_time,
          (t.details ->> 'dp')::int * p_size,
          ((t.details ->> 'fee')::int - (t.details ->> 'dp')::int) * p_size,
          p_wallet, p_wallet_number, nullif(p_names, ''), coalesce(p_listed, false),
          -- "Ana Reyes" -> "Ana R."
          case when position(' ' in trim(who.name)) > 0
               then split_part(trim(who.name), ' ', 1) || ' ' || left(regexp_replace(trim(who.name), '^.* ', ''), 1) || '.'
               else trim(who.name) end)
  returning * into b;
  return b;
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

-- Organizer dashboard: bookings on the caller's trips, with the joiner's name and phone.
create or replace function public.organizer_bookings()
returns table (ref text, trip_id text, date date, size int, pickup text, pickup_time text, dp int, balance int,
               wallet text, joiner_name text, joiner_phone text, status text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.ref, b.trip_id, b.date, b.size, b.pickup, b.pickup_time, b.dp, b.balance, b.wallet,
         p.name, p.phone, b.status, b.created_at
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
revoke all on function public.book_trip, public.move_booking, public.cancel_booking, public.organizer_bookings, public.add_review from public, anon;
grant execute on function public.book_trip, public.move_booking, public.cancel_booking, public.organizer_bookings, public.add_review to authenticated;
grant execute on function public.slots_left, public.all_slots, public.whos_going, public.all_reviews, public.ph_today to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Table access for the website's API roles (the project has "automatically expose
-- new tables" turned off, so each table is opened on purpose here). Row Level
-- Security above still decides which rows each person sees.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on public.trips, public.departures to anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant insert, update on public.trips to authenticated;
grant insert, update, delete on public.departures to authenticated;
grant select on public.bookings to authenticated;   -- changes go through the functions only
grant select on public.reviews to authenticated;    -- own rows only; writes go through add_review
