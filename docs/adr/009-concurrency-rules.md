# ADR-009: Concurrency rules for seats: one lock order, real-clock deadlines, one request id per submit

**Status:** Accepted
**Date:** 2026-11-11
**Deciders:** Christine (product owner)
**Related:** issue #14 (TP-013), ADR-002 (holds at read time), PRs for #3, #4, #12, #13

## Context

Zero overbookings is a pilot success metric. Seats are taken by online bookings, outside bookings, rebooking a late payer, and kept by a DP reference that stops a hold's clock; organizers also change capacity and close dates. Each path was safe on its own, but PGlite (one connection) can't show what happens when they run at the same instant. A real-Postgres race test (`tests/race.test.mjs`) found two holes:

1. **A late DP reference could overbook.** A joiner's transaction that started just before their hold lapsed could save the reference after an outside booking had already taken the freed seats: 4 seats taken on a date with 2.
2. **Online booking had no idempotency.** A double submit or a retry after a dropped connection could create two reservations.

## Decision

Every function that adds, keeps or frees seats follows three rules:

1. **Lock the date first, then the booking.** `select … from departures … for update` before touching a booking row: `book_trip`, `add_outside_booking`, `rebook_expired` (fixed in this PR), `edit_/cancel_outside_booking`, `release_overdue_booking`, `send_dp_reference` (fixed in this PR), and capacity/status updates on `departures`. Same order everywhere means no deadlocks and no interleaving on one date. One known exception: `move_booking` locks the joiner's own booking, then the *new* date; it only frees seats on the old date, which is safe without that lock (others just see the seats as taken a moment longer).
2. **Judge deadlines by `clock_timestamp()` after the lock**, not `now()` (which is when the transaction started). A slow request can't carry an old "still in time" into a later moment.
3. **One request id per submit** on every creation path: `book_trip(p_request)` and `add_outside_booking(p_request)` return the existing booking when the same id comes again, checked after the date lock; a unique column backs it up.

Seat counts keep using `booking_holds_seat()` (ADR-002).

## Options considered

- **Serializable transactions everywhere.** Strong, but callers must retry on serialization failures; the static pages have no retry loop and errors would surface to joiners. Rejected.
- **Advisory locks per date.** Equivalent to rule 1 but invisible in table locks and easy to forget on a new path. Rejected in favour of the row lock the paths already took.
- **Client-side duplicate protection only (disable the button).** Doesn't cover retries after a dropped connection or a second tab. Kept as a convenience, not the guarantee.

## Consequences

- New seat-changing functions must follow the three rules; `tests/race.test.mjs` should get a scenario for each.
- The race test needs a real Postgres (`DATABASE_URL`); CI starts one, and locally it skips without it.

## Action items

- [x] Fix `send_dp_reference` (date lock + `clock_timestamp()`), add `bookings.request_id` and `book_trip(p_request)` (PR for #14)
- [x] Race tests in CI against Postgres 16
