# ADR-007: Under-18 hikers name a guardian from the same booking; the booker states their own age

**Status:** Accepted for the pilot
**Date:** 2026-11-11
**Deciders:** Christine (product owner)
**Related:** issue #20 (TP-015), PRD P.5, ADR-006 (details cut-off), Terms ("Joiners under 18 need a parent or guardian")

## Context

Organizers can't take a minor up a mountain without a responsible adult. The PRD requires every under-18 hiker to have a parent or guardian 18 or older **in the same booking**, recorded, and kept through later edits. TrailPeak collected each companion's age group (18+ / under 18) but never the booker's own, so a teen booking for friends couldn't be caught.

## Decision

- **Ask the booker's age too.** Joiner 1 ("You") gets the same "18 or older / under 18" choice, defaulting to 18 or older. It is stored in `bookings.booker` (`{"age": "adult"}` or `{"age": "minor", "guardian": n, "relation": …}`); older bookings count as 18 or older.
- **Name the guardian by joiner number.** Each under-18 hiker (booker or companion) points at an adult in the same booking (1 = the booker, 2+ = companions) and gives the relationship: parent, legal guardian, or an adult with the parents' written permission.
- **One check, in the database, on every write.** `check_guardians(booker, companions)` runs in `book_trip` and in `update_booking_details`. So a later edit that removes the guardian, makes them under 18, or drops them from the list is refused. The pages run the same rule first only to give a quicker, field-specific message.
- **Self-reported.** Ages and relationships are what the booker says; organizers still check IDs at the jump-off. TrailPeak doesn't verify them.

## Options considered

### Option A: Assume every booker is an adult
**Pros:** nothing new to ask. **Cons:** a 16-year-old booking for friends passes; the rule has a hole exactly where it matters. Rejected.

### Option B: Guardian as free text ("Mom, joining")
**Pros:** flexible. **Cons:** can't check that the guardian is actually in the booking or is 18+; organizers have to read and judge every one. Rejected.

### Option C (chosen): booker's age + guardian chosen from the booking's adults, checked in the database
**Pros:** enforceable without the page; organizers see "Kid Cruz · under 18 · with Ana Reyes (parent)"; the same check covers edits. **Cons:** one more question for every booker, and guardians are referenced by position, so renumbering joiners means re-choosing (the form re-renders from saved data, so this only matters if someone deletes a joiner in the middle).

## Trade-off analysis

One extra dropdown that almost everyone leaves at "18 or older" is a small cost for closing the hole in Option A. Pointing at a joiner number instead of free text is what makes the rule checkable by the database.

## Consequences

- Any new path that writes companions (for example, outside bookings if they ever collect ages) must call `check_guardians`.
- Bookings saved before this with an unguarded minor must choose a guardian on their next edit.
- The organizer list and copied joiner list show each minor's guardian.

## Action items

- [x] `bookings.booker`, `check_guardians`, `book_trip` and `update_booking_details` with an optional `p_booker` (old signatures dropped so calls aren't ambiguous)
- [x] Reserve and My trips fields; dashboard and copied list show guardians; tests for booking and edits
- [ ] Ask organizers in interviews whether "adult with the parents' written permission" should need an uploaded or shown permission note (#26)
