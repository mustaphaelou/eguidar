# Le Filtre de recherche a un propriétaire neutre, et son interface n'est pas l'assembleur

Les trois Filtres de la Recherche — les marques, la catégorie, la Tranche de prix — portaient cinq
vocabulaires dans six modules. La grammaire d'URL parlait `marque`, `categorie`, `prix` ; l'encodage
`SearchFilters` parlait `brand`, `categorySlug`, `priceBucketId`
([`lib/search-params.ts:5-9`](../../lib/search-params.ts#L5-L9)) ; le moteur nommait ses facettes
`brand`, `categorySlug`, `priceBucket` ([`lib/search-params.ts:3`](../../lib/search-params.ts#L3),
[`lib/meili.ts:126-144`](../../lib/meili.ts#L126-L144)) ; la charge utile du panneau nommait ses
listes `brands`, `categories`, `priceBuckets` ; et la puce portait pour clé le champ encodé,
`"brand" | "categorySlug" | "priceBucketId"`. Aucun module ne portait la table des cinq, et chaque
règle se ré-derivait là où elle servait.

Appliquer un filtre demandait de savoir qu'une marque s'ajoute et qu'une catégorie se remplace ; en
retirer un, de savoir quelle clé de puce correspondait à quel champ, « Tout effacer » vidait trois
champs en ligne, et ADR-0016 retirait la clause de son propre filtre depuis le module du moteur.
Compter les filtres était répondu trois fois — le badge mobile, la porte des puces, l'état vide — et
un désaccord entre les trois n'aurait été vu par aucune suite. Les libeller demandait de dériver deux
fois le même libellé, et la barre latérale filtrait les décomptes nuls, seconde copie d'une règle que
le serveur appliquait déjà. Un quatrième filtre aurait demandé une édition dans cinq modules. Les
invariants qui rendent le panneau digne de confiance — le libellé d'une puce est celui de son option,
une option retenue reste visible à zéro, les cinq bandes gardent leur ordre — étaient énoncés plus
d'une fois et épinglés par aucune suite unique.

#694 avait déjà supprimé un module, `lib/options-de-filtre.ts`, comme mince : son interface était
l'assembleur, une façade sur trois fonctions privées. ADR-0029 en porte l'amendement, et c'est ce
jugement que toute proposition devait rencontrer plutôt que répéter.

#726 a posé la réponse : un module neutre possède le Filtre de recherche, et les surfaces qui
portaient ses règles consomment son identité au lieu de la redériver. Sept tickets l'ont construite,
chacun à sa couture : #727 l'identité et la grammaire d'URL, #728 l'entrée d'assemblage, #729 les
opérations et la couture du moteur, #730 la barre latérale, #731 la règle de visibilité, #732 le
chemin d'import et le type de suggestion. #733 consigne la décision ici et amende ADR-0029 ;
ADR-0023 n'est pas touché, et aucun terme de glossaire n'est ajouté.

## Décision

- **Un module neutre possède le Filtre de recherche.** `lib/filtre-de-recherche.ts` ne porte ni
  `"use client"`, ni base de données, ni `next/headers`, ni `server-only`, ni SDK Meilisearch, ni
  React, ni cas d'usage serveur ; il est importé par l'orchestration
  ([`lib/use-cases/search.ts:2-9`](../../lib/use-cases/search.ts#L2-L9)) et par la barre latérale
  ([`components/storefront/search-filters.tsx:44-53`](../../components/storefront/search-filters.tsx#L44-L53)).
  Ses seules dépendances sont `price-buckets` (des valeurs) et le type `SearchFilters`
  ([`:1-2`](../../lib/filtre-de-recherche.ts#L1-L2)). La garde
  [`lib/filtre-de-recherche-frontiere.test.ts:5-16`](../../lib/filtre-de-recherche-frontiere.test.ts#L5-L16)
  énumère les modules interdits, refuse la directive (`:25-30`), n'admet du langage d'URL que ce type
  (`:32-40`) et se prouve sur des violations synthétiques (`:42-64`).

- **L'identité est la clé d'URL.** `CleDeFiltre = "marque" | "categorie" | "prix"`
  ([`:4`](../../lib/filtre-de-recherche.ts#L4)) — les clés que l'URL écrit déjà. Elle indexe la
  charge utile des options (`OptionsDeFiltre`, `:13`), les répartitions (`RepartitionsDeFacettes`,
  `:15`), la puce (`FiltreActif.cle`, `:17-22`) et les trois groupes de la barre latérale
  ([`components/storefront/search-filters.tsx:345-407`](../../components/storefront/search-filters.tsx#L345-L407)).
  Le filtre s'appelle `prix` — la clé d'URL et l'intitulé du groupe — et ses options sont les
  Tranches de prix.

- **`SearchFilters` reste l'encodage.** Ses trois champs
  ([`lib/search-params.ts:5-9`](../../lib/search-params.ts#L5-L9)) sont l'entrée des adaptateurs du
  moteur ([`lib/meili.ts:126-144`](../../lib/meili.ts#L126-L144)) ; le module possède la seule table
  clé -> champ (`CHAMP_DE_FILTRE`,
  [`lib/filtre-de-recherche.ts:24-28`](../../lib/filtre-de-recherche.ts#L24-L28)). Aucun client ne
  lit un champ : la barre latérale passe par `valeursRetenues`
  ([`components/storefront/search-filters.tsx:325`](../../components/storefront/search-filters.tsx#L325),
  `:374`, `:396`) et les résultats par `nombreDeFiltres`
  ([`components/storefront/search-results.tsx:40`](../../components/storefront/search-results.tsx#L40)).
  Une lecture subsiste dans l'orchestration — `search.ts:173` ajoute le slug retenu à l'ensemble dont
  les noms se résolvent — et elle ne décide aucune règle de filtre. `SearchSort`, `SearchFacet` et
  `SearchView` gardent leurs noms et leur maison, comme ADR-0023 les a laissés.

- **La grammaire d'URL vit avec les règles.** `lireFiltres`
  ([`:46-65`](../../lib/filtre-de-recherche.ts#L46-L65)) rogne et déduplique les marques, lit une
  `marque` unique héritée comme une liste d'un élément (`:42-44`), retient la première valeur d'une
  clé unique répétée (`:36-40`) et ignore un `prix` hors des cinq bandes (`:61-62`).
  `parametresDeFiltre` (`:67-83`) répond des paires ordonnées — marques, catégorie, `prix` — et
  n'écrit aucun `URLSearchParams`. Le module de paramètres garde son métier : `parseSearchParams` lui
  délègue les trois clés et garde `q`, `tri` et `page`
  ([`lib/search-params.ts:46-66`](../../lib/search-params.ts#L46-L66)) ; `buildSearchHref` écrit les
  paires après `q`, et garde la fusion des surcharges, le tri par défaut et l'omission de la page 1
  ([`lib/search-params.ts:73-92`](../../lib/search-params.ts#L73-L92)). Le module importe
  `SearchFilters` en type seulement, donc la dépendance de valeur va dans un seul sens, de
  `search-params` vers le module.

- **Une seule entrée assemble.** `etatDesFiltres(repartitions, filtres, nomsDeCategories)`
  ([`:275-291`](../../lib/filtre-de-recherche.ts#L275-L291)) répond `{ options, filtresActifs }` et
  garde privés les trois assembleurs et la projection des puces (`:160-223`, `:236-273`). Le libellé
  d'une puce est donc celui de son option par construction : `projeterFiltresActifs` lit l'option par
  `optionDeValeur` (`:225-234`), dont le jet est inatteignable parce que les assembleurs émettent
  toute valeur retenue. La voie du moteur indisponible appelle la même entrée avec des répartitions
  vides et une `Map` vide
  ([`lib/use-cases/search.ts:98-114`](../../lib/use-cases/search.ts#L98-L114)), et
  `optionsSansRepartition` a disparu.

- **Les opérations sont des valeurs pures.** `choisirValeur` (`:85-105`) ajoute une marque et
  remplace une clé à valeur unique ; `retirerValeur` (`:139-158`) retire une marque et efface une
  clause unique quand elle correspond ; `retirerFacette` (`:130-137`) retire la clause entière pour
  la règle de décompte d'ADR-0016 ; `nombreDeFiltres` (`:122-128`) compte chaque marque et une par
  clé unique ; `valeursRetenues` (`:107-120`) rend les valeurs retenues d'une clé. Aucune ne mute son
  argument — les copies sont neuves — et un retrait supprime la clé au lieu de la vider
  (`delete restants[CHAMP_DE_FILTRE[cle]]`, `:135`). « Tout effacer » est la valeur vide, pas une
  opération : la barre latérale navigue vers `{}`
  ([`components/storefront/search-filters.tsx:238`](../../components/storefront/search-filters.tsx#L238)).

- **La visibilité est une fonction pure.** `optionsVisibles(options, plafond?, deplie)` (`:293-309`)
  cache une option à zéro non retenue (`:298-300`), ne cache jamais une retenue (`:306`), replie le
  reste sous le plafond et compte les cachées (`:305-308`). Un plafond omis ne replie rien
  (`:301-303`) : c'est le groupe Prix, seul appelant sans plafond
  ([`components/storefront/search-filters.tsx:343`](../../components/storefront/search-filters.tsx#L343)).
  La barre latérale garde ses deux drapeaux de dépliage (`:321-322`) et son plafond de huit (`:60`),
  et ne refait plus l'arithmétique.

- **La couture du moteur perd une règle de domaine.** `retirerFacette` quitte
  [`lib/moteur-recherche.ts`](../../lib/moteur-recherche.ts), qui ne garde que ses types et
  `MoteurRecherche` (`:8-38`). L'orchestration tient la seule
  table exhaustive clé -> facette du moteur (`FACETTE_DU_MOTEUR`,
  [`lib/use-cases/search.ts:29-33`](../../lib/use-cases/search.ts#L29-L33)) et s'en sert pour les
  trois requêtes de facette (`:116-125`) comme pour les répartitions (`:166-170`). Le vocabulaire de
  Meilisearch s'arrête à la couture, ADR-0016 garde sa règle au-dessus d'elle, et ADR-0023 garde son
  opération unique : `chercher`.

- **La barre latérale n'emprunte rien au cas d'usage serveur.** Elle importe le module et le module
  de paramètres, et rien d'autre (`:44-58`) ; la frontière l'épingle
  ([`lib/use-cases/search-frontiere.test.ts:74-80`](../../lib/use-cases/search-frontiere.test.ts#L74-L80)),
  et sa règle de corpus — aucun module client n'emprunte une valeur à un module serveur — reste la
  même (`:52-72`). Le type de suggestion suit le cavalier d'ADR-0022 : il est déclaré par le serveur
  (`SearchSuggestionCategory`,
  [`lib/use-cases/search.ts:230-233`](../../lib/use-cases/search.ts#L230-L233)) et le client
  l'emprunte en type
  ([`components/storefront/search-suggestions.tsx:12-15`](../../components/storefront/search-suggestions.tsx#L12-L15)),
  ce que la même frontière prouve (`:82-93`).

- **Pourquoi la suppression de #694 ne s'applique pas ici.** L'interface de
  `lib/options-de-filtre.ts` était l'assembleur : une façade `assemblerOptionsDeFiltre` sur trois
  fonctions privées, et des types. L'interface de ce module-ci est une famille d'opérations sur une
  identité — choisir, retirer une valeur, retirer une facette, compter, lire les valeurs retenues —
  plus les entrées qui portent la grammaire d'URL et l'assemblage. Le test de suppression se lit donc
  ainsi : **si le retrait, le comptage ou la grammaire d'URL reste hors de ce module, il est redevenu
  `options-de-filtre` et doit être supprimé.** ADR-0029 reçoit son second amendement, parce que sa
  phrase #694 sur la maison des assembleurs est fausse à nouveau ; ADR-0023 n'est pas rouvert.

- **Aucune surface ne change de comportement, à deux normalisations inatteignables près.** La
  première : le libellé d'une puce est pris à son option, là où la puce le dérivait elle-même. Pour
  les valeurs qu'une URL peut produire, le libellé de l'option est celui que la puce dérivait déjà —
  la valeur pour une marque, le nom résolu ou le slug pour une catégorie, le libellé de la bande pour
  une Tranche. La seconde : une Tranche retenue hors des cinq bandes retombe sur son identifiant et
  s'émet à zéro ([`lib/filtre-de-recherche.ts:204-223`](../../lib/filtre-de-recherche.ts#L204-L223))
  au lieu de disparaître ; aucune URL du site ne la produit, puisque `lireFiltres` écarte un `prix`
  inconnu (`:61-62`). L'unique suite qui l'exerce passe un `SearchFilters` construit à la main
  ([`lib/use-cases/search-memoire.test.ts:687-710`](../../lib/use-cases/search-memoire.test.ts#L687-L710)),
  et c'est le seul cas où « les suites d'orchestration gardent leurs assertions » ne tient pas.

## Options écartées

- **Ressusciter `lib/options-de-filtre.ts`** — écartée : son interface était l'assembleur, et c'est
  précisément ce que ce module ne peut pas être. L'assembleur reste privé derrière `etatDesFiltres`,
  et les opérations ont leur maison.
- **Renommer `SearchFilters` ou absorber l'encodage dans le module** — écartée : c'est l'entrée des
  adaptateurs du moteur ; la renommer rouvrirait le vocabulaire d'ADR-0023 sans déplacer une règle.
  `SearchSort`, `SearchFacet` et `SearchView` gardent leur maison.
- **Laisser `retirerFacette` dans `lib/moteur-recherche.ts`** — écartée : c'est la règle de décompte
  d'ADR-0016, pas une opération de couture ; la couture garde `chercher` seul.
- **Faire lire la base ou la Structure par le module** — écartée : les noms de catégorie entrent
  comme faits (`nomsDeCategories`) ; `resoudreLesNomsDeCategories` reste dans l'orchestration
  ([`lib/use-cases/search.ts:69-85`](../../lib/use-cases/search.ts#L69-L85)), avant l'assemblage.
- **Un second assemblage pour la voie indisponible** — écartée : c'est ce second chemin qui laissait
  les libellés diverger ; la voie vide appelle `etatDesFiltres`.
- **Laisser la visibilité au composant** — écartée : la règle est pure et se prouve sans rendu,
  comme `optionsVisibles` le fait.
- **Un libellé de puce indépendant de son option** — écartée : il faudrait dériver deux fois le même
  libellé, et rien ne garantirait plus qu'ils s'accordent.
- **Un quatrième filtre maintenant** — hors de cette décision : l'identité le rendrait possible
  (une ligne dans `CHAMP_DE_FILTRE`, une dans `FACETTE_DU_MOTEUR`, un groupe), mais rien n'en est
  décidé ici.

## Invariants

- Tout Filtre de recherche est identifié par sa clé d'URL : la charge utile des options, les
  répartitions, les puces et les groupes de la barre latérale sont indexés par `CleDeFiltre`. Un
  quatrième filtre serait une ligne et un cas, pas cinq éditions.
- `lib/filtre-de-recherche.ts` est neutre — aucune directive, aucune base, aucun en-tête, aucun
  `server-only`, aucun SDK de moteur, aucun React, aucun cas d'usage serveur — et la frontière le
  verrouille.
- `SearchFilters` est l'encodage, pas un vocabulaire client : aucun client n'en lit les champs ; le
  module et les adaptateurs du moteur les lisent.
- La grammaire d'URL va et revient dans le module : `parametresDeFiltre` écrit ce que `lireFiltres`
  relit ; `parseSearchParams` garde `q`/`tri`/`page` et délègue les trois clés ; `buildSearchHref`
  écrit les paires après `q`.
- Les options et les puces sortent de la même entrée `etatDesFiltres` ; aucun appelant ne peut
  produire l'une sans l'autre, et le libellé d'une puce est celui de son option.
- Les opérations sont pures et ne mutent jamais ; un retrait supprime la clause au lieu de la vider ;
  « Tout effacer » est la valeur vide.
- Une option à zéro non retenue est cachée, une retenue ne l'est jamais ; le plafond replie le reste
  et `cachees` le compte ; un plafond omis ne replie rien.
- La couture du moteur ne parle que `chercher` ; la correspondance clé -> nom de facette du moteur
  n'est écrite qu'une fois, dans la table exhaustive de l'orchestration.
- La barre latérale n'emprunte aucune valeur au cas d'usage serveur ; la surface de suggestion
  n'emprunte que son type (ADR-0022).
- Si le retrait, le comptage ou la grammaire d'URL reste hors du module, le module est redevenu
  `options-de-filtre` et doit être supprimé.
- Aucune surface ne change de comportement ; les deux normalisations sont inatteignables depuis une
  URL que le site produit.
