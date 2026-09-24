# Commande, Catalogue, Structure and Livraison share one mutation mechanism

Four entity modules own real domain invariants — Commande's transitions and Réapprovisionnement, Catalogue's unique SKU and slug, Structure's acyclicity, Livraison's fees — and each wrapped them in the same scaffold, transcribed rather than shared. `runEffect` existed four times (`orders.ts:34`, `livraison.ts:42`, `admin-structure.ts:47`, `admin-catalog.ts:13`) and had already drifted: the Commande copy took `fn: () => void` while the other three took `fn: () => Promise<unknown> | unknown` and declared `async` with no `await` in the body. Seven `*ValidationError` classes each re-spelled the same `` `Données invalides : ${issues.join(" ; ")}` `` (three of them inside these four modules). Thirteen mutation entry points re-wrote `{ ...defaultEffects, ...overrides }`, and the unique-violation ladder appeared three times over one shared `hasUniqueViolation` predicate.

## Decision

- **One skeletal module owns the mechanism**, `lib/use-cases/mutation-squelette.ts`: `runEffect`, the validation-refusal builder, a typed merge helper for the effects override, the unique-violation ladder, and the contract assertions the four suites share.
- **The mechanism learns no entity and no database.** ADR-0014 stands untouched: each module keeps its own `*Effects` type, its `default*Effects`, its error classes and its effects, and the merge helper preserves the exact `{ ...defaults, ...overrides }` semantics ADR-0014 decided.
- **Each module keeps its own error classes.** The skeleton builds the refusal; it does not own a shared `ValidationError`. Catch blocks and tests keep keying on `CatalogValidationError` and its siblings.
- **The ladder is shared; the predicate stays home.** The three ladders take one shape, while the Prisma-aware check stays where Prisma already is.
- **Four contract suites stay four.** The genuinely identical assertions — the best-effort boundary, the validation refusal — move into a helper the four call. They are not merged into one parameterised suite.
- **The merge helper lands where a merge already happens.** `orders.ts` merges at two of its four entry points; the helper does not force `overrides` onto the other two, and no signature changes to accommodate it.

## Amendment: ordered post-commit sequence

The skeletal module now also owns `runOrderedEffects`, an entity-agnostic ordered
sequence of labelled post-commit effects. It runs one effect at a time, awaits each
one, delegates each failure to the existing best-effort boundary, and continues with
the later effects. The mechanism has no knowledge of an entity, a database, an e-mail,
or a cache.

Commande supplies the policy at its interface: `placeOrder` and `updateOrderStatus`
invoke the sequence only after their transaction resolves successfully, and each
passes its relevant e-mail effect followed by one `invalidateCommande` effect. The
`OrderEffects` type, production adapters, error classes, transaction implementation,
status-transition and Réapprovisionnement rules, and checkout profile prefill remain
owned by their existing sites. Catalogue, Structure, and Livraison keep their current
effect sequences.

This amendment does not merge the four entity suites: each suite remains separate and
continues to assert its own invariants. Only the shared sequencing mechanism and its
identical best-effort behaviour are centralized.

## Considered Options

- **One parameterised contract suite over the four modules** — the review that prompted this asked for it; rejected on ADR-0023's reasoning, six days older. The four modules' invariants are genuinely different, so a shared contract would be their intersection — weaker than four suites with distinct jobs, exactly as ADR-0023:58-60 argued for the two search engines.
- **One shared `ValidationError` across the four modules** — rejected: it deletes per-entity class names that catch blocks and suites key on, widening the blast radius far past the seven construction sites.
- **Move `hasUniqueViolation` into the skeleton** — rejected: it is the only Prisma-aware piece, and the mechanism should not learn a database term.
- **Leave the four `runEffect` copies** — rejected: one has already drifted to a narrower signature, and a retry or metrics policy would otherwise be written four times.

## Invariants

- Production adapters and effects types never leave their entity module (ADR-0014, unchanged).
- Task-action refusal mechanics are untouched (ADR-0010, unchanged): the shell's `refusalUrl` and its silent-void default keep deciding the UX.
- The merge helper preserves `{ ...defaults, ...overrides }`: an override wins per key, and an omitted key falls back to the production default.
- The four modules keep four suites; only identical assertions may be shared.
