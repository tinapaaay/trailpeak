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

When `schema.sql` changes (for example, the November 2026 updates added reviews, Manila-time date rules, and joiner names with an emergency contact), open **SQL Editor → New query**, paste all of `schema.sql` again and click **Run**. It keeps your existing accounts, trips and bookings. Run it right after pulling the update: the website and the database functions change together, so until you do, new features (and after the joiner-details update, new bookings) won't work.

## What's real and what's still simulated

| Real now | Still simulated |
| --- | --- |
| Accounts (email link, or Google once it's set up) | Facebook and mobile-text sign-in |
| Trips, dates and slots shared by everyone | GCash / Maya payment |
| Bookings, move and cancel, checked on the server | ID and business checks |
| Organizers see joiners' bookings | Texts to joiners |
| Who's going (opt-in, same-date only) | |
| Reviews (one per booking, after the trip date) | |
| Editing a published trip | |

**Known shortcut:** a signed-in user can currently mark their own profile as an organizer and as ID verified, because the ID check is simulated. Before any real launch, only an admin or the ID-check service should be able to set those.
