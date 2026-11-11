# ADR-012: Measure the pilot funnel in our own database with anonymous events; owner-only SQL views

**Status:** Accepted for the pilot
**Date:** 2026-11-12
**Deciders:** Christine (product owner)
**Related:** issue #27 (TP-022), ADR-001 (static site + Supabase), ADR-010 (reconciliation log), privacy page

## Context

The pilot needs a before/during comparison: shared-link visits → reservations → DP sent → DP confirmed, first-time vs returning joiners, how long the sign-in email and the organizer take, and the owner's admin load. Hiker details (names, phones, emails, emergency contacts) must never reach analytics, and the privacy page promised no analytics trackers.

## Decision

- **In-database events, no third party.** One table, `pilot_events`, written only through `log_event()`. Kinds: `trip_view` (with source `share` or `direct`), `code_sent`, `signed_in`, `reserved`. Columns: kind, a random browser id (`visitor`, made by the page and kept in localStorage), trip, booking number (for `reserved` only), source, time. **No account id, name, email or phone.**
- **Everything else is read from the real tables**: reservations from `bookings`, DP sent from `dp_sent_at`, DP confirmed from the first full `dp_receipts` record, first-time vs returning from the account's booking history, incidents from `departure_checks`.
- **Attribution:** a reservation comes from a shared link if the same browser opened that trip from a shared link within `attribution_days` (7) before it. Shared = `?s=share` (added to the Facebook text), `fbclid`, `utm_*`, or an outside referrer.
- **Guard rails:** `log_event` accepts only known kinds, public trips, and `reserved` for the caller's own booking, once; one visit per browser, trip and Manila day; it never errors to the page. The page skips tracking when the browser sends Do Not Track or Global Privacy Control.
- **Reading:** owner-only views (`pilot_funnel_weekly`, `pilot_waits_weekly`, `pilot_admin_weekly`, `pilot_bookings`) in the SQL editor; no grants to `anon` or `authenticated`. Admin minutes, messages, corrections and support cases go into `pilot_admin_log` by hand once a week.

## Options considered

- **Privacy-first hosted analytics (Plausible, Umami Cloud, GoatCounter).** Good page-view dashboards, no cookies, but they can't see reservations or DP confirmation, so the funnel would be split across two systems and joined by hand; adds a processor to the privacy page and a monthly cost (Plausible) or a self-host. Rejected for the pilot.
- **Google Analytics / Meta Pixel.** Free, but a third party with cross-site tracking and cookie consent; conflicts with the privacy promise. Rejected.
- **Log only server-side facts (no events).** Simplest and most private, but it can't see visits or where they came from, so the first funnel step and attribution would be missing. Rejected.
- **An owner-only web page for the numbers.** Nicer than SQL, but it needs an owner role and access rules for a few weekly reads. Deferred; the views make it easy to add later.

## Trade-off analysis

Own-database events keep the whole funnel in one place with one privacy story, at the cost of fewer niceties (no ready-made charts, no bot filtering beyond the once-a-day rule). Visits can be undercounted (Do Not Track, blocked storage, a link opened on another device), so rates are lower bounds; that's acceptable for a before/during comparison as long as the method doesn't change.

## Consequences

- The privacy page now describes the pilot counts.
- Spam can add fake visits (anyone may call `log_event` for `trip_view`), limited to one per browser id, trip and day; reservations and DP steps come from real bookings and can't be faked.
- After the pilot, decide whether to keep, export or drop `pilot_events` (they hold no personal details, but the browser id is a pseudonymous identifier).

## Action items

- After merging, re-run `schema.sql`; in the first pilot week, record the baseline (SETUP.md › Pilot funnel and baseline).
- Revisit an owner page or hosted analytics if weekly SQL becomes a chore.
