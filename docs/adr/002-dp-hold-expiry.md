# ADR-002: Release unpaid DP holds at read time, with pg_cron for labels

**Status:** Accepted (rule numbers proposed; confirm in interviews)
**Date:** 2026-11-11
**Deciders:** Christine (product owner)
**Related:** issue #13 (TP-011), PR #55, PRD "DP hold rule for the pilot"

## Context

In the pilot, joiners pay the DP directly to the organizer by GCash or Maya, so TrailPeak can't see the money arrive. A reservation must hold slots for a short time (6 hours; 2 when the trip is within 3 days, Manila time) and release them if the joiner never sends a payment reference. Entering the reference stops the clock.

The constraints that shaped the design:

- **Slots must never be wrong.** A slot held past its deadline blocks other joiners; a slot released too early overbooks. Zero overbookings is a pilot success metric.
- **No server of our own.** TrailPeak is a static site on GitHub Pages plus Supabase (Postgres). There is no always-running app server to run timers.
- **Nobody has a page open.** Expiry has to happen even when no joiner or organizer is looking.
- **One rule everywhere.** Search, trip pages, booking, the dashboard and Who's going all count slots; they must agree.

## Decision

Treat "does this booking hold its seats?" as a **calculation, not a stored flag**. One database function, `booking_holds_seat(status, hold_until, dp_sent_at)`, answers it from the current time, and every slot count uses it. A booking stops holding seats the instant `hold_until` passes without a reference, whether or not anything has run.

Separately, `expire_holds()` changes the stored status to `expired` (for the "Expired: DP not sent" label, the activity feed and the organizer reminder). It runs every 5 minutes through **pg_cron** when the Supabase project has it, and also at the start of every booking. The hold lengths live in an `app_settings` table, so they can change after the interviews without a code change.

## Options considered

### Option A: Scheduled job only (pg_cron flips status; counts read the stored status)

| Dimension | Assessment |
| --- | --- |
| Complexity | Low |
| Cost | Free (pg_cron is built into Supabase) |
| Scalability | Fine at pilot size |
| Familiarity | Common pattern |

**Pros:** simple to read; the stored status is always the source of truth.
**Cons:** slots stay blocked for up to 5 minutes after expiry; if the job is off or fails, slots stay blocked indefinitely. That is wrong availability, which is exactly what the pilot must prove we avoid.

### Option B: Compute at read time only (no scheduled job)

| Dimension | Assessment |
| --- | --- |
| Complexity | Medium (every count must use the same function) |
| Cost | Free |
| Scalability | Fine; one cheap comparison per booking row |
| Familiarity | Less common |

**Pros:** slot counts are exact to the second with nothing to schedule.
**Cons:** the stored status still says "confirmed" for an expired hold until something touches it, so labels, the activity feed and reminders lag or never fire.

### Option C: Hybrid, read-time seats + pg_cron for labels (chosen)

| Dimension | Assessment |
| --- | --- |
| Complexity | Medium |
| Cost | Free |
| Scalability | Fine at pilot size and well beyond |
| Familiarity | Combines two simple ideas |

**Pros:** availability is always exact (the part that must never be wrong), and labels and reminders follow within 5 minutes. If pg_cron is missing, nothing breaks: slots are still released on time, and only the label waits for the next booking.
**Cons:** two mechanisms to understand; every new slot count must call `booking_holds_seat()` or it will disagree with the rest.

### Option D: Timer in the browser

Rejected without scoring: it only runs while someone has the page open, and a user can change it. Expiry has to live in the database.

## Trade-off analysis

The pilot's promise is dependable reservations, so the deciding factor is **what happens when something goes wrong**. With A, a failed job means wrong availability. With C, a failed job only means a late label. C costs one extra rule ("always count through `booking_holds_seat()`"), which is cheap to follow and easy to test. B is C without the job, and loses reminders, which the organizer flow needs.

## Consequences

- **Easier:** changing the hold length (one `update app_settings ...`), trusting slot counts during the pilot, adding the real-payment slot hold later (TP-028) on the same pattern.
- **Harder:** any new query that counts seats must use `booking_holds_seat()`; a code review should check for it.
- **Revisit:** the 6 h / 2 h / 24 h numbers after the interviews (questions 5–8 for organizers in `research/interview-guide.md`); whether 5 minutes is fast enough for labels once real bookings run; how this interacts with gateway payment holds (TP-028).

## Action items

1. [x] Build it (PR #55, 39 tests)
2. [x] Turn on pg_cron in Supabase and re-run `schema.sql` (verified Nov 11: pg_cron 1.6.4, job trailpeak-expire-holds scheduled)
3. [ ] Confirm the hold numbers in interviews; update `app_settings` if they change
4. [ ] Add "counts seats through `booking_holds_seat()`" to the code-review checklist
