# ADR-008: Overdue joiner details alert the organizer in-app; slots are released only by the organizer

**Status:** Accepted for the pilot
**Date:** 2026-11-11
**Deciders:** Christine (product owner)
**Related:** issue #21 (TP-016), PRD P.5, ADR-006 (details cut-off), ADR-007 (guardians), ADR-002 (DP holds)

## Context

From the details due date (3 days before the trip, ADR-006), a booking can still be missing joiners' names, the emergency contact, or a guardian for an under-18 (older bookings, or names left for later). The PRD says: "Incomplete details 3 days out: the organizer is alerted and may release the slot under their policy." Three questions had real options: how to alert without SMS, whether release is automatic, and how much to release.

## Decision

- **Overdue = past the due date and still missing something**, judged by one function, `booking_details_missing()` (names, emergency contact, guardian), mirrored in `missingDetails()` on the pages.
- **Alert in-app, once.** `flag_overdue_details()` runs with the 5-minute job (inside `expire_holds()`) and writes one Activity line per booking, which also feeds the Dashboard unread count. The booker sees the exact missing items in My trips. No SMS or simulated texts.
- **The organizer decides; nothing is released automatically.** `release_overdue_booking(ref, reason, whole)` is organizer-only, needs a reason, works only past the due date on a still-incomplete booking, and can't be repeated.
- **Two sizes of release:** the unnamed slots only (the booking shrinks to the booker plus named joiners; DP and balance rescale per person), or the whole booking (cancelled). Partial is offered only when the emergency contact and guardians are in place.
- **Money stays separate.** Recorded DP receipts are never touched; the joiner's note says any refund follows the trip's policy, outside TrailPeak.

## Options considered

### Automatic release at the due date
**Pros:** no organizer effort; slots free up predictably. **Cons:** organizers in the research chase joiners by Messenger and often get names on the morning of; auto-release would punish groups the organizer was happy to wait for, and it decides a refund question the platform shouldn't. Rejected for the pilot.

### Alert by SMS / email
**Pros:** reaches organizers who aren't on the site. **Cons:** needs a sending service (TP-033), costs, and consent; the pilot has none. Deferred; the in-app Activity and badge cover the pilot.

### Whole-booking release only
**Pros:** simplest. **Cons:** throws out named joiners who did their part. The partial option keeps them.

## Consequences

- Any new "missing details" condition must be added to both `booking_details_missing()` and `missingDetails()`.
- A partial release changes the booking's size, DP and balance; receipts can exceed the new DP (shown as overpaid), which the organizer settles outside TrailPeak.
- Revisit automatic release after the pilot with real data on how late names arrive (#26).

## Action items

- [x] Overdue flag, one alert per booking, organizer list, release function, tests (PR for #21)
- [ ] Ask organizers in interviews how late names usually arrive and whether they'd want auto-release (#26)
- [ ] Email or SMS alerts when TP-033 picks a channel
