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
Separate the lifecycle of every reservation into three orthogonal state dimensions and an append-only audit trail:

### 1. Three Orthogonal Lifecycles
On `public.bookings`:
- **`status` (Booking Status)**: `confirmed` | `cancelled` | `completed`.
  Governs slot reservation and trip participation.
- **`payment_status`**: `none` | `pending` | `confirmed` | `failed`.
  Governs the down-payment / event fee collection. In the pilot, GCash/Maya reference submission moves `none` → `pending`; organizer confirmation (via `record_dp_receipt`) moves `pending` → `confirmed`.
- **`refund_status`**: `none` | `pending` | `completed` | `declined`.
  Governs financial return. A booking can be `status = 'cancelled'` while `refund_status = 'pending'`, directly representing "Cancelled with refund pending".

### 2. Allowed Transitions and Permitted Actors
Transitions are governed by `transition_booking_state()` and specialized business functions:
- **Joiner**:
  - Cancel own active booking before the departure date (`confirmed` → `cancelled`). If DP was confirmed and cancellation is >= 7 days prior, `refund_status` becomes `pending`; otherwise DP is retained under policy (`refund_status = 'none'`).
  - Submit DP payment reference (`payment_status`: `none` → `pending`).
- **Organizer**:
  - Confirm received DP (`pending` → `confirmed`) via `record_dp_receipt()`.
  - Record refund sent (`refund_status`: `pending` → `completed`).
  - Decline refund under stated policy (`refund_status`: `pending` → `declined`).
  - Release overdue booking slots or cancel date with full refund pending.
- **Support / Admin**:
  - Adjudicate disputes and adjust payment or refund states with recorded rationale.
- **System (Automated/Cron)**:
  - Expire unpaid holds (`expire_holds()`), marking lapsed reservations.

### 3. Slot Invariants: Released Never Twice
Seat availability continues to be computed at read time via `booking_holds_seat(status, hold_until, dp_sent_at)`.
- Releasing slots occurs if and only if a booking currently holds seats (`booking_holds_seat(...) = true`).
- Transitioning to `cancelled` frees the slots immediately and logs `slots_affected = -size`.
- Subsequent operations on a cancelled booking (such as transitioning `refund_status` from `pending` to `completed`, or re-evaluating policies) calculate `slots_affected = 0`.
- It is mathematically impossible for slots to be released twice.

### 4. Append-Only State History Log
Every transition writes a permanent row to `public.booking_state_history`:
- `booking_ref`, `from_booking_status`, `to_booking_status`
- `from_payment_status`, `to_payment_status`
- `from_refund_status`, `to_refund_status`
- `actor_id`, `actor_role` (`joiner`, `organizer`, `support`, `system`)
- `slots_affected` (integer: -N when seats freed, +N if restored, 0 otherwise)
- `reason` and `created_at` timestamp.

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
- PGlite test suite validates idempotency, permitted transitions, and upgrade compatibility.

## Action Items
1. Add `payment_status`, `refund_status`, and `booking_state_history` to `supabase/schema.sql`.
2. Implement `public.transition_booking_state()` with actor role checks and seat idempotency.
3. Wire `cancel_booking()` and `record_dp_receipt()` to update state and log history.
4. Add comprehensive PGlite tests in `tests/states.test.mjs`.
