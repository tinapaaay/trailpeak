# ADR-015: Change the database through numbered migration files, recorded in a ledger

**Status:** Proposed (decide before P0 Payments work starts: TP-025–TP-031)
**Date:** 2026-11-20
**Deciders:** Christine (product owner)
**Related:** ADR-001 (static site + Supabase), ADR-009 (concurrency), ADR-014 (untrusted text), architecture review of Nov 20, 2026

## Context

Every database change today edits one file, `supabase/schema.sql`, and the owner pastes the **whole file** into the Supabase SQL editor, on staging first and then on live. That has worked because the file is written to be safe to run twice. But:

- It is **2,100 lines** with **16 tables and 64 functions** (53 run with owner rights), changed in **27 commits** so far.
- Safety on re-run depends on **167 hand-written guards** (`if not exists`, `create or replace`, `drop … if exists`) and one-time upgrade blocks such as the organizer-status reset in TP-001. One missed guard can damage data on a re-run.
- There is **no record of which version each project is on.** Staging and live can drift apart, and the only way to know is to rerun everything.
- Reviewing a change means reading a diff inside a large file, rather than one short file that says what changes.
- Real payments (TP-025–TP-031) will add tables that hold money states. Those need upgrades that run **exactly once, in order**, with a clear record.

**Constraints:** one owner who is learning, no secrets in the repo (AGENTS.md rule 6), the owner applies changes by hand in the SQL editor today, and 20 test files build their database from `schema.sql`.

## Decision

Move to **numbered migration files with a ledger table**, applied in the SQL editor as today, with the option to switch to the Supabase CLI later.

1. **Baseline:** today's `schema.sql` becomes `supabase/migrations/0001_baseline.sql`. Projects that already ran it are marked as having `0001`.
2. **One file per change:** each later change is a new file, `0002_<short-name>.sql`, `0003_…`, applied once and in order. Old files are never edited.
3. **Ledger:** a table `public.schema_migrations (version text primary key, applied_at timestamptz, note text)`. Each file starts by refusing to run if its version is already recorded, or if the previous version is missing, and ends by recording itself. A file pasted twice, or out of order, stops with a clear message and changes nothing.
4. **Applying:** the owner pastes only the **new** file(s), on staging first and then live (`docs/testing/staging.md`). `select * from schema_migrations order by version;` shows where each project stands.
5. **Tests and CI:** a helper builds the test database by applying every migration in order. A CI check fails if a file is out of sequence, if an old file was edited, or if the result differs from the expected schema. This is a **schema drift** check.
6. **Snapshot for reading:** `schema.sql` stays as a readable "current state", regenerated from the migrations and checked in CI. Nobody pastes it into a live project any more.

## Options considered

### Option A: Keep the single re-runnable `schema.sql` (today)

| Dimension | Assessment |
| --- | --- |
| Complexity | Low now, rising with every change |
| Cost | Free |
| Scalability | Poor: one file, guards everywhere, no version record |
| Team familiarity | High: it's the current habit |

**Pros:** nothing to learn; one paste updates everything; already tested.
**Cons:** every change risks the whole database; no record of which version a project is on; big diffs; payments-grade upgrades are hard to make safely "run once".

### Option B: Supabase CLI migrations (`supabase migration new`, `supabase db push`)

| Dimension | Assessment |
| --- | --- |
| Complexity | Medium: install the CLI, link each project, learn its commands |
| Cost | Free |
| Scalability | Good: the industry-standard approach, with a built-in ledger |
| Team familiarity | Low: new tool and terminal steps |

**Pros:** standard tooling, built-in history, can be automated from GitHub Actions later.
**Cons:** needs the database password or an access token on the owner's computer (or as GitHub secrets for automation), which is a bigger security surface. It also replaces the SQL-editor habit in one step.

### Option C: Numbered files + our own ledger, applied in the SQL editor (recommended)

| Dimension | Assessment |
| --- | --- |
| Complexity | Low–medium: a ledger table, a header and footer in each file, one test helper |
| Cost | Free |
| Scalability | Good for one or two people; same file layout as the CLI |
| Team familiarity | High: still "paste SQL in the editor", just a smaller file |

**Pros:** keeps the current workflow; no new secrets anywhere; each change is small and reviewable; run-once and in-order are enforced by the database itself; uses the same `supabase/migrations/` layout, so moving to Option B later is mostly a rename.
**Cons:** the ledger and checks are ours to maintain; a person still has to remember to apply the new file to both projects (the CI check and the staging guide help).

## Trade-off analysis

Option A was right for fast early building; its weakness is the safety of later changes, which is exactly what payments need. Option B is the long-term standard, but it adds credentials and a new tool at the same moment real money arrives. Option C gets the important properties now (small reviewable changes, run-once, in order, a version record per project) without new secrets or a new workflow, and leaves a straight path to B.

## Consequences

- **Easier:** reviewing a database change (one short file); knowing what staging and live are on; writing safe one-time upgrades for payments; spotting drift in CI.
- **Harder:** two places to look while learning (`migrations/` for changes, `schema.sql` for the current picture); a new rule: **never edit an applied migration, add a new one**.
- **Revisit:** move to the Supabase CLI (Option B) when a second developer joins or deploys are automated; consider it when Edge Functions arrive for payments (architecture review, risk 4).

## Action items

1. [ ] Owner decides (accept / change / reject this ADR).
2. [ ] Add `schema_migrations`, `supabase/migrations/0001_baseline.sql` and a one-time "mark as 0001" step for staging and live.
3. [ ] Test helper that builds the database from migrations; switch the 20 test files to it.
4. [ ] CI checks: sequence, no edits to applied files, snapshot matches.
5. [ ] Update AGENTS.md (rule 5), the PR template's "After merge" line, `supabase/SETUP.md` and `docs/testing/staging.md`.
6. [ ] First real use: the next schema change ships as `0002_…`.
