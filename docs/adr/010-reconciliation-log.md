# ADR-010: Reconcile each departure by hand, logged in an append-only table that never blocks bookings

**Status:** Accepted for the pilot
**Date:** 2026-11-11
**Deciders:** Christine (product owner)
**Related:** issue #25 (TP-020), ADR-009 (seat rules), TP-008/009 outside bookings, TP-012 closing dates

## Context

Availability is only as good as two things TrailPeak can't see on its own: bookings organizers take in Messenger or in person, and whether the trail is open (parks and LGUs post closures on Facebook, at short notice). The pilot needs a routine that keeps both in check, names who checked, keeps where the trail status came from and when, and leaves a record of overbookings and manual fixes.

## Decision

- **Routine (SETUP.md):** the organizer enters outside bookings within 1 hour of agreeing to them, or closes the date until they can. Two days before each departure, a named person reconciles it: every outside booking is in the list, and the trail status is checked against a named source. A confirmed closure is acted on with **Close** or **Cancel for weather**, which already handle joiners.
- **Record:** a new table `departure_checks`, written only through `log_departure_check()`, readable only by the trip's organizer. Kinds: `reconciled` (needs who, "outside bookings entered", trail open/closed and the source), `overbooking`, `correction`, `other` (need who and a description). The time is the server's.
- **Append-only:** no update or delete for anyone; a mistake is fixed by logging another entry.
- **Informational:** the log never changes a date's status or blocks a booking. The dashboard shows "Reconcile on {date}", "Reconcile due", or "Reconciled {time} by {name} · trail open/closed" on each upcoming date.

## Options considered

- **Written routine only (a checklist in SETUP.md or a shared sheet).** Simplest, but check times and who checked live outside TrailPeak and get lost; nothing reminds the organizer on the date itself.
- **Block or auto-close dates that aren't reconciled in time.** Enforces the routine, but a missed check would cancel real trips for a paperwork reason, and auto-closing is hard to explain to joiners. Rejected for the pilot; revisit if checks are routinely missed.
- **Automatic closure feed.** No reliable machine-readable source for Philippine trail closures exists; checks stay manual.
- **Columns on `departures` (last reconciled at/by).** Keeps only the latest check and no incident history. Rejected in favour of a log.

## Trade-off analysis

A log plus a reminder is cheap and keeps evidence, at the cost of relying on the organizer to follow the routine. Making it append-only means the record can be trusted in a dispute; the price is that typos stay (a correction entry fixes them).

## Consequences

- One more table and function in `schema.sql`; re-runnable as usual.
- Pilot reviews can count reconciled dates, overbookings and corrections from `departure_checks`.
- Closures still go through Close/Cancel for weather, so joiner messaging stays in one place.

## Action items

- Review the routine with the pilot organizers and link the agreed version from issue #25.
- After the pilot, decide whether missed reconciliations should block bookings.
