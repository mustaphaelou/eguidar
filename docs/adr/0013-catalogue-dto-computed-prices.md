# Catalogue DTOs expose computed prices — display surfaces never re-derive

ADR-0009 pinned the values rule for order amounts: "display sites show `totalPayable` and must not re-derive `total + shippingFee`". This decision extends that same constraint to Catalogue prices.

A product's price reaches the Visiteur through multiple surfaces: the product page's buy box, the variant picker, the floating Barre d'achat, Données structurées (JSON-LD), and the share preview (Open Graph metadata). When surfaces receive a bare base price and variant price deltas, every surface is forced to re-derive «prix de base + écart de prix» independently, leading to scattered arithmetic, prop drilling, and inconsistencies (such as share previews announcing the base price instead of the purchasable minimal price).

The read path is enforced in code:
- The Catalogue read module's DTOs (`ProductDetailData` and `ProductVariantDto`) expose prices already computed: `minPrice` (cents) on the product detail and `prix` (cents) per Variante, built using the canonical pure functions (`minVariantPrice`, `prixVariante`).
- Display surfaces (the buy box, the variant picker, the Barre d'achat, Données structurées, and page metadata) consume these baked facts directly and never re-derive «prix de base + écart de prix».
- The écart de prix (`priceDelta`) remains a storage and Administration fact for variant editing, never a storefront display input.
- The Panier module already exposes the computed `unitPrice` on its Article du panier DTO; its internal computation remains an isolated module concern. The Document d'index and Recherche retain their own `minPrice` computed at reindex time.

## Amendement — Devis auto-porteur (#193)

Les faits calculés voyagent cuits : le Devis est auto-porteur — il porte le
`sousTotal` (cents) issu du Panier dont il a été chargé par `chargerDevis`.
Les surfaces d'affichage ne reçoivent plus le sous-total comme un fait
séparé, filé à part, qui pourrait dériver des devis.

Le champ dérivé `rows` devient redondant : il se dérive du fait propre via
`lignesDevis(devis.sousTotal, devis)` et sera supprimé par le ticket de
contraction. En attendant, `rows` reste présent et consommé — l'expansion ne
casse aucun appelant.
