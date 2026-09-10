## What to build

The Panier line component edits and removes an Article du panier through a per-line instance of the mutation seam instead of calling the Panier Server Actions directly. A Refus du panier (article absent, article indisponible) surfaces inline on the affected line (`role="alert"`) instead of vanishing silently; the client-side quantity guard stays; success is reflected by the action's refresh only — no success copy for edit/remove.

The component is renamed to the glossary term **Article du panier** (dropping « ligne », which the glossary forbids) and its importers updated.

## Acceptance criteria

- [ ] Edit and remove cross the seam; no direct Server Action import remains in the component
- [ ] A Refus du panier on edit/remove renders inline on the line and is cleared by the next operation on that line
- [ ] Tests assert the previously-ignored refusals (article absent, article indisponible) now display, via the in-memory port
- [ ] Component and file renamed to the Article du panier glossary term; all importers updated
- [ ] lint, typecheck and tests green

## Blocked by

- Panier: one mutation seam lands with its first consumer (Produit lié)
