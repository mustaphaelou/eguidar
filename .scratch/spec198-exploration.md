# Spec #198 Exploration — Deepen mutation seams by encapsulating domain effects

Repo: `\\wsl.localhost\Ubuntu\home\eloaurdi\codeprojects\eguidar` (WSL: `/home/eloaurdi/codeprojects/eguidar`)
Spec issue: #198 "Spec: Deepen mutation seams by encapsulating domain effects" (`ready-for-agent`)
Date: 2026-09-04

## 1. File inventory with paths

### Mutation + effects modules (read fully)
- `lib/use-cases/orders.ts` — checkout + status mutations (`placeOrder`, `updateOrderStatus`), reads (`getOrder`, `listUserOrders`)
- `lib/use-cases/admin-orders.ts` — read-only admin (`listAdminOrders` overload, `getAdminOrder`); NO mutations, NO effects param
- `lib/use-cases/order-effects.ts` — `OrderEffects` interface + `realOrderEffects` pass-through singleton
- `lib/use-cases/admin-catalog.ts` — catalog mutations (`createProduct`, `updateProduct`, `deleteProduct`, `updateVariantStock`) + reads (`listAdminProducts`, `getAdminProduct`, `listAdminCategories`); owns `CatalogEffects` interface
- `lib/use-cases/catalog-effects.ts` — `realCatalogEffects` singleton (imports `invalidateCatalogue`, `indexProductDocuments`/`deleteProductDocument`, `deleteR2Object`)
- `lib/use-cases/cache-invalidation.ts` — `invalidateCatalogue`, `invalidateStructure`, `invalidateLivraison`, `invalidateCommande`, `invalidateBlog` + tag constants
- `vitest.config.ts` — `include: ["**/*.test.{ts,tsx}"]`, `setupFiles: ["test/setup.ts"]`, `globalSetup: ["test/global-setup.ts"]`, alias `@` → repo root
- `test/setup.ts` — currently ONLY `import "dotenv/config"; process.env.DATABASE_URL = process.env.TEST_DATABASE_URL` (NO `next/cache` mock — gap for spec)
- `test/global-setup.ts` — requires `TEST_DATABASE_URL`, runs `npx prisma migrate deploy`, truncates 15 tables, disconnects

### Server Actions (callers)
- `app/(boutique)/checkout/actions.ts` — `placeOrderAction` (`formAction`)
- `app/admin/commandes/actions.ts` — `updateOrderStatusAction` (`adminTaskAction`)
- `app/admin/produits/actions.ts` — `createProductAction`, `updateProductAction` (`adminFormAction`), `deleteProductAction`, `updateVariantStockAction` (`adminTaskAction`)

### Tests
- `lib/use-cases/orders.test.ts` — 20+ integration tests (Prisma + `makeEffects()`), asserts stock, emails, transitions, concurrency
- `lib/use-cases/admin-orders.test.ts` — admin reads + lifecycle via `placeOrder`/`updateOrderStatus` with `makeEffects()`
- `lib/use-cases/admin-catalog.test.ts` — catalog mutations with `makeEffects()` (reindex/revalidate/deleteImages spies)
- `lib/use-cases/cache-invalidation.test.ts` — vocab + `vi.mock("next/cache")` local mock pattern (copy for global setup)
- `app/(boutique)/checkout/actions.test.ts` — mocks `@/lib/use-cases/orders.placeOrder`, asserts `calledWith(SESSION_USER.id, INPUT, realOrderEffects)`
- `lib/use-cases/mutation-actions.ts` — shell: `formAction`/`taskAction` (boutique, `unauthenticated` refusal), `adminFormAction`/`adminTaskAction` (redirect gate + `refusalUrl`)
- `test/navigation-mocks.ts` — `redirectMock` (throws `RedirectSentinel`), `sessionUserMock`, `adminSessionMock`

