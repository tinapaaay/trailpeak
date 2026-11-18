# ADR-014: All typed text and trip details are untrusted

**Status:** Accepted
**Date:** 2026-11-18
**Deciders:** Christine (product owner)
**Related:** TP-005 (privacy), `tests/e2e/xss.e2e.mjs`

## Context

Pages build HTML from data other people typed: trip details, organizer names, pick-ups, joiner names, notes. A hostile-data test found stored cross-site scripting (XSS) on the search, My trips, reserve, dashboard and Post a trip pages: text saved by one person ran as code in another person's browser. `trips.details` is free-form JSON, so even "number" fields can hold anything.

## Decision

Three layers:

1. **Clean on load.** `tpCleanDetails()` in `api.js` forces numbers to be numbers and level and kind to known values, accepts only plain photo ids and `https` gallery links, and drops page-only fields such as `page`. Trips with unsafe ids are skipped.
2. **Escape on display.** All supplied text goes through `escapeHtml()` or `textContent`. Every page uses the same escaping, including single quotes.
3. **Browser safety net.** Each page sets a Content-Security-Policy of `script-src-attr 'none'; object-src 'none'; base-uri 'self'`, which blocks inline event-handler attacks if a future template forgets to escape.

## Options considered

- **Escape only.** Smallest change, but one missed template reopens the hole, and numeric fields look safe when they aren't.
- **Validate only in the database.** Worth adding later, but it doesn't protect rows already saved and can't know how each page uses a value.
- **Full CSP without inline scripts.** Strongest, but every page keeps its script inline; moving them is a larger change for after the pilot.

## Consequences

- New templates must escape supplied text (AGENTS.md rule 8); the security test runs on every PR.
- Inline `onclick`-style attributes no longer work. Use `addEventListener`.

## Action items

- After the pilot, consider moving inline scripts to files so a stricter policy can apply.
