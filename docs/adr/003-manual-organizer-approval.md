# ADR-003: Approve pilot organizers by hand in the SQL editor

**Status:** Accepted for the pilot
**Date:** 2026-11-11
**Deciders:** Christine (product owner, approver)
**Related:** issues #1 (TP-001), #2 (TP-002), #16 (TP-003); PRs #6, #57; `supabase/SETUP.md` "Approve an organizer"

## Context

Organizers publish trips and receive joiners' DPs, so "organizer" and "verified" must mean something. Before TP-001 any signed-in user could mark their own profile as organizer and ID verified, and the ID check itself is simulated (any image passed). The pilot needs 3–5 trustworthy organizers, not open sign-up, and no real ID-check (eKYC) provider has been chosen yet.

## Decision

Organizer sign-up only **applies**: the account becomes `pending` and the page says "Application received, waiting for approval". The owner approves or revokes in the **Supabase SQL editor** with `approve_organizer(...)` and `revoke_organizer(...)`, which only the database owner can run. Approval requires a recorded checklist and an approver name, and every change is logged in `organizer_approvals`. Badges say exactly what was checked, and simulated checks show "Demo: not a real check" (TP-002). Users can't change their own role or verification by any route, because a database trigger blocks it.

## Options considered

### Option A: Manual approval in the SQL editor (chosen)

| Dimension | Assessment |
| --- | --- |
| Complexity | Low: two functions, one log table |
| Cost | Free |
| Scalability | Fine for 3–20 organizers; tedious beyond that |
| Familiarity | One SQL line per approval, documented in SETUP.md |

**Pros:** nothing to build in the UI; the owner sees every organizer; approval can't be granted by a bug in a page; a full audit trail.
**Cons:** the owner must use the SQL editor; no self-serve status page for applicants beyond "waiting"; doesn't scale past a small pilot.

### Option B: An admin page in the site

| Dimension | Assessment |
| --- | --- |
| Complexity | Medium: admin role, new page, more permission tests |
| Cost | Free |
| Scalability | Better than A |
| Familiarity | New admin-role concept |

**Pros:** friendlier than SQL.
**Cons:** a new privileged surface to secure before the pilot; weeks of work for 3–5 approvals.

### Option C: Real ID check (eKYC) now

| Dimension | Assessment |
| --- | --- |
| Complexity | High: provider integration, data-privacy handling |
| Cost | Per-check fees |
| Scalability | High |
| Familiarity | New |

**Pros:** real verification.
**Cons:** a provider decision and integration before learning whether organizers will use TrailPeak at all.

## Trade-off analysis

For a pilot of 3–5 hand-picked organizers, the owner already knows each one; the risk to remove is *self-granted* status, not the lack of an admin screen. A closes that hole with the least new attack surface. B and C are worth it only once the pilot shows organizers want TrailPeak (decision TP-024).

## Consequences

- **Easier:** trusting that every "organizer" was approved by a person; explaining badges honestly.
- **Harder:** onboarding many organizers; applicants can't see why they're still pending.
- **Revisit:** after the pilot: an admin page (B) if approvals become frequent, and real verification (TP-032) before any public launch.

## Action items

1. [x] Lock role and verification (PR #6), honest badges (PR #7), approval checklist and log (PR #57)
2. [ ] Approve the first pilot organizers using the SETUP.md checklist (#16)
3. [ ] Re-evaluate after the pilot decision (TP-024)
