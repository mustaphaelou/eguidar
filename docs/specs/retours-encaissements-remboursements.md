# Retours, Encaissements and Remboursements

> Spec written 2026-11-16; its decisions are ADR-0055, ADR-0056 and ADR-0057.

## Problem Statement

Eguidar publicly promises, on its FAQ and its conditions page, a 7-day right of withdrawal with a refund. The database cannot record one.

A customer who returns one article out of three has no representation: the only available gesture is to mark the whole Commande `Retournée`, which restocks **every** line, removes the **entire** order from the Chiffre d'affaires encaissé, and records neither what came back, nor what was refunded, nor when. The €/MAD amounts were never recorded as received either: money is inferred from `Statut de commande = Livrée`, with no collection row, no method, no actor, no refund, and no idempotency. The 7-day withdrawal window runs from delivery, and the schema stores no delivery date; `updatedAt` is overwritten by the next transition. Status changes leave no history, so "who cancelled this and when" is unanswerable.

The current public copy also contradicts the statute: it promises a refund "sous 7 jours après réception", while loi 31-08 art. 37 requires the refund within **15 days of the customer exercising the right**, delivery charge included in the « montant total payé », and does not authorise conditioning the refund on receipt. The schema has nowhere to put either clock.

From the support desk's perspective: a customer calls to return one item, and there is no fact to write down.

## Solution

Split the three facts the current schema conflates, and stop letting `Statut de commande` carry money and stock:

- **Retour** — the goods coming back, with `Lignes du Retour` carrying declared and received quantities and the condition of each.
- **Encaissement** — money received for a Commande. Cash on delivery produces one automatically when the Commande becomes `Livrée`.
- **Remboursement** — money going back, against an Encaissement, with a mode and an idempotency key. It may exist without a Retour and may precede receipt.
- **Changement de statut** — every transition recorded with its actor and instant; **`Order.deliveredAt`** persisted so the legal window is provable.

The Chiffre d'affaires encaissé becomes the sum of Encaissements; the Chiffre d'affaires net subtracts the Remboursements. A partial Retour leaves the Commande `Livrée`; a complete one makes it `Retournée` from the same transaction that receives the last unit. Support can record a Retour, mark it received or refused, and refund it; only resellable goods go back to stock; the 7-day and 15-day clocks are visible from recorded facts.

No new UI is part of this slice: the write paths, the schema and their proofs ship first, so the admin screens are a later, purely additive surface.

## User Stories

