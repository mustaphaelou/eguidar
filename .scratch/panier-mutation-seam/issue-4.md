## What to build

The Barre d'achat takes its own instance of the mutation seam and receives only display facts from the buy-box (variante, prix courant, nom, indisponible). The seven-field relay and the old add-state type die; the barre's add and its acknowledgement / refusal display are its own. Tests against the in-memory port.

## Acceptance criteria

- [ ] The barre adds through its own seam instance; acknowledgement and Refus du panier render on the barre
- [ ] Props shrink to display facts; the seven-field relay object is gone
- [ ] The old add-state type has no remaining consumers and is deleted
- [ ] Barre tests use the in-memory port (no actions-module mocking)
- [ ] lint, typecheck and tests green

## Blocked by

- Panier: the buy-box crosses the mutation seam
