# ADR-013: Profile keeps age and emergency contact; each booking keeps its own copy; no health data

**Status:** Accepted
**Date:** 2026-11-13
**Deciders:** Christine (product owner)
**Related:** issue #93 (TP-058, part 1), ADR-006 (joiner details cut-off), ADR-007 (guardian in booking)

## Context

Every booking asked the booker for their age and an emergency contact again. Joiners asked for a profile that remembers them. Some details are sensitive: the emergency contact is a third person's phone number, and health information is **sensitive personal information** under the Philippine Data Privacy Act (RA 10173).

## Decision

- `profiles` gets two columns: `age_group` (`adult` / `minor`, nullable) and `emergency` (`{ name, relation, phone }`, nullable).
- **Only the owner reads or writes them.** The existing row-level security on `profiles` (own row only) and the column grants cover them; signed-out visitors have no access. Organizers never read profiles: they see a booker's name and phone through `organizer_bookings()`, and the age and emergency contact **copied into each booking**.
- **The booking keeps its own copy.** The reserve page fills in from the profile; `book_trip()` is unchanged and still stores `booker` and `emergency` on the booking. Editing the profile never changes past bookings, and the 30-day deletion of booking details (ADR-006) still applies to the copies.
- **Validated in the database:** a `before insert or update` trigger tidies the emergency contact with the same mobile rule as bookings (`ph_mobile`, "+63 917 123 4567"), requires a name and a phone, and drops any other keys.
- **No health notes on the profile.** Not stored anywhere in part 1.
- Age is "18 or older / Under 18", not a birthdate: the least we need (data minimization).

## Options considered

- **Profile only, booking reads it live.** Less copying, but organizers would see today's contact rather than the one given for that trip, and deleting old booking details would no longer work. Rejected.
- **Birthdate instead of an age group.** Lets us work out age on the trip date, but stores more personal data. Rejected for now; revisit if organizers need exact ages.
- **Health notes on the profile.** Most convenient, highest risk: kept indefinitely and easy to over-share. Rejected. If added later, per booking only, organizer-only, deleted with the booking details.

## Trade-off analysis

Two nullable columns and one trigger, with no change to booking functions or seat counting. The cost is a small duplication (profile + booking copy), which is deliberate: the booking is a record of what was true for that trip.

## Consequences

- Any future page that shows profile details to someone other than the owner needs a new, reviewed function; never widen the `profiles` read policy.
- Clearing the profile's contact is allowed (set to null).

## Action items

- After merging, re-run `schema.sql` in the Supabase SQL editor.
- Decide username, photo upload and per-booking health notes in #93 before part 2.
