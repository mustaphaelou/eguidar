# A better Administration: products, Structure, product media and automations

> **Research-only document.** Every factual claim in this file is traced to a primary source: vendor
> documentation, W3C specification text, package metadata read from npm/GitHub, or files read in this
> checkout. The four research axes were run in parallel on **28 October 2026** against commit
> `02bd8e1`, and the Next.js claims were checked against the **docs shipped inside
> `node_modules/next/dist/docs/`** for `next@16.4.1`, not against the public site. Where a claim
> could not be verified it is labelled **unverified** and says what would settle it. No application
> code, schema, migration, test or configuration in this checkout was modified.
>
> **Scope.** The question is *what should the Administration become, and in what order* — not a
> pixel specification. The four axes (product list and editor, the category tree, product media, and
> automations) each contributes a section with its own numbered sources; §§7–8 sequence the work and
> list the decisions only the owner can make.

**How to read it.** §1 records what the Administration does today, verified file by file. §2 collects
the findings that cut across all four axes: the listing pattern this repository already has, the
Next.js 16.4.1 behaviours that change the obvious answers, the three ADR amendments the work
requires, the WCAG 2.2 AA floor, and the ownership rules that must not be duplicated. §§3–6 are the
four research axes in full. §7 is the roadmap with exit criteria, §8 the decisions requested, §9 the
method and the consolidated list of unverified items.

## Summary

- **The gap is structural, not cosmetic.** The Administration is missing four things: a paged *read
  model* for the product list, a *sibling order* for the Structure, a *registry* for product media,
  and a *trigger-and-record* layer for effects. Each is a different kind of work, and none of them is
  a restyling of an existing page.
- **The product list should clone the orders listing, not invent a second pattern.** `commandes`
  already does server pagination (`$transaction([findMany, count])`), URL-carried state, a 300 ms
  debounce with echo reconciliation, and the `components/data-table` kit. `produits` renders every
  row with no argument. The fix is to copy the seam, not to reach for a client-side table or the
  Meilisearch index (which is asynchronous by construction).
- **The product editor stays one sectioned page with an explicit save.** Autosave is wrong here:
  saving owns draft-image promotion and its compensation (ADR-0034), and triggers reindex and edge
  purge as post-commit effects; a VAT-inclusive price goes live immediately. What is missing is a
  sticky save bar that cannot cover the last field (WCAG 2.4.11), per-section errors instead of one
  string, and a real unsaved-changes guard.
- **Bulk edit must be narrow and server-reported.** Structure, *mis en avant*, *livraison offerte*
  and delete — not price or stock, because a base-price change can make a variant's final price
  negative and the existing validation refuses per product. A partial-failure report is the honest
  shape of a bulk write.
- **Structure: add one integer, ship move commands, skip drag-and-drop in v1.** `position Int` plus
  `@@index([parentId, position])`, and a single intent-shaped command
  (`deplacerStructure({ id, nouvelleParenteId, avantId })`) executed under the existing lock. The
  UI never sends a sibling array — that would be a second topology owner, which ADR-0027 and
  ADR-0030 forbid. Move buttons — *Monter / Descendre / Indenter / Désindenter / Déplacer sous…* —
  are operable by keyboard and satisfy WCAG 2.5.7 by construction.
- **Media: the upload half is written and tested; the missing half is the registry.** Keep the
  presigned draft lifecycle, the 10 MB / 8-image / five-MIME limits, the client port and the R2
  lifecycle rule. Add a row per published asset (dimensions, alt, usage), a post-upload `HeadObject`
  plus server-side decode, a checked-in CORS rule (there is none today), a central library, alt text
  with a real UI, and refusal to delete an asset that products still use.
- **Automations: nearly every action exists; none has a trigger, a condition, a record or a clock.**
  Order emails, reindex, CDN purge and invalidation already run as named effects — best-effort, with
  `console.warn` as the only trace, and ADR-0014 explicitly deferred the outbox. Fix the two defects
  first: **scheduled blog publishing does not work** (public reads check `statut` and
  `publishedAt: { not: null }`, never `publishedAt <= now`), and a lost email leaves no trace.
- **Run automation on Postgres, not on a new platform.** v1 is a transactional outbox written inside
  the mutation's transaction, drained by **pg-boss 12.38.0** (MIT, `SKIP LOCKED`, cron/RRULE, DLQ,
  Prisma adapter) from a loop started in `instrumentation.register` or a Coolify scheduled task. No
  second container, no second dashboard. Reject BullMQ here (Redis is a rebuildable cache; `repeat`
  was removed in v6), and reject n8n / Activepieces / Windmill / Trigger.dev / Inngest / Temporal
  self-hosted for roughly six automations.
- **Three ADR amendments, one ADR untouched.** ADR-0026 (catalogue read gains the category path),
  ADR-0030 (the core ordering comparator gains `position`), and a successor **ADR-0044** that
  supersedes only ADR-0014's "no queues/outbox" invariant. ADR-0027's serialisation of Structure
  mutations is not reopened.
- **Accessibility is a delivery constraint, not a polish pass.** Six criteria bite immediately:
  2.5.7 (dragging), 3.3.4 (bulk delete confirmation), 4.1.3 (counts and move results announced),
  3.3.2 (toolbar search has no label), 2.4.11 (sticky bar must not obscure focus) and 1.1.1 (alt text
  per image). The fixes are small; discovering them after the features is not.

## 1. Where the Administration stands today

| Surface | What exists (verified in this checkout) | What is missing | Seam that decides the shape |
|---|---|---|---|
| **Tableau de bord** (`app/admin/page.tsx`, 249 lines) | KPI cards, a Recharts revenue chart, low-stock variants, recent products and orders; all fed by `getDashboardStats()` | Nothing structural; the aggregates are already the ones an owner digest would reuse | `lib/use-cases/admin-dashboard.ts` |
| **Produits list** (`app/admin/produits/page.tsx`, 116 lines) | A plain `Table`; per-row *Modifier* and delete; delete uses the browser `confirm()` | No pagination, search, filter, sort, bulk action, row menu, duplicate; no URL state; no result count | ADR-0026 (Catalogue owns product reads) |
| **Produit editor** (`components/admin/product-form.tsx`, 410 lines) | One long form: identity, price, variants array, specs textarea, category select, two switches, gallery upload; single `state.error` string | Sticky save bar, per-section errors, unsaved-changes guard, path-aware category picker, per-image alt text | ADR-0034 (save owns draft promotion), ADR-0029 (nullable category) |
| **Structure** (`app/admin/categories/page.tsx`, 145 lines) | Flattened tree (`paddingLeft = profondeur * 1.5`), name sort, direct product counts, delete dialog with reassignment targets, *hors arbre* badge | Sibling order, move/reparent, keyboard controls, cumulative counts, breadcrumb path, inline rename | ADR-0027 (serialised mutations), ADR-0030 (one topology owner) |
| **Médias** (`components/admin/image-gallery-upload.tsx`, 306 lines; `app/api/admin/uploads/*`) | Per-product presigned PUT to R2, draft registry with 24 h retention, promotion on save, 10 MB / 8 images / five MIME types, R2 lifecycle rule checked in | Central library, dimensions, alt text, usage counts, CORS artifact, post-upload verification, thumbnails | ADR-0004 (key derived from URL), ADR-0033 (client port) |
| **Commandes** (`app/admin/commandes/*`) | Server pagination, URL state, 300 ms debounce, `DataTable*` kit, faceted filters, pagination, view options | — (the reference implementation) | `lib/commande-listing.ts`, `use-commande-listing.ts` |
| **Automatisations** | Nothing. Effects exist (`reindexProducts`, `removeProductFromIndex`, `revalidateCatalog`, `deleteImages`, `sendOrderPlacedEmail`, `sendOrderStatusEmail`, `purgeEdge`) | Trigger, condition, run record, retry, schedule, admin surface | ADR-0014 (best-effort effects), `mutation-squelette.ts` |
| **Navigation shell** (`app/admin/layout.tsx`) | Sidebar + header, session gate, `<main class="max-w-6xl">`; no `error.tsx` | A page-level error boundary that uses the v16 `retry` prop | — |

Two facts about the existing code are worth stating plainly because they change what "better" means:

- **The orders page is the reference implementation, not the exception.** It paginates in the
  database, serialises its state into the URL, debounces on the client, and renders with the house
  data-table kit. The product list needs the same four pieces (URL grammar, use case, client hook,
  table), not a new architectural idea.
- **The product catalog is small enough that Postgres can own search in v1.** The real cost of the
  current list is not row count but the projection: `listAdminProducts()` selects `images` and every
  variant to compute `totalStock`. Filtering and paging in SQL fixes the cost; moving the list to
  Meilisearch would replace a synchronous truth with an asynchronous index.

### 1.1 The overview page: keep the chart, make every number a queue

The home page is not the problem the four axes solve, but it is where their results should surface.
It already links the *En attente* count to a filtered orders list
(`buildCommandeListingUrl({ statuses: ["pending"] })`) and each low-stock row to its product — the
right instinct. The gaps follow from the rest of this research:

- **Every KPI links somewhere.** *CA encaissé*, *Commandes* and *Stock faible* are numbers without a
  destination; once Phase 1 gives the product list a URL grammar, *Stock faible* can open
  `stock=faible`, and the order counts can reuse the existing status filter.
- **One queue per unfinished job.** After Phase 2, *images sans texte alternatif*; after Phase 4,
  *automatisations en échec* — the only card that should be red. A dashboard that only reports money
  cannot tell the owner what to do on a quiet Tuesday.
- **The chart stays.** It answers "how is the shop doing"; the queues answer "what do I do now". Do
  not replace one with the other.
- **No new aggregate before the list it opens.** Each count must link to the exact filtered list
  that produced it; a number that disagrees with its page is worse than no number.

## 2. Cross-cutting findings

### 2.1 The repository already contains the listing pattern to copy

The `commandes` listing separates four concerns, and the product list should mirror the split exactly:

1. `lib/commande-listing.ts` — parse and validate URL params, and rebuild the URL from a state. This
   is the only place that knows the query-string grammar.
2. `lib/use-cases/orders.ts` (`runListAdminOrders`) — build `where`, run
   `prisma.$transaction([findMany, count])`, return `{ rows, totalCount, pageCount }`.
3. `app/admin/commandes/use-commande-listing.ts` — the client hook: 300 ms debounce, echo
   reconciliation, `router.replace(href, { scroll: false })`.
4. `app/admin/commandes/commandes-table.tsx` — TanStack Table with `manualPagination`,
   `manualSorting`, `manualFiltering`, and the shared `DataTableToolbar / Pagination / ViewOptions`.

The product list adds two things the orders list does not have: **multi-select with bulk actions**
and a **row action menu**. Both are well-understood, and both have sharp edges documented in §3
(selection lives in row ids, never in `getSelectedRowModel()`; one Server Action per bulk gesture
because Next dispatches actions one at a time per client).

### 2.2 Next.js 16.4.1 changes several answers

This checkout is not the Next.js most examples assume. The version-accurate facts that change the
design:

- **`cacheComponents: true` is on**, so `searchParams` is a Promise and must be read inside a
  `<Suspense>` child; reading it at the top of the page blocks the static shell. The orders page
  already has the right shape.
- **Server Actions are dispatched one at a time per client**, and the body is capped at 1 MB. A bulk
  action must be *one* action carrying ids, never `Promise.all` over N actions; a file must never
  travel through an action.
- **`revalidatePath` inside the action** returns the fresh RSC payload in the same round-trip, so the
  table can re-render without a second client fetch.
- **The router preserves state for retained routes via `<Activity>`** — the docs name form drafts and
  scroll positions. That weakens the "unsaved changes" guard: it is needed for reload, tab close and
  navigation beyond the retained routes, not for every back-navigation.
- **`after()` is not a queue.** It is bounded by the route's configured duration and by the
  process's shutdown drain (the self-hosting guide recommends 10–30 s). Nothing is persisted, nothing
  is retried, and an OOM kill drops the work silently. This is the single most important fact for
  §6.
- **Images:** `priority` is deprecated in favour of `preload` (`loading="eager"` or
  `fetchPriority="high"` are the documented alternatives for an LCP image); `formats` defaults to
  `['image/webp']`, so no AVIF is served today; and the optimizer cache cannot be invalidated — plan
  keys, not purges.

### 2.3 Three ADR amendments, one ADR left alone

| ADR | What it owns today | What the work changes | Required? |
|---|---|---|---|
| **0026** — product administration read/form | The Catalogue owns product reads "in facts, not rows" | The list gains a paged envelope; the category picker needs the category *path* | Yes — a named amendment, not a quiet widening |
| **0027** — Structure mutations are serialised | Every Structure mutation runs under one lock/owner | Nothing. `position` and the move command run *inside* the existing lock | No |
| **0030** — the Structure's marché has one owner | Topology and the single ordering promise | The core comparator becomes `(position, name, id)`; the admin gains *move* commands, never topology computation | Yes — amend the ordering promise deliberately |
| **0014** — encapsulated mutation effects | Best-effort post-commit effects; explicitly no queues/outbox | A durable outbox, run records and retries | Yes — **ADR-0044** supersedes only the "no queues/outbox" invariant |

The successor is **0044**: at research time 0041 was the next free number, but the auth programme
took 0041–0043 while this branch was open, so the integration renumbered it. The successor should
keep ADR-0014's encapsulation (`*Effects` ports, injected adapters) and replace only the "warning is
enough" boundary.

### 2.4 The WCAG 2.2 AA floor

Accessibility is not a separate project here: most of the fixes are a prop, a label or one
component, and they are cheaper before the features exist than after.