1. As support staff, I want to record that a Client exercises their right of withdrawal, so that the 7-day and 15-day clocks start from a recorded fact rather than a conversation.
2. As support staff, I want the date the Client exercised the right to be a fact of the Retour, separate from the moment I type it, so a late entry does not move the legal deadline.
3. As support staff, I want to record why the goods come back — withdrawal, non-conformity, goodwill, or other — so that the applicable rule is explicit.
4. As support staff, I want a Retour for a Commande that was never delivered (a parcel refused at the door), so that goods can come back without inventing a refund.
5. As support staff, I want to record one Ligne du Retour per Article du panier with the declared quantity, so that a partial return is expressible.
6. As support staff, I want to declare, across non-refused Retours, no more than the ordered quantity of a line, so that a Client cannot be refunded twice for the same unit.
7. As support staff, I want at most one open Retour per Commande, so that two agents cannot create duplicates from two conversations.
8. As support staff, I want to record a request after the seventh day as a commercial gesture, never as a withdrawal, so that the legal clock is never falsified.
9. As support staff, I want to see the withdrawal deadline computed from the recorded delivery date, so that I know whether the request is in time.
10. As support staff, I want to refuse a Retour with a lawful code, so that the refusal is explainable and reportable later.
11. As support staff, I want to refuse a request for an article excluded by law, so that the refusal follows the statute rather than a blanket policy.
12. As support staff, I want to mark a Retour received with the quantity actually received on each line, so that the parcel's contents are the fact, not the Client's claim.
13. As support staff, I want to record the condition of each received line — resellable or damaged — so that damaged goods do not silently re-enter stock.
14. As support staff, I want only received and resellable quantities to re-enter stock, so that the catalogue's stock reflects what can be sold.
15. As the shop, I want the Commande to become `Retournée` automatically when every ordered unit has come back, so that the glossary's rule cannot be forgotten by an operator.
16. As the shop, I want a partial receipt to leave the Commande `Livrée`, so that a sale is not closed while goods are still out.
17. As support staff, I want a later parcel to be a second Retour, so that partial receipts need no new concept.
18. As the shop, I want receipt never to restock again through the status transition, so that the same unit is not counted twice.
19. As support staff, I want to refuse only while the Retour is requested, so that a received parcel cannot be un-received.
20. As support staff, I want a refusal not to erase a Remboursement already granted, so that goods and money stay independent facts.
21. As the shop, I want an Encaissement written automatically when a Commande is marked `Livrée`, in the same transaction, so that a delivered Commande always has a money fact.
22. As the Propriétaire, I want the Encaissement to record amount, mode, instant and the administrator who recorded it, so that the collection is attributable.
23. As support staff, I want to refund against a specific Encaissement, so that money out always references money in.
24. As support staff, I want to refund in cash or by transfer, so that the record matches what physically happened.
25. As support staff, I want a complete withdrawal to refund the whole amount paid, delivery included, so that the statute's « montant total payé » is honoured.
26. As support staff, I want a partial return to refund goods only, so that the delivery rule is predictable and explainable.
27. As support staff, I want to refund a Retour before the goods come back, so that the 15-day statutory deadline is not held hostage to the postal service.
28. As support staff, I want to attach an idempotency key to every Remboursement, so that a double submit cannot pay twice.
29. As the shop, I want to be unable to refund more than remains on an Encaissement, so that the money ledger cannot go negative.
30. As support staff, I want to give a reason on a Remboursement whose amount differs from the computed expectation, so that a commercial gesture is explained.
31. As the Propriétaire, I want the Chiffre d'affaires encaissé to be the sum of Encaissements, so that "money received" is a fact rather than a status.
32. As the Propriétaire, I want the Chiffre d'affaires net to subtract Remboursements, so that I see what remains acquired to the shop.
33. As the Propriétaire, I want a fully refunded Commande to remain `Livrée` with both its Encaissement and its Remboursement, so that the money trail does not disappear.
34. As the Propriétaire, I want the dashboard's net revenue before and after the migration to be identical, so that the change is provably neutral.
35. As the Propriétaire, I want every Changement de statut recorded with its actor, instant and reason, so that I can answer who did what and when.
36. As the Propriétaire, I want the delivery instant persisted on the Commande, so that the withdrawal window is provable after the fact.
37. As the maintainer, I want historical `Livrée` Commandes to receive one Encaissement at migration, so that revenue does not reset to zero.
38. As the maintainer, I want no fabricated history for Commandes whose past cannot be known, so that the audit trail does not lie.
39. As the maintainer, I want the historical `Retournée` Commandes to remain without money rows, so that the record reflects what the old schema could never capture.
40. As the maintainer, I want the new timestamps to carry their time zone, so that the legal clocks are unambiguous.
41. As the maintainer, I want the backfill to be re-runnable, so that a failed deployment can be retried without duplicating Encaissements.
42. As the maintainer, I want a verified restore point before the first migration, so that a failure is not one-way.
43. As the maintainer, I want the status-derived revenue and restock predicates deleted rather than left dormant, so that no screen can silently resurrect the old rule.
44. As the maintainer, I want the new write paths to go through the shared mutation skeleton, so that retries, best-effort effects and validation refusals behave like every other Administration mutation.

## Implementation Decisions

**The three facts, and the status.** A Retour is the physical fact, an Encaissement the money-in fact, a Remboursement the money-out fact; none of them is a Statut de commande. `Order.status` keeps its labels and allowed transitions; `Retournée` is reached only when every ordered unit has been received across non-refused Retours, and there is no `partiellement retournée`. The revenue predicates built on status (`STATUTS_ENCAISSÉS`, `FRAGMENT_WHERE_ENCAISSÉS`, `estEncaissée`) are retired, as is the `réapprovisionne` flag and the restock it drives.

