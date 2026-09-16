# The Recherche engine crosses a seam; Meili stays inside its adapter

`searchProducts` (`lib/use-cases/search.ts:138-245`) and `searchSuggestions` (`:269-313`) resolved
their engine from an environment singleton: `getMeiliSearch()` (`lib/meili.ts:9-17`) reads `MEILI_URL`
and answers an unbranded `null` without it, so both callers returned an `emptyResult` (`:158-159`,
`:274-275`) that no test covered. A configured-but-unreachable engine behaved differently again — its
rejection escaped both pages with nothing to catch it and no `error.tsx` in `app/` — so an outage had
two faces and no owner. Meili's own facts were entangled with the Recherche's: filter syntax, the sort
array, `attributesToRetrieve`, the index name and the SDK call lived beside the query orchestration,
the four facet queries and the pagination clamp. Because the page query asks with `limit`/`offset`, the
engine answers `estimatedTotalHits`, which the module renamed `totalHits` and the results header
printed as an exact « N produits ». And none of it ran on CI: every assertion about facets, filters,
sorts and pagination sat behind `describe.runIf(!!meili)`, while the CI test job starts Postgres only.

## Decision

- **One neutral module owns the seam**, `lib/moteur-recherche.ts`: `MoteurRecherche`, `RequeteMoteur`,
  `ReponseMoteur`. No `"use client"`, no `@/lib/db`, no `next/headers`, no `server-only`, no
  `meilisearch` — it speaks the Recherche's vocabulary (`SearchFilters`, `SearchSort`, `SearchFacet`,
  `IndexableProduct`), and a frontière guard keeps it that way.
- **One operation.** `chercher(requete)` takes the query, the Filtres de recherche, the tri, the page
  and its size, and the facets to count; it answers Documents d'index, the total and the per-facet
  repartitions. `searchProducts` keeps its traffic — one page query plus three count queries at
  `taille: 0` — and `searchSuggestions` keeps its single query.
- **Meili stays inside its adapter**, `lib/meili.ts`, which owns `buildSearchFilter`, `SORT_TO_MEILI`,
  `attributesToRetrieve`, `PRODUCTS_INDEX` and the SDK call. Its index-management exports
  (`ensureProductsIndex`, `indexProductDocuments`, `deleteProductDocument`) are unchanged and remain
  the production adapters of ADR-0014's effects seams (`admin-catalog.ts:60-62`,
  `admin-structure.ts:31`).
- **ADR-0016's rule is owned above the seam.** `retirerFacette(filtres, facette)` is pure and strips a
  facet's own clause before its count query; an adapter applies exactly the filters it is given, so the
  keep-every-option-countable rule has one implementation rather than one per engine.
- **The production adapter is an optional override** defaulting to production — the ADR-0014 effects
  and ADR-0018 port idiom — so the three call sites (`produits/page.tsx:43`, `recherche/page.tsx:60`,
  `suggestions/route.ts:11`) pass nothing.
- **Documents d'index cross the seam cooked.** The hit carries the `minPrice`/`totalStock` computed at
  reindex time (ADR-0013, ADR-0022); no adapter re-derives a price or a stock.
- **Unavailability is a typed answer, and its rendering is frozen.** The seam distinguishes an
  unavailable engine from an empty Catalogue; the Meili adapter answers unavailable both when
  `MEILI_URL` is absent and when the engine call rejects; the use-cases keep their `SearchPageData` /
  `SearchSuggestionsData` shapes, so every surface still renders « 0 produit ». Surfacing the outage to
  the Visiteur is a later product decision with its own copy.
- **The total stays the engine's estimate.** `estimatedTotalHits` keeps that meaning at the seam.

## Considered Options

- **A Meili-shaped interface** (query object in, raw `SearchResponse` out) — rejected: the in-memory
  engine would have to interpret Meili's filter language and, to keep the existing assertions true,
  imitate typo tolerance, accent-insensitivity and relevance ranking. Its fidelity, not the module
  under test, would become the ceiling of every green CI test.
- **Inject the engine at the page boundary** — rejected: every caller would learn the dependency,
  which ADR-0014 explicitly rejected server-side.
- **The Panier split** (`lib/recherche-coeur.ts` + a composition entry `lib/recherche.ts`) — rejected:
  `search.ts` already is the entry point and nothing pulls it into a client graph, so the split would
  add files without moving a fact.
- **The in-memory engine only, deleting the Meili suites** — rejected: typo tolerance, accents and
  ranking are Meili's semantics, and those suites are their only pin.
- **One contract suite parameterised over both engines** — rejected: the two engines genuinely differ
  on ranking and typo semantics, so a shared contract would be their intersection — weaker than two
  suites with distinct jobs, as `panier-coeur.test.ts` and `panier.test.ts` already demonstrate.
- **An exact count now** (`page`/`hitsPerPage` instead of `limit`/`offset`) — deferred: it can move the
  printed number and the page clamp, so it is a user-visible change deserving its own decision.
- **Surfacing the outage to the Visiteur now** — deferred: new copy and a new domain term, a product
  decision rather than a seam decision.

## Invariants

- The interface never speaks Meili: no filter string, no sort array, no index name and no SDK type
  crosses it.
- Hits are Documents d'index whose metrics were cooked at reindex time; no adapter recomputes them.
- Every facet count is produced by the one pure rule above the seam (ADR-0016).
- Index writes stay with ADR-0014's effects; this seam carries no write operation.
- An absent engine and a rejecting engine answer the same typed fact, and the rendered result is
  unchanged by that typing.
- The count shown to the Visiteur remains the engine's estimate until a separate decision says
  otherwise.
