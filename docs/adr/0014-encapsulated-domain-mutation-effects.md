# Domain mutation effects are encapsulated in the mutations, never caller-injected

Commande, Catalogue, Structure, and Livraison mutations used to require callers to supply an effects bundle:
Server Actions imported and wired infrastructure singletons (Meilisearch, Cloudflare R2,
Resend email) just to perform everyday business tasks. Worse, cache invalidation had leaked
into callers — the admin order action manually revalidated on status change while the checkout
action forgot invalidation entirely, so confirmation and history pages could go stale. Tests
carried the other face of the same cost: full mock effect factories even when only asserting
stock, validation, or transitions.

## Decision

- **Production adapters live inside the mutation modules.** `lib/use-cases/orders.ts` owns the
  `OrderEffects` type and its `defaultOrderEffects`; `lib/use-cases/admin-catalog.ts` owns
  `CatalogEffects` and `defaultCatalogEffects`; `lib/use-cases/admin-structure.ts` owns
  `StructureEffects` and `defaultStructureEffects`; `lib/use-cases/livraison.ts` owns
  `LivraisonEffects` and `defaultLivraisonEffects`. The deleted pass-through modules
  (`order-effects.ts`, `catalog-effects.ts`, `structure-effects.ts`, `livraison-effects.ts`) held
  no logic beyond singletons and are gone.

- **Seam is an optional partial override.** Mutations take an optional `overrides` parameter and
  merge it over the defaults (`const effects = { ...defaultEffects, ...overrides }`):
  `placeOrder(userId, input)`, `createProduct(input)` and friends — Server Actions pass no
  effects argument and import no adapter.

- **Co-located cache invalidation.** `invalidateCommande` was added to the order seam as
  `invalidateCommande` and fires inside both `placeOrder` and `updateOrderStatus`; catalog
  mutations already revalidate via `revalidateCatalog`. No mutation call site can omit it.

- **Uniform best-effort post-commit boundary.** Committed DB transactions are authoritative.
  Each auxiliary (Meilisearch reindex, R2 removal, email, cache revalidation) runs post-commit
  in its own try/catch that logs a structured `console.warn` and never throws to the caller.

- **Tests call mutations bare.** Only suites that assert on notifications or external sync pass
  a spy override. A global `next/cache` mock in `test/setup.ts` lets default effects fire in
  plain-Node runs instead of crashing on Next.js static-generation store invariants.

## Considered Options

- **Keep caller-injected effects** — rejected: it is the current state, with lost cache
  invalidation at checkout and effect boilerplate everywhere.
- **No seam at all (true encapsulation only)** — every effect test would need Prisma fakes or
  module-level mocks; rejected, the partial-override seam keeps side-effect tests cheap.
- **Outbox / background worker** — durable and robust, but a heavier infrastructure step;
  deferred to a future phase, hence the warning-logged best-effort boundary today.

## Trade-offs

- **Testability via seam spies vs production simplicity**: the seam is an escape hatch for
  exactly the tests that assert on effects; everything else runs zero-override calls.
- **Default effects fire in Node tests** — mitigated by the global `next/cache` mock, which
  itself is a test-only stand-in for a production module and may drift from reality.
- **Warning-only failure surfacing** — a broken Meilisearch or Resend silently degrades until
  logs are read; accepted in exchange for never blocking the transaction.

## Invariants

- The database is authoritative: a committed mutation is never rolled back because a
  side-effect failed; failures are logged warnings.
- `deleteImages` never rejects (ADR-0004): each R2 deletion is guarded and logs a structured
  `console.warn` per failed URL, and the whole call sits under an outer guard so injected
  spies also cannot throw.
- Task-action refusal mechanics are untouched (ADR-0010): `InvalidOrderTransitionError` and
  `OrderNotFoundError` stay `UserFacingError` and the `adminTaskAction({ refusalUrl })` redirect
  still decides the UX for refusals.
- No schema change, no queues/outbox. Phase 2 is complete: Administration structure (categories)
  and Livraison (shipping) mutations are contracted onto the encapsulated effects seam alongside
  Commande and Catalogue. Blog mutations (`lib/use-cases/blog.ts`) had no production Server Action
  caller and stayed caller-injected as an exception; they are now deleted outright, the module
  exposing only public reads.