| Criterion | Where it bites | The fix |
|---|---|---|
| **2.5.7 Dragging Movements** (AA) | Structure move (the gallery already has before/after buttons) | A single-pointer, non-drag alternative is mandatory — buttons, not just a keyboard sensor |
| **3.3.4 Error Prevention** (AA) | Bulk delete | Confirm, naming the number of rows; the current product delete uses `confirm()`, the category delete uses a proper dialog |
| **4.1.3 Status Messages** (AA) | "37 produits", "12 sélectionnés", result of a move | A polite live region; the table itself is not a status message |
| **3.3.2 Labels or Instructions** (A) | Toolbar search | Visible or `aria-label`; placeholder is not a label |
| **2.4.11 Focus Not Obscured** (AA) | Sticky save bar | `sticky` in the flow plus scroll padding; a `fixed` bar over the last field fails |
| **1.1.1 Non-text Content** (A) | Product images | A per-image alt field; decorative thumbnails stay `alt=""` |

Two related decisions: do **not** add `role="grid"`/`treegrid` to the read-only tables (it makes every
cell a focus stop and imports a focus-management contract the page does not need), and use the
existing Base UI primitives rather than new ones — `Checkbox` (`indeterminate`), `AlertDialog`,
`Combobox` (`filter={null}` for server search) and `Menu` are available in `@base-ui/react@1.7.0`;
`components/ui/` still lacks `combobox.tsx` and `alert-dialog.tsx`.

### 2.5 No second owner for any fact

Every failure mode this research rejects has the same shape: two places that believe they own one
fact. The rules that follow from the ADRs:

- The browser never computes Structure topology (it sends one move intent).
- `images[0]` remains the cover; no `coverImageId` second owner.
- R2 is a store, the database is authoritative for what an asset *is* and where it is used.
- Alt text belongs to the asset row, not to each render site.
- An automation rule references an allow-listed action; it never embeds an arbitrary script, secret
  value or second scheduler.

The next four sections are the detailed research, one axis each. Their citation numbers restart at
`[1]` in every section, and each ends with its own **Sources** list, **Rejected options** and **Open
questions**; the numbering is scoped per section and must be read that way.

## 3. Product management: list, editor, and the Administration's information architecture

Scope: list, editor, state architecture, within four seams: ADR-0026 (Catalogue owns
Product reads, in facts not rows), ADR-0029 (`categoryId` may be null), ADR-0034 (save owns draft
promotion), `lib/use-cases/cache-invalidation.ts` (single invalidation seam).

### Findings

#### List: what the five reference admin panels document

**All of them paginate server-side, with a visible page size.** Shopify shows 50 rows per page in a
view [6]. BigCommerce exposes a « products per page » selector and previous/next arrows [9]. Medusa
lists products with `offset`/`limit`, `limit` defaulting to 50 (20 for the generic
`createFindParams`) [11][12]. Saleor paginates by cursor and caps a request at 100 objects [13].
TanStack considers client-side pagination viable « if your table will never exceed a few thousand
rows » [1]: the choice is about where the truth lives.

**Search is a single box over several fields, not a per-column filter.** BigCommerce searches « across
multiple product fields, such as name and SKU » [9]. Shopify puts filters *inside* the query string,
displays them as editable pills, and removes them with the Delete key [6]. Medusa exposes `q`
alongside the structured filters [12].

**Filters are a small typed set, and the same axes keep coming back.** BigCommerce: category,
channel, brand, visibility, featured, free shipping, price, stock — with numeric operators (≥, ≤, =,
range) and at most 10 criteria [9]. Shopify filters by vendor and collection [6]; WooCommerce by
category, product type, and stock status only [10]; Saleor by `where`, `sortBy`, and `search` [13].

**Saved views are the documented answer to repeated filtering — a view is just a named query.**
Shopify: default views and views created from the current search, rename, duplicate, delete — but
sorting is **not** persisted per view, « any time you navigate away from the view, the sort order
resets » [6]. BigCommerce: predefined views plus « Save as view », per user, with a « Manage views »
dialog [9].

**Row actions live in a menu; column visibility is not universal.** BigCommerce: a `⋯` menu per row
(Edit, Duplicate, View, visibility, featured, Delete) and a pencil for price and stock [9]. Shopify
reserves column editing for Orders, Inventory, Transfers, Purchase orders, and Metafields — « This
option isn't available for other types of lists » [6] — whereas TanStack models a `columnVisibility`
freely, provided you render through `getVisibleCells()` [5]. eguidar already has
`DataTableViewOptions`.

**Duplicating is a documented action, with a copy contract.** Shopify asks for a new title, a status,
and which details to copy [7]; BigCommerce exposes it in the row menu [9]. eguidar has none of it.

#### Editor: one sectioned page, explicit save, never autosave

**All five edit a single product on a long, sectioned page, not in tabs.** On Shopify the parts are
named sections of the same page — Status, Product organization, Variants, Inventory, Publishing,
Search engine listing [7]; BigCommerce offers a *choice* between a side panel and a full-screen
editor, with « Save » and « Save and exit » [9]. None documents autosave, and here autosave would be
wrong: save owns the promotion of product-image drafts (ADR-0034), so every pause would trigger
promotion, compensation, reindexing, and edge purge, and a half-typed price would be visible in the
storefront.

**A variant matrix is not representable here, and deleting is not archiving.** Shopify generates
variants from options (color, size) and advises adding a variant rather than duplicating the product
[7]; `ProductVariant` here has only `name`, `sku`, `priceDelta`, `stock`, so the row list is the only
honest form. Shopify also keeps Active / Draft / Unlisted as statuses, archive as a separate tab, and
permanent deletion — « Deleted products can't be restored » [7]. eguidar has neither `status` nor
`deletedAt`: `deleteProduct` deletes the row, then the R2 images and the Meili document, in
post-commit effects (`lib/use-cases/admin-catalog.ts:732`).

#### Next.js 16.4.1 + TanStack v8: the architecture this repository already has for orders

