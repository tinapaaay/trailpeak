# Receipt regression tests

Run `npm ci --prefix tests` and `npm test --prefix tests` from the repository root with Node 22+. Keep Git history available: the upgrade fixture loads the main schema at the merge of PR #9 (`f4c51425f2af2ce4de127005a4a8875b2e47028a`).

Tests use an in-memory PostgreSQL instance (PGlite) with synthetic `auth.uid()` claims and separate anon/authenticated roles. They cover the upgrade, schema re-run, permissions, row visibility, duplicate requests, payload mismatches, stale corrections, partial receipts, resetting an incorrect receipt, outside-booking snapshots, new DP-pending reservations and inventory invariants. JavaScript syntax and joiner balance mapping are also checked.

Run `node tests/preview.mjs` for a local synthetic browser fixture. Use `/dashboard.html` for the organizer and `/mytrips.html?testRole=joiner` for the joiner at `http://127.0.0.1:8015`. The fixture uses the current app files and real PostgreSQL receipt functions with a small mock Supabase transport. It never uses real auth sessions, contacts or bookings. All records vanish when stopped. It is test infrastructure, not a production server.

Browser evidence from this change: pending showed ₱0 received / ₱2,998 outstanding; recording ₱1,000 produced ₱1,998; correcting to ₱700 produced ₱2,298 in both organizer and joiner views. Occupancy stayed at two seats. Saved via keyboard and tested the receipt form at 375px with no page-level overflow.

Limitations: PGlite has one connection, so it does not prove true concurrent locking. This fixture does not validate Supabase JWT handling, PostgREST or the live deployment. Repeat owner/booker/other-organizer/signed-out checks in staging, apply the schema before app deployment, and verify demo/pilot isolation before pilot release. Demo sample IDs are rejected by booking/move/receipt/outside-booking operations and cannot be reassigned by normal clients. VoiceOver has not been tested.

## Manual end-to-end test

The live walkthrough for issue #24 (TP-019), a real two-joiner booking from both sides, is in [docs/testing/pilot-booking-test.md](../docs/testing/pilot-booking-test.md). The practice demo (`demo.html`) saves nothing and can't be used for it.
