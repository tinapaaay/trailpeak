# ADR-011: Trips are draft, published or archived; the database hides drafts and archived trips

**Status:** Accepted
**Date:** 2026-11-11
**Deciders:** Christine (product owner)
**Related:** issue #67 (TP-053), ADR-001 (static site + Supabase), ADR-002 (`booking_holds_seat`)

## Context

Test trips showed up in public search and filled the dashboard (5 "Mt. Batulao" trips on Nov 11). The only way to remove one was to delete it in the SQL editor, which is impossible once it has a booking (bookings, receipts and history point at it), and the only hiding switch was `published`, which the owner uses to suspend an organizer. Organizers need to retire a trip and to keep a trip private while they prepare it, without losing records.

## Decision

- `trips.status` is `draft`, `published` or `archived` (default `published`, so existing trips are unchanged), with `archived_at`. `published` stays as the owner's suspension switch; a trip is public only when `published and status = 'published'`.
- **Visibility is a database rule.** The trips read policy is: public trips, or the organizer's own, or a trip the caller has a booking on (so My trips keeps working after archiving). Departures follow their trip, and `all_slots()` uses the same rule. The pages also hide non-public trips from search, cards and profiles, but they're not what keeps them private.
- **Status rules in a trigger** on `trips`, so the dashboard and a direct API call behave the same: a trip can't be created archived, and can't leave `published` (to archived or draft) while an upcoming, not-cancelled date still has joiners holding seats (`booking_holds_seat`) or confirmed outside bookings; the error names the dates. Restoring is always allowed.
- **Bookings need a public trip:** a trigger on `bookings` refuses inserts for draft or archived trips.
- Archiving never deletes or changes bookings, DP records, history or reviews.

## Options considered

- **Delete instead of archive.** Simplest, but loses bookings, receipts and the activity trail; refused by foreign keys anyway once a trip has bookings. Rejected.
- **Reuse `published` (true/false) only.** Can't tell a draft from a retired trip or from a suspended organizer's trip; the dashboard needs to show them differently. Rejected.
- **Filter on the pages only.** Easy, but a direct API call (or an old cached page) would still list drafts. Rejected: privacy rules live in the database (ADR-001).
- **Archive automatically after the last date.** Nice later; for the pilot, organizers decide, since many trips repeat.

## Trade-off analysis

One column, two triggers and one policy change keep the rule in a single place for every client. The cost is that the trips policy now calls a security-definer helper (`has_booking_on`) to avoid a policy loop between trips and bookings, and that an organizer with an active date must close or cancel it before archiving: deliberate, so nobody's booking disappears from search mid-trip.

## Consequences

- Existing trips stay published; the 2 leftover test trips with bookings (`mt-batulao-p80w`, `mt-batulao-exfh`) can be archived from the dashboard once their dates are cancelled or past.
- Any new query that lists trips for the public must use the same rule (`trip_is_public()` or the trips policy), never `published` alone.

## Action items

- After merging, re-run `schema.sql`, then archive the two test trips.
- Revisit auto-archiving after the pilot.
