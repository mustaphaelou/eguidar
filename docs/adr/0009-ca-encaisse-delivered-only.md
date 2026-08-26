# Chiffre d'affaires encaissé counts only Commandes Livrées

Eguidar's only payment method is Paiement à la livraison: money becomes real only when the courier collects it, i.e. at statut `delivered` (`Livrée`). Revenue metrics on the Tableau de bord therefore sum **only** orders with statut `Livrée`, deliberately excluding `pending`, `confirmed` and `shipped` even though those are legitimate in-flight orders — do not "fix" the where-clause to include them; add a separate order-book metric instead if needed.

Two constraints not obvious from the code: `Order.total` stores the articles subtotal **without** the delivery fee (see `lib/use-cases/orders.ts`), so any collected amount must be computed as `total + shippingFee` ("Total à payer"); and the same rule applies retroactively to chart buckets.