**Schema additions** (money stays integer minor units; MAD is frozen, so no currency column in this slice):

- `Order.deliveredAt` — nullable, time zone aware, written in the same transaction as the `Livrée` transition.
- `Payment` (Encaissement) — `orderId`, `amount`, `mode` (`cash_on_delivery`), `collectedAt`, `recordedBy`, `createdAt`. Multiple per Commande allowed; `delivered ⇒ at least one` is an application invariant, not a database one.
- `Refund` (Remboursement) — `paymentId`, optional `returnId`, `amount`, `mode` (`cash` or `transfer`), `refundedAt`, `recordedBy`, optional `reason`, `idempotencyKey` unique.
- `Return` (Retour) — `orderId`, `status` (`requested`, `received`, `refused`), `reason` (`withdrawal`, `non_conformity`, `goodwill`, `other`), `requestedAt`, `receivedAt`, `refusalCode` (`out_of_window`, `excluded_by_law`, `not_received`, `condition_mismatch`, `other`), `refusalNote`.
- `ReturnLine` (Ligne du Retour) — `returnId`, `orderItemId`, `declaredQuantity`, `receivedQuantity`, `condition` (`resellable`, `damaged`); unique on `(returnId, orderItemId)`.
- `OrderStatusChange` (Changement de statut) — `orderId`, `fromStatus`, `toStatus`, `changedAt`, `actorId`, optional `reason`.

Database constraints that must exist in SQL, not only in code: a partial unique index on `Return(orderId)` where `status = 'requested'`; `CHECK declaredQuantity > 0`; `CHECK receivedQuantity >= 0 AND receivedQuantity <= declaredQuantity`; the refund ceiling and the cumulative declared cap are transaction checks, because they aggregate rows. Foreign keys: Payment, Return, ReturnLine and OrderStatusChange cascade with their Commande; Refund cascades with its Payment and nulls its `returnId` if a Retour were removed; actor references null on user deletion. The partial index and the CHECKs are hand-written in a `--create-only` migration, as the single-running-import index already is.

**Refund expectation.** A complete return — every ordered unit received — expects the full `Payment.amount`, delivery included. A partial return expects `OrderItem.price × receivedQuantity` per line, goods only. The expectation is computed by a pure rule; the Remboursement stores the amount actually granted, which may differ, with `reason` explaining why.

**Clocks.** The withdrawal window is seven days from `Order.deliveredAt` and applies only to `withdrawal`; `non_conformity` has no window; `goodwill` is the recorded path for a late request. The refund duty is fifteen days from `Return.requestedAt`; a Remboursement may therefore precede receipt. A late request is never hard-blocked — it is recorded as `goodwill`.

**Creation and receipt.** Creating a Retour declares lines and quantities under a row lock on the Commande; the sum of declared quantities across non-refused Retours may not exceed the ordered quantity. Receiving sets each line's received quantity and condition, restocks only resellable received units, and — when the cumulative received quantity reaches the ordered quantity — transitions the Commande to `Retournée` and writes the Changement de statut in the same transaction, with the acting administrator as actor. Receipt never restocks twice.

**Refusal.** Only a `requested` Retour can be refused; the refusal carries a lawful code and a note, and cannot extinguish a Remboursement already granted.

**Revenue and reads.** Gross revenue is Σ `Payment.amount`; net is gross − Σ `Refund.amount`. The dashboard, the Commande detail and the order list read these facts; the statut-derived predicate disappears.

**Backfill.** Orders currently `Livrée` receive `deliveredAt = updatedAt` and one Encaissement (`totalPayable`, cash on delivery, `collectedAt = updatedAt`, no actor). Orders currently `Retournée` receive neither money rows nor invented history. No `OrderStatusChange` row is fabricated. The backfill is guarded so a second run cannot duplicate an Encaissement. Acceptance: net revenue is identical before and after.

