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
3. Make another new query with all of `supabase/seed.sql` and click **Run**. This adds the 6 sample trips and their dates.

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

**2. Approve.** Copy their `id` and run one of these (safe to run again to change the result):

```sql
select approve_organizer('paste-the-id-here');                     -- can post trips, no ID badge yet
select approve_organizer('paste-the-id-here', true);               -- can post trips + ID verified badge
select approve_organizer('paste-the-id-here', true, 'verified');   -- + Business verified
```

They see the Dashboard and Post a trip the next time they open the site. The verified seal on their trips follows their profile automatically; organizers can't set it themselves.

**3. Turn access off (if needed).**

```sql
select revoke_organizer('paste-the-id-here');
-- Their trips stay up. To hide them too:
update trips set published = false where organizer_id = 'paste-the-id-here';
```

A revoked account can't post, edit its trips or change dates, and can't re-apply on its own; run `approve_organizer` again to restore it.

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
