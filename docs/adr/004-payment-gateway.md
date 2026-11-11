# ADR-004: Payment gateway for real DP payments

**Status:** Proposed (research only; decide after interviews and the pilot, TP-024)
**Date:** 2026-11-12
**Deciders:** Christine (product owner), with pilot organizers
**Related:** issue #31 (TP-026), #30 (TP-025), ADR-002 (slot holds), PRD P.6–P.7

## Context

During the pilot, joiners pay the DP directly to the organizer's GCash or Maya and the organizer marks it received. For real payments, TrailPeak wants joiners to pay inside the site, the DP to reach the organizer, and TrailPeak's commission to come off automatically, without TrailPeak holding other people's money in its own account.

What the choice must support: GCash and Maya (how joiners already pay), **split payouts** (organizer share + TrailPeak commission), refunds that don't land on the wrong party, onboarding small organizers, and webhooks we can verify once (TP-029). Costs must suit ₱500–₱3,000 DPs.

Figures below come from the providers' public pages and docs as of Nov 2026, and must be confirmed with each provider's sales team before deciding.

## Options considered

### Option A: PayMongo Platforms (split payments)

| Dimension | Assessment |
| --- | --- |
| Complexity | Medium: parent account + organizer child accounts, split payments, webhooks |
| Cost | GCash about 2.23% + 12% VAT on the fee (public rate); Platforms about ₱75/month per activated sub-account; split and refund pricing is custom (quote needed) |
| Scalability | Built for marketplaces |
| Familiarity | Philippine company; GCash, Maya, cards, QR Ph |

**Pros:** split payments are a documented feature; a refund can be split in proportion, or the platform can choose who bears it (`split_refund`); GCash refunds are supported for 180 days.
**Cons:** split and refund pricing isn't public; each organizer needs a verified child account (KYC friction for small organizers); per-organizer monthly fee adds up if many are inactive.

### Option B: Xendit xenPlatform (split rules)

| Dimension | Assessment |
| --- | --- |
| Complexity | Medium: master + sub-accounts, split rules by API |
| Cost | GCash about 2.3%, Maya about 1.8%, + 12% VAT; about ₱85/month per *active* sub-account; a per-transaction processing fee announced from Oct 1, 2026 (confirm) |
| Scalability | Built for platforms; regional |
| Familiarity | Large SEA provider; good docs |

**Pros:** flexible split rules (flat or percent); a sub-account fee only when it transacts that month; lower Maya rate.
**Cons:** split fees are **not** returned automatically on refunds, so we must design for it; refunds must name the sub-account; the new processing fee changes the math.

### Option C: No gateway: keep direct payment (the pilot model) and invoice commission

| Dimension | Assessment |
| --- | --- |
| Complexity | Low: already built |
| Cost | No gateway fees; TrailPeak bills organizers monthly |
| Scalability | Limited by trust and manual confirmation |
| Familiarity | How organizers work today |

**Pros:** nothing new to build; no KYC for organizers; no money held by TrailPeak.
**Cons:** joiners still pay outside the site; slots wait on organizer confirmation; collecting commission is manual and may go unpaid; no automatic refunds.

## Trade-off analysis

A and B both solve the core problem (the DP reaches the organizer, commission comes off, TrailPeak never holds the money). The deciding questions are ones only real conversations answer:

1. **Will organizers complete a gateway's KYC** to get a child/sub-account? If not, A and B fail at onboarding.
2. **What will commission be**, and on the DP or the full fee? On a ₱500 DP, a ~2.3% gateway fee is about ₱13, plus VAT, plus monthly per-organizer fees. A small commission may not cover it.
3. **Who bears refund fees** (see the draft operations in `docs/payments/operations-draft.md`). PayMongo lets the platform choose; Xendit needs us to handle split fees ourselves.

Until those answers exist, **C stays in place** (it's what the pilot runs on), and the leaning between A and B is **A (PayMongo)** for its documented split refunds and Philippine focus, pending a quote. If the quote or onboarding is poor, B is a strong second.

## Consequences

- **Easier now:** nothing to build until the pilot proves organizers want TrailPeak.
- **Harder later:** whichever gateway wins needs webhook handling somewhere (Supabase Edge Functions, per ADR-001's open item), slot holds during checkout (TP-028, same pattern as ADR-002) and reconciliation (TP-031).
- **Legal check before going live:** confirm with the chosen provider (and a lawyer if needed) that routing payments through a licensed gateway's split feature means TrailPeak isn't holding or remitting funds itself under BSP rules. This ADR is not legal advice.

## Action items

1. [ ] Ask PayMongo and Xendit sales for a marketplace quote: split fees, refund fees, sub-account onboarding requirements for individual organizers
2. [ ] Add interview questions on gateway KYC and commission (organizer Q15–17 already cover trust and fees)
3. [ ] Decide after the pilot (TP-024); update this ADR to Accepted or Superseded

## Sources

- [PayMongo pricing](https://paymongo.com/pricing)
- [PayMongo Platforms](https://developers.paymongo.com/docs/paymongo-platforms)
- [PayMongo: refunding a split payment](https://developers.paymongo.com/docs/refunding-a-split-payment)
- [PayMongo: refunding transactions](https://developers.paymongo.com/docs/refunding-transactions)
- [Xendit split payments](https://docs.xendit.co/docs/split-payments)
- [Xendit: xenPlatform fee](https://help.xendit.co/hc/en-us/articles/4413990486041-How-Much-is-XenPlatform-Fee)
- [Xendit Philippines pricing](https://www.xendit.co/en-ph/pricing/)
- [Xendit pricing policy update](https://help.xendit.co/hc/en-us/articles/59516240127129-Xendit-Pricing-Policy)
