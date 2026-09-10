## What to build

With every consumer on the mutation seam (ADR-0018), the old add-only hook and its test file are deleted. A repo search proves the ADR's invariant: **no client component imports the Panier Server Actions directly** — every Panier mutation crosses the seam.

Idempotent retirer stays out of scope: ADR-0018 defers it explicitly.

## Acceptance criteria

- [ ] Old add hook and its test file deleted; no dead exports remain
- [ ] Search confirms zero client-component imports of the Panier actions outside the seam's default port
- [ ] lib and actions tests untouched and green; lint, typecheck and tests green

## Blocked by

- Panier: the cart line crosses the mutation seam (renamed Article du panier)
- Panier: the Barre d'achat consumes the seam itself