**Migration order.** (0) verified `pg_dump` and a real test restore; (1) every `DateTime` to a time-zone-aware column with `USING … AT TIME ZONE 'UTC'`; (2) additive schema, backfill, and the new writes for payment, history and `deliveredAt`; (3) switch the revenue reads, retire the old predicates and status restock, and land the four return mutations. Expand first, contract only after the reads have moved. No destructive rename in a single step.

**Modules.** A pure returns rules module (refund expectation, complete-return predicate, withdrawal window); a returns use-case module for the four mutations; the orders use-case gains payment and history writes and loses restock; the order status module keeps labels and transitions only. The write paths go through the shared mutation skeleton, like every other Administration mutation.

**ADR-0055** records the three-fact split; **ADR-0056** records that revenue reads the money rows and amends ADR-0009; **ADR-0057** records that timestamps carry their time zone. The glossary already owns the vocabulary and the French-to-persistence mapping.

**No UI.** No admin screen, no customer-facing return form. The admin reads that exist today are extended only where a persisted fact must be displayed.

## Testing Decisions

A good test here proves an **external behaviour of the use-case boundary** against a real PostgreSQL database, then reads the state back through the same public surface or through Prisma. It does not mock Prisma data, does not assert private helpers, and does not assert that an internal function was called. Concurrency is proven with two real promises and a transaction held open between two reads, the pattern the structure-mutation suites already use. Fixtures are namespaced with one run id; files run serially against `TEST_DATABASE_URL`.

**Seam 1 — the returns use-case boundary.** One module's public functions are exercised for: creating a Retour (withdrawal, non-conformity, goodwill, refused parcel), the cumulative cap, the one-open-request rule, receipt with partial and damaged lines, resellable-only restock, the automatic `Retournée` transition, second-parcel returns, refusal, payment creation on delivery, full and partial refund expectations, refund before receipt, the refund ceiling, idempotent double-submit, and history rows on every transition. Prior art: the orders use-case suite and the administration structure suites.

**Seam 2 — the migration suite.** The migration test reads its own SQL, asserts it is additive (no drop, no destructive rename), then seeds a delivered Commande without an Encaissement, runs the backfill twice, and asserts exactly one Encaissement appears and that gross/net revenue are unchanged. Prior art: the structure-position migration suite, which already reads a migration's SQL and asserts its additive shape.

The pure rules are exercised through Seam 1; no third seam is added. The import-boundary suites around `lib/` do not change.

## Out of Scope

- Admin and storefront screens for returns, refunds and status history; a customer-facing return request form.
- Exchanges, store credit (`avoir`), per-line refund allocation, multiple parcels per Retour as a distinct concept.
- Multi-currency, per-location stock, stock reservation tables, promotions and discounts, tax lines.
- The historical money trail of Commandes already `Retournée` under the old schema (unrecoverable, and not to be invented).
- Return notification e-mails.
- The public copy fix: the conditions page's "7 days after receipt" and its blanket "opened = no return" are a separate ticket. This spec records the conflict; it does not rewrite the page.
- The later branches of the enhancement (pre-MAD currency, per-location stock, promotions) remain unvisited until this slice ships.

## Further Notes

- Legal basis: loi 31-08 (protection du consommateur), art. 36 (7 days from receipt; 30 if the information duties are not met), art. 37 (refund of « le montant total payé », within 15 days of exercising the right), art. 38 (the narrow exclusions). The refusal vocabulary follows art. 38, not the current page.
- The withdrawal clock is only as good as `deliveredAt`: historical `Retournée` Commandes have no provable delivery instant, and the spec accepts that gap rather than fabricating one.
- The work is sequenced after the in-flight mutation-skeleton refactor, so the new write paths use the shared mechanism rather than a fifth copy of it.
- Deferred decisions are recorded in the glossary (three terms now named) and are recorded as ADR-0055, ADR-0056 and ADR-0057; the glossary is already updated.
- The restore point is a gate, not a nice-to-have: with production data and no repository backup job, the first irreversible migration must not run without a tested restore.
