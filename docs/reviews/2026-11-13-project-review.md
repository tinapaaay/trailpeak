# TrailPeak project review: 13 Nov 2026

A step back after PR #92 (edit joiners on the reserve page). What's working, what isn't, and what to do next.

**Short version:** the craft is strong. The biggest risk is building ahead of proof: no real organizer has run a real trip on TrailPeak yet, and features keep getting added before that has happened.

## What's good

- **Started from research, not screens.** 27 real posts from a 148K-member hiking group, then a PRD, a backlog and a pilot plan.
- **Privacy and safety live in the database.** Row-level security, one seat-count rule (`booking_holds_seat()`, ADR-002), joiner details deleted 30 days after a trip. A buggy page can't leak data or overbook.
- **A real team workflow.** One issue per PR, required checks (tests + design-lint), branch protection, ADRs, and `AGENTS.md` so every AI tool follows the same rules. This is why Gemini's mistakes were caught before reaching users.
- **Lots of tests.** 20 test files, including ones that run the real `schema.sql` on a test database (PGlite).
- **A working design system.** `DESIGN.md` lints clean; pages look consistent.
- **Honest PRs.** "Not done / not tested" is filled in. That habit is rare.

## What's bad

1. **Features before validation.** Interviews (#26), organizer onboarding (#16) and the pilot (#28) haven't happened, while maps, profiles and Strava were added to the backlog.
2. **Scope creep from testing.** Each test session turns into new feature issues while the core loop stays unproven.
3. **Prototype leftovers.** Offline demo mode, pretend accounts and simulated payments are still in the code, so there are two paths for booking. The sample-trip and demo confusion (#89, #90) came from this.
4. **No separate test environment.** Testing happens on the live site and real database.
5. **No automated end-to-end test of the online flow.** Nothing clicks through sign-in → reserve → My trips on the real site.
6. **AI-tool output needs heavy review.** Gemini caused the overbooking bug (#77), made-up FAQ claims, and the regex bug in #91.
7. **Big files.** `auth.js` and `dashboard.html` keep growing; each change risks breaking something unrelated.
8. **Email sign-in has a limit.** The custom email domain (#17) is on hold, and Supabase's built-in email sending is heavily rate-limited.

## What to improve, in order

| # | Do this | Tracked in |
| --- | --- | --- |
| 1 | **Freeze new features until the pilot runs.** Live booking test, onboard 1–2 organizers, 5 interviews, then decide. | #24, #16, #26, #28, #29 |
| 2 | **Remove offline and demo mode** once the pilot starts: one code path. | #95 |
| 3 | **Add a staging environment** (a second free Supabase project) so tests never touch real data. | #97 |
| 4 | **Add one automated browser test** of the real booking flow on every PR. | #96 |
| 5 | **Give Gemini only well-defined tasks that don't touch the database.** Copy, styling, small UI. Database, privacy and booking logic get reviewed in Claude Code. Keep patch → review → PR. | `AGENTS.md` |
| 6 | **Split big files when you're already changing them** (e.g. joiner form → `joiners.js`). | as you go |
| 7 | **Save tokens:** one session per issue; refresh PRD statuses weekly. | habit |

Exception to the freeze: profile part 1 (#93) is fine to finish, because it removes a real annoyance in booking.

## Concepts to look up

- **Validation / MVP:** proving people want it before building more.
- **Scope creep:** a project growing a little at a time until the original goal slips.
- **Staging environment:** a copy of the app for testing, separate from what users see.
- **End-to-end (E2E) test:** an automated test that uses the app like a person would, across pages.
- **Refactoring:** changing code structure without changing what it does.
- **Row-level security (RLS):** database rules that decide which rows each user may read or change.

## Next review

After the pilot decision (#29): check this list again and note what changed.