### Infra adapters (defaultEffects sources)
- `lib/emails.ts` — `sendOrderPlacedEmail(snapshot)`, `sendOrderStatusEmail(snapshot, newStatus)`, `OrderEmailSnapshot`; no-op + `console.warn` if `RESEND_API_KEY` absent
- `lib/meili.ts` — `indexProductDocuments(products)`, `deleteProductDocument(productId)`, `getMeiliSearch()` null if `MEILI_URL` absent; early-return on empty array
- `lib/r2.ts` — `deleteR2Object(publicUrl): Promise<boolean>` (false if unconfigured/key mismatch), `createPresignedUploadUrl`, `objectKeyFromPublicUrl` (strip `R2_PUBLIC_URL` prefix, ADR-0004)
- `lib/index-projection.ts` — `toIndexableProduct(product): IndexableProduct`, `IndexableProduct` (id/slug/brand/minPrice/totalStock/category*/specsText/variantNames/skus/isFeatured/freeShipping/priceBucket/updatedAt)
- `package.json` — `next: 16.3.2`, `react: 19.2.4`, `vitest: 4.1.10`

### ADRs
- `docs/adr/0004-r2-public-images-key-from-url.md` (ADR-0004)
- `docs/adr/0010-task-action-refusals-redirect-through-mutation-shell.md` (ADR-0010)
- No `0014-*` yet (to be created by implementer per spec).

## 2. Current function signatures (6 mutations + 2 effects types)

```ts
// lib/use-cases/orders.ts
export async function placeOrder(userId: string, input: CheckoutInput, effects: OrderEffects)
export async function updateOrderStatus(orderId: string, nextStatus: string, effects: OrderEffects)
// CheckoutInput { cityId: string; address: string; phone: string } (zod-validated)
// placeOrder flow: parse → find user → lirePanierClient → chargerDevis → pre-check stock → $transaction(decrement+create+clear cart) → try/catch sendOrderPlacedEmail (warn-only)
// updateOrderStatus flow: isOrderStatus guard → find + ORDER_TRANSITIONS check → $transaction(re-read + claim via updateMany + restock on cancelled/returned) → try/catch sendOrderStatusEmail

// lib/use-cases/admin-catalog.ts
export async function createProduct(input: ProductInput, effects: CatalogEffects)
export async function updateProduct(id: string, input: ProductInput, effects: CatalogEffects)
export async function deleteProduct(id: string, effects: CatalogEffects): Promise<void>
export async function updateVariantStock(variantId: string, stock: number, effects: CatalogEffects)
// ProductInput { name, slug, description, brand, categoryId, price, specs: Record<string,string>, images: string[], isFeatured, featuredOrder, freeShipping, variants: ProductVariantInput[] }
// create: parse → price/sku/slug guards → prisma.create(include variants+category) → await reindex → sync revalidate
// update: find → parse/guards → diff removedImages → $transaction(update product + upsert variants + delete orphans) → await deleteImages(removed) → await reindex → sync revalidate (with previousSlug)
// delete: find → prisma.delete → await deleteImages(full gallery) → await removeFromIndex → sync revalidate
// updateVariantStock: int>=0 guard → find+include → prisma.update → patch product.variants in-memory → await reindex → sync revalidate
```

```ts
// lib/use-cases/order-effects.ts
export interface OrderEffects {
  sendOrderPlacedEmail(order: OrderEmailSnapshot): Promise<void>
  sendOrderStatusEmail(order: OrderEmailSnapshot, newStatus: OrderStatus): Promise<void>
}
export const realOrderEffects: OrderEffects = { sendOrderPlacedEmail, sendOrderStatusEmail }

// lib/use-cases/admin-catalog.ts (interface) + lib/use-cases/catalog-effects.ts (impl)
export interface CatalogEffects {
  reindexProducts(products: IndexableProduct[]): Promise<void>
  removeProductFromIndex(productId: string): Promise<void>
  revalidateCatalog(product: CatalogueEventProduct): void
  deleteImages(urls: string[]): Promise<void> // invariant: never rejects (ADR-0004)
}
export const realCatalogEffects: CatalogEffects = {
  reindexProducts: indexProductDocuments,
  async removeProductFromIndex(productId) { await deleteProductDocument(productId) },
  revalidateCatalog(product) { invalidateCatalogue(product) },
  async deleteImages(urls) { for (url of urls) { try { await deleteR2Object(url) } catch {} } },
}
```

Note: `lib/use-cases/admin-orders.ts` has NO effects — pure reads.

## 3. Caller list (Server Actions)

