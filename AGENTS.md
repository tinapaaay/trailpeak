# TrailPeak: rules for every AI coding tool

These rules apply to any assistant working in this repo (Claude Code, Codex, Gemini / Google AI Studio, Cursor, Copilot…). If your tool doesn't read this file automatically, paste it in as the first message.

## What TrailPeak is
A static site (GitHub Pages, no build step) plus a light Supabase backend. Joiners find Philippine joiner hikes and reserve with a down payment (DP); organizers manage dates and joiner lists. The next release is an assisted pilot with 3–5 organizers, and its promise is **dependable reservations: zero overbookings**.

- Product decisions: the PRD (claude.ai artifact `PquYyR5i1XGg25fj8YaYuY`, with a Product backlog tab of TP-xxx items) and the GitHub issue you're working on.
- Why things are built the way they are: `docs/adr/` (read ADR-001 to ADR-005 before changing the database).
- Design: `DESIGN.md`.

## Hard rules (a PR that breaks one will be rejected)

1. **Seat counts go through `booking_holds_seat()`.** Never count taken seats any other way (ADR-002).
2. **Never bypass the existing booking functions.** Booking, moving, cancelling, expiring and rebooking go through `book_trip`, `move_booking`, `cancel_booking`, `expire_holds` and `rebook_expired` (or functions that call them). Anything that makes a booking hold seats again must check capacity first.
3. **Policy decides money states, not users.** A joiner can't set their own refund or payment outcome; refunds follow the trip's cancellation policy or an organizer/support action.
4. **Privacy is enforced in the database.** Every new table has row-level security; signed-out users can read only public trip data; contacts and emergency details are for the booker and that trip's organizer only. Never put names, phones or emails in analytics.
5. **`supabase/schema.sql` stays re-runnable** (safe to run twice) and upgrades the current live schema. Test both.
6. **No secrets.** Never ask for, use or commit the Supabase `service_role` key or database password. The publishable key in `config.js` is public by design.
7. **Organizer and verified status** are set only by `approve_organizer` / `revoke_organizer` (ADR-003).

## How to work

- **One issue per branch and PR.** The PR says `Fixes #N` and fills in the PR template.
- **Tests:** add tests for new behavior in `tests/` and add the file to the `test` script in `tests/package.json`. Run `npm test --prefix tests` (PGlite; set `DATABASE_URL` to a throwaway Postgres for the race tests). Include permission denials and the upgrade path.
- **Design:** follow `DESIGN.md`; if a token or component changes, update it and lint: `npx -y @google/design.md@0.4.0 lint --format json DESIGN.md` (0 errors, 0 warnings).
- **ADRs:** if the PR chooses between real options, changes the database structure in a lasting way, picks a provider, or sets a rule other code must follow, write or update an ADR in `docs/adr/`.
- **Be honest about gaps.** List anything unfinished or untested under "Not done" in the PR. Don't mark an issue fixed if part of it isn't.
- **Don't merge your own PR.** The owner (or a reviewing assistant) merges after CI passes.
- **After merge:** remind the owner to re-run `schema.sql` in the Supabase SQL editor if it changed.
