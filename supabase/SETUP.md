# Setting up the TrailPeak backend (Supabase)

This adds real accounts and shared trips and bookings. **Payments stay simulated, and you approve organizers by hand** (see [Approve an organizer](#approve-an-organizer)). It takes about 10 minutes and uses Supabase's free plan.

## 1. Create the project

1. Go to [supabase.com](https://supabase.com) and sign up (signing in with GitHub is easiest).
2. Click **New project**.
   - **Name:** `trailpeak`
   - **Database password:** make a strong one and save it in your password manager. You won't need to share it with anyone, including Claude.
   - **Region:** Southeast Asia (Singapore), closest to the Philippines.
   - **Security:** keep **Enable Data API** on, turn **Automatically expose new tables** off (`schema.sql` opens each table on purpose), and turn **Enable automatic RLS** on.
3. Wait a minute or two while the project starts.

## 2. Create the tables

1. In the left menu, open **SQL Editor** and click **New query**.
2. Open `supabase/schema.sql` from this repo, copy all of it, paste it in, and click **Run**. You should see "Success. No rows returned".
3. **Don't run `supabase/seed.sql`** on a new project. It adds the 6 old sample trips, which the site no longer shows (#89, #95); it's kept only for older databases and local tests.

Both files are safe to run again later.

## 3. Turn on sign-in by email code

1. Open **Authentication → Sign In / Providers**. **Email** should already be on.
2. Open **Authentication → Email Templates** and add this line to **both** the **Confirm signup** template (new accounts) and the **Magic Link** template (returning accounts), so people get a code instead of only a link:

   ```html
   <p>Your TrailPeak code: <strong>{{ .Token }}</strong></p>
   ```
3. Open **Authentication → URL Configuration**:
   - **Site URL:** `https://tinapaaay.github.io/trailpeak/`
   - **Redirect URLs:** add `https://tinapaaay.github.io/trailpeak/**` and `http://localhost:5391/**` (the email link returns to the sign-in page)

The free plan's built-in email sender only sends a few emails per hour. That's enough for testing; a real launch needs your own email service.

## 4. Share two values with Claude

Open **Project Settings → API Keys** (or **Data API**) and copy:

- the **Project URL**, like `https://abcdefgh.supabase.co`
- the **anon / publishable** key (starts with `eyJ` or `sb_publishable_`)

These two are meant to be public: they go in the website's code, and the privacy rules in `schema.sql` protect the data.

**Never share** the `service_role` / secret key or the database password. Those can bypass every rule.

## Sign in with Google (optional, about 15 minutes)

One tap, no email to wait for. The **Continue with Google** button appears on the sign-in page by itself once this is on.

**In Google Cloud** ([console.cloud.google.com](https://console.cloud.google.com)), signed in with your Google account:

1. Top bar → project picker → **New project** → name it `TrailPeak` → **Create**, then select it.
2. Search for **Google Auth Platform** (it used to be "OAuth consent screen") → **Get started**:
   - **App name:** `TrailPeak` · **User support email:** your email
   - **Audience:** External
   - **Contact email:** your email → agree → **Create**
3. **Clients → Create client:**
   - **Application type:** Web application · **Name:** `TrailPeak website`
   - **Authorized JavaScript origins:** `https://tinapaaay.github.io` and `http://localhost:5391`
   - **Authorized redirect URIs:** `https://fjssjgefufwuadrltvjf.supabase.co/auth/v1/callback`
   - **Create.** Keep the window with the **Client ID** and **Client secret** open.
4. **Audience → Publish app → Confirm.** Until you do, only Google accounts you add as test users can sign in. TrailPeak asks only for name and email, so Google doesn't need to review it.

**In Supabase:**

5. **Authentication → Sign In / Providers → Google** → turn it on, paste the **Client ID** and **Client secret** → **Save**.

Don't send the client secret to anyone, including Claude. It goes only into Supabase.

Google's screen will say "continue to fjssjgefufwuadrltvjf.supabase.co". Showing "TrailPeak" there needs a custom domain (a paid Supabase add-on), which can wait until launch.

## After an update

When `schema.sql` changes (for example, the November 2026 updates added reviews, Manila-time date rules, joiner names with an emergency contact, organizer approval, the slots guard, and outside bookings), open **SQL Editor → New query**, paste all of `schema.sql` again and click **Run**. It keeps your existing accounts, trips and bookings. Run it right after pulling the update: the website and the database functions change together, so until you do, new features (and after the joiner-details update, new bookings) won't work.

## Dates, slots and closing

Organizers change a date's slots on the dashboard (**Change slots**). The database refuses any number below the slots already taken (bookings plus sample seats), with a message that says the lowest number allowed. This holds for the website, direct API calls and the SQL editor. **Close** stops new bookings but keeps existing ones; **Reopen** makes the date bookable again if slots remain. **Cancel for weather** is final: a cancelled date can't be reopened, so add it again as a new date if plans change. Organizers can't move a date or change sample seats.

The November 2026 update (issue #3) doesn't change any existing date. To see dates that were set below their bookings before it, run:

```sql
select d.trip_id, d.date, d.capacity, seats_taken(d.trip_id, d.date) as taken
from departures d where d.capacity < seats_taken(d.trip_id, d.date);
```

Those dates show 0 slots left. The organizer can raise them, or leave them as they are.

## Outside bookings

Joiners who book through Messenger, in person or another way can be added by the trip's organizer on the dashboard (**Add outside booking**). They use slots straight away, through the same check as online bookings, so the public slot count, the slots guard and online bookings all see them. Only the trip's organizer can add or see them; their names and numbers never appear in Who's going. Adding one doesn't record a DP (use the separate Record DP action after checking a direct payment). Each form submit carries a one-time id, so a double click or a retry saves it once. Editing and cancelling them comes later (TP-009).

To see them in the SQL editor:

```sql
select trip_id, date, name, size, pickup, source, created_at from outside_bookings order by date, created_at;
```

## Activity, references and mobile checks (November 2026)

- **Activity:** when a joiner books, cancels or moves a date on an organizer's trip, the database adds a line to that organizer's activity (dashboard, top). The header's **Dashboard** button shows how many are unread. It's in-app only: nothing is emailed or texted yet. Old bookings from before this update don't create activity.
- **Transaction reference:** Record DP has an optional reference number field. Both the organizer and the joiner see it.
- **Mobile numbers:** the database now refuses mobile numbers that aren't a Philippine mobile (10 digits starting with 9), for outside bookings, joiner names and emergency contacts. Numbers saved before this update aren't changed; to find outside bookings with a bad number:

```sql
select trip_id, date, name, phone from outside_bookings
where phone is not null and regexp_replace(phone, '\D', '', 'g') !~ '^(63|0)?9[0-9]{9}$';
```

## DP hold and expiry (TP-011)

A new booking holds its slots for **6 hours**, or **2 hours** when the trip is within 3 days (Manila time). The joiner sends the DP to the organizer and enters the GCash or Maya reference in My trips: the booking shows **DP sent, waiting for organizer**, the clock stops and the slots stay held. With no reference by the deadline, the slots are free again at once and the booking shows **Expired: DP not sent**. If the organizer hasn't recorded a sent DP after 24 hours, their dashboard Activity reminds them. A joiner who paid after their hold expired can be brought back with **Rebook** on the dashboard if the date still has room; otherwise the organizer refunds the DP under the trip's policy. Bookings made before this update have no deadline and never expire.

The four numbers live in one table, so you can change them after the interviews without touching code:

```sql
select * from app_settings;
update app_settings set value = 8 where key = 'dp_hold_hours';        -- hold for 8 hours instead of 6
```

Re-running `schema.sql` never resets a value you changed.

**The expiry job.** `schema.sql` turns on Supabase's **pg_cron** extension and schedules `expire_holds()` every 5 minutes. If the SQL editor shows a notice that pg_cron isn't set up, open **Database → Extensions**, turn on **pg_cron**, and run `schema.sql` again. Even without it, slots are released on time; only the "Expired" label waits until the next booking or page load. To check the job: `select jobname, schedule from cron.job;`

## What's real and what's still simulated

| Real now | Still simulated |
| --- | --- |
| Accounts (email link, or Google once it's set up) | Facebook and mobile-text sign-in |
| Trips, dates and slots shared by everyone | GCash / Maya payment |
| Bookings, move and cancel, checked on the server | Automatic ID and business checks (you check them by hand) |
| Organizers see joiners' bookings | Texts to joiners |
| Who's going (opt-in, same-date only) | |
| Reviews (one per booking, after the trip date) | |
| Editing a published trip | |
| Organizer approval (by you, in the SQL editor) | |

## Approve an organizer

Since the November 2026 update (issue #1), nobody can make themselves an organizer or "ID verified". Organizer sign-up ends with **Application received**, and the database refuses any attempt to change `role`, `id_verified`, `business` or `organizer_status` from the website, even a hand-made API call. Only you can, from the SQL editor.

**1. See who is waiting.** SQL Editor → New query:

```sql
select id, name, org, phone, application, applied_at
from profiles where organizer_status = 'pending' order by applied_at;
```

`application` shows which ID they chose and whether they have business documents. The ID photos never leave their phone, so check the ID yourself (for example on a video call) before you mark it verified.

**2. Go through the pilot checklist** (on a short video call is easiest). Approve only when every item is true:

| Key | Check |
| --- | --- |
| `id_checked` | Saw their government ID on a video call; the name matches their TrailPeak profile |
| `payout_matches` | Their GCash or Maya account name matches that ID |
| `track_record` | They have run joiner trips before (posts, reviews or a reference you checked) |
| `permits_known` | They know the registration and permit steps for the mountains they will post |
| `safety_plan` | They have a guide ratio and an emergency plan (who to call, nearest hospital) |
| `pilot_rules` | They agreed to the pilot rules: outside bookings within 1 hour, confirm DPs within 24 hours, check the list 2 days before |

**3. Approve.** Copy their `id`, put your name as the approver, and run:

```sql
select approve_organizer('paste-the-id-here', p_approver => 'Christine',
  p_checklist => '{"id_checked":true,"payout_matches":true,"track_record":true,"permits_known":true,"safety_plan":true,"pilot_rules":true}',
  p_note => 'Video call Nov 12');
```

If an item is missing (or not exactly `true`), nothing changes and the message lists what's left. Add `true` after the id to give the ID verified badge (`approve_organizer('id', true, p_approver => …)`), or `true, 'verified'` for Business verified too. Changing those labels later doesn't need the checklist again. They see the Dashboard and Post a trip the next time they open the site. The verified seal on their trips follows their profile automatically; organizers can't set it themselves.

**4. Turn access off (if needed).**

```sql
select revoke_organizer('paste-the-id-here', p_approver => 'Christine', p_note => 'why');
-- Their trips stay up. To hide them too:
update trips set published = false where organizer_id = 'paste-the-id-here';
```

A revoked account can't post, edit its trips or change dates, and can't re-apply on its own. To restore it, run `approve_organizer` again with the full checklist.

**Approval record.** Every approval, label change and revoke is kept, with who did it, the checklist and the note:

```sql
select a.at, p.name, p.org, a.action, a.approver, a.note from organizer_approvals a join profiles p on p.id = a.user_id order by a.at desc;
```

Organizers approved before this checklist existed stay approved; their record starts with the next change.

These two functions only work in the SQL editor (or with the service role). The website's keys can't call them.

### What the first run of this update did to old data

Before this update, sign-up made people organizers and "ID verified" on the spot, but nothing was checked. So the first time you run the new `schema.sql`, it:

- moves every existing organizer back to **pending** (they keep their trips, but can't post or edit until you approve them), and
- clears every simulated ID and business check, so no old badge looks like a real check.

Later runs don't touch approvals you've made. Sample trips from `seed.sql` keep their sample badges.


## Direct DP receipt records (TP-010 / issue #5)

Apply the updated `schema.sql` before deploying this application change. Do not rerun `seed.sql` against existing pilot data. The upgrade is repeatable and preserves accounts/bookings. Test first in a staging project. It creates an empty `dp_receipts` history: **existing simulated DP amounts are not receipts**. `bookings.dp` is the expected DP; `dp + balance` remains its original total fee snapshot. Outside bookings now snapshot `expected_dp` and `total_fee`; the first upgrade uses their trip's current prices because older outside rows had no price snapshot. Review that initial backfill before enabling pilot receipts. Future price changes do not rewrite snapshots.

Only the owning organizer can use **Record DP** on a joiner or outside booking. Enter the total DP received so far (whole pesos, from zero up to expected DP), method, Philippine received time and a note. Partial DPs are supported; meetup/full-balance payments are outside this form's scope. To correct it, choose **Correct DP / history** and enter the replacement total and reason. Zero resets the DP to pending; this is a bookkeeping correction, not a refund. The history records the actor, received/recorded times and previous record. Corrections to cancelled bookings do not reopen them.

`record_dp_receipt` checks owner authorization before replay, locks the target booking, compares the previous receipt to reject stale edits, and treats identical request ids/payloads as one write. Normal clients can read authorized history but cannot insert/update/delete it directly. Receipt changes never change booking status or occupied seats. Joiners see the same current amount and remaining balance in My trips. This records an organizer's statement, not wallet/provider verification. TrailPeak does not move money, send payouts, verify transfers, or deliver automated receipt notifications.

Demo/pilot separation (TP-004 / issue #10): `demo.html` contains only in-memory sample slots; it loads no SDK, account data, config or API client and makes no booking/payment requests. Refreshing or resetting it changes only its sample state. On the database, a trip with `organizer_id IS NULL` is a seeded demo trip. `book_trip` and `move_booking` refuse those trips. Outside-booking and receipt operations require the owning organizer, which a seeded sample cannot have. Normal users cannot claim a sample trip by changing its organizer id. Existing sample bookings remain labelled legacy demo records, with no real DP due; they are not promoted or deleted. Organizer-owned trips are real reservations, always DP pending until an owner receipt is recorded. A browser mode toggle cannot change these server checks. This is not full pilot readiness: other P0 backlog items still apply.

Regression tests: `npm ci --prefix tests` then `npm test --prefix tests`. They upgrade from the PR #9 main schema and verify RLS, RPC permissions, replay, stale corrections, validation, price snapshots and unchanged inventory. PGlite is single-connection; a true two-connection race and live Supabase smoke test remain required.

For a synthetic browser fixture, run `node tests/preview.mjs` after installing the test dependency. Open `http://127.0.0.1:8015/dashboard.html`, record a receipt, then `/mytrips.html?testRole=joiner`. This local fixture uses mock sessions and real PGlite schema/functions; it never connects to live Supabase. Stop it when finished.

## Edit and cancel outside bookings (TP-009)

On the dashboard, each outside booking has **Edit** and **Cancel** (owning organizer only). Adding joiners needs free slots; removing joiners or cancelling opens them again, exactly once. Every change needs a reason and is kept in `outside_booking_changes` (who, when, why, before/after). Recorded DPs are never changed or refunded by an edit or a cancel.


## Organizer contact and booking help (TP-018)

Post a trip now asks for a **mobile number for joiners**, shown on the trip page under Ask the organizer. Trips posted before that have none on the page; joiners who book one see the organizer's profile mobile in My trips instead (`my_booking_contacts()`, only for trips they booked). To add a number to an older trip, open it with **Edit trip** on the dashboard and save. The trip and reserve pages explain the booking steps (hold, paying the organizer directly, the reference, rain, cancelling, contact).

## Booking privacy check (TP-005)

`tests/privacy.test.mjs` checks every role against every way to read booking data, straight through the database (no website): booker, another joiner on the same date, a joiner on another date, the trip's organizer, another organizer, and signed out. Summary of what each gets:

| Data | Booker | Same-date joiner | Other joiner | Trip's organizer | Other organizer | Signed out |
| --- | --- | --- | --- | --- | --- | --- |
| Booking, group, emergency contact, wallet | own only | own only | own only | their trips' | none | denied |
| Profiles | own | own | own | own | own | denied |
| Outside bookings, activity, change history | none | none | none | their trips' | none | denied |
| DP receipts and reference log | own booking's | none | none | their trips' | none | denied |
| Approval log | denied | denied | denied | denied | denied | denied |
| Who's going (names) | own + opted-in, same date | own + opted-in, same date | counts only | counts only | counts only | counts only |
| Slots list | counts only | counts only | counts only | counts only | counts only | counts only |
| Organizer's mobile | for trips they booked | same | same | – | – | denied |

**Self-name:** in Who's going you always see your own name, even if you didn't opt in; nobody else does. You see other names only while your own booking on that date still holds its seat: a cancelled, expired or lapsed unpaid hold sees counts only. Who's going never returns contacts, emergency details or wallet numbers. Run `npm test --prefix tests` to repeat the check.


## Hiker lists and the 30-day deletion (TP-017)

**One line per hiker.** The dashboard's joiner list and **Copy joiner list** both show the booker, then a line for every other hiker in the booking: their name (with "under 18, with {guardian}" when it applies) or, when there's no name, "name to follow", "name not recorded, outside booking" or "name deleted 30 days after the trip". So the number of lines always matches the headcount.

**Who sees emergency contacts.** Only the booker (their own bookings) and the trip's organizer (their own trips), as in the privacy table above. `tests/retention.test.mjs` also checks direct database access: signed out, another joiner and another organizer get nothing; Who's going and the slot counts never include them.

**30-day deletion.** On the day after trip date + 30 (Manila calendar), `clear_old_details()` empties the joiners' names, their ages and mobiles and the emergency contact on every booking of that date. It runs every 5 minutes with the expiry job, and also whenever someone books or edits. The booking itself, the booker, the DP records and reviews stay. The organizer's view stops showing these details from the same day even before the job runs. Nobody can call `clear_old_details()` directly.

**For organizers: exported lists.** The copied list has joiners' mobiles and emergency contacts. Share it only with your guides and the jump-off registration (for example DENR or the barangay), not in group chats or public posts. Print or keep it on one phone, and delete your copy (messages, screenshots, printouts) 30 days after the trip, when TrailPeak deletes these details. The dashboard says this above the list, and the copied text ends with the same reminder.


## Joiner details cut-off (TP-014, ADR-006)

Joiner names are due **3 days before the trip** (Manila calendar). A booking made earlier can leave names for later; My trips shows "Add N joiners' details before {date}". From that due date on, a new booking needs every joiner's full name and the emergency contact before it confirms (the reserve page stops offering "add later", and the database refuses an incomplete booking). Bookings already missing names after the due date show "details were due {date}. Add them now". Change the number with `update app_settings set value = 4 where key = 'details_due_days';`.


## Under-18 hikers (TP-015, ADR-007)

Every hiker under 18, the booker included, needs a parent or guardian 18 or older **in the same booking**. On the reserve page and in My trips, choosing "Under 18" shows two more fields: who their parent or guardian is (Joiner 1 = the booker, or another joiner) and how they're related (parent, legal guardian, or an adult with the parents' written permission). The database checks this on every booking and every later edit, so removing the guardian or changing them to under 18 is refused. The organizer's joiner list and copied list show each minor with their guardian. Ages are what the booker says; organizers still check IDs at the jump-off.


## Overdue joiner details (TP-016, ADR-008)

From the details due date (3 days before the trip), a booking that still misses a joiner's name, the emergency contact or a guardian for an under-18 is **overdue**. The organizer gets one Activity alert per booking (no texts), and the booking shows "Details overdue" with what's missing in the joiner list. The booker sees exactly what to add in My trips. Nothing is released automatically: the organizer can use **Release slots** to let go of just the unnamed slots (keeping the named joiners) or the whole booking, with a reason the joiner sees. Recorded DPs are never changed; refunds follow the trip's policy outside TrailPeak.


## Closure checks and reconciliation routine (TP-020, ADR-010)

Keeps availability dependable: what TrailPeak shows must match the bookings you took elsewhere and the trail's real status.

**Who:** the trip's organizer is responsible. If someone else does the check (a co-organizer or guide), they type their own name under "Checked by".

1. **Outside bookings within 1 hour.** When you agree to a booking in Messenger, by text or in person, add it under **Add outside booking** within 1 hour. If you can't (on the trail, no signal), **Close** the date until you've entered it, then reopen it.
2. **Reconcile 2 days before each departure.** Each upcoming date shows "Reconcile on {date}", then "Reconcile due" from 2 days before. Open the date's joiners, press **Reconcile or log**, and:
   - Compare the joiner list with your Messenger chats and notes; add anything missing. Tick "Every outside booking is in the joiner list" (you can't save without it).
   - Check the trail status at its official source (the park, DENR or LGU page) and choose Open or Closed. Write where you checked, for example "Mt. Pulag NP Facebook page, 9 AM".
   - Save. The date then shows "Reconciled {time} by {name} · trail open".
3. **Trail closed?** Use **Cancel for weather** (joiners are offered another date or a refund under your policy) or **Close** if you're waiting for confirmation. Logging "Closed" alone changes nothing for joiners.
4. **Log incidents.** Under **Reconcile or log**, choose Overbooking, Manual correction or Other incident, and write what happened and what you did (for example "12 of 10 after a late Messenger entry; moved Ben (2) to Jan 8 with his OK"). Log any manual change made outside the dashboard, such as a fix in the SQL editor.
5. **Check it again on the day if the weather turns.** Reconcile again; every check is kept.

Entries can't be edited or deleted. To correct one, log another. The log never blocks bookings or changes a date by itself. Only the trip's organizer can read or write it.

**Pilot review:** count checks and incidents per date in the SQL editor:
```sql
select trip_id, date, kind, checked_by, trail, source, note, created_at
from departure_checks order by date, id;
```


## Drafts and archived trips (TP-053, ADR-011)

A trip is a **draft** (only its organizer sees it), **published** (public), or **archived** (retired). The database decides who sees what, so a direct API call gets the same answer as the website:

| | Signed out / other joiners | Joiner with a booking on it | Its organizer | Other organizers |
| --- | --- | --- | --- | --- |
| Draft | hidden (search, direct link, dates, slots) | – (drafts can't be booked) | sees it | hidden |
| Published | sees it | sees it | sees it | sees it |
| Archived | hidden | sees it in My trips | sees it under "Archived trips" | hidden |

- **Save as draft** is under Publish on Post a trip; **Publish** is on the draft in the dashboard.
- **Archive** (dashboard, per trip) is refused while any upcoming date still has joiners holding seats or confirmed outside bookings; the message names the dates. Close or cancel those dates first. Bookings, DP records, history and reviews stay; **Restore** brings the trip back.
- Booking a draft or archived trip is refused by the database.
- The owner's old suspension switch still works and overrides everything: `update trips set published = false where organizer_id = '<user id>';`

`tests/trip-status.test.mjs` checks each row of the table straight through the database.


## Pilot funnel and baseline (TP-022, ADR-012)

TrailPeak counts the pilot funnel in its own database; there's no outside analytics service. Events carry **no names, emails, phones or account ids**, only a random id each browser makes for itself. Browsers that send Do Not Track or Global Privacy Control are skipped. Only you can read the numbers, in the SQL editor; the website and the API can't.

**What's counted, and the denominators**

| Step | Counted from | Denominator |
| --- | --- | --- |
| Shared-link visits | `trip_view` events with source `share`: the link has `?s=share` (the Facebook text adds it), `fbclid` or `utm_`, or another site sent the visitor | distinct browsers per week |
| Reservations | bookings on real (organizer) trips made that week | – |
| From a shared link | the browser that reserved opened that trip from a shared link within **7 days** before (`attribution_days`) | shared-link visitors that week |
| DP sent | the booking has a DP reference | reservations that week |
| DP confirmed | the organizer recorded the full DP | reservations that week |
| First-time vs returning | the account's first booking on any real trip, or not | reservations that week |

**Waits, kept apart:** *email*: sign-in link sent → signed in, same browser, within an hour; *organizer*: DP reference sent → full DP recorded. Each has a median and the slowest 10% (p90). A link opened on another device isn't timed.

**Read the numbers** (SQL editor):
```sql
select * from pilot_funnel_weekly;   -- visits, reservations, DP sent/confirmed, first-time vs returning, rates
select * from pilot_waits_weekly;    -- email and organizer waits (median, p90)
select * from pilot_admin_weekly;    -- your admin log + organizers' overbookings and corrections
```

**Log admin work once a week** (Monday of the week, per organizer or `all`):
```sql
insert into pilot_admin_log (week_of, organizer, admin_minutes, messages, corrections, support_cases, note)
values ('2026-11-16', 'Batangas Trail Co.', 45, 12, 1, 2, 'Two DP questions, one wrong pick-up');
```
`corrections` here are fixes you made yourself (SQL editor, by hand); the ones organizers log under **Reconcile or log** show separately as `dashboard_corrections`.

**Baseline:** in the first pilot week, run the three queries and paste the rows into the PRD's Success metrics as the baseline, with the date. Compare each later week against it. Change the attribution window with `update app_settings set value = 14 where key = 'attribution_days';`.


## Last-slot safety test (TP-013, ADR-009)

`tests/race.test.mjs` fires competing requests at the same time on separate database connections: two groups for the last seats (online, outside and mixed), the same submit sent twice, booking against a capacity change or a date being closed, a hold lapsing while someone else books, two receipt saves at once, rebooking a late payer, and bursts of 12 mixed requests into 10 seats. After each, it counts the seats actually held and checks they never exceed capacity. It needs a disposable Postgres:

```bash
DATABASE_URL=postgres://user:pass@host:5432/throwaway npm test --prefix tests
```

It rebuilds the schema from scratch, so **never point it at the Supabase project**. GitHub runs it on every pull request with its own Postgres; without `DATABASE_URL` it skips.
