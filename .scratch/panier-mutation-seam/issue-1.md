## What to build

One client seam for the Panier mutations (ADR-0018): a hook owning only the mutation state — en attente, le message d'un Refus du panier, et l'accusé « ajouté » (add-only, cleared by the next operation) — exposing `ajouter(varianteId, quantité)`, `modifier(varianteId, quantité)`, `retirer(varianteId)`. The mutation transport enters as an optional port defaulting to the Panier Server Actions; tests drive it through an in-memory adapter.

The Produit lié card crosses the seam as its first consumer: its locally copied add state machine is deleted, and a Refus du panier now renders inline (`role="alert"`) on the card. Variant selection, prix courant and stock stay out of the seam — it never requires stock facts.

## Acceptance criteria

- [ ] The hook exposes the three mutations and only mutation state (pending, refusal message, add-only acknowledgement cleared by the next operation)
- [ ] The transport is an optional port parameter defaulting to the Panier Server Actions; production call sites pass nothing
- [ ] Hook tests exercise the refusal branch (panier plein, quantité invalide, article indisponible, article absent) through an in-memory adapter, without mocking the actions module
- [ ] The Produit lié card renders the add acknowledgement and a Refus du panier inline; its copied state machine is gone
- [ ] The card has tests (previously none) covering success acknowledgement and refusal display
- [ ] lint, typecheck and tests green

## Blocked by

None — can start immediately.