**The Orders screen is the template; Products is the exception.** `commandes/page.tsx` wraps in
`<Suspense>` an async child that awaits `searchParams` and then calls `listAdminOrders(params)`;
`lib/commande-listing.ts` turns the URL into a typed view, and `use-commande-listing.ts` carries the
300 ms debounce, the echo reconciliation, and `router.replace(href, { scroll: false })`.
`produits/page.tsx` does none of that: `listAdminProducts()` with no argument returns every row
(`lib/use-cases/admin-catalog.ts:817` — `findMany` with no `where`, `take`, or `skip`, projecting
`images` and each variant's `stock` to compose `totalStock`).

**`searchParams` is a promise you must not await at the top of the page.** With
`cacheComponents: true` (`next.config.ts`), the App Router prerenders a static shell and streams the
dynamic part; reading `searchParams` outside `<Suspense>` triggers the blocking-prerender insight
[15]. The documented fix is to pass the promise to the wrapped child [14][15]. `loading.js` wraps a
segment in a Suspense boundary [17]; Products has none and keeps its internal `<Suspense>`.

**TanStack's `manual*` options implement nothing: they stop the table from trying.**
`manualPagination: true` assumes rows are already paginated, requires `pageCount` (or `rowCount`),
and **disables** the automatic reset of `pageIndex` [1]; `manualSorting` assumes the data is sorted
[3], `manualFiltering` that it is already filtered [4]. The Orders hook sets `pageIndex` back to 0 on
sort and filter: that is the obligation moved into the application.

**Selection must be keyed by identifier and must not be read back from the row model.**
`getRowId: row => row.id` is mandatory under manual pagination, otherwise the identifiers are
indexes [2]. The documentation is explicit: `getSelectedRowModel()` returns only the current page,
whereas the selection state « can contain row ids that are not present in the data array » [2]. A
cross-page bulk action therefore submits the keys from the state, never the row model.

**Server Actions are dispatched one at a time per client: a bulk action must be a single action.**
Next.js 16 « dispatches Server Actions one at a time per client » and advises against `Promise.all`
[18]; a `revalidatePath` in the action makes the same round trip carry the return value and a fresh
RSC payload [18][19]; the body is capped at 1 MB [18].

**Optimistic UI is the pattern for row toggles, not for forms.** `useOptimistic` + `useTransition`
flips a value before the server render, and the guide drives filter pills from the URL with
`data-pending` [16]; `useActionState` covers a form's `pending`/reset cycle, provided you wrap state
updates after `await` in `startTransition` [16].

**`useDeferredValue` is the wrong tool for a network search**: it « does not by itself prevent extra
network requests » and debouncing « can let you fire fewer network requests » [21]. The existing
300 ms debounce is the right primitive.

**Cache Components changes the « unsaved changes » guard.** Three routes are preserved via
`<Activity>`, DOM and React state included — « form drafts, scroll positions » [16]. Coming back from
the list restores the draft; the guard is only needed for reload, tab close, and navigation beyond
the preserved routes — the functions reference exposes no blocking API, so `beforeunload` plus a
confirmation on exit links.

**`error.tsx` receives `retry`, not `reset`** — stable in v16.3.0, with `reset` reserved for clearing
without refetch — and must be a Client Component [20].

#### Accessibility: the criteria that actually bite

**Deleting user-controllable data is a WCAG 3.3.4 event.** For a page that « modify[s] or delete[s]
user-controllable data », at least one of Reversible / Checked / Confirmed is required [25]. A batch
of 40 products deleted with a toast and no confirmation satisfies none of them; a dialog naming the
count satisfies « Confirmed ».

**A sticky save bar can fail 2.4.11.** The criterion cites « sticky footers » and « sticky headers »
as typical causes, and proposes *scroll padding* [26]. A `sticky` bar in the form flow is safe; a
`fixed` bar sitting over the last field is not.

**Any drag reordering is a 2.5.7 failure.** The criterion requires a single-pointer alternative
without dragging, and gives the example of a sortable list offering adjacent « up or down » controls
[27]: that applies to gallery order and to Structure.

**Do not adopt `role="grid"`.** The APG defines a grid as a composite widget where a single element
is in the tab sequence and where « the author [must] provide code that manages focus movement inside
it » [30]; in a table, « all focusable elements […] are included in the page tab sequence » [30]. A
read-only table with a checkbox and a link per row does not need that contract: « No ARIA is better
than Bad ARIA » [30].

**Selection and result counters are status messages.** The WCAG 4.1.3 examples include « 5 items »
and « 18 results returned », and the criterion specifies that the results themselves are not a status
message whereas the count is [29]. « 12 produits sélectionnés » (12 products selected) and
« 37 produits » (37 products) go in a polite live region; the table does not.

**A field without a label is a 3.3.2 failure.** Labels are required « when content requires user
input » [28]. The toolbar renders an `<Input>` with only a placeholder
(`components/data-table/data-table-toolbar.tsx:46-51`), and the faceted filter renders bare
`<button>`s with a check icon, without `aria-pressed` or a checkbox role
(`components/data-table/data-table-faceted-filter.tsx:79-110`): the selected state is invisible to
assistive technologies.

**Base UI 1.7.0 already provides the four primitives needed.** `Checkbox` has an `indeterminate` prop
and a `data-indeterminate` attribute [32]; `AlertDialog` is the documented primitive for a dialog
« that requires a user response to proceed » [33]; `Combobox` supports server-side search with
`filter={null}` and filtering in `onInputValueChange` [34]; `Menu` exposes `CheckboxItem`,
`RadioItem`, and `Submenu` [35]. Icons: Hugeicons core-free only,
`<HugeiconsIcon icon={X} strokeWidth={2} />` (`notes/14-ui-kit-inventory.md:39-47`).
`components/ui/` has neither `combobox.tsx` nor `alert-dialog.tsx`: two primitives to add.

### What this implies for eguidar

**1. Extend `listAdminProducts` into a paged listing, as `listAdminOrders` already is.** A
`ProduitListingParams` type and a `{ produits, totalCount, pageCount }` return from a
`prisma.$transaction([findMany, count])`, like `lib/use-cases/orders.ts:600-639`. The shape of the
facts (`FaitsProduitListe`) does not move: ADR-0026 opposes rows and facts, not envelope and facts.
Available filters: stock (zero / non-zero; a threshold requires raw SQL or a denormalized column),
Structure (including « sans Structure » — no Structure), brand, `isFeatured`, `freeShipping`. No
status column: do not invent a « Statut » (Status) filter; the column already renders those two
badges (`app/admin/produits/page.tsx:85-92`).

**2. Clone the orders listing seam.** `lib/produit-listing.ts` (parse, validate, rebuild the URL), a
`useProduitListing` hook modeled on `use-commande-listing.ts`, and a client `produits-table.tsx`
reusing `DataTableToolbar`, `DataTablePagination`, `DataTableViewOptions`, and
`DataTableColumnHeader` — already carrying the French copy and the Hugeicons conventions. Add to it
the `indeterminate` header checkbox [32], `aria-pressed` on the facets, and a label on the search
[28].

**3. Keep search in Postgres for v1, saying what it cannot do.** `mode: "insensitive"` (`QueryMode`
is `default | insensitive`, `lib/generated/prisma/commonInputTypes.ts:26`) folds case, not
diacritics; accents are the `unaccent` dictionary's job [22]. Search on `name`, `brand`, `slug`, and
the variant `sku`: at a few thousand rows the scan is negligible, the real cost being the projection
of `images` and the variants. No expression index: it requires an immutable expression [23], and
whether `unaccent()` is one is **unverified** —
`SELECT provolatile FROM pg_proc WHERE proname = 'unaccent'` would settle it.

**4. A single bulk Server Action, with a narrow vocabulary.** `updateProduct` takes a complete
`ProductInput`: the wrong vehicle for « changing the Structure of 30 products ». Add
`bulkSetStructure`, `bulkSetFeatured`, `bulkSetFreeShipping`, `bulkDelete`: one
`updateMany`/`deleteMany`, one invalidation effect per product (edge purge by slug,
`lib/use-cases/cache-invalidation.ts:80-110`), a single `revalidatePath("/admin/produits")`, and the
identifiers from `rowSelection` [2]. Rule out bulk price and stock: changing the base price can make
a variant's final price negative, which `assertNonNegativeVariantPrices`
(`lib/use-cases/admin-catalog.ts:264`) refuses per product — that needs a partial-failure report, not
a toolbar checkbox.

**5. Editor: a sectioned page, a `sticky` bar, a real guard.** The 410 lines are already in Cards;
what is missing is (a) a bar that is reachable without covering the last field (2.4.11 [26]), (b) an
error card per section instead of the single `state.error` string, (c) `beforeunload` plus an
internal confirmation — drafts surviving navigation via `<Activity>` anyway [16]. No autosave.

**6. A Structure picker that shows the path, and the widening recorded.** `options()` returns
`{ id, name }` sorted by name: two branches carrying the same leaf are indistinguishable
(`components/admin/product-form.tsx:185-201`). Project `{ id, name, filAriane }`, render a `Combobox`
whose label is the path, and write the ADR-0026 amendment rather than slipping the widening in. The
« sans Structure » (no Structure) warning (ADR-0029) is correct and must survive.

**7. Row menu, duplication, confirmed deletion.** Move `Modifier` + `Supprimer` out to a Base UI
`Menu` (Modifier / Dupliquer / Mettre en avant / Livraison offerte / Supprimer — Edit / Duplicate /
Feature / Free shipping / Delete) [35]. Duplication copies the product and its variants with suffixed
slug and SKU, without copying `images`: those URLs are R2 keys of the draft lifecycle (ADR-0004);
reusing them would lose the other product's images. Confirmation via `AlertDialog` [33], with name
and count, initial focus on « Annuler » (Cancel) — the APG advises the least destructive action when
the action is hard to reverse [31].

### Rejected options

**Spreadsheet-style inline editing, everywhere** — rejected. Shopify's bulk editor is a separate
screen with a column picker and a documented failure mode
(« Update the invalid values, then save again »), triggerable by a column the editor does not even
look at [8]. BigCommerce limits inline editing to price and stock [9], WooCommerce to a Quick Edit
[10]. Here a cell would have to build a complete `ProductInput` to call `updateProduct`: it is a
form, not a cell.

**Autosave in the editor** — rejected. Save owns the promotion, the compensation, and the post-commit
effects (ADR-0034); autosave would multiply a three-phase image lifecycle on every pause, and a
mistyped VAT-inclusive price is immediately visible in the storefront. WCAG 3.3.4's
« Checked / Confirmed » says the same thing [25].

**Loading the whole catalog client-side, or reading the list from Meilisearch** — rejected, but not
for the row count: TanStack says a few thousand rows go through client-side [1][4]. Rejected because
(a) the list must show the row just saved, and the Meili index is asynchronous by construction
(`enqueued` / `processing` / `succeeded` [24]) whereas Postgres is not; (b) each row would carry
`images` and its variants; (c) reindexing is a post-commit effect allowed to fail, so a list that
omits a product is worse than a slow `ILIKE`.

**Infinite scroll, editor tabs, and a `SavedView` table** — rejected. Infinite scroll removes the
denominator needed for « select all matching this filter » and breaks the URL as shareable state (the
reason `lib/commande-listing.ts` exists); the five reference admin panels paginate with a visible
page size [6][9][13]. Tabs would hide the failing section of a six-section form whose current visit
is a price or stock change. And with state in the URL, a saved view is a URL: Shopify and BigCommerce
persist them because they serve several merchants per account [6][9].

### Open questions

1. **Archive or delete?** Adding `deletedAt` (or a status enum) is a schema change that every
   storefront read must honor — `carte-produit`, the Meili document, the Structure counters. Is a
   confirmed permanent deletion enough for v1, or is « removing from the storefront without losing
   the record » a real need?
2. **Should a Structure filter include descendants?** The tree is an adjacency list owned by
   `lecture-structure.ts` (ADR-0030); filtering a parent by its subtree is a read-model decision, and
   it changes the meaning of the counter.

### Sources

[1] — TanStack Table v8, Pagination — https://tanstack.com/table/v8/docs/guide/pagination — retrieved 2026-10-28
[2] — TanStack Table v8, Row Selection — https://tanstack.com/table/v8/docs/guide/row-selection — retrieved 2026-10-28
[3] — TanStack Table v8, Sorting — https://tanstack.com/table/v8/docs/guide/sorting — retrieved 2026-10-28
[4] — TanStack Table v8, Column Filtering — https://tanstack.com/table/v8/docs/guide/column-filtering — retrieved 2026-10-28
[5] — TanStack Table v8, Column Visibility — https://tanstack.com/table/v8/docs/guide/column-visibility — retrieved 2026-10-28
[6] — Shopify Help, Searching and filtering your lists using views — https://help.shopify.com/en/manual/shopify-admin/productivity-tools/searching-filtering-views — retrieved 2026-10-28
[7] — Shopify Help, Adding and updating products — https://help.shopify.com/en/manual/products/add-update-products — retrieved 2026-10-28
[8] — Shopify Help, Bulk editing — https://help.shopify.com/en/manual/shopify-admin/productivity-tools/bulk-editing — retrieved 2026-10-28
[9] — BigCommerce Help, Product List — https://support.bigcommerce.com/s/article/Product-List?language=en_US — retrieved 2026-10-28
[10] — WooCommerce Docs, Feature, Filter, and Sort Products — https://woocommerce.com/document/feature-filter-and-sort-products/ — retrieved 2026-10-28
[11] — Medusa Docs, Products Overview in Medusa Admin — https://docs.medusajs.com/user-guide/products — retrieved 2026-10-28
[12] — Medusa source, admin products validators and `api/utils/validators.ts` — https://raw.githubusercontent.com/medusajs/medusa/develop/packages/medusa/src/api/admin/products/validators.ts — retrieved 2026-10-28
[13] — Saleor Docs, `products` query — https://docs.saleor.io/api-reference/products/queries/products — retrieved 2026-10-28
[14] — Next.js 16.4.1 local docs, `page.js` (`searchParams` is a Promise) — node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md — next@16.4.1 local, no URL
[15] — Next.js 16.4.1 local docs, Migrating to Cache Components — node_modules/next/dist/docs/01-app/02-guides/migrating-to-cache-components.md — next@16.4.1 local, no URL
[16] — Next.js 16.4.1 local docs, Preserving UI state and Building interactive apps — node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md, .../interactive-apps.md — next@16.4.1 local, no URL
[17] — Next.js 16.4.1 local docs, `loading.js` — node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md — next@16.4.1 local, no URL
[18] — Next.js 16.4.1 local docs, Server Actions — node_modules/next/dist/docs/01-app/02-guides/server-actions.md — next@16.4.1 local, no URL
[19] — Next.js 16.4.1 local docs, `revalidatePath` — node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md — next@16.4.1 local, no URL
[20] — Next.js 16.4.1 local docs, `error.js` (`retry` stable in v16.3.0) — node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md — next@16.4.1 local, no URL
[21] — React, `useDeferredValue` — https://react.dev/reference/react/useDeferredValue — retrieved 2026-10-28
[22] — PostgreSQL 16 Documentation, unaccent — https://www.postgresql.org/docs/16/unaccent.html — retrieved 2026-10-28
[23] — PostgreSQL 16 Documentation, CREATE INDEX — https://www.postgresql.org/docs/16/sql-createindex.html — retrieved 2026-10-28
[24] — Meilisearch Docs, Tasks and asynchronous operations — https://www.meilisearch.com/docs/learn/async/asynchronous_operations — retrieved 2026-10-28
[25] — W3C, Understanding SC 3.3.4 Error Prevention (Legal, Financial, Data) — https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-legal-financial-data.html — retrieved 2026-10-28
[26] — W3C, Understanding SC 2.4.11 Focus Not Obscured (Minimum) — https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html — retrieved 2026-10-28
[27] — W3C, Understanding SC 2.5.7 Dragging Movements — https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html — retrieved 2026-10-28
[28] — W3C, Understanding SC 3.3.2 Labels or Instructions — https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html — retrieved 2026-10-28
[29] — W3C, Understanding SC 4.1.3 Status Messages — https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html — retrieved 2026-10-28
[30] — W3C WAI-ARIA APG, Grid Pattern — https://www.w3.org/WAI/ARIA/apg/patterns/grid/ — retrieved 2026-10-28
[31] — W3C WAI-ARIA APG, Dialog (Modal) Pattern — https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ — retrieved 2026-10-28
[32] — Base UI 1.7.0 docs, Checkbox — node_modules/@base-ui/react/docs/react/components/checkbox.md — @base-ui/react@1.7.0 local, no URL
[33] — Base UI 1.7.0 docs, Alert Dialog — node_modules/@base-ui/react/docs/react/components/alert-dialog.md — @base-ui/react@1.7.0 local, no URL
[34] — Base UI 1.7.0 docs, Combobox — node_modules/@base-ui/react/docs/react/components/combobox.md — @base-ui/react@1.7.0 local, no URL
[35] — Base UI 1.7.0 docs, Menu — node_modules/@base-ui/react/docs/react/components/menu.md — @base-ui/react@1.7.0 local, no URL

## 4. Structure: managing the category tree without breaking its invariants

### Findings

#### Four first-party admins, four different answers

**Shopify does not nest collections; the hierarchy lives in menus, capped at three levels.** "You can nest links up to three levels deep" [1], described in the admin as a top-level item with "up to two levels of nested drop-down menus", built by dragging an item under another and pressing **Save menu** [2]; nothing persists until then.

**Saleor stores a level, not a sibling order.** `Category` exposes `parent`, `children`, `ancestors` and `level: Int!` [3], but its only sort inputs are `NAME`, `PRODUCT_COUNT` and `SUBCATEGORY_COUNT` [4] — no `position`/`rank`, so sibling order is derived, and the dashboard must pick a derivation. Its deletion mutation is documented only as "Deletes a category", with no stated child/product policy [5] (**unverified**; settling it needs Saleor's implementation or tests).

**Medusa stores a rank and saves on every move.** The API object carries `rank` ("The category's rank among sibling categories") and `parent_category_id` [7]. The admin **Edit ranking** surface saves "every time you move a category", dragging to reorder and "under another category and move it slightly to the side" to nest [6]. Deletion is soft (`deleted_at`) [7], so children keep an existing parent.

**WooCommerce has `menu_order` and a hard delete.** The product-category resource accepts `menu_order` ("used to custom sort the resource") and `parent`; deletion requires `force=true` [8].

**Only Shopify documents a depth limit**; Saleor's `level`, Medusa's `rank` and WooCommerce's `menu_order` document none [3][7][8], and eguidar's schema has no depth column. eguidar has refused a depth cap twice, because it "borne sans détecter" and would add an unstated business rule (ADR-0027, #490; ADR-0030).

#### The ARIA pattern: a tree view, not a treegrid

**A treegrid makes every cell a focus stop, for cells that are read-only.** The APG requires that in a treegrid "both rows and cells are focusable… regardless of whether individual cell content is editable or interactive", because in application mode a screen reader only reports focusable content [10]. For *Catégorie / Slug / Produits / Sous-catégories / Actions* that is four or five stops per row, plus two-axis navigation where Left/Right move between cells rather than depth [10].

**A tree view gives the same hierarchy with one tab stop.** Nodes carry `role="treeitem"`, parents carry `aria-expanded` (end nodes must not) [9], and a roving `tabindex` keeps one node at `0` and the rest at `-1`, moved on every arrow key [11]. The keyboard model is the familiar one: Up/Down through visible nodes, Right opens then enters, Left closes then rises, Home/End, and type-ahead [9].

**Flattening obliges you to declare what the DOM no longer says.** APG: when the complete set of nodes is not in the DOM, "each node has `aria-level`, `aria-setsize`, and `aria-posinset` specified" [9]. A flattened, filterable renderer never nests `group` elements, so all three must be computed from the sibling array — describing the sibling set, not the filtered view.

**Row actions collide with the one-tab-stop rule.** The APG says the tab sequence should include only one focusable element of a composite [11]; visible "Modifier / Supprimer" buttons per treeitem either break that (N extra stops) or must leave the tab order. Base UI ships no tree/treegrid primitive (`node_modules/@base-ui/react` has `accordion`, `collapsible`, `menu`, `select`), so the resolution is one menu button per row, or actions on the detail page.

**WCAG 2.2 adds three constraints, one of which is not about keyboards.** SC 2.5.7 Dragging Movements (AA) requires that dragging functionality "can be achieved by a single pointer without dragging", and states that keyboard equivalence "does not automatically meet this success criterion" [12] — so buttons are mandatory even if drag exists. SC 2.5.8 (AA) sets 24×24 CSS px or non-intersecting 24 px spacing circles [13]: size the move controls to clear it, and note that a 16 px drag handle would not. SC 4.1.3 (AA) requires the *result* of a move to be determinable without focus [14]; the same document excludes expand/collapse, because `aria-expanded` already announces it [14]. One polite live region saying « Déplacée sous Chaussures, position 2 sur 5 » is the requirement; announcing every expand is not.

#### Drag-and-drop libraries: all pointer-first, none tree-native

**@dnd-kit ships a real keyboard sensor and documents its limits.** `@dnd-kit/core` 6.3.1 and `@dnd-kit/sortable` 10.0.0 are MIT [15][16]. Enter/Space pick up and drop, arrows move, Escape cancels; the default arrow step is 25 px, "an arbitrary default" to be replaced via `getNextCoordinates` [18]. Instructions and announcements ship "in English only due to bundle size concerns", with positions preferred over indices [18] — in a French admin both must be written by hand.

**The sortable preset is not a tree.** Its documented use cases are "vertical lists, horizontal lists, grids, and virtualized lists" [19]; a tree needs several `SortableContext`s plus `onDragOver` for cross-container moves [19], i.e. your own collision and projection logic — the exact place where a wrong drop corrupts topology. The next generation, `@dnd-kit/react`, is 0.5.1 [17]: a 0.x API in the admin's most invariant-sensitive screen.

**Pragmatic drag-and-drop declines the accessibility job by design.** `@atlaskit/pragmatic-drag-and-drop` is 4.0.0, Apache-2.0 [20]. Its docs say the pieces "are unopinionated about visual language or accessibility", with assistive-technology controls as *optional* additions built on the Atlassian Design System [21].

**react-arborist is the closest fit and still needs move buttons.** 4.0.1, MIT, with `react-dnd` 16 and `react-dnd-html5-backend` as peers [22]. Its README lists drag-and-drop sorting, keyboard navigation, aria attributes, virtualization, inline renaming and filtering, and documents exactly the search behaviour the task asks about: "If a child matches, all its parents are shown too, so the tree keeps its structure" [23]. But re-parenting is drag-and-drop through react-dnd; a keyboard-only *move* path is not documented (settling it needs the keyboard handler source). It also replaces the repo's table and Base UI/Hugeicons rendering.

**Native HTML5 DnD has no keyboard model.** The HTML Standard's processing model says that from drag start "device input events (e.g. mouse and keyboard events) must be suppressed", and that with a non-pointing modality users "would probably have to explicitly indicate their intention" [24]. No key starts a native drag.

#### Data model and transactions: one column, one index, and the root problem

**The minimal change is one integer plus the order siblings already have implicitly.** `Category` is `id, name, slug, image?, parentId?, parent, children, products, createdAt, updatedAt` (`prisma/schema.prisma:81-92`), and `lignesAdmin()` returns siblings in `comparerParNom` order (`name.localeCompare(name, "fr")` then id). `position Int @default(0)` plus `@@index([parentId, position])` stores an order; every existing row starts at 0 and the read model breaks ties by name, so no visible order changes. The relation is a plain self-relation [32]; the column changes none.

**A unique `(parentId, position)` does not constrain roots, because SQL treats NULLs as distinct.** PostgreSQL's default is "that they are distinct, so that a unique index could contain multiple null values in a column" [27]; `NULLS NOT DISTINCT` exists for this [26][27]. Prisma's `@@unique` cannot be assumed to express it (**unverified**; the documented route for SQL Prisma cannot generate is a hand-edited migration via `--create-only`) [35].

**Deferrability exists only for unique-family constraints — and it matters because uniqueness is checked per row.** Only `UNIQUE`, `PRIMARY KEY`, `EXCLUDE` and `REFERENCES` accept `DEFERRABLE` [26]; `SET CONSTRAINTS` toggles them per transaction, deferred checks firing at commit [28]. PostgreSQL checks non-deferrable uniqueness "immediately whenever a row is inserted or modified", where the standard checks at end of statement [26]: one `UPDATE` shifting positions 1,2,3 to 2,3,4 collides transiently unless the constraint is `DEFERRABLE INITIALLY DEFERRED` or the rewrite uses temporary negative offsets.

**`ON DELETE` is a backstop, and positions make it worse.** `Category_parentId_fkey` is `ON DELETE SET NULL` while the Prisma schema carries no `onDelete`; Prisma's default for an optional relation is `SetNull` on delete [33], so they agree by accident and the promotion trap ADR-0027 names survives. `deleteCategory` reassigns or orphans children inside its transaction before deleting, making `SET NULL` unreachable (ADR-0027, #519/#522). With `position`, a stray `SET NULL` would promote children to root *carrying their old positions* and collide with real roots — one more reason explicit reassignment stays the only path.

**The move runs under the existing lock, and the subtree read is one query.** Inside `sousVerrouDeStructure` (`lib/use-cases/admin-structure.ts`): read the id→parentId links and the moved node's descendants with one `WITH RECURSIVE … UNION` — the shape #541 uses for `assertAcyclicCategoryTree`, terminating on a cycle because `UNION` discards produced rows [25]; refuse if the target is in that set; read destination siblings ordered by `(position, name, id)`; rewrite only affected positions; let post-commit effects run.

**Concurrent moves are what READ COMMITTED does not solve by itself.** At Read Committed each statement gets a fresh snapshot, and a concurrent updater re-evaluates its `WHERE` against the updated row [30] — two moves can each compute positions from a state the other is about to invalidate. ADR-0027's coarse `FOR UPDATE` already serialises every Structure mutation; Prisma supports `isolationLevel` and documents `P2034` plus retry loops for the alternative [31], which ADR-0027 explicitly rejected.

**Adjacency list + recursive CTE beats both alternatives at this size.** `ltree` is a contrib extension [29] storing a second representation every reparent rewrites for the whole subtree, and Prisma sees it as an `Unsupported` column needing casts in raw SQL [34]. A closure table has no native support and rewrites O(nodes × depth) rows per move, with no constraint able to prove it consistent. The adjacency list is what the read model already walks in memory (`lib/marche-structure.ts`); the CTE covers the one place the database must answer "who descends from whom" [25].

#### UI shape: the read model already knows more than the page shows

**`lignesAdmin()` returns ten facts per row and the page uses seven.** `LigneStructureAdmin` is `id, name, slug, image, parentId, nomParente, nombreProduits, nombreEnfants, profondeur, horsArbre` (`lib/use-cases/lecture-structure.ts:35-46`). `nombreProduits` is **direct** products only (`produitsDirects`, line 193), while `arbreAccueil()` cumulates counts up the tree (`cumulerLesProduits`, lines 81-104) — a "Produits" column reading 0 for a parent of three populated children is a bug users report, not a design choice.

**`ciblesSuppression()` is a per-row partition, computed for every row.** For each category it returns `produits` (products outside the deleted subtree) and `sousCategories` (children outside the deleted descendance), via `complementDepuis` (lines 225-234); the page computes all of them eagerly and joins by id. That is delete-dialog data, not a move affordance.

**The breadcrumb already exists and is unused.** `filAriane(id)` returns the `{name, slug}` chain (lines 253-261) and `branche(id)` returns the node plus descendance in name order (lines 269-278); the edit page uses `branche(id)` to exclude descendants from the parent selector (`app/admin/categories/[id]/page.tsx:23`). What a move UI lacks is the destination's path, which `filAriane` gives for free.

**The page scans, it does not browse.** It compares slugs and counts and runs two actions per row; the flattened `paddingLeft = profondeur * 1.5` table (`app/admin/categories/page.tsx:23,63-69`) is the right skeleton.

### What this implies for eguidar

1. **Ship keyboard-first move commands in v1, and no drag-and-drop.** Four buttons per row — « Monter », « Descendre », « Indenter » (last child of the previous sibling), « Désindenter » (next sibling of the parent) — plus « Déplacer sous… » with a searchable parent picker. This satisfies SC 2.5.7 by construction rather than by bolting on a fallback [12], and avoids @dnd-kit's tree glue on a page where a bad drop mutates topology. Add DnD later only if the owner asks; the commands are identical either way, which is the point.

2. **The UI never sends positions — it sends one intent.** `deplacerStructure({ id, nouvelleParenteId, avantId | null })` in `lib/use-cases/admin-structure.ts`, executed inside `sousVerrouDeStructure`, returning a named refusal (`CategoryValidationError` for a target inside the subtree; the cycle refusal untouched). This is the only shape that respects ADR-0027 (all Structure mutations serialised, one owner) and ADR-0030 (topology has one owner; the admin line does not decide it). A command shipping a whole re-ordered sibling array would be a second topology owner wearing a form payload. Save-per-move is safe on the wire — Next.js dispatches Server Actions one at a time per client, and `revalidatePath` re-renders the route in the same roundtrip [37] — but each roundtrip returns the server's truth, so one command per gesture beats a drag preview that disagrees with it.

3. **Schema: `position Int @default(0)` and `@@index([parentId, position])` now; skip the unique constraint in v1.** Dense unique positions buy an invariant the UI already guarantees through one serialised command, and cost either a `DEFERRABLE` constraint (hand-written SQL, not Prisma schema [35]) or negative-offset shuffles on every reorder [26][28]. Sparse integers (steps of 1024) with `ORDER BY position, name, id` and a non-unique index give the same visible behaviour with one-row writes. If the database should enforce it later, the migration is additive.

4. **Extend the read model; do not build a second tree.** Add `position` and a cumulative `nombreProduitsCumules` to `LigneStructureAdmin`, and expose the destination path through the existing `filAriane`. That is a deliberate amendment to ADR-0030's ordering promise (the core comparator becomes `(position, name, id)`) and must be written as one, not slipped in as a page change. `arbreAccueil()` ordering changes with it — check with the owner before the migration.

5. **Keep the table, fix the two lies, and make « hors arbre » actionable.** Use TanStack expanding [36] on the existing table rather than inventing a board: a category has exactly one parent, so a board would encode an axis that does not exist. A filter that keeps ancestors visible is `filterFromLeafRows` [36]. Show the cumulative count with the direct count as a subtitle, replace « sous X » with the `filAriane` path beyond depth two, and turn the `hors arbre` badge into « Rattacher… ». Note that reassigning a node *inside* a cycle hits `CategoryAncestorCycleError` (ADR-0027, #490) until the edge that closes the cycle is named — the repair command must return that edge, which `LigneStructureAdmin` cannot express today. Rename and slug edits belong inline, with `CategorySlugConflictError` rendered next to the slug input rather than in the form's single error paragraph (`components/admin/category-form.tsx:68-72`).

### Rejected options

- **`role="treegrid"` on the categories table.** Every cell becomes a focus stop and arrows become two-axis navigation [10]; for four read-only columns the cost buys nothing.
- **A board / kanban of categories.** A board encodes "which column" as a second hierarchy axis; `parentId` is single-valued, and drag-between-columns is exactly what SC 2.5.7 constrains [12].
- **@dnd-kit for the tree in v1** (core 6.3.1 / sortable 10.0.0 [15][16], or `@dnd-kit/react` 0.5.1 [17]). The preset does not model trees [19]; multi-container collision logic plus French announcements [18] must be written before the first move works, none of it needed for 2.5.7 [12], and the new generation is still 0.x.
- **Pragmatic drag-and-drop as the accessibility answer.** Its docs call AT controls optional Atlassian-DS add-ons [21]; the button path is still required.
- **react-arborist.** Closest feature match, including ancestor-preserving filtering [23], but it replaces the table and rendering stack and still relies on react-dnd for re-parenting [22][23].
- **`ltree` materialized path.** A contrib extension [29], a second representation to keep true, and an `Unsupported` Prisma column needing casts [34], for a tree that fits in one `findMany`.
- **A closure table.** No native support, O(nodes × depth) rows rewritten per move, and no constraint that can prove the closure consistent.
- **Immediate unique `(parentId, position)` without `NULLS NOT DISTINCT`.** Roots would all sit at position 0 undetected [27].
- **Client-computed topology** (the drop handler sends the new sibling order). Violates ADR-0030's single topology owner and ADR-0027's refusal surface; every invariant would have to be re-proved in the browser.

### Open questions

1. **Is the storefront's category order part of the product?** If alphabetical is acceptable there, `position` stays admin-only and ADR-0030's ordering promise is untouched for the boutique. If not, every surface follows the core comparator.
2. **Does the owner want drag-and-drop?** Buttons are mandatory regardless [12]; DnD is a second path to build, test and announce. Say no unless asked.
3. **Where does a moved node land by default** — end of the destination siblings, or after the destination's last child? « Indenter » needs one default.
4. **Is bulk move in scope for v1?** It is one command (`ids[]`, target) but N refusals to surface; the single-node command is the prerequisite.
5. **What should the UI do with a cycle it cannot name?** Until the repair command reports the closing edge, « Rattacher… » on a `hors arbre` row can fail with a refusal the editor cannot act on.

### Sources

[1] — Add navigation to your theme (Shopify) — https://shopify.dev/docs/storefronts/themes/navigation-search/navigation — retrieved 2026-10-28
[2] — Set up drop-down menus in your online store (Shopify Help) — https://help.shopify.com/en/manual/online-store/menus-and-links/drop-down-menus — retrieved 2026-10-28
[3] — Category Object (Saleor 3.23.43 API reference) — https://docs.saleor.io/api-reference/products/objects/category — retrieved 2026-10-28
[4] — CategorySortField Enum (Saleor) — https://docs.saleor.io/api-reference/products/enums/category-sort-field — retrieved 2026-10-28
[5] — categoryDelete Mutation (Saleor) — https://docs.saleor.io/api-reference/products/mutations/category-delete — retrieved 2026-10-28
[6] — Manage Product Categories in Medusa Admin — https://docs.medusajs.com/user-guide/products/categories — retrieved 2026-10-28
[7] — ProductCategory Object, Admin API schema (Medusa) — https://docs.medusajs.com/api/admin/product-categories/schema.md — retrieved 2026-10-28
[8] — wc product_cat (WooCommerce developer docs) — https://developer.woocommerce.com/docs/wc-cli/wc-cli-commands/wc-product-cat — retrieved 2026-10-28
[9] — WAI-ARIA APG, Tree View Pattern — https://www.w3.org/WAI/ARIA/apg/patterns/treeview/ — retrieved 2026-10-28
[10] — WAI-ARIA APG, Treegrid Pattern — https://www.w3.org/WAI/ARIA/apg/patterns/treegrid/ — retrieved 2026-10-28
[11] — WAI-ARIA APG, Developing a Keyboard Interface — https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/ — retrieved 2026-10-28
[12] — WCAG 2.2 Understanding SC 2.5.7 Dragging Movements — https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html — retrieved 2026-10-28
[13] — WCAG 2.2 Understanding SC 2.5.8 Target Size (Minimum) — https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html — retrieved 2026-10-28
[14] — WCAG 2.2 Understanding SC 4.1.3 Status Messages — https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html — retrieved 2026-10-28
[15] — npm registry, @dnd-kit/core latest (6.3.1, MIT) — https://registry.npmjs.org/@dnd-kit/core/latest — retrieved 2026-10-28
[16] — npm registry, @dnd-kit/sortable latest (10.0.0, MIT) — https://registry.npmjs.org/@dnd-kit/sortable/latest — retrieved 2026-10-28
[17] — npm registry, @dnd-kit/react latest (0.5.1, MIT) — https://registry.npmjs.org/@dnd-kit/react/latest — retrieved 2026-10-28
[18] — dnd kit docs, Accessibility — https://docs.dndkit.com/guides/accessibility — retrieved 2026-10-28
[19] — dnd kit docs, Sortable preset — https://docs.dndkit.com/presets/sortable — retrieved 2026-10-28
[20] — npm registry, @atlaskit/pragmatic-drag-and-drop latest (4.0.0, Apache-2.0) — https://registry.npmjs.org/@atlaskit/pragmatic-drag-and-drop/latest — retrieved 2026-10-28
[21] — Atlassian Design System, Pragmatic drag and drop — https://atlassian.design/components/pragmatic-drag-and-drop/about — retrieved 2026-10-28
[22] — npm registry, react-arborist latest (4.0.1, MIT) — https://registry.npmjs.org/react-arborist/latest — retrieved 2026-10-28
[23] — react-arborist README — https://raw.githubusercontent.com/jameskerr/react-arborist/main/README.md — retrieved 2026-10-28
[24] — HTML Living Standard, 6.11 Drag and drop — https://html.spec.whatwg.org/multipage/dnd.html — retrieved 2026-10-28
[25] — PostgreSQL 16, WITH Queries (Common Table Expressions) — https://www.postgresql.org/docs/16/queries-with.html — retrieved 2026-10-28
[26] — PostgreSQL 16, CREATE TABLE — https://www.postgresql.org/docs/16/sql-createtable.html — retrieved 2026-10-28
[27] — PostgreSQL 16, CREATE INDEX — https://www.postgresql.org/docs/16/sql-createindex.html — retrieved 2026-10-28
[28] — PostgreSQL 16, SET CONSTRAINTS — https://www.postgresql.org/docs/16/sql-set-constraints.html — retrieved 2026-10-28
[29] — PostgreSQL 16, ltree — https://www.postgresql.org/docs/16/ltree.html — retrieved 2026-10-28
[30] — PostgreSQL 16, Transaction Isolation — https://www.postgresql.org/docs/16/transaction-iso.html — retrieved 2026-10-28
[31] — Prisma ORM v7, Transactions and batch queries — https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions — retrieved 2026-10-28
[32] — Prisma ORM v7, Self-relations — https://www.prisma.io/docs/orm/v7/prisma-schema/data-model/relations/self-relations.md — retrieved 2026-10-28
[33] — Prisma ORM v7, Referential actions — https://www.prisma.io/docs/orm/v7/prisma-schema/data-model/relations/referential-actions.md — retrieved 2026-10-28
[34] — Prisma ORM v7, Raw queries — https://www.prisma.io/docs/orm/v7/prisma-client/using-raw-sql/raw-queries.md — retrieved 2026-10-28
[35] — Prisma ORM v7, Customizing migrations — https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/customizing-migrations.md — retrieved 2026-10-28
[36] — TanStack Table v8, Expanding Guide — https://tanstack.com/table/v8/docs/guide/expanding — retrieved 2026-10-28
[37] — Next.js 16.4.1 in-checkout docs, "Server Actions and Mutations" — node_modules/next/dist/docs/01-app/02-guides/server-actions.md (local file, no URL) — retrieved 2026-10-28

## 5. Product media: from an upload widget to a media library

### Findings

#### 1. A media library is a registry, not a grid

**Shopify makes the library the single entry point.** Every file picker in the admin — product
media, theme, metafield, rich-text editor — writes to the same `Content > Files` page [12]. The list
filters by size range, file type, **Used in** (file reference) and **Alt text**, and sorts by date,
name or size [12]. The GraphQL `files` query exposes the same filters as first-class arguments:
`used_in`, `product_id`, `media_type`, `original_upload_size`, `status` [13]. Two of those filters —
usage and alt text — cannot be answered by the bucket: R2 knows bytes, not references. Any "unused"
or "missing alt" view therefore needs a database row per asset.

**What the other UIs document that is worth copying.** Strapi [14]: folder tree, grid/table toggle,
filter/search/sort bar; the detail panel is exactly the shape we want — a read-only *File info*
block (size, dimensions, extension, asset id) next to editable *File name*, *Location*, *Caption*,
*Alternative text*, with a warning when alt or caption is empty. Uploads show a per-file status
(Queued / Uploading… / Uploaded), a *Cancel all* button that keeps files already sent, and a *Retry*
that only relaunches cancelled files — a single failed file is not retryable in the dialog [14].

**Payload models media as a collection, not a column.** `alt` is an ordinary field; `imageSizes` and
`adminThumbnail` generate and choose derivatives; `crop` and `focalPoint` are admin tools; a
collection carries a `relationTo: 'media'` field [15]. Medusa places storage behind a file module
with **only one provider registered at a time** (local in development, S3-compatible in production)
[16]. Both separate the asset from its usage; eguidar puts the URL in the product and nowhere else.

**Replace and delete are policies, not buttons.** Shopify: *Replace* keeps the name and URL handle,
but only accepts the same format [12]. Strapi: *Replace* swaps the file behind the asset id, while
deletion warns "If a file is currently in use, the linked content breaks and image containers are
left empty" [14]. Neither counts references. eguidar has a stronger rule (the database is
authoritative, ADR-0004), so deleting an asset is a **Catalogue** decision, not a bucket decision.

#### 2. What already exists and must not be rebuilt

The "upload" half of the media library is written and tested. Read it as an asset:

- **Two ownership states** (product-image draft / product image), promotion by copy, persistent key
  a pure function of the id, 24 h configurable retention, first-writer-wins claim (ADR-0004).
- **The R2 lifecycle rule is a versioned artifact**: `infra/regle-cycle-vie-r2.json` targets the
  `products/brouillons/` prefix with `expire.days = 1`, and `scripts/setup-providers.sh` applies it
  and verifies that no persistent key can match. The out-of-band expiration the ADR promises really
  exists.
- **The client protocol has a port** (`components/admin/televersement-brouillons.ts`, ADR-0033):
  `ajouter(fichiers, places)` and `relacher(draftId)`, refusals instead of exceptions, a single HTTP
  adapter (`televersement-brouillons-http.ts`) naming the two routes.
- **The routes are thin**: `app/api/admin/uploads/presign/route.ts` and `.../delete/route.ts` only
  parse and delegate to the lifecycle; the MIME list comes from `CONTENT_TYPES_IMAGE_PRODUIT`
  (`lib/r2.ts:20`).
- **Promotion belongs to product save**, in three phases, with unconditional compensation
  (ADR-0034); `preparerPromotionBrouillons` / `confirmerBrouillons` / `supprimerSources` are
  sequential and the Catalogue chains them.
- **The cover is `images[0]`**: `lib/carte-produit.ts:44` does `image: images[0] ?? null`, and the
  gallery renders `images[current]` starting at zero.
- **The render scope is already locked**: `next.config.ts` declares `remotePatterns` on
  `cdn.eguidar.com` with `search: ""`, and the CSP allows only `'self'` and that domain in `img-src`.

What is missing is not storage but **reads**: width, height, alt text, usage counts, object listing,
CORS configuration.

#### 3. Upload mechanics to R2

**At 10 MB, a simple PUT is the right primitive and multipart is a net cost.** R2 documents simple
PUT as the path for files "under ~100 MB" and multipart for parallelization and resumption, with
parts from 5 MiB to 5 GiB and 10,000 parts [2]; the single-part upload limit is 5 GiB [5]. Multipart
would add round-trips, a `CompleteMultipartUpload`, and the 7-day abort rule for incomplete uploads
[2][7]; for 10 MB, no gain.

**What a presigned URL binds, and what it does not.** R2 documents that the signature includes the
declared `Content-Type`, and that a different header makes the upload fail with 403
`SignatureDoesNotMatch` [1]. A POST-policy size bound (`content-length-range`) is out of reach: R2
does not support form POST uploads [1]. The `ContentLength` set in the presign command
(`lib/r2.ts:270`) is not a documented range check — **unverified**; a `curl -X PUT` with a body
shorter than the signed size would settle it. Finally, a presigned URL does not bind the bytes: a
polyglot file named `.jpg`, declared `image/jpeg`, starting with the right magic bytes passes. OWASP
is explicit: do not trust `Content-Type`, validate the file signature, and for images **decode then
re-encode** [21].

**Authoritative verification therefore happens after upload, not before.** `HeadObject` is
implemented by R2 and returns `ContentLength` and `ContentType` [6]: a post-upload HEAD, then a
server decode/re-encode, yields the three facts the presign cannot guarantee.

**CORS is a deployment artifact eguidar does not have.** The bucket must allow the admin origin, the
`PUT` method, the `content-type` header, and expose `ETag` [3]. `scripts/setup-providers.sh`
configures the lifecycle rule but **no CORS rule**: a fresh bucket therefore fails in the browser,
with no server trace. A detail that matters: an expired presigned URL returns 403 `ExpiredRequest`
**without** CORS headers, so JavaScript cannot read the body [3] — the client port must map that to
a generic refusal then re-presign, not to a typed refusal.

**Public bucket + custom domain is not a choice, it is a constraint.** Presigned URLs only work on
the S3 endpoint and "cannot be used with custom domains" [1]. The alternative to `cdn.eguidar.com`
would be serving images from `<account>.r2.cloudflarestorage.com` (no WAF, no Cache Rules, no purge)
or proxying every GET through Next. ADR-0004's choice is the only one that keeps the CDN. The public
bucket also unlocks Smart Tiered Cache, WAF and Bot Management [4].

**Immutable keys make caching simple and deduplication possible.** Keys are UUIDs and promotion
preserves the id, so the bytes behind a URL never change: `Cache-Control: public, max-age=31536000,
immutable` can be set as system metadata at `PutObject` [6]. Cloudflare respects the origin
`Cache-Control` and, failing that, caches by extension with a 120-minute edge TTL [8] — `jpg`,
`png`, `webp` and `avif` are in the default list, so something is already cached, but without the
immutability guarantee. For deduplication: hash the bytes and send `If-None-Match: *` — R2 evaluates
conditional headers atomically and returns 412 to all concurrent writers but one [6]. A put-if-absent
without a lock.

**Metadata and dimensions come out of a single decode.** sharp strips all metadata by default,
including EXIF orientation, and `withMetadata`/`keepExif` are opt-in [17]; the `info` object returned
by `toBuffer` carries width, height, format and byte size [17]. A server decode therefore yields the
real type, the dimensions, the real size, and a rewritten file — OWASP's recommendation for images
[21].

**Three thumbnail strategies, only one that costs no code.** (a) The `next/image` optimizer at
96 px, which downloads the original (up to 10 MB) per derivative; (b) a derived object written at
upload, which needs either a second presigned PUT and a client canvas, or a server worker this
deployment does not have; (c) Cloudflare transformations,
`/cdn-cgi/image/width=96,fit=cover,format=auto/<source>` on the zone [10], billed per unique
(source, parameters) pair per month — 5,000 free, then $0.50/1,000, with `format` and `quality`
excluded from the uniqueness count [9]. Optimized images are cached for a minimum of one hour [10],
the zone must have transformations enabled, and by default the source must be on the same zone [11].
`gravity=auto` is documented for e-commerce galleries [10].

#### 4. Delivery and performance with next/image 16.4.1

**The checkout version diverges from public docs on five points that touch this subject.**
`priority` is deprecated since 16 in favour of `preload`; `qualities` is required since 16 and
defaults to `[75]` — the repo already declares it; `formats` defaults to `['image/webp']`, so **no
AVIF** is served today; `minimumCacheTTL` is 14,400 s and "There is no mechanism to invalidate the
cache at this time"; `maximumDiskCacheSize` (added in 16.1.7) defaults to 50% of free disk space
[22]. The optimizer sets `Vary: Accept` [26], and the docs warn that a proxy/CDN in front of Next
must forward the `Accept` header, or the served format will not match the client [22]. Coolify
terminates through Traefik: whether `Accept` is forwarded is **unverified**; a `curl -H 'Accept:
image/avif'` on the deployed host would settle it.

**The product page LCP is not marked.** `components/storefront/product-gallery.tsx` renders the
first image with `fill`, without `preload`, without `loading="eager"`, without `fetchPriority`; the
documented signal in 16.4.1 for an LCP image above the fold is `preload`, and the docs often prefer
`loading="eager"` or `fetchPriority="high"` [22]. The admin grid is worse: `<Image width={96}
height={96}>` on a 10 MB original asks the container's sharp to download and decode 10 MB per
thumbnail [22]. For a remote image, Next has no compile-time dimensions and `width`/`height` must be
supplied by hand [23]: exactly what the media library must store.

**The optimizer's cost is a single container's.** Image optimization works "self-hosted with zero
configuration" under `next start`, but `sharp` is the only additional dependency required [24][27].
The disk cache is capped and LRU-evicted beyond that [22]: on a container with modest disk, a media
grid of several hundred thumbnails evicts the storefront image cache.

#### 5. Accessibility and trust

**Alt text is a model field, not a render attribute.** 1.1.1 requires a text alternative for all
informative non-text content, and requires decorative content to be ignorable by assistive
technology [18]. Today `Product.images` is a `Json` array of strings: the only available alt is the
product name (`alt={name}` in the gallery, `alt={product.name}` in `carte-produit.tsx`), and the
thumbnails are `alt=""` — correct, they are decorative duplicates. 1.4.5 forbids images of text
outside logos and customizable cases [19]: relevant for promo banners and size guides uploaded as
JPEG.

**Status feedback must be announced without stealing focus.** 4.1.3 requires status messages —
success, progress, error — to be programmatically determinable without receiving focus [20]. In
`image-gallery-upload.tsx`, the error is a `<p class="text-destructive">` without `role="alert"` or
association with the control; the release button's `aria-busy` is already right.

**SVG is already excluded; EXIF is not.** `CONTENT_TYPES_IMAGE_PRODUIT` (`lib/r2.ts:20`) does not
contain `image/svg+xml`: keep it that way. SVG is script-capable, which is why Next disables it by
default and recommends `contentDispositionType: 'attachment'` plus a restrictive CSP if enabled
[22], and why Strapi refuses it by default and points to a domain without cookies [14]. The quieter
risk is EXIF GPS: a phone photo carries coordinates, it is published on a public bucket, and
Cloudflare's `metadata` parameter defaults to `copyright` (GPS removed) but `metadata=keep`
**preserves GPS** [10] — so never pass `keep`. File names are already server-generated UUIDs,
exactly OWASP's recommendation [21].

### What this implies for eguidar

1. **Build the media library as a read model, not a second storage path.** One new table
   (`ImageProduit`: `publicUrl` unique, `mimeType`, `byteSize`, `width`, `height`, `alt`,
   `createdAt`, `createdBy`), written as a post-commit effect of `enregistrerProduit` — the ADR-0014
   seam — as an idempotent upsert by URL, never inside the transaction. The list reads as
   `ListObjectsV2` [6] `LEFT JOIN` the rows: a missing row is a repairable hole, never a lost image.
   No `coverImageId`: the cover is `images[0]` (`lib/carte-produit.ts:44`), and a second owner would
   desynchronize the storefront.

2. **Do not touch the upload protocol.** ADR-0033's port, the two routes, 10 MB, five types, 300 s
   and the eight-image limit stay. Three additions only: a CORS artifact next to
   `infra/regle-cycle-vie-r2.json` [3], a post-upload `HeadObject` before claiming [6], and
   dimensions from decoding. Per-file progress requires `XMLHttpRequest.upload.onprogress` — `fetch`
   exposes no upload progress event [28] — and merely attaching listeners makes the request
   non-simple, which triggers the preflight the CORS policy above must cover [28][3].

3. **Thumbnails via Cloudflare transformations behind a custom `loader`, and never persist the
   transformed URL.** The `/cdn-cgi/image/...` URL is a **view** computed at render; the database
   keeps the object URL, preserving ADR-0004's key derivation and the existing CSP. At a catalogue
   of a few hundred images, we stay under the 5,000 unique monthly transformations [9], and sharp
   leaves the container.

4. **Refuse to delete a used asset instead of warning.** Count usages by joining `Product.images`
   (and `Category.image`), block with the list of affected products — the reversal of Strapi/Shopify
   policy [12][14], possible because the database is authoritative here. Removing an image from a
   gallery keeps its current "pending removals until save" mechanism, which is already the right
   shape.

5. **A required alt field at promotion, with a warning and without AI.** Make it server-required for
   any published image, render it as a field error like the other Catalogue refusals, and flag it in
   the grid as Strapi does [14]. No automatic generation: no primary source documents a reliable alt
   model for product photos.

### Rejected options

- **Base64/`bytea` images in Postgres.** OWASP tolerates it only with a DBA and a demonstrated gain,
  naming the costs: performance, storage, backups, SQLi surface [21]. Here it would also push every
  file through a Server Action capped at 1 MB [25].
- **Serving uploads from the application origin.** OWASP asks for a separate host, or at least
  storage outside the webroot [21]; doing this would proxy 10 MB objects through the Next container
  and contradict `output: "standalone"` behind Coolify. ADR-0004 already decided on the public
  bucket.
- **Client-only type validation.** OWASP: `Content-Type` comes from the user and is trivial to forge;
  the signature must not be used alone [21]. Strapi draws the same boundary — the server remains the
  security boundary, client detection is only UX [14].
- **A second storage provider or a local fallback.** Medusa requires one provider registered at a
  time [16]; ADR-0004 centralizes key derivation in one adapter, and a second path would make the
  lifecycle rule and URL derivation non-exhaustive.
- **Multipart for 10 MB images.** Contraindicated by R2's own upload table (simple PUT under
  ~100 MB) [2].
- **`unoptimized` everywhere on the admin grid.** Would remove the sharp cost but serve multi-MB
  originals for 96 px thumbnails; Cloudflare transformations solve the same problem without that
  cost.
- **A separate `coverImageId` field.** The storefront already derives the cover from `images[0]`
  (`lib/carte-produit.ts:44`); two owners for one fact.
- **Accepting SVG.** Script-capable, refused by default by Next [22] and Strapi [14], and absent
  from the current MIME list.

### Open questions

1. Does the zone have **Cloudflare transformations** enabled, and is `cdn.eguidar.com` a custom
   domain of the bucket in the same zone? The whole thumbnail strategy in point 3 depends on it.
2. Does the media library cover **only** product images, or also Structure (category) and blog
   images? ADR-0004 explicitly leaves categories "their own path".
3. Who may delete a used asset: the shop owner alone, or any Administration editor? The answer
   decides whether the refusal is a Catalogue invariant or a permission.
4. Do we accept a **required** alt text (blocking on save) or only a warning? The former is more
   compliant with 1.1.1 [18], the latter faster for a single-operator shop.

### Sources

[1] — Cloudflare R2, Presigned URLs — https://developers.cloudflare.com/r2/api/s3/presigned-urls/ — retrieved 2026-10-28
[2] — Cloudflare R2, Upload objects — https://developers.cloudflare.com/r2/objects/upload-objects/ — retrieved 2026-10-28
[3] — Cloudflare R2, Configure CORS — https://developers.cloudflare.com/r2/buckets/cors/ — retrieved 2026-10-28
[4] — Cloudflare R2, Public buckets — https://developers.cloudflare.com/r2/buckets/public-buckets/ — retrieved 2026-10-28
[5] — Cloudflare R2, Limits — https://developers.cloudflare.com/r2/platform/limits/ — retrieved 2026-10-28
[6] — Cloudflare R2, S3 API compatibility — https://developers.cloudflare.com/r2/api/s3/api/ — retrieved 2026-10-28
[7] — Cloudflare R2, Object lifecycles — https://developers.cloudflare.com/r2/buckets/object-lifecycles/ — retrieved 2026-10-28
[8] — Cloudflare, Default cache behavior — https://developers.cloudflare.com/cache/concepts/default-cache-behavior/ — retrieved 2026-10-28
[9] — Cloudflare Images, Pricing — https://developers.cloudflare.com/images/pricing/ — retrieved 2026-10-28
[10] — Cloudflare Images, Transform via URL (features and parameters) — https://developers.cloudflare.com/images/transform-images/transform-via-url/ — retrieved 2026-10-28
[11] — Cloudflare Images, Transformations overview — https://developers.cloudflare.com/images/transform-images/ — retrieved 2026-10-28
[12] — Shopify Help, Uploading and managing files — https://help.shopify.com/en/manual/shopify-admin/productivity-tools/file-uploads — retrieved 2026-10-28
[13] — Shopify Admin GraphQL, `files` query — https://shopify.dev/docs/api/admin-graphql/latest/queries/files — retrieved 2026-10-28
[14] — Strapi, Media Library — https://docs.strapi.io/cms/features/media-library — retrieved 2026-10-28
[15] — Payload, Uploads — https://payloadcms.com/docs/upload/overview — retrieved 2026-10-28
[16] — Medusa, File Module — https://docs.medusajs.com/resources/infrastructure-modules/file — retrieved 2026-10-28
[17] — sharp, Output options — https://sharp.pixelplumbing.com/api-output — retrieved 2026-10-28
[18] — W3C, Understanding SC 1.1.1 Non-text Content — https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html — retrieved 2026-10-28
[19] — W3C, Understanding SC 1.4.5 Images of Text — https://www.w3.org/WAI/WCAG22/Understanding/images-of-text.html — retrieved 2026-10-28
[20] — W3C, Understanding SC 4.1.3 Status Messages — https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html — retrieved 2026-10-28
[21] — OWASP, File Upload Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html — retrieved 2026-10-28
[22] — Next.js 16.4.1, Image Component (local docs shipped in the checkout) — `node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md` — read 2026-10-28
[23] — Next.js 16.4.1, Image Optimization getting started (local docs) — `node_modules/next/dist/docs/01-app/01-getting-started/12-images.md` — read 2026-10-28
[24] — Next.js 16.4.1, Self-hosting (local docs) — `node_modules/next/dist/docs/01-app/02-guides/self-hosting.md` — read 2026-10-28
[25] — Next.js 16.4.1, Server Actions, body size limit (local docs) — `node_modules/next/dist/docs/01-app/02-guides/server-actions.md` — read 2026-10-28
[26] — Next.js 16.4.1, image optimizer source (`res.setHeader('Vary', 'Accept')`) — `node_modules/next/dist/server/image-optimizer.js:843` — read 2026-10-28
[27] — Next.js 16.4.1, Deploying to platforms (local docs, `sharp` requirement) — `node_modules/next/dist/docs/01-app/02-guides/deploying-to-platforms.md` — read 2026-10-28
[28] — MDN, XMLHttpRequest.upload — https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/upload — retrieved 2026-10-28

## 6. Automations: what should run without a click

### Findings

#### The action layer exists; the trigger, condition and record layers do not

Every effect an automation would want is already a named, injectable function — and every one already runs unconditionally after a commit.

- `CatalogEffects` declares `reindexProducts`, `removeProductFromIndex`, `revalidateCatalog` and `deleteImages`, with production adapters that call Meilisearch and Cloudflare [6]. The document projection (`toIndexableProduct`) and the index writer exist and are tested [7].
- After a Commande commits, the order module runs, in order, `sendOrderPlacedEmail`, `invalidateCommande` then `invalidateProduits` [3]; `sendOrderStatusEmail` is already keyed on `OrderStatus` labels [4].
- Edge purge is a port with a Cloudflare adapter, credential detection, 100-URL batching and a 5 s timeout budget [8][9]; tag → URL mapping with a "purge everything" fallback lives in one module [5].
- Those effects are **best-effort by construction**: `runEffect` awaits the function in a `try/catch` that only calls `console.warn`, and `runOrderedEffects` continues after a failure [2]. ADR-0014 made that the deliberate boundary and deferred "Outbox / background worker", with the invariant "No schema change, no queues/outbox" [1].

So the missing machinery is not the actions. It is the **trigger** (which event, on which entity), the **condition**, the **record** (did it run, can it be replayed) and the **clock**.

#### What is absent, and one false assumption

| Candidate | Trigger | Condition | Action | Status |
|---|---|---|---|---|
| Order status → customer email | `order.status.changed` | status set matches | Resend | **exists** [3][4], no retry, no record |
| Meilisearch reindex | `product.*` | document changed | `reindexProducts` | **exists** [6][7], no reconciler |
| CDN purge | same + deploy | URL set non-empty | `purgeEdge` | **exists** [8][9][5] |
| Low-stock alert | nightly tick | `stock <= 5` | owner email | **missing**, dashboard query only [12] |
| Daily/weekly digest | cron | window has orders | reuse aggregates | **missing**, aggregates exist [12] |
| Back-in-stock | stock 0 → >0 | subscriber exists | email | **missing**, no entity [10] |
| Abandoned cart | `CartItem.updatedAt` age | user has email | email | **missing**, cart is SQL [10] |
| Scheduled publishing | clock | `publishedAt <= now` | flip `statut` | **broken by design** [11] |
| Price schedule | clock | change due | update `price` | **missing**, no history [10] |
| Outbound webhook | any event | URL configured | POST | **missing** |

Three corrections:

- **The cart is not in Redis.** `CartItem` is a Prisma model with a `(userId, variantId)` unique key [10]. Redis holds the Next.js remote ISR cache handler and the search rate limiter — a derived, rebuildable store.
- **Scheduled publishing cannot work as data alone.** `ArticleBlog` carries `statut: StatutPublication` and `publishedAt`, indexed on `[statut, publishedAt]` [10], but the public reads filter `statut: "publie"` and `publishedAt: { not: null }` — never `publishedAt <= now()` [11]. A future-dated article is visible immediately. There is also no admin surface for the blog: `app/admin/` holds `produits`, `categories`, `commandes`, `livraison`, `villes` [13].
- **Products have no publication concept.** `Product` has no status or publication date [10]; "scheduled publishing of products" is a schema decision before it is an automation.

#### Ranked by value over effort, for one COD store

1. **Reliability of the four order effects** — retry and record; a lost confirmation is invisible today [1][2], and nothing else can be trusted before this.
2. **Low-stock digest, daily** — query and threshold exist [12]; near-zero effort, direct COD revenue protection.
3. **Meilisearch reconciliation, nightly** — the incremental path drifts silently; projection exists [7].
4. **Daily owner digest** — orders, revenue, pending, low stock; aggregates exist [12].
5. **Abandoned cart reminder** — SQL plus email, but needs an unsubscribe story first.
6. **Back-in-stock** — good lever, needs a subscriber table with double opt-in.
7. **Scheduled publishing** — a time gate in the read model, not an automation: one predicate, zero infrastructure.
8. **Outbound webhook** — no consumer named today.
9. **Price schedule** — low value by hand, high cost (price history first).
10. **Order-status email as new work** — zero: it exists; its real work is items 1 and 5.

#### What Shopify Flow and Medusa document

**Flow's model is three nouns plus a template.** A trigger starts, conditions decide, actions execute; a template is a copyable example, and **conditions are not developer-extensible** — "As a developer you cannot create a condition task" [21]. Useful boundary: let the merchant compose conditions from a closed vocabulary, never invent a predicate shape.

**Flow's run history is the UX to copy literally**: run status among `In progress`, `Waiting`, `Rate limited`, `Canceled`, `Completed`; results and per-step errors; linked retries; trigger type `Trigger event`/`Manual trigger`/`Manual retry`; filters on text, errors, actions taken, time, retry status and run ID; **14-day** retention; and disabling a workflow cancels its in-progress runs [22].

**Flow documents what outbound HTTP costs**: a 30 s wait for a response code, `4XX` and `5XX`/`429` each configurable as Retry (up to 24 h), Fail or Ignore, and secrets kept in a separate store, referenced as `{{secrets.handle}}` and redacted from run logs [23].

**Flow prices arbitrary JavaScript at six limits.** `Run code` is ECMA2020 only, cannot import modules, **cannot `fetch`**, cannot use random or clock functions, and is capped at 5 s, 10 MB, 50 KB of output plus `console.log`, 50 000 characters of code, 5 000-character schemas [24].

**Medusa separates the engine from its store, and says what that costs.** Workflows are steps with rollback logic and a tracked internal representation [25]; long-running ones continue in the background and are observed by subscribing to status changes [33]. Steps take `maxRetries`, `retryInterval`, `autoRetry: false` for manual retry, and `retryIntervalAwaiting`/`maxAwaitingRetries` for async steps — with an explicit warning that a waiting step may execute again while a previous execution is still running, so it must be side-effect free [26]. Durability is a property of the store: the in-memory module "keeps scheduled retries in memory, so the Medusa application loses them when it restarts", and Redis is the production module [26][27]. Same failure mode as `after()`, one abstraction up.

#### The execution engine on *this* deployment

The `runner` target copies only the standalone build and static assets [14]; the `migrate` target copies the whole context and already runs a one-shot script [13]; sidecars are Postgres 16, Redis 7, Meilisearch; Node is pinned as `22` in `.nvmrc` [15]; deploys are Coolify's webhook with `migrate` before the app [17].

| Option | Extra containers | Durable across restart | Retries | Cron | Same image, other command |
|---|---|---|---|---|---|
| (a) `after()` + external cron | 0 | **no** | none | external | n/a |
| (b) BullMQ 6.5.0 MIT [42] | 1 new process | as durable as Redis | backoff + jitter [28] | Job Schedulers; `repeat` removed in v6 [29] | needs worker JS in image |
| (c) pg-boss 12.38.0 MIT [42] | 0 | **yes, same Postgres** | backoff + DLQ with redrive [30] | cron and RRULE [30] | needs worker JS in image |
| (d) Inngest 4.26.1 | 1 (+ PG/Redis for prod) | yes, with Postgres [31] | built in | built in | needs `/api/inngest` |
| (e) Trigger.dev v4 | webapp + worker + own PG/Redis + registry [32] | yes | built in | built in | deploys task code as its images |
| (f) n8n 2.45.5 | 1 (+ its DB) | yes | built in | built in | runs workflows, not your code |
| (g) Activepieces / Windmill | 1 each (+ DB) | yes | built in | built in | same class as n8n |
| (h) Temporal | server + UI + PG + Elasticsearch [38] | yes | built in | built in | you still write a worker |

**`after()` is not an engine, and the docs say why.** It runs after the response, for "the platform's default or configured max duration of your route" [18]. Self-hosted `next start` flushes pending callbacks on graceful shutdown with a recommended **10–30 s** drain [19], and `maxDuration` is a value "deployment platforms can use" to impose limits, not something `next start` enforces [20]. The bound is process lifetime plus a drain window: no persistence, no retry, no record, and an OOM kill drops the work silently.

**Redis here is a cache, and business events should not live in it.** The ISR handler keeps a tag manifest with a 30-day TTL cap and the limiter keeps counters — both rebuildable by definition. The compose service declares a volume but no `command:` override [13], so persistence is whatever the image defaults to. (Whether that default enables AOF is **unverified**; `redis-server --help` in the image would settle it.)

**Trigger.dev and Inngest are real engines and wrong-sized.** Trigger.dev self-hosted is a webapp container (dashboard plus its own Redis and Postgres) and a worker container (supervisor and runners); it builds and deploys your task code into its own images, and self-hosted loses checkpoints, warm starts and auto-scaling [32]; the platform is Apache-2.0 [16]. Inngest is one container, but `inngest start` is flagged **[Beta]**, defaults to SQLite and an in-process Redis, and "does not automatically delete old database rows" [31]. Both add a second scheduler, a second dashboard and a second answer to "what ran?".

**n8n's licence is not the blocker; its shape is.** The Sustainable Use License permits use "only for your own internal business purposes or for non-commercial or personal use", forbids redistributing except free of charge for non-commercial purposes, reserves `.ee` files for the Enterprise licence, and n8n does not call itself open source [34]. Running it for eguidar's own shop is inside those terms. But its unit is a workflow of nodes with its own execution model — two execution lists, manual versus production modes, redaction, credentials the viewer cannot see [35] — a second admin UI holding the shop's rules outside the repo and outside review. Activepieces (MIT except `packages/ee/`) [36] and Windmill (AGPLv3 plus proprietary Community-Edition code; internal use needs no commercial licence, reselling does) [37] are the same trade with different licences. Temporal is the industrial version of the same mistake here: server, UI, Postgres, Elasticsearch and manual schema management with `admin-tools` [38].

**pg-boss is the fit.** It runs on `SKIP LOCKED`, which PostgreSQL documents as unsuitable for general work but correct "to avoid lock contention with multiple consumers accessing a queue-like table" [39]. It creates jobs **inside an existing transaction**, ships a Prisma adapter, and offers cron/RRULE scheduling, dead-letter queues with redrive, exponential backoff and `LISTEN/NOTIFY` [30]. It requires Node ≥ 22.12 and PostgreSQL ≥ 13 [30], satisfied by `node:22-alpine` and `postgres:16-alpine` [13] — though `.nvmrc` says only `22` [15], so the patch floor is implied, not stated.

The decisive argument is transactional: `placeOrder` and `updateOrderStatus` already open a transaction that knows which variants moved [3], so an outbox `INSERT` there is one line and no new failure mode, whereas a Redis `ADD` after commit is the dual write the outbox exists to remove.

**Running the tick without a third container.** `instrumentation.ts` exports `register`, "called **once** when a new Next.js server instance is initiated, and must complete before the server is ready to handle requests" [43] — a loop may be *started* there, never awaited. With `SKIP LOCKED`, several replicas can run it safely. Alternatively a Coolify scheduled task documents `command`, `frequency`, `container`, `timeout` (default 300 s, max 36 000 s) and `enabled` [41] — a cron executing a command inside a container of the deployed app, the same shape as the existing `purge-edge` one-shot [13]. Use the Coolify task when the app itself is crash-looping; use `register` for latency-sensitive ticks.

#### Plumbing rules, small enough for one operator

- **One table, one writer.** The mutation inserts the row; only the worker updates it. Payload is immutable JSON plus `type`, `entityType`, `entityId`, `occurredAt`, `expiresAt`.
- **At-least-once, dedupe at the edge.** Medusa documents the hazard from the other side: a step may re-execute while a previous run is still in flight, so it must not create duplicates [26]. Two layers: a unique index on `(type, entityId, attemptOf)`, and a provider idempotency key. Resend documents `Idempotency-Key` as `<event-type>/<entity-id>`, remembered **24 hours**, returning `409 invalid_idempotent_request` for the same key with a different payload and `409 concurrent_idempotent_requests` while one is in flight [40]. That window is why the outbox needs `expiresAt`: a retry three days later cannot rely on the provider to dedupe.
- **Ordering per entity, not globally.** Claim `ORDER BY "entityId", "seq"` and process one entity at a time; global FIFO buys nothing and serialises the shop.
- **Replay is a status change, and failures are visible.** Keep `payload` immutable, reset `status`, increment `attempt`; past `maxAttempts` the row becomes `failed` with its last error and appears in history — what Flow records as `Manual retry` [22]. Replacing ADR-0014's warning-only boundary is the point [1].

### What this implies for eguidar

**v0 — repair the seam, no new infrastructure.** Keep `runOrderedEffects`; make each effect return an outcome, and log it as a row. Fix the two defects the current code makes inevitable: a lost email leaves no trace [2], and a future `publishedAt` publishes immediately [11] — add `publishedAt: { lte: new Date() }` to each public blog read path. Then ship the two automations that need no machinery — a nightly low-stock digest (query and `LOW_STOCK_THRESHOLD = 5` exist [12]) and a Meilisearch reconciliation [7] — on a Coolify task or a `register` loop.

**v1 — declarative rules, outbox, one worker loop.** Amend ADR-0014 with a successor (`docs/adr/0044-des-effets-post-commit-durables.md`, renumbered from 0041 when the auth ADRs took 0041–0043) that supersedes only the "no queues/outbox" invariant; the per-entity `*Effects` types and the best-effort boundary for non-critical effects stay. Entities: `AutomationEvent` (outbox), `AutomationRun` (`ruleId`, `eventId`, `status`, `attempt`, `lastError`, `startedAt`, `finishedAt`), `AutomationRule` (`nom`, `actif`, `declencheur`, `condition Json`, `action`, `actionConfig Json`). Files: `lib/automations/outbox.ts` (`enregistrerEvenement(tx, …)`), `regles.ts` (closed Zod vocabulary), `executeur.ts` (claim, execute, record), `actions/{email,index,digest,webhook}.ts` wrapping existing adapters [3][6][8], `app/api/automations/tick/route.ts` behind a bearer secret, `scripts/automations-tick.mjs`. Rules are seeded in code.

**v2 — merchant-editable rules.** `app/admin/automatisations/page.tsx` (list: déclencheur → condition → action, `Activer`/`Désactiver`), `app/admin/automatisations/[id]/page.tsx` (editor, `Exécuter maintenant`, `Simulation`), `app/admin/automatisations/executions/page.tsx` (statut, erreur, `Réessayer`, filters). Add `AutomationRuleRevision` (snapshot JSON, author, timestamp) for the audit trail, and a `Simulation` that evaluates the condition on a real entity and renders "would send / would skip" without writing a run. Copy Flow's statuses and retention [22], and n8n's manual-versus-production split so a test run is visibly not production [35].

**What the page must forbid.** Arbitrary JavaScript: Flow, with a real sandbox, still documents no `fetch`, no imports, no clock, 5 s, 10 MB, 50 KB [24], and eguidar has no sandbox. Unbounded fan-out: one entity per event, any batch action carrying an explicit `limite` (the purge port batches at 100 URLs [8]). Secrets in rules: store an env var *name*, as Flow keeps secrets separate and redacts them from logs [23]. Rules that write to the table their own trigger watches: `declencheur` is an allow-list so the loop cannot be expressed.

### Rejected options

- **`after()` as the engine** — no durability, no retry, no history; bounded by route duration and a 10–30 s drain [18][19][20].
- **BullMQ on the existing Redis** — Redis here is a cache and a limiter, both rebuildable; `repeat` was removed in v6 [29], so most examples are stale; and adding after commit is a dual write.
- **Inngest, Trigger.dev, Temporal self-hosted** — footprint and a second source of truth [31][32][38]; Trigger.dev would also build and host our task code in its own images.
- **n8n, Activepieces, Windmill as the host, and merchant-authored JavaScript** — licences permit internal use [34][36][37], but rules would live outside the repo and review [35], and the sandbox cost is documented by the one vendor that built one [24].

### Open questions

1. Who receives the digest, at what hour, and is `ADMIN_EMAIL` the only address [13]?
2. Do we accept customer-facing email (abandoned cart, back-in-stock), and with which consent and unsubscribe story?
3. Do products need a publication status and date, or is "draft" simply "not created yet" — the blog answered this differently [10][11]?
4. Who may toggle a rule: the owner only, or any admin session? The audit trail needs an author identity.

### Sources

[1] — ADR-0014, Encapsulated domain mutation effects — `docs/adr/0014-encapsulated-domain-mutation-effects.md` (local checkout) — retrieved 2026-10-28
[2] — `lib/use-cases/mutation-squelette.ts` — local checkout — retrieved 2026-10-28
[3] — `lib/use-cases/orders.ts` — local checkout — retrieved 2026-10-28
[4] — `lib/emails.ts` — local checkout — retrieved 2026-10-28
[5] — `lib/use-cases/cache-invalidation.ts` — local checkout — retrieved 2026-10-28
[6] — `lib/use-cases/admin-catalog.ts` (`CatalogEffects`) — local checkout — retrieved 2026-10-28
[7] — `lib/index-projection.ts`, `lib/meili.ts` — local checkout — retrieved 2026-10-28
[8] — `lib/purge-edge.ts` — local checkout — retrieved 2026-10-28
[9] — `lib/purge-edge-cloudflare.ts` — local checkout — retrieved 2026-10-28
[10] — `prisma/schema.prisma` — local checkout — retrieved 2026-10-28
[11] — `lib/use-cases/blog.ts` — local checkout — retrieved 2026-10-28
[12] — `lib/use-cases/admin-dashboard.ts` — local checkout — retrieved 2026-10-28
[13] — `docker-compose.yml` — local checkout — retrieved 2026-10-28
[14] — `Dockerfile` — local checkout — retrieved 2026-10-28
[15] — `.nvmrc` — local checkout — retrieved 2026-10-28
[16] — Trigger.dev, LICENSE (Apache License 2.0) — https://raw.githubusercontent.com/triggerdotdev/trigger.dev/main/LICENSE — retrieved 2026-10-28
[17] — ADR-0020, CI in GitHub Actions, deployment with Coolify — `docs/adr/0020-ci-github-actions-deployment-coolify.md` (local checkout) — retrieved 2026-10-28
[18] — Next.js 16.4.1 docs, `after` (bundled) — `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md` — retrieved 2026-10-28
[19] — Next.js 16.4.1 docs, Self-hosting, §`after` (bundled) — `node_modules/next/dist/docs/01-app/02-guides/self-hosting.md` — retrieved 2026-10-28
[20] — Next.js 16.4.1 docs, `maxDuration` (bundled) — `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/maxDuration.md` — retrieved 2026-10-28
[21] — Shopify, About Flow — https://shopify.dev/docs/apps/build/flow — retrieved 2026-10-28
[22] — Shopify, Finding and monitoring workflow runs — https://help.shopify.com/en/manual/shopify-flow/monitor — retrieved 2026-10-28
[23] — Shopify, Send HTTP request — https://help.shopify.com/en/manual/shopify-flow/reference/actions/send-http-request — retrieved 2026-10-28
[24] — Shopify, Run code — https://help.shopify.com/en/manual/shopify-flow/reference/actions/run-code — retrieved 2026-10-28
[25] — Medusa, Workflows — https://docs.medusajs.com/learn/fundamentals/workflows — retrieved 2026-10-28
[26] — Medusa, Retry Failed Steps — https://docs.medusajs.com/learn/fundamentals/workflows/retry-failed-steps — retrieved 2026-10-28
[27] — Medusa, Workflow Engine Module — https://docs.medusajs.com/resources/infrastructure-modules/workflow-engine — retrieved 2026-10-28
[28] — BullMQ, Retrying failing jobs — https://docs.bullmq.io/guide/retrying-failing-jobs — retrieved 2026-10-28
[29] — BullMQ, Repeatable (deprecated, removed in v6) — https://docs.bullmq.io/guide/jobs/repeatable — retrieved 2026-10-28
[30] — pg-boss, README — https://github.com/timgit/pg-boss — retrieved 2026-10-28
[31] — Inngest, Self-hosting — https://www.inngest.com/docs/self-hosting — retrieved 2026-10-28
[32] — Trigger.dev, Self-hosting overview — https://trigger.dev/docs/self-hosting/overview — retrieved 2026-10-28
[33] — Medusa, Long-Running Workflows — https://docs.medusajs.com/learn/fundamentals/workflows/long-running-workflow — retrieved 2026-10-28
[34] — n8n, Community license (Sustainable Use License) — https://docs.n8n.io/choose-n8n/faircode-license/ — retrieved 2026-10-28
[35] — n8n, Understand executions — https://docs.n8n.io/workflows/executions/ — retrieved 2026-10-28
[36] — Activepieces, LICENSE (MIT except `packages/ee/`) — https://raw.githubusercontent.com/activepieces/activepieces/main/LICENSE — retrieved 2026-10-28
[37] — Windmill, LICENSE (AGPLv3 plus proprietary Community Edition) — https://raw.githubusercontent.com/windmill-labs/windmill/main/LICENSE — retrieved 2026-10-28
[38] — Temporal, Deploying a Temporal Service — https://docs.temporal.io/self-hosted-guide/setup — retrieved 2026-10-28
[39] — PostgreSQL 16, SELECT / The Locking Clause (`SKIP LOCKED`) — https://www.postgresql.org/docs/16/sql-select.html — retrieved 2026-10-28
[40] — Resend, Idempotency Keys — https://resend.com/docs/dashboard/emails/idempotency-keys — retrieved 2026-10-28
[41] — Coolify, Create scheduled task (API reference) — https://next.coolify.io/docs/api/endpoints/scheduled-tasks/create-scheduled-task-by-application-uuid — retrieved 2026-10-28
[42] — npm registry metadata read via `npm view` on 2026-10-28: `bullmq` 6.5.0 MIT, `pg-boss` 12.38.0 MIT, `inngest` 4.26.1 Apache-2.0, `@trigger.dev/sdk` 4.8.1 MIT, `n8n` 2.45.5 (SEE LICENSE IN LICENSE.md) — https://registry.npmjs.org/ — retrieved 2026-10-28
[43] — Next.js 16.4.1 docs, `instrumentation.js` (bundled) — `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md` — retrieved 2026-10-28

## 7. Roadmap

Sizes are relative (S / M / L) to this codebase, not calendar estimates. Every phase is independently
shippable and leaves the shop working.

### Phase 0 — Repair what is already broken (S)

1. **Gate public blog reads on the clock.** Every public read adds `publishedAt: { lte: new Date() }`
   (landing, detail, related articles). Today a future-dated article is visible immediately, and the
   landing page even admits `publishedAt: null` rows and filters them in memory with a warning. This
   is a read-path predicate, not a job — it does not need the automation engine.
2. **Replace the browser `confirm()` in `delete-product-button.tsx`** with a Base UI `AlertDialog`
   that names the product (WCAG 3.3.4, and the category delete already does it this way).
3. **Fix the shared data-table kit:** a label for the toolbar search, pressed/checked semantics on
   the faceted filters, and a polite live region for result and selection counts. This benefits
   *Commandes* immediately.
4. **Check in an R2 CORS artifact** next to `infra/regle-cycle-vie-r2.json`, and make
   `scripts/setup-providers.sh` apply and verify it. Today a fresh bucket fails in the browser with
   no server trace.
5. **Log effect outcomes structurally** (type, entity, outcome, duration) instead of only
   `console.warn`. No schema change yet; this is the seed of the run history in Phase 4.

**Exit criteria:** a future-dated article is neither listed nor reachable; deleting a product names
it in a dialog; no unlabelled or unannounced control on the admin lists; uploads succeed against a
fresh bucket; a failed effect is greppable by entity id.

### Phase 1 — A real product list (M)

- Extend `listAdminProducts` into `{ produits, totalCount, pageCount }` via
  `prisma.$transaction([findMany, count])`, mirroring `runListAdminOrders`.
- Add `lib/produit-listing.ts` (URL grammar), `use-produit-listing.ts` (debounce + echo),
  `produits-table.tsx` (TanStack manual modes + the existing kit). Filters: text (name, brand, slug,
  variant SKU), Structure (including *sans structure*), *mis en avant*, *livraison offerte*, stock
  zero / non-zero. Sort: name, price, stock, created.
- Bulk actions, one Server Action each: set Structure, set featured, set free shipping, delete.
  Return a partial-failure report; do not offer bulk price or stock.
- Row menu: *Modifier*, *Dupliquer* (no images copied — those URLs are R2 keys), feature/free-shipping
  toggles, *Supprimer* with the dialog from Phase 0.
- Empty, loading and error states; result count in a live region.

**Exit criteria:** a 1,000-row seed behaves; reloading a URL reproduces the exact view; selection
survives page changes and is submitted as ids; a bulk write that fails on two rows reports which two;
the browser never receives the whole catalogue.

### Phase 2 — Product media becomes a library (L)

- Add `ImageProduit` (`publicUrl` unique, `mimeType`, `byteSize`, `width`, `height`, `alt`,
  `createdAt`, `createdBy`), written as an idempotent post-commit effect keyed by URL; backfill from
  `Product.images`.
- Verify after upload, not before: `HeadObject`, then a server decode (sharp) that yields real type,
  dimensions and size and strips EXIF; never trust the declared `Content-Type`.
- A media surface under `app/admin/medias/`: grid/list, search, *unused* and *no alt* filters, bulk
  select, detail drawer with usage count, copy URL. Deleting an asset still used by a product is
  refused with the list of products; the gallery keeps its existing "pending removals until save".
- Alt text per image, edited in the library and in the product gallery; the storefront uses it
  instead of the product name. Required at publish (see §8).
- Keep the gallery's existing before/after buttons and the `images[0]` cover; add the alt field to the same gallery.
- Thumbnails: prefer Cloudflare image transformations behind a custom `next/image` loader (the
  transformed URL is a render-time view and is never persisted); otherwise give every thumbnail
  explicit dimensions and a `sizes` value so the container does not decode 10 MB originals for 96 px.

**Exit criteria:** every published image has a registry row with real dimensions; deleting a used
asset refuses and names the products; alt text reaches the storefront DOM; the product LCP image is
marked (`preload`/`loading="eager"` + `fetchPriority="high"`); the admin grid never downloads an
original for a thumbnail.

### Phase 3 — An ordered Structure with move commands (M)

- Migration: `position Int @default(0)` and `@@index([parentId, position])`; backfill so the visible
  order is unchanged (ties keep the existing name order).
- One command, `deplacerStructure({ id, nouvelleParenteId, avantId })`, executed inside
  `sousVerrouDeStructure` and returning named refusals. The client never sends positions.
- Extend `LigneStructureAdmin` with `position` and a cumulative product count; expose `filAriane` as
  the destination path; make *hors arbre* repairable by returning the edge that closes the cycle.
- UI: expand/collapse on the existing table (TanStack expanding, `filterFromLeafRows` for search),
  *Monter / Descendre / Indenter / Désindenter*, *Déplacer sous…* with a searchable parent picker, one
  polite live region announcing « Déplacée sous X, position 2 sur 5 ».
- Amend ADR-0030 for the `(position, name, id)` comparator; leave ADR-0027 untouched.

**Exit criteria:** a keyboard-only user can reorder and reparent; no topology is computed in the
browser; concurrent moves still serialise; the storefront order and the admin order are the same
promise or explicitly documented as two; the delete-with-children tests remain green.

### Phase 4 — Automations v0 then v1 (L)

**v0, no new infrastructure:** the low-stock digest (query and threshold already exist), a nightly
Meilisearch reconciliation (the incremental path drifts silently), and optionally a daily owner
digest, run from a Coolify scheduled task or a loop started in `instrumentation.register`.

**v1, durable:** ADR-0044 supersedes ADR-0014's no-outbox invariant; add `AutomationEvent` (outbox,
inserted **inside** the mutation's transaction), `AutomationRun` (status, attempt, last error,
timestamps) and a closed rule vocabulary. Drain with **pg-boss** on the existing Postgres, either
from a worker command on the same image or from the tick loop; per-entity ordering, `SKIP LOCKED`,
backoff, dead-letter and redrive, and a Resend idempotency key for every email.

**Exit criteria:** killing the container mid-run still executes the event after restart; a duplicate
delivery does not send a second email; a failed run is visible with its error and can be retried; no
Redis write sits between commit and side effect.

### Phase 5 — Merchant-facing rules (M)

`app/admin/automatisations/`: rule list (trigger → condition → action), enable/disable, run history
with status and error, *Réessayer*, *Exécuter maintenant*, *Simulation* (evaluates on a real entity
without writing a run), and a revision log with author and timestamp. Rule actions are allow-listed;
secrets are referenced by environment-variable *name* and redacted from logs.

**Exit criteria:** the owner can add and disable a rule without a deploy; every run is attributable;
no rule can execute arbitrary code or reference a secret value.

### Deliberately deferred

Drag-and-drop (the buttons are mandatory regardless), spreadsheet-style inline editing, autosave,
bulk price/stock, product status/archive (until the owner decides, §8), customer-facing emails
(consent first), a second storage provider, and any external workflow platform.

## 8. Decisions requested

Each item changes scope. The recommendation is what the evidence supports; the consequence is what
changes if the owner decides otherwise.

1. **Archive or delete products?** Recommendation: keep confirmed hard delete in v1. Add a
   `status`/`deletedAt` only if "hide from the shop without losing the sheet" is a real need —
   it is a schema change every storefront read, the Meilisearch projection and the Structure counts
   must honour. Consequence: scheduled product publishing is impossible without this decision.
2. **Does the Structure's sibling order reach the storefront?** Recommendation: yes, one comparator
   everywhere; two different orders is the bug that gets reported. Consequence: the ADR-0030
   amendment covers the storefront, and its tests change.
3. **Drag-and-drop for the Structure and the gallery?** Recommendation: no in v1. Buttons are
   required by WCAG 2.5.7 even if drag exists, so DnD is a second path to build, test and announce.
4. **Is alt text required to publish?** Recommendation: yes for product images; warning-only in the
   library. Consequence: existing rows need a backfill policy; the storefront keeps the product-name
   fallback until an image is edited.
5. **Is the media library product-only in v1?** Recommendation: yes. Category and blog images are
   different owners (ADR-0004 leaves categories their own path) and can join later.
6. **Are Cloudflare image transformations enabled, and is `cdn.eguidar.com` a custom domain in the
   same zone?** If not, Phase 2's thumbnail strategy falls back to `next/image` with explicit
   dimensions, and the AVIF question is settled by `images.formats`.
7. **Who receives automations, and at what hour?** Internal digests only in v1. Customer-facing email
   (abandoned cart, back-in-stock) needs an unsubscribe and consent story before it exists.
8. **Who may toggle a rule, and is the audit author required?** Recommendation: owner only at first,
   with the admin session recorded on every revision.
9. **Is the bulk vocabulary confirmed?** Structure, featured, free shipping, delete. If bulk price
   is added, the design must carry per-row validation failures, not a single toast.

## 9. Method, limitations and source numbering

**Method.** Four research agents worked the four axes in parallel against primary sources: vendor
documentation (Shopify, Medusa, Saleor, BigCommerce, WooCommerce, Strapi, Payload, Cloudflare, Prisma,
TanStack, Base UI, pg-boss, BullMQ, Inngest, Trigger.dev, n8n), W3C specifications (WCAG 2.2
Understanding documents, WAI-ARIA Authoring Practices), npm/GitHub metadata, and — for every
Next.js/React claim — the documentation shipped in this checkout (`node_modules/next/dist/docs/`,
`node_modules/@base-ui/react/docs/`). No third-party blog was used as evidence. Each section was
written to its own file, then assembled here; the four parts total roughly 12,300 words.
**101 unique external URLs** are cited. 80 returned HTTP 200 to a plain `curl`; the other 21 are
canonical `w3.org` and `help.shopify.com` pages that block scripted clients (HTTP 403); two of
them were spot-checked through a browser-style fetch and returned 200. Any URL that does not resolve
is a defect worth reporting, but it is not evidence that the claim is wrong.

**Source numbering is scoped per section.** Citation `[3]` in §3 is not citation `[3]` in §4; each
section's **Sources** list is the authority for that section. This is deliberate: renumbering a
combined bibliography across four independent parts would have introduced transcription errors for
no reader benefit.

**Unverified, and what would settle each one:**

- Whether Postgres' `unaccent()` is `IMMUTABLE` in the deployed instance (needed before an expression
  index on the folded name): `SELECT provolatile FROM pg_proc WHERE proname = 'unaccent'`.
- Whether Prisma 7's schema language can express `UNIQUE NULLS NOT DISTINCT` (the draft skips the
  unique sibling constraint in v1 precisely because of this): `prisma validate` on a scratch schema.
- Saleor Dashboard's merchant-facing list UI (only its GraphQL API was verified).
- Whether Next.js 16.4.1 exposes a router-level navigation-blocking API (the absence of one in the
  local function reference is negative evidence, not a documented statement).
- Whether Prisma's `mode: "insensitive"` compiles to `ILIKE` specifically (the enum and case-folding
  behaviour were verified; the emitted SQL was not).
- Whether the `redis:7-alpine` default enables AOF, i.e. how durable a Redis queue would be.
- Coolify's behaviour for scheduled tasks missed while the container was down.
- Whether Cloudflare image transformations are enabled on the zone (see decision 6).
- Saleor's delete policy for categories with children, and react-arborist's keyboard re-parenting
  support (both only negative evidence from their docs).

**Not done, and not claimed.** No merchant interviews, no instrumented accessibility audit, no load
test, no measurement of the current optimizer or CDN. The recommendations are grounded in documented
behaviour and in the repository's own invariants; they are not a substitute for measuring the
deployed instance.
