# TrailPeak: notes for Claude sessions

- **Product:** read the PRD (claude.ai artifact PquYyR5i1XGg25fj8YaYuY; its Product backlog tab lists TP-xxx items) and the GitHub issue you're working on. One issue per branch and PR; the PR says "Fixes #N" and lists test results.
- **Design:** follow `DESIGN.md`; update it in the same change when a token or component changes; lint with `npx -y @google/design.md@0.4.0 lint --format json DESIGN.md` (0 errors, 0 warnings).
- **Database:** `supabase/schema.sql` must stay re-runnable; test with PGlite including the upgrade path from the previous schema. Remind the owner to re-run it in the Supabase SQL editor after merging. Never ask for the service_role key or database password.
- **Architecture decisions:** if a PR chooses between real options, changes the database structure in a lasting way, picks a provider, or sets a rule other code must follow, write or update an ADR in `docs/adr/` in the same PR (template in `docs/adr/README.md`). Don't write one for ordinary features, copy, design tweaks or bug fixes.
- **Seat counts:** any query that counts taken seats must use `booking_holds_seat()` (ADR-002).
