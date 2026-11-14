# Staging: a safe copy of TrailPeak for testing

Staging is a second Supabase project with its own accounts, trips and bookings. The website is the same; only the database is different. Test there first, so the live site only ever holds real organizers and real joiners (issue #97, TP-061).

```
tinapaaay.github.io/trailpeak/            → live project      (real data)
tinapaaay.github.io/trailpeak/?env=staging → staging project  (test data only)
```

- Open any page with **`?env=staging`** and this browser stays on staging until you open a page with **`?env=live`**.
- Every staging page shows a light blue bar: **"Staging: test data only."** No bar means you're on the live site.
- Switching clears TrailPeak's saved data in that browser (its copy of your account, bookings and drafts), so the two never mix. You stay signed in to each project separately.

## One-time setup (about 15 minutes)

### 1. Create the project

1. On [supabase.com](https://supabase.com), click **New project** (the free plan allows two projects).
   - **Name:** `trailpeak-staging`
   - **Database password:** a new strong one, saved in your password manager. Don't share it with anyone, including Claude.
   - **Region:** Southeast Asia (Singapore)
   - **Security:** **Enable Data API** on, **Automatically expose new tables** off, **Enable automatic RLS** on (same as live).
2. Wait for it to start.

### 2. Create the tables

1. **SQL Editor → New query**, paste all of `supabase/schema.sql`, click **Run** ("Success. No rows returned").
2. If it mentions **pg_cron**: **Database → Extensions**, turn on **pg_cron**, and run `schema.sql` again.
3. **Don't run `seed.sql`.** Staging has no sample trips, the same as the live site.

### 3. Sign-in

1. **Authentication → URL Configuration:**
   - **Site URL:** `https://tinapaaay.github.io/trailpeak/`
   - **Redirect URLs:** add `https://tinapaaay.github.io/trailpeak/**` and `http://localhost:5391/**`
2. Email sign-in is on by default; that's enough for testing. Google sign-in on staging is optional (it needs its own Google Cloud setup; see "Sign in with Google" in `supabase/SETUP.md`).
3. The free email sender only sends a few emails per hour. Make your test accounts early.

### 4. Share two public values

**Project Settings → API Keys**, copy:

- the **Project URL** (`https://xxxx.supabase.co`)
- the **publishable** key (`sb_publishable_…`)

Paste them to Claude (or put them in `config.js` under `staging`). They're public by design. **Never share** the secret / `service_role` key or the database password.

### 5. Test accounts

Use email addresses you control. Gmail's `+` trick gives you extra addresses that land in the same inbox: `you+tporg@gmail.com`, `you+tpjoin@gmail.com`.

1. Open `https://tinapaaay.github.io/trailpeak/signin.html?env=staging` and sign in as the **test organizer** email; finish the profile, then go through **Become an organizer**.
2. In the **staging** SQL Editor, approve it (checklist answers can all be true, it's a test account):

   ```sql
   select id, name from profiles where organizer_status = 'pending';
   select approve_organizer('<the id from above>', p_approver => 'Staging test',
     p_checklist => '{"id_checked":true,"payout_matches":true,"track_record":true,"permits_known":true,"safety_plan":true,"pilot_rules":true}');
   ```
3. Sign in as the **test joiner** email in a private window (also with `?env=staging`).

## Automated booking test (TP-062, #96)

`npm run e2e --prefix tests` books like a joiner on staging and then cancels: trip page → date → 2 joiners → Reserve → joiner 2 "later" → My trips shows the booking and the reminder. It runs on every PR (the **e2e** check) using that PR's pages.

It needs, on **staging only**:

1. **Anonymous sign-ins on:** Authentication → Sign In / Providers → **Allow anonymous sign-ins**. Each run gets a brand-new throwaway joiner, so no password is stored anywhere. **Never turn this on in the live project.**
2. **One test trip:** as the test organizer, post any mountain (trip names come from the mountain list), capacity 20, with a few dates **at least 4 days** away (add more before they pass). Publish it. The test uses the first published trip with a date that far out and 2+ slots.

Run it on your computer: `npm ci --prefix tests`, `npx --prefix tests playwright install chromium`, then `npm run e2e --prefix tests`. It refuses to run if `config.js` points staging at the live project.

The throwaway joiners stay in staging's Authentication → Users list; delete them now and then if you like.

## Keeping staging up to date

When a PR changes `supabase/schema.sql`, run it on **staging first**, try the change there, then run it on live after merging.

## What staging doesn't cover

- Real money never moves anywhere; that's the same on live.
- Staging and live use the same GitHub Pages site, so a page change is on both at once after merging. Staging protects the **data**, not the code: PR checks and reviews protect the code.