| Mutation | Caller file:line | Current effects import | Manual revalidate |
|---|---|---|---|
| `placeOrder` | `app/(boutique)/checkout/actions.ts:29` — `await placeOrder(user.id, input, realOrderEffects)` inside `formAction({parse: parseCheckoutFormData, run})`; post-call `updateProfile` best-effort then `redirect(/commande/confirmation/${order.id})` | `import { realOrderEffects } from "@/lib/use-cases/order-effects"` (line 7) | NONE — spec bug: confirmation/history pages go stale; fix = add `invalidateOrder` inside `placeOrder` |
| `updateOrderStatus` | `app/admin/commandes/actions.ts:24` — `await updateOrderStatus(orderId, nextStatus, realOrderEffects)` inside `adminTaskAction({next:"/admin/commandes", parse, refusalUrl: ({orderId})=>/admin/commandes/${orderId}?transition=refusee`, run})`; then `invalidateCommande(orderId)` (line 25) + `redirect(/admin/commandes/${orderId})` | `import { realOrderEffects }` (line 10) + `import { invalidateCommande }` (line 9) | YES manual `invalidateCommande(orderId)` — spec moves this INSIDE `updateOrderStatus` and deletes caller import |
| `createProduct` | `app/admin/produits/actions.ts:73` — `await createProduct(input, realCatalogEffects)` in `adminFormAction({next:"/admin/produits", parse: parseProductFormData, run → redirect(/admin/produits/${product.id})})` | `import { realCatalogEffects } from "@/lib/use-cases/catalog-effects"` (line 19) | NONE at call site (inside mutation via `effects.revalidateCatalog`) |
| `updateProduct` | `app/admin/produits/actions.ts:87` — `await updateProduct(productId, input, realCatalogEffects)` in `adminFormAction` (parse adds `productId`) → `redirect("/admin/produits")` | same `realCatalogEffects` | NONE at call site (inside mutation) |
| `deleteProduct` | `app/admin/produits/actions.ts:96` — `await deleteProduct(productId, realCatalogEffects)` in `adminTaskAction({next:"/admin/produits", parse: productId, run → redirect})` | same | NONE at call site |
| `updateVariantStock` | `app/admin/produits/actions.ts:111` — `await updateVariantStock(variantId, stock, realCatalogEffects)` in `adminTaskAction` (no redirect, fire-and-forget) | same | NONE at call site |

Post-spec caller shape (all 3 action files): delete `real*Effects` imports (and `invalidateCommande` import); call `placeOrder(user.id, input)`, `updateOrderStatus(orderId, nextStatus)`, `createProduct(input)`, etc. with NO 3rd arg.

Other grep hits are NOT callers: tests, `lib/meili.ts` def, `lib/panier.ts` comment, ADR mentions, `components/storefront/checkout-form.tsx` (imports `placeOrderAction`, not `placeOrder`).

## 4. Test mock patterns

### `lib/use-cases/orders.test.ts` + `admin-orders.test.ts` (identical helper)
```ts
function makeEffects(): OrderEffects & { sendOrderPlacedEmail: ReturnType<typeof vi.fn>; sendOrderStatusEmail: ReturnType<typeof vi.fn> } {
  return {
    sendOrderPlacedEmail: vi.fn<OrderEffects["sendOrderPlacedEmail"]>(async () => {}),
    sendOrderStatusEmail: vi.fn<OrderEffects["sendOrderStatusEmail"]>(async () => {}),
  }
}
// usage: placeOrder(userId, checkoutInput(), effects) / updateOrderStatus(id, "confirmed", effects)
// assertions: toHaveBeenCalledOnce, mock.calls[0][0] as OrderEmailSnapshot ({userEmail, orderId, items, total, shippingFee, totalPayable, cityName}), calls.map(c=>c[1]) == ["confirmed","shipped","delivered"], toHaveBeenCalledWith(expect.objectContaining({orderId}), "cancelled"), not.toHaveBeenCalled() on failure paths
// email failures are warn-swallowed in use-case, so no throw assertions needed
```
Post-spec: delete `makeEffects` in most tests → call `placeOrder(userId, input)` / `updateOrderStatus(id, status)` bare; keep partial override ONLY in the 2-3 email-spy tests: `placeOrder(..., { sendOrderPlacedEmail: spy })`.

### `lib/use-cases/admin-catalog.test.ts`
```ts
function makeEffects(): CatalogEffects & { reindexProducts: ReturnType<typeof vi.fn>; deleteImages: ReturnType<typeof vi.fn> } {
  return {
    reindexProducts: vi.fn(async () => {}),
    removeProductFromIndex: vi.fn(async () => {}),
    revalidateCatalog: vi.fn(),
    deleteImages: vi.fn(async () => {}),
  }
}
// assertions: reindexProducts toHaveBeenCalledWith([expect.objectContaining({id, slug, name, brand, totalStock, categoryId, ...})]), revalidateCatalog toHaveBeenCalledWith({id, slug}) / toHaveBeenLastCalledWith({id, slug, previousSlug}), deleteImages toHaveBeenCalledWith([removed...]) or ([]) or (full gallery), removeProductFromIndex toHaveBeenCalledWith(product.id)
```
Post-spec: bare calls `createProduct(input)` etc.; only reindex/deleteImages-spy tests pass `{ reindexProducts: spy }` / `{ deleteImages: spy }`; `revalidateCatalog` assertions either drop (covered by `cache-invalidation.test.ts`) or pass `{ revalidateCatalog: spy }`.

### `lib/use-cases/cache-invalidation.test.ts` (prior art for global mock)
```ts
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
import { revalidatePath, revalidateTag } from "next/cache";
const mockedRevalidateTag = vi.mocked(revalidateTag); // + beforeEach vi.clearAllMocks()
```

### `app/(boutique)/checkout/actions.test.ts`
Mocks `@/lib/use-cases/orders.placeOrder` via `vi.hoisted` + `vi.mock(... importOriginal ...)`, asserts `toHaveBeenCalledWith(SESSION_USER.id, INPUT, realOrderEffects)` (line 123-127). Post-spec: update to `toHaveBeenCalledWith(SESSION_USER.id, INPUT)` and drop `realOrderEffects` import; add coverage that action performs NO manual invalidation (mutation owns it).

## 5. ADR constraints (do NOT violate)

- **ADR-0004 (`docs/adr/0004-r2-public-images-key-from-url.md`)**: R2 bucket stays PUBLIC (`cdn.eguidar.com`), DB stores full public URL never the key; key derived by stripping `R2_PUBLIC_URL` prefix (`objectKeyFromPublicUrl`). Deletion is SYNCHRONOUS in admin use-cases (diff old vs new on update, full gallery on delete) and BEST-EFFORT — R2 failure never blocks catalog mutation. Spec §Out-of-Scope freezes URL→key derivation/CDN routing. Implementer: preserve `deleteImages` never-rejects invariant; wrap each `deleteR2Object` in try/catch (already in `catalog-effects.ts` — carry over verbatim).
- **ADR-0010 (`docs/adr/0010-task-action-refusals-redirect-through-mutation-shell.md`)**: `InvalidOrderTransitionError`/`OrderNotFoundError` extend `UserFacingError` at definition site; `adminTaskAction({ refusalUrl })` redirects run-refusals to detail banner (`/admin/commandes/${orderId}?transition=refusee`); parse failures NEVER trigger refusal redirect; parse contract total. Spec freezes refusal mechanics + `UserFacingError` hierarchy. Implementer: do not touch `mutation-actions.ts` refusal path, error classes, or `refusalUrl` wiring in `app/admin/commandes/actions.ts`.
- **Phase-2 deferral**: structure (categories) + livraison (shipping) modules untouched (`structure-effects.ts`, `livraison-effects.ts`, `invalidateStructure`, `invalidateLivraison` out of scope). No schema/Prisma changes, no queues/outbox.

## 6. Next.js version behavior for revalidatePath/revalidateTag in test env

- `package.json`: `next 16.3.2` (React 19.2.4). In Next 16, `revalidateTag(tag, "max")` / `revalidatePath(path)` require the static-generation async store; called in plain Node (vitest `environment: "node"`) they throw `Invariant: static generation store missing` (same failure the spec's story #14 calls out).
- Evidence: `cache-invalidation.test.ts` works ONLY because it does `vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))` at module top. `test/setup.ts` has NO such mock today, so any test invoking default effects (which call real `invalidateCommande`/`invalidateCatalogue`) would crash.
- Required fix (spec Testing Decisions): add GLOBAL mock in `test/setup.ts` (or `vitest.config.ts setupFiles` entry):
```ts
// test/setup.ts (append)
import { vi } from "vitest";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
```
Note: `vi.mock` in a setup file is hoisted per-test-file module registry in Vitest 4.1.10 — verify with a smoke run (`npx vitest run lib/use-cases/cache-invalidation.test.ts`). Fallback if hoisting fails: `vi.stubGlobal` + `await vi.mock` or a `test/mocks/next-cache.ts` aliased module. Also `invalidate*` are sync `void` so defaults need no async handling.

## 7. Suggested defaultEffects shapes per spec #198

Spec §Implementation Decisions fixes these shapes ( overrides = `Partial`, merge `{ ...defaults, ...overrides }` ):

```ts
// lib/use-cases/orders.ts (absorb + delete lib/use-cases/order-effects.ts)
import { sendOrderPlacedEmail, sendOrderStatusEmail } from "@/lib/emails";
import { invalidateCommande } from "@/lib/use-cases/cache-invalidation";

