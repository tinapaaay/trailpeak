# ADR-005: Separate booking, payment and refund states into orthogonal lifecycles

**Status:** Accepted for the pilot and payment gateway
**Date:** 2026-11-12
**Deciders:** Christine (product owner)
**Related:** issue #32 (TP-027), issue #30 (TP-025), issue #31 (TP-026), PRD "Data model, P.6–P.7", ADR-002, ADR-004

## Context
In early prototypes, a booking carried a single composite `status` (`confirmed`, `cancelled`). Payment and refund nuances—such as an unpaid hold, a submitted GCash reference, a confirmed DP, an organizer cancellation awaiting refund, or a refund already disbursed—were conflated into single flags or timestamp heuristics (`dp_sent_at`, `hold_until`).

This created three critical vulnerabilities:
1. **Unrepresentable intermediate business states**: When a joiner or organizer cancels an active booking that already has a confirmed DP, the booking is logically *cancelled* (freeing seats for other joiners), but financial reconciliation is *pending* (the organizer owes a refund or policy decision). Under a single status column, this was unrepresentable without corrupting seat calculations or losing track of owed money.
2. **Double-release of slots**: If state transitions repeatedly touch seat availability, a cancellation or refund process might accidentally decrement capacity twice or resurrect held seats. Seat calculations must follow ADR-002 (`booking_holds_seat()` computed at read time) and remain strictly idempotent.
3. **Auditability and disputes**: TrailPeak support needs a verifiable, append-only history of who changed each state, when, why, and how many seats were affected, especially during disputes where joiners claim they paid or organizers report refunds sent.

## Decision
Three separate state dimensions on `public.bookings`, one source of truth, and an append-only history.

### 1. Three lifecycles
- **`status`** (seats): `confirmed` | `cancelled` | `expired`. "Completed" is **not stored**: a confirmed booking whose date has passed is completed (the status check stays as it was).
- **`payment_status`**: `none` | `pending` | `confirmed` | `failed`.
- **`refund_status`**: `none` | `pending` | `completed` | `declined`. "Cancelled with refund pending" is `status = 'cancelled' and refund_status = 'pending'`.

### 2. One source of truth (no drift)
The existing actions stay the only way most states change; triggers keep the new columns in step with them:

| Action (existing function) | Effect |
| --- | --- |
| `send_dp_reference` | payment `none`/`failed` → `pending` |
| `record_dp_receipt` (full / partial / undo to 0) | payment → `confirmed` / `pending` / back to what the facts say (`derived_payment_status()`) |
| `expire_holds` | status → `expired`; payment `none` → `failed` |
| `rebook_expired` | status `expired` → `confirmed` (seats checked under the date lock, ADR-009); payment `failed` → `pending`/`none` |
| `cancel_booking` (joiner) | status → `cancelled`; refund by policy: confirmed DP and at least `refund_cutoff_days` (7) before the trip → `pending`, otherwise `none` (DP kept) |
| `release_overdue_booking` (whole, organizer) or any other cancel | status → `cancelled`; refund `pending` if the DP was confirmed, else `none` |
| DP confirmed after the booking was already cancelled | refund `none` → `pending` (money arrived; the organizer decides) |

Upgrades backfill `payment_status` from the same facts.

### 3. Deliberate changes: `transition_booking_state()`, a per-role matrix
Anything not listed is refused. Payment status is never set by hand.

| Role | Allowed |
| --- | --- |
| Joiner | booking `confirmed` → `cancelled`, **routed through `cancel_booking`** (its past-date rule, note and activity entry). Never a refund. |
| Organizer | booking `expired` → `confirmed`, **routed through `rebook_expired`** (capacity checked); refund `pending` → `completed` / `declined`, with a reason. |
| Support (service role or the owner in the SQL editor) | refund `pending` → `completed` / `declined`, `declined` → `pending`, and `none` → `pending` on a cancelled booking (goodwill), with a reason. |
| System (cron) | only through `expire_holds`. |

### 4. Seats: released never twice
Seat use is still computed at read time (`booking_holds_seat()`, ADR-002). Each history row records the seats it moved: `+size` when a booking starts or is revived holding seats, `-size` when it stops (a cancel, a release, or an expiry: the lapse freed the seats at `hold_until`, and the expiry row records it), else `0`. For every booking, the history's seats add up to what it holds now; a second cancel is refused.

### 5. Append-only history
`public.booking_state_history`, written only by the trigger on `bookings`, on every insert and every change of any of the three states: from/to of each, `actor_id`, `actor_role` (joiner, organizer, support, system), `slots_affected`, `reason` (the caller's reason, else the booking's note), time. The booker and the trip's organizer can read their rows; nobody can write, edit or delete them through the API.

## Options Considered

### Option A: Flat Composite Status Strings (cancelled_refund_pending, cancelled_refunded)
- **Complexity:** High exponential growth of combinatorial string states.
- **Cons:** Combinatorial explosion of states (`confirmed_unpaid`, `confirmed_paid`, `cancelled_unpaid`, `cancelled_refund_pending`, `cancelled_refund_completed`, `cancelled_no_refund`). Querying whether a booking holds a seat becomes fragile.

### Option B: Three Dedicated State Columns + History Log (Selected)
- **Complexity:** Low; clean separation of concerns.
- **Schema Impact:** Non-destructive `add column if not exists` with backward-compatible defaults.
- **Scalability:** Direct bridge from pilot direct-payments to automated gateway webhooks (ADR-004).
- **Pros:** State queries are simple, orthogonal, and self-documenting. Supports "Cancelled with refund pending" naturally (`status = 'cancelled' AND refund_status = 'pending'`).

## Trade-off Analysis
Adding columns and an append-only log slightly increases row write volume during cancellations and receipt confirmations. However, because bookings per departure are small (typically 12–20 joiners), this overhead is negligible. In exchange, we gain complete auditability, zero risk of double seat releases, and full compliance with PRD Section P.6–P.7.

## Consequences
- `supabase/schema.sql` gains `payment_status` and `refund_status` on `bookings`, and the `booking_state_history` table.
- Upgrades from existing schemas backfill historical rows seamlessly: confirmed DP receipts map to `payment_status = 'confirmed'`; existing cancellations default to `refund_status = 'none'`.
- The organizer dashboard and joiner booking view can show accurate, multi-stage statuses (e.g., "Cancelled · Refund pending from organizer").
- `tests/states.test.mjs` (PGlite, upgrade path from main) and two new real-Postgres scenarios in `tests/race.test.mjs` check no-drift, the matrix and the seat invariant.

## Action Items
1. Show the states in My trips and on the dashboard ("Cancelled · Refund pending from organizer"), with the organizer's refund buttons, in a later PR.
2. When the payment gateway lands (ADR-004), its webhook sets payment status through the same receipt path, not by hand.
3. Released unnamed slots (a booking that shrinks but stays confirmed) don't change any of the three states; refunds for them follow the trip's policy outside TrailPeak for now.
