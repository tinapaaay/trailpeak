# ADR-006: One Manila-date cut-off for joiner details, decided in the database

**Status:** Accepted (3 days is proposed; confirm in interviews)
**Date:** 2026-11-11
**Deciders:** Christine (product owner)
**Related:** issue #19 (TP-014), PRD P.5 "Joiner details rule", ADR-002 (DP holds)

## Context

Organizers register every hiker by full name at the jump-off and need an emergency contact who isn't on the hike. A booker can leave names for later, but not so late that the organizer can't register the group. The PRD sets details due 3 days before the trip; a booking made inside that window must include everything before it confirms.

What made this a decision rather than a feature:

- **Two places judge "is it too late?":** the reserve page (to hide "add names later") and the database (to refuse the booking). If they disagree, a joiner is told one thing and refused another.
- **Phones lie about the date.** A phone in another time zone, or with a wrong clock, can be on a different calendar day from Manila, where the trips are.
- **Midnight matters.** The boundary is a calendar day, so 11:59 PM and 12:00 AM must land on different sides, in Manila time.

## Decision

- **The rule:** names are due `details_due_days` (3) days before the trip, by the **Manila calendar**. From that due date on (trip date minus 3, inclusive), a new booking needs every joiner's full name and the emergency contact.
- **The database decides.** `details_required(trip_date, today)` and `details_due_date(trip_date)` are the single definition; `book_trip` refuses an incomplete booking inside the window. `ph_date()` converts a moment to the Manila date.
- **The pages mirror it, never replace it.** They compute "today" in Manila time (`manilaToday()` in `auth.js`, UTC+8, no daylight saving) and read `details_due_days` from `app_settings` (synced with the trips), falling back to 3. A page that gets it wrong only changes what's offered; the server still refuses.
- **The number lives in `app_settings`**, next to the hold numbers, so it can change after interviews without code.
- Saving names one at a time in My trips stays allowed after the due date; acting on overdue details is TP-016 (#21).

## Options considered

### Option A: Page-only check
**Pros:** simplest. **Cons:** a hand-made API call, a stale page or a wrong phone clock books an incomplete group inside the window. Rejected: the rule protects the organizer, so it must hold without the page.

### Option B: Database-only check, page always offers "add later"
**Pros:** one source of truth. **Cons:** the joiner ticks "add later", then gets refused at the end. Poor experience for a rule we can know in advance.

### Option C (chosen): Database decides, page mirrors with Manila dates and the shared setting
**Pros:** correct even if the page is wrong; joiners see the right form up front; one number to change. **Cons:** two implementations of one small rule (SQL and JS) must stay in step. Mitigated by keeping both tiny, naming them the same, and testing the boundaries.

## Trade-off analysis

The cost is a few duplicated lines of date math; the gain is that the rule can't be bypassed and joiners aren't surprised. Using whole Manila calendar days (not hours before departure) matches how organizers and joiners talk about deadlines ("by Wednesday") and makes midnight the only boundary to test.

## Consequences

- Any new code that asks "is it too late for names?" must call `details_required` (server) or `detailsRequired` (page), never compare dates itself.
- Any page date rule should use Manila dates (`manilaToday()`), not the phone's local date.
- Changing the cut-off is one `update app_settings set value = … where key = 'details_due_days';`.

## Action items

- [x] `details_required`, `details_due_date`, `ph_date`; enforcement in `book_trip` (PR for #19)
- [x] Page mirror on reserve and My trips; tests for exactly 3 days and Manila midnight
- [ ] Confirm "3 days" with organizers in interviews (#26)
- [ ] TP-016 (#21): what happens when details are still missing after the due date
