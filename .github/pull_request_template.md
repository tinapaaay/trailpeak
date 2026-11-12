Fixes #

## What changed
<!-- One or two sentences in plain words. -->

## Checklist (see AGENTS.md)
- [ ] Seat counts go through `booking_holds_seat()`; no booking function is bypassed
- [ ] New tables have row-level security; permission denials are tested
- [ ] `schema.sql` runs twice cleanly and upgrades the current schema (tested)
- [ ] New tests added to `tests/` and to the `test` script; `npm test --prefix tests` passes
- [ ] `DESIGN.md` updated and linted (if UI tokens or components changed)
- [ ] ADR written or updated (if this PR makes a lasting technical decision)
- [ ] No secrets, and no personal data in analytics

## Tests run
<!-- Paste the summary: suites, passed, failed. -->

## Not done / not tested
<!-- Be honest: anything unfinished, skipped or only checked by hand. "Nothing" is fine. -->

## After merge
- [ ] Re-run `supabase/schema.sql` in the Supabase SQL editor (if it changed)
