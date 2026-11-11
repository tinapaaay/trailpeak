# Architecture Decision Records

One short file per technical decision: the context, the options, why one won, and what it costs us. The PRD says *what* TrailPeak does; these say *how* and *why that way*. Add a new file instead of editing an old decision; mark the old one "Superseded by ADR-00X".

| ADR | Decision | Status |
| --- | --- | --- |
| [002](002-dp-hold-expiry.md) | Release unpaid DP holds by computing them at read time, with pg_cron for labels | Accepted |

Planned: 001 static site on GitHub Pages + Supabase · 003 manual organizer approval in the SQL editor · 004 payment gateway (TP-026) · 005 map provider (parked).

Template: Status · Date · Deciders → Context → Decision → Options considered (complexity, cost, scale, familiarity; pros, cons) → Trade-off analysis → Consequences → Action items.