type OrderEffects = {
  sendOrderPlacedEmail(order: OrderEmailSnapshot): Promise<void>;
  sendOrderStatusEmail(order: OrderEmailSnapshot, newStatus: OrderStatus): Promise<void>;
  invalidateOrder(orderId: string): void; // NEW — unifies the leaked caller-side invalidateCommande
};
const defaultOrderEffects: OrderEffects = {
  sendOrderPlacedEmail,
  sendOrderStatusEmail,
  invalidateOrder: (orderId) => invalidateCommande(orderId),
};
// seams:
export async function placeOrder(userId: string, input: CheckoutInput, overrides?: Partial<OrderEffects>)
export async function updateOrderStatus(orderId: string, nextStatus: string, overrides?: Partial<OrderEffects>)
// body prologue: const effects = { ...defaultOrderEffects, ...overrides };
// post-commit uniform boundary (each in its own try/catch → console.warn, never throw):
//   placeOrder: await effects.sendOrderPlacedEmail(snapshot) [keep existing warn]; effects.invalidateOrder(order.id) [wrap warn — NEW]
//   updateOrderStatus: same with sendOrderStatusEmail + invalidateOrder(updated.id)
```

```ts
// lib/use-cases/admin-catalog.ts (absorb + delete lib/use-cases/catalog-effects.ts)
import { invalidateCatalogue } from "@/lib/use-cases/cache-invalidation";
import { deleteProductDocument, indexProductDocuments } from "@/lib/meili";
import { deleteR2Object } from "@/lib/r2";

