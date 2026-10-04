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

## Amendement — La décision était juste, et le service qu'elle supposait manquait (#535)

L'option écartée à la [L56](#L56) — « the in-memory engine only, deleting the Meili suites » — l'a
été pour une raison qui s'est révélée exacte : la tolérance aux fautes, les accents et le classement
sont bien la sémantique de Meilisearch, et ces deux suites en étaient le seul épinglage. **La
décision n'a pas à être reprise.** Ce qui n'était pas juste est ailleurs, et l'ADR le disait déjà :
la CI démarrait PostgreSQL et lui seul. Sans `MEILI_URL`,
[`getMeiliSearch`](../../lib/meili.ts#L18-L26) rend `null`, et les blocs
`describe.runIf(!!meili)` sont **[sautés](../../lib/meili.test.ts#L43)**, jamais exécutés. Les deux
suites que la décision comptait étaient `lib/meili.test.ts` et `lib/use-cases/search.test.ts` ; il y en
a aujourd'hui cinq, toutes sur la même porte. Le double avait donc la qualité du seul épinglage que
la décision croyait avoir, sans jamais l'exercer — une suite verte qui ne prouvait rien.

Ce n'était pas une économie : [`test/setup.ts`](../../test/setup.ts) charge `.env`, donc le moteur
tourne à chaque `npm test` en développement. La CI était le seul endroit où la Recherche ne
rencontrait aucun moteur, et elle le rendait verte quand même.

### Le préalable, et où il se trouve

Ce que la CI ne voyait ne se voit plus depuis que le moteur y a un service : le commit
[`4cf3f24`](../../.github/workflows/ci.yml), « Le Moteur de recherche reçoit son service en CI ».
Il ajoute à `.github/workflows/ci.yml` vingt-deux lignes — un service `meilisearch`
(`getmeili/meilisearch:v1.52`, le `health-cmd` de `docker-compose.yml`) à côté de PostgreSQL, plus
`MEILI_URL` et `MEILI_MASTER_KEY` dans l'environnement du poste `test`.

**Cet amendement n'est pas vrai sans lui.** Sans ce service, le poste `test` ne démarre aucun
moteur : `getMeiliSearch` y rend `null`, les cinq blocs `describe.runIf(!!meili)` sautent comme
avant, et cet amendement décrirait un épinglage que rien n'exerce.

Ce que le dépôt en retient — ce qui est poussé, ce qui ne l'est pas, l'existence d'une demande de
fusion — ne se consigne pas ici : cela devient faux au premier envoi, et une décision qui affirme
un état de gestion de versions cesse de l'être sans que personne ne l'ait relue. L'état du dépôt
tient dans le message de commit et dans la description de la demande de fusion, où il est vrai le
jour où on le lit.

### Ce qui est maintenant épinglé

Trois réglages que le Visiteur voit et que le moteur appliquait sans que rien ne les écrive sont
désormais écrits par [`ensureProductsIndex`](../../lib/meili.ts#L101-L134) et relus sur un moteur
vivant : `typoTolerance`, `pagination.maxTotalHits`, et `faceting.maxValuesPerFacet` /
`sortFacetValuesBy`. Les valeurs sont celles que v1.52 appliquait déjà — les écrire ne change rien
de visible, cela retire seulement qu'une montée de version les change en silence.

Deux autres mesures complètent l'épinglage, chacune à l'endroit où elle seule peut se poser :

- **La stratégie de correspondance**, sur un moteur vivant
  ([`lib/meili-correspondance.test.ts`](../../lib/meili-correspondance.test.ts#L93)) — exigence des
  trois termes, contrôle négatif compris, faute de frappe préservée, casse et accents repliés.
- **L'ordre des suggestions de catégories, sur les deux moteurs** —
  [`search-memoire.test.ts:693`](../../lib/use-cases/search-memoire.test.ts#L693) et
  [`search-suggestions-meili.test.ts:96`](../../lib/use-cases/search-suggestions-meili.test.ts#L96).
  Même jeu, mêmes assertions, deux moteurs qui rendent leurs clés dans deux ordres différents : le
  test décrit la Recherche, pas un adaptateur.

### Les deux comportements qui étaient faux sous une suite verte

Ce sont deux **comportements** et non deux affirmations : ils se corrigeaient dans le code, et les
deux sont corrigés.

- **La stratégie de correspondance.** Le défaut du moteur, `last`, relâche : il retire les mots de
  la fin jusqu'à remplir une page. « samsung iphone » et « 128 Go 256 » rendaient donc des
  Produits, pendant que les suites du dépôt disaient le contraire — une suite intitulée « exige
  chaque jeton de la requête » affirmait une exigence que la production n'avait pas. Le défaut du
  moteur n'est plus laissé tel quel : [`MATCHING_STRATEGY`](../../lib/meili.ts#L79) vaut `all` et
  s'écrit sur **chaque** requête, la page comme les requêtes de facette — sans quoi les options de
  filtre compteraient sur une requête plus large que celle qui rend les résultats.
- **L'ordre des suggestions.** Le Bandeau prenait les cinq premières entrées d'une répartition que
  Meilisearch rend par ordre alphabétique : le Visiteur se voyait proposer les cinq catégories
  qui commencent le plus tôt dans l'alphabet, pas les cinq que sa requête concernait. Le choix est
  désormais fait au-dessus de la couture, dans
  [`comparerParComptePuisSlug`](../../lib/use-cases/search.ts#L295-L303), sur les comptes que le
  moteur a déjà rendus.

Le rétrécissement est un choix, et **il se voit**. Mesuré sur un moteur Meilisearch v1.52 : à
« samsung 128 256 », le défaut rend un Produit et une catégorie de suggestion ; `all` ne rend ni
l'un ni l'autre. La requête complète, « samsung 128 go », rend les deux dans les deux modes. Un
Visiteur qui tape deux mots sur trois voit donc moins de Produits, et le Bandeau de navigation reste
vide tant que sa requête n'est pas complète. C'est le prix de la phrase que le glossaire porte
désormais ; l'autre voie est le relâchement, que la production faisait.

### Une affirmation de trop, sur le double

Ce troisième point n'est pas un comportement faux : c'est une **description** fausse, et une
description se corrige dans un commentaire, non dans une décision. L'en-tête de
[`test/moteur-recherche-memoire.ts`](../../test/moteur-recherche-memoire.ts#L15) plaçait « chaque
token de la requête préfixe d'un token du document » du côté de ce qui est imité. C'est vrai de ce
moteur et de lui seul — Meilisearch ne troncature que le dernier mot de la requête, son
`prefixSearch` valant `indexingTime` — et une suite qui le redit sur ce double est verte sans moteur
sous elle. L'en-tête dit désormais ce que le double **n'atteste pas** : le classement par pertinence,
la sémantique des fautes de frappe, l'ordre et le plafond des valeurs de facette.

Il n'est pas pour autant retiré, et rien ne le remplace : c'est le chemin hermétique — le retrait de
la clause d'une facette (ADR-0016), le bornage d'une page hors bornes, sans moteur à démarrer. Une
distinction qu'il faut écrire, parce que le chantier dont cet amendement est issu compte
l'indisponibilité parmi les choses que le double éprouve : le double ne la rend pas. `chercher` n'a
qu'un retour, `statut: "ok"` y est écrit en dur, aucune branche ne pourrait faire autrement.
L'indisponibilité s'éprouve par le moteur de recette, figé sur une réponse
([`test/moteur-recherche-recette.ts`](../../test/moteur-recherche-recette.ts#L7)), et c'est ce que
dit l'entrée *Moteur de recherche* du glossaire.

### Une rectification

**La stratégie de correspondance n'est pas un réglage d'index.** Relevé sur Meilisearch v1.52 :
`PATCH /indexes/<uid>/settings` avec `{"matchingStrategy":"all"}` rend `Unknown field
\`matchingStrategy\`: expected one of \`displayedAttributes\`, \`searchableAttributes\`, …`, et
`GET /indexes/<uid>/settings` ne la rend pas davantage — `POST` sur cette route répond `405`. Le SDK
la déclare dans `SearchParams` et nulle part dans `Settings`. C'est un paramètre de requête, écrit
sur chaque recherche depuis `lib/meili.ts`.

Le commit `7f97c6f` (#531) affirmait le contraire, et son affirmation était plus instructive que
son motif : la suite portait `expect(recus).not.toHaveProperty("matchingStrategy")`, et le commentaire
au-dessus disait « le jour où quelqu'un l'ajoute au passage, la suite dise que c'est un choix » —
donc la traitait comme un réglage volontairement absent, différé à #532. Elle n'a jamais pu l'être,
et l'assertion a depuis été remplacée par une égalité de charge utile entière
([`lib/meili-reglages.test.ts:149-172`](../../lib/meili-reglages.test.ts#L149-L172)), qui est plus
large que l'absence qu'elle remplace : un réglage ajouté en passant, quel qu'il soit, la rend rouge.
Le raisonnement de #531, lui, tient.

C'est aussi la quatrième des sémantiques que la [L56](#L56) attribue à Meilisearch sans la nommer,
avec « typo tolerance, accents and ranking » : n'ayant d'épinglage que sur un moteur vivant, elle ne
pouvait être laissée au double, dont l'en-tête dit désormais ce qu'il n'atteste pas.

### Ce que cet amendement laisse ouvert

Rien de ce qui suit n'est ici une décision nouvelle.

- **Le plafond de cent valeurs par facette.** Meilisearch tronque ses valeurs de facette à
  cent ; l'ordre par compte ne peut donc classer que ce qui a survécu à la troncature, et la
  suggestion ne peut pas offrir une catégorie que le moteur n'a jamais nommée. C'est un fait du
  moteur, dit et laissé tel quel
  ([`lib/use-cases/search.ts:330-336`](../../lib/use-cases/search.ts#L330-L336)) ; la borne se lève
  dans le moteur ou nulle part.
- **Le total estimé et plafonné**, la règle de la requête courte appliquée aux comptes de facette,
  les champs trimés rendus, et le filet qui transforme toute erreur en Catalogue vide : les autres
  écarts entre les deux moteurs, documentés et laissés.
- **Le rendu de l'indisponible reste gelé**, comme la décision l'a gelé. Une Recherche rompue et
  une Recherche qui n'a légitimement rien trouvé se ressemblent toujours.

### Où les promesses sont écrites

Les deux énoncés que ce chantier a produits ne sont pas dans cet ADR, ils sont dans le glossaire,
qui est leur maison : l'entrée [**Recherche**](../../GLOSSARY.md#L128) dit que chaque terme de la
requête doit être trouvé dans le Document d'index, faute de frappe permise, et que ni la casse ni
les accents ne changent le résultat ; l'entrée [**Moteur de recherche**](../../GLOSSARY.md#L148)
dit ce que le double en mémoire est et ce qu'il n'atteste pas. Un changement de stratégie de
correspondance ou d'ordre de suggestions contredira désormais une ligne écrite, et non plus une
suite que personne ne voit tourner.
