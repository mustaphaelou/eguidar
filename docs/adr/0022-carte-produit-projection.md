# The Carte produit projection and the Produit URL have one owner

The set of facts a Produit shows when it is rendered in a list — its Carte produit — had no owner.
`ProductCard` (`lib/use-cases/storefront.ts`) and `SearchProductCard` (`lib/use-cases/search.ts`)
declared the same eight fields twice, a six-field suggestion type was re-declared privately inside a
client component, and four producers (the storefront read module, the blog read module, and two inline
Meilisearch hit-to-card maps) each re-decided the card's rules: which image, and — for the Produit lié
surface alone — whether an out-of-stock Produit is masked (#164). `ProductCardItem` was typed against
`ProductCard` yet called with a `SearchProductCard`, compiling only because the shapes happened to be
structurally identical. `/produit/<slug>` was hand-built in eight places, including the Données
structurées builder and page metadata. ADR-0013 already required display surfaces to receive computed
prices rather than re-derive them; the card was the surface that still reassembled its own facts.

## Decision

- **One neutral module owns the card**, `lib/carte-produit.ts`: no `"use client"`, no `@/lib/db`, no
  `next/headers`, no `server-only` — it is imported by client components and by server read modules.
- **One projection entry, over cooked facts.** Input: the identity facts (`id`, `name`, `slug`,
  `brand`), raw `images`, and already-computed `minPrice`, `totalStock`, `freeShipping`. The price and
  stock arithmetic stays in `lib/product-metrics.ts`, composed by each read module.
- **The rupture rule belongs to the projection, not the caller.** The masking option is typed so the
  return narrows: asking to show answers a total `CarteProduit`; asking to mask answers
  `CarteProduit | null`, null when nothing is purchasable. A Produit lié masks; the Catalogue and the
  Recherche do not.
- **`CarteProduit` is the single eight-fact type.** `ProductCard` and `SearchProductCard` are deleted.
  `SuggestionProduit` owns the suggestion row's narrower shape, declared server-side and imported by the
  client.
- **`ProduitLie` is an extension of `CarteProduit`** carrying the first available `varianteId`, enriched
  by the blog read path that already holds the Variantes.
- **The module owns the Produit URL write language.** `urlProduit(slug)` answers the relative path;
  `${site.url}` composition stays with the Données structurées builder, as it already does for
  breadcrumbs, and `pageMetadata` keeps taking a relative `path`.
- **The Document d'index keeps its own metrics.** `toIndexableProduct` continues to compute
  `minPrice`/`totalStock` at reindex time, and the Recherche hit carries them cooked.

## Considered Options

- **Fold the Document d'index into the same module** — rejected: ADR-0013 sanctions the index's own
  reindex-time metrics, and a Document d'index is a search document, not a Carte produit.
- **Let the caller drop an out-of-stock card** — rejected: the mask would be re-decided at every
  consuming surface, which is the defect this decision removes.
- **Two named projections (card / masked card)** — rejected: one projection with a typed option keeps a
  single implementation while each caller's return type still tells the truth.
- **Carry the first available Variante on every card** — rejected: only the Produit lié surface has an
  add-to-cart control, so the fact would travel unused everywhere else.
- **Absolute URLs from the module** — rejected: the JSON-LD builder already composes `${site.url}`
  around relative hrefs for breadcrumbs, and `pageMetadata` takes a relative `path`.

## Invariants

- Every rendered Carte produit comes from the projection; no surface reassembles a Produit's card facts.
- A Produit lié whose total stock is zero does not appear as a Carte produit; the Article de blog stays
  published.
- The Carte produit module never touches the database and never enters a server-only import graph.
- `/produit/<slug>` is written by one function.
- The Document d'index remains the only place that computes search-time product metrics.
