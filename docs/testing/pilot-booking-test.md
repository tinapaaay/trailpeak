# Pilot booking test: a real booking, end to end

Use this to check the full joiner → organizer flow on the live site: a two-joiner booking with one name left for later, **DP pending** with the hold deadline in My trips, and the organizer's **Activity** entry. It's the walkthrough for issue #24 (TP-019). It takes about 20 minutes.

**Not the practice demo.** [`demo.html`](../../demo.html) is practice only: nothing is saved, so its bookings never appear in My trips, start a DP hold or notify anyone. This guide makes a *real* booking on a test trip, then cleans it up. No money moves: you type a made-up GCash reference, and the organizer can mark a made-up DP as received.

## Before you start

- **Two accounts with different emails.** The same email is always the same TrailPeak account.
  - **Organizer:** your approved organizer account.
  - **Joiner:** a second email that isn't an organizer (another Gmail, or email-link sign-in). Google sign-in now shows "Choose an account", so you can pick it there.
- **Two separate browser sessions** so you can watch both sides: a normal window for the organizer, a private/Incognito window for the joiner.
- **Do this before the pilot starts.** Test bookings count in the pilot funnel (`pilot_funnel_weekly`). Running the test before the first pilot week keeps it out of the pilot numbers. Write the test booking number in the admin log note (step 7).

## 1. Organizer: create a test trip (normal window)

1. Open **Post a trip**.
2. Pick any mountain, and set **Hike time** to `TEST TRIP – practice only` so nobody mistakes it for a real trip.
3. Add **one date at least 4 days from today.** Bookings made within 3 days of the trip need every name before they confirm, so a nearer date won't let you leave a name for later.
4. Click **Publish trip**. *Why not "Save as draft"?* The database only lets joiners book **published** trips, so a draft can't be used for this test. The trip will be public for the few minutes the test takes; step 8 removes it.
5. Open **Dashboard** and copy the trip's link from **View trip page**.

## 2. Joiner: reserve 2 joiners, leave one name for later (private window)

1. Open the copied trip link and sign in as the **joiner**.
2. Pick the test date, set **2 joiners**, and **Reserve**.
3. On the reserve page, fill in Joiner 2's age but leave the **name empty**, tick **"Some names aren't ready yet…"**, add an emergency contact, and confirm.
4. ✅ The confirmation says **DP pending** and shows the hold deadline: **6 hours from now** (2 hours if the trip were within 3 days), in Manila time.

## 3. Joiner: check My trips

1. Open **My trips**.
2. ✅ The booking shows **"Send the ₱… DP to [organizer] by [time]"**, matching the confirmation's deadline.
3. ✅ It also shows the reminder to add the missing name before the due date.
4. Take a screenshot at phone width (375px) and at desktop width.

## 4. Organizer: check Activity and the joiner list (normal window)

1. Refresh **Dashboard**.
2. ✅ The **Activity** list has a new booking entry (and the unread count went up).
3. ✅ The test date shows the 2 joiners; the joiner list shows the booker and "1 name still to come".

## 5. Joiner: send a made-up DP reference

1. In **My trips**, enter any reference, like `TEST-123`, under **GCash or Maya reference number**.
2. ✅ The booking now says **"DP sent… waiting for organizer"** and the slots stay held (the hold clock stops).
3. ✅ The organizer's Activity shows the DP-sent entry.

## 6. Optional: organizer marks the DP received

On the Dashboard, record the DP as received with the method **GCash** and reference `TEST-123`. ✅ The joiner's My trips changes to **DP received** after a refresh. This is a test record: no money moved.

## 7. Record the result under #24

Comment on issue #24 with:
- what passed or failed at each ✅ above
- the screenshots (375px and desktop, joiner and organizer)
- the **test booking number** (e.g. `TP-AB12CD`), so it can be ignored in pilot numbers

If you logged a pilot baseline already, add the booking number to that week's `note` in the admin log too.

## 8. Clean up

1. **Joiner:** in My trips, **Cancel** the test booking. A trip within 7 days shows the "DP not refunded" warning; that's expected and no real money is involved.
2. **Organizer:** on the Dashboard, **Archive** the test trip. Archiving is refused while a date still has people on it, so cancel the booking first. Archived trips leave search and the organizer profile; the cancelled test booking stays in history.

## Repeats, reloads and what to expect

- **Booking again** on the same date makes a second, separate booking, and the slots go down again. Cancel each one during cleanup.
- **Reloading** any page keeps everything: bookings, holds and Activity live in the database, not the browser.
- **If you don't send a reference within the hold time,** the booking expires on its own ("Expired: DP not sent") and its slots are released. That's another valid thing to test, but it takes 6 hours.
- **Payments stay simulated during the pilot:** joiners pay organizers directly, and TrailPeak only records what the organizer confirms.
