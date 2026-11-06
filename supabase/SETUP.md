# Setting up the TrailPeak backend (Supabase)

This adds real accounts and shared trips and bookings. **Payments and ID checks stay simulated.** It takes about 10 minutes and uses Supabase's free plan.

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
   - **Redirect URLs:** add `http://localhost:5391/**`

The free plan's built-in email sender only sends a few emails per hour. That's enough for testing; a real launch needs your own email service.

## 4. Share two values with Claude

Open **Project Settings → API Keys** (or **Data API**) and copy:

- the **Project URL**, like `https://abcdefgh.supabase.co`
- the **anon / publishable** key (starts with `eyJ` or `sb_publishable_`)

These two are meant to be public: they go in the website's code, and the privacy rules in `schema.sql` protect the data.

**Never share** the `service_role` / secret key or the database password. Those can bypass every rule.

## What's real and what's still simulated

| Real now | Still simulated |
| --- | --- |
| Accounts (email code) | Facebook and mobile-text sign-in |
| Trips, dates and slots shared by everyone | GCash / Maya payment |
| Bookings, move and cancel, checked on the server | ID and business checks |
| Organizers see joiners' bookings | Texts to joiners |
| Who's going (opt-in, same-date only) | |

**Known shortcut:** a signed-in user can currently mark their own profile as an organizer and as ID verified, because the ID check is simulated. Before any real launch, only an admin or the ID-check service should be able to set those.
