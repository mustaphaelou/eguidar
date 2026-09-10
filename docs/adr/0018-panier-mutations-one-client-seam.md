# One client seam for the Panier mutations, with an injected transport

Three client modules crossed the same Panier mutations with three different contracts: the add
hook owned result→message, pending and added; the cart line called the modifier/retirer Server
Actions directly and ignored `ResultatPanier`, so `article-inconnu` and `variante-inconnue`
refusals vanished silently; the Produit lié card re-implemented the add state machine inline.

## Decision

- **One client seam owns the mutation state** for ajouter, modifier and retirer: pending,
  result→message, and the add-only acknowledgement (cleared by the next operation).
  Modifier and retirer surface refusals only — their success is reflected by the Server
  Action's `refresh()`.
- **Mutation-state only.** Variant selection, prix and stock stay with the buy-box; the seam
  never requires stock facts (the Produit lié card has none).
- **Every consumer crosses it** — buy-box, Barre d'achat (own instance; the seven-field relay
  and `EtatAjoutAuPanier` are gone), cart line, Produit lié card — and refusals render inline
  where the operation happened.
- **The transport is the injected port.** The hook takes an optional port parameter defaulting
  to the Server Actions import; tests pass an in-memory adapter. This is the client-side
  counterpart of ADR-0014's optional-override seam, not a violation of it: ADR-0014 stands
  server-side — mutation effects, including success-only `refresh()`, stay encapsulated in the
  action/lib layer, never caller-injected.
- **Refusal copy stays server-side.** `ResultatPanier.message` is relayed verbatim; `motif`
  remains server-side typing.

## Considered Options

- **Keep mocking the actions module in tests** (current client-test convention) — rejected:
  the refusal branch stays untestable per consumer and the port stays implicit.
- **Motif→client message lookup** — rejected: the server owns refusal wording and the facts it
  cites (the visitor cap); client-side copy would split one rule in two.
- **Idempotent retirer** (article absent = success) — deferred: an honest semantic change to
  `lib/panier.ts` with its own test pins, not something to smuggle into the seam.

## Invariants

- Silent refusals are impossible: no consumer calls a Panier Server Action without crossing
  the seam.
- `refresh()` stays success-only and stays in the action layer (ADR-0014's co-located
  invalidation).