type CatalogEffects = {
  reindexProducts(products: IndexableProduct[]): Promise<void>;
  removeProductFromIndex(productId: string): Promise<void>;
  revalidateCatalog(product: CatalogueEventProduct): void;
  deleteImages(urls: string[]): Promise<void>;
};
const defaultCatalogEffects: CatalogEffects = {
  reindexProducts: indexProductDocuments,
  async removeProductFromIndex(productId) { await deleteProductDocument(productId); },
  revalidateCatalog: (product) => invalidateCatalogue(product),
  async deleteImages(urls) { for (const url of urls) { try { await deleteR2Object(url); } catch {} } }, // ADR-0004 verbatim
};
// seams (all overrides optional partial):
export async function createProduct(input: ProductInput, overrides?: Partial<CatalogEffects>)
export async function updateProduct(id: string, input: ProductInput, overrides?: Partial<CatalogEffects>)
export async function deleteProduct(id: string, overrides?: Partial<CatalogEffects>): Promise<void>
export async function updateVariantStock(variantId: string, stock: number, overrides?: Partial<CatalogEffects>)
// each body: const effects = { ...defaultCatalogEffects, ...overrides };
// wrap EVERY post-commit effect (reindex, removeFromIndex, revalidate, deleteImages) in try/catch→console.warn so Meilisearch/R2/cache hiccups never roll back the committed tx (spec story #1/#11). Keep deleteImages inner per-URL guard AND outer guard for the injected-spy path.
```

Implementer checklist cross-ref:
1. Add global `next/cache` mock → 2. Add `invalidateOrder` + `defaultOrderEffects` in `orders.ts`, thread through both mutations with best-effort guards → 3. Add `defaultCatalogEffects` in `admin-catalog.ts`, wrap 4 effects in all 4 mutations → 4. Simplify 3 action files (drop effects imports + `invalidateCommande` call) → 5. Delete `order-effects.ts` + `catalog-effects.ts` (verify zero imports via grep) → 6. Update tests to bare calls + partial-override spies only → 7. Write `docs/adr/0014-encapsulated-domain-mutation-effects.md` (ADR-0014 per spec).
