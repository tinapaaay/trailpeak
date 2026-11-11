# ADR-001: Static site on GitHub Pages with a light Supabase backend

**Status:** Accepted (recorded after the fact)
**Date:** 2026-11-11 (decision made 2026-11-06)
**Deciders:** Christine (product owner)
**Related:** `supabase/schema.sql`, `api.js`, `supabase/SETUP.md`, PRD "How it's built"

## Context

TrailPeak started as a front-end prototype: plain HTML, CSS and JavaScript pages with sample data in the browser. To run a real pilot it needed shared data (accounts, trips, live slots, bookings that organizers can see) while staying cheap, simple to deploy, and understandable to a solo builder who is learning front-end development. Payments, ID checks and texts could stay simulated for now.

Constraints: a budget of ₱0 for the prototype and pilot, no server to maintain, a portfolio-friendly public link, data that must be private per user (Philippine Data Privacy Act), and pages that already existed and shouldn't be rewritten.

## Decision

Keep the site as **static files on GitHub Pages** (no build step) and add **Supabase** for the backend: Postgres with **row-level security** (RLS) deciding who sees which rows, and **security-definer functions** for anything that changes bookings (book, move, cancel, hold, review). `api.js` is a thin data layer that keeps the pages' existing data shapes; with an empty `config.js` the same pages run as an offline demo.

## Options considered

### Option A: Static site + Supabase (chosen)

| Dimension | Assessment |
| --- | --- |
| Complexity | Low to medium: no build or server; rules live in SQL |
| Cost | Free tier for the pilot |
| Scalability | Comfortable for thousands of users; Postgres underneath |
| Familiarity | HTML/JS already in use; SQL is new but readable |

**Pros:** no server to run; real Postgres with transactions and row locks (needed for slots); privacy enforced in the database, not just the page; email and Google sign-in built in; keeps every existing page.
**Cons:** business rules live in SQL functions, which are harder to read than app code; the publishable key is public, so every table must have RLS; schema changes are applied by hand in the SQL editor; free-tier email sends only a few messages per hour.

### Option B: Firebase (Firestore + Auth)

| Dimension | Assessment |
| --- | --- |
| Complexity | Medium |
| Cost | Free tier |
| Scalability | High |
| Familiarity | JS-first, but document data and security rules are a new model |

**Pros:** JavaScript all the way; good auth.
**Cons:** a document database makes "seats taken per date" and "never overbook" harder (no SQL transactions over related rows in the same simple way); security rules are less suited to the reporting the dashboard needs.

### Option C: A framework app with its own server (e.g. Next.js on Vercel + a database)

| Dimension | Assessment |
| --- | --- |
| Complexity | High: build step, server code, deployments |
| Cost | Free to low |
| Scalability | High |
| Familiarity | New framework to learn |

**Pros:** business logic in one language; room to grow.
**Cons:** rewrites every page; more moving parts than a pilot needs; slows learning the fundamentals.

## Trade-off analysis

The pilot needs dependable slots and private data more than it needs a big framework. Postgres row locks and RLS give both with no server. Firebase would make capacity rules harder; a framework app would cost weeks of rewriting before the first real booking. Supabase's main cost, rules written in SQL, is acceptable because the rules are few and well tested with PGlite.

## Consequences

- **Easier:** deploying (push to `main`, live in seconds), keeping data private by default, adding rules that every client must follow.
- **Harder:** reading business logic spread across SQL functions; remembering to re-run `schema.sql` after merges; anything needing a long-running process (handled with pg_cron, see ADR-002).
- **Revisit:** real payments may need a small server or Supabase Edge Functions for gateway webhooks (TP-029); the email sender limit before the pilot (TP-006); a migrations tool if schema changes become frequent.

## Action items

1. [x] Supabase project, `schema.sql`, `api.js`, offline demo
2. [ ] Decide where gateway webhooks will run when real payments start (TP-026/TP-029)
