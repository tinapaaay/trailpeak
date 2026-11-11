# Architecture Decision Records

One short file per technical decision: the context, the options, why one won, and what it costs us. The PRD says *what* TrailPeak does; these say *how* and *why that way*. Add a new file instead of editing an old decision; mark the old one "Superseded by ADR-00X".

| ADR | Decision | Status |
| --- | --- | --- |
| [001](001-static-site-supabase.md) | Static site on GitHub Pages with a light Supabase backend | Accepted |
| [002](002-dp-hold-expiry.md) | Release unpaid DP holds by computing them at read time, with pg_cron for labels | Accepted |
| [003](003-manual-organizer-approval.md) | Approve pilot organizers by hand in the SQL editor | Accepted for the pilot |
| [006](006-joiner-details-cutoff.md) | One Manila-date cut-off for joiner details, decided in the database | Accepted (3 days to confirm) |
| [007](007-guardian-in-booking.md) | Under-18 hikers name a guardian from the same booking; the booker states their own age | Accepted for the pilot |
| [008](008-overdue-details-release.md) | Overdue joiner details alert the organizer in-app; slots are released only by the organizer | Accepted for the pilot |

Planned: 004 payment gateway (TP-026) · 005 booking, payment and refund states (TP-027) · map provider (parked).

**When to write one:** a PR that chooses between real options, changes the database structure in a lasting way, picks a provider, or sets a rule other code must follow. Not for ordinary features, copy, design tweaks or bug fixes.

Template: Status · Date · Deciders → Context → Decision → Options considered (complexity, cost, scale, familiarity; pros, cons) → Trade-off analysis → Consequences → Action items.
