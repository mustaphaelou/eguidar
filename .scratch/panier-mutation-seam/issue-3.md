## What to build

The product buy box keeps variant selection (choix de variante, prix courant, stock, indisponible) and takes its mutation state from the mutation seam instead of the old add-only hook. Until the Barre d'achat migrates, it keeps building the existing relay object for the barre from seam state (transitional shim). Its tests drive the seam through the in-memory adapter.

## Acceptance criteria

- [ ] Add from the buy-box behaves as before (acknowledgement, refusal inline, pending label) but crosses the seam
- [ ] Variant selection remains a buy-box concern; the seam receives no stock facts
- [ ] The Barre d'achat continues to work unchanged via the relay object built from seam state
- [ ] Buy-box tests use the in-memory port (no actions-module mocking)
- [ ] lint, typecheck and tests green

## Blocked by

- Panier: one mutation seam lands with its first consumer (Produit lié)
