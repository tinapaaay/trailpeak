# Payment and refund operations (draft)

**Status:** Draft for review (issue #30, TP-025). Confirm with pilot organizers before any real-payment build. Gateway options are in [ADR-004](../adr/004-payment-gateway.md).

The aim: every money situation has a named decider, a sender, a way for the joiner to track it, and an escalation path. Today (pilot) money goes directly from joiner to organizer; these rules apply to that model now and carry over to a gateway later.

## Who does what

| Situation | Decides | Sends the money | Joiner sees | Escalation |
| --- | --- | --- | --- | --- |
| Joiner cancels **7+ days** before | The trip's policy (standard: move once for free; refund only if the organizer's policy says so) | Organizer | Booking shows "Cancelled" + the policy line that applied | TrailPeak support reads the policy and the booking history |
| Joiner cancels **under 7 days**, or no-show | Policy: DP kept by the organizer | Nobody | "Cancelled: DP kept under the trip's policy" | Same |
| **Organizer cancels** (weather, closure, too few joiners) | Organizer must offer a move **or** a full DP refund | Organizer, within **3 days** | "Date cancelled: choose Move or Refund" | If not refunded in 3 days, TrailPeak support contacts the organizer; repeated cases pause the organizer |
| DP sent **after the hold expired** | Organizer: rebook if slots remain, otherwise refund | Organizer | "Expired: DP received late" then "Rebooked" or "Refund due" | Same as above |
| **Duplicate or wrong-amount payment** | Organizer confirms what arrived | Organizer refunds the extra within 3 days | Payment history shows both entries | Same |
| **Dispute** (joiner says they paid, organizer says no) | Organizer checks the reference; TrailPeak reviews the reference number and timestamps | n/a | "Under review" | TrailPeak decides whether the booking stands; it can't move money in the pilot |

## Commission and fees (proposals to test in interviews)

- **Basis:** a percentage of the **DP**, not the full event fee, because TrailPeak only touches the DP. Proposal to test: **5–10% of the DP**, with **no commission during the pilot**.
- **Refunds:** if the DP is fully refunded, TrailPeak's commission is refunded too. Gateway fees on a refund are borne by **the party who caused it** (organizer cancels → organizer; joiner cancels inside policy → joiner's refund is net of the gateway fee). Confirm what each gateway allows (ADR-004).
- **Payout already sent** to the organizer when a refund is owed: the organizer sends the refund from their own wallet; with a gateway, the next payout is reduced.

## Partial payment situations

- **Group booking, only some joiners paid:** the DP is per joiner; slots for unpaid joiners follow the hold rule (ADR-002). The organizer can confirm a partial DP; the booking shows how many joiners are covered.
- **Date cancelled after only some paid:** everyone who paid gets the move-or-refund choice; unpaid holds simply release.

## What TrailPeak needs to build for this (later issues)

- Booking, payment and refund states kept separate (TP-027, #32)
- A refund-due list for organizers, with a 3-day timer (part of TP-030, #35)
- A support view of a booking's full history (references, timestamps, who changed what)

## Open questions for organizers

1. What refund rule do you use today when *you* cancel? Is "move or full refund within 3 days" fair?
2. Would you accept a commission on the DP? What % feels fair?
3. Who should pay the gateway fee on a refund?
