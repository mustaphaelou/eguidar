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
  ([`lib/use-cases/search.ts:2-10`](../../lib/use-cases/search.ts#L2-L10)) et par la barre latérale
  ([`components/storefront/search-filters.tsx:44-54`](../../components/storefront/search-filters.tsx#L44-L54)).
  Ses seules dépendances sont `price-buckets` (des valeurs) et le type `SearchFilters`
  ([`:1-2`](../../lib/filtre-de-recherche.ts#L1-L2)). La garde
  [`lib/filtre-de-recherche-frontiere.test.ts:5-18`](../../lib/filtre-de-recherche-frontiere.test.ts#L5-L18)
  énumère les modules interdits, refuse la directive (`:31-36`), n'admet du langage d'URL que ce type
  (`:38-46`) et se prouve sur des violations synthétiques, imports relatifs résolus (`:48-83`).

- **L'identité est la clé d'URL.** `CleDeFiltre` est dérivé de la table d'identité
  (`keyof typeof DEFINITIONS_DE_FILTRE`, `:18-37`), et `CLES_DE_FILTRE` en dérive l'ordre
  (`:39-41`) ; la clé vaut `"marque" | "categorie" | "prix"` — les clés que l'URL écrit déjà. Elle
  indexe la charge utile des options (`OptionsDeFiltre`, `:43`), les répartitions
  (`RepartitionsDeFacettes`, `:45`), la puce (`FiltreActif.cle`, `:47-52`) et les trois groupes de la
  barre latérale
  ([`components/storefront/search-filters.tsx:344-406`](../../components/storefront/search-filters.tsx#L344-L406)).
  Le filtre s'appelle `prix` — la clé d'URL et l'intitulé du groupe — et ses options sont les
  Tranches de prix.

- **`SearchFilters` reste l'encodage.** Ses trois champs
  ([`lib/search-params.ts:5-9`](../../lib/search-params.ts#L5-L9)) sont l'entrée des adaptateurs du
  moteur ([`lib/meili.ts:126-144`](../../lib/meili.ts#L126-L144)) ; le module possède la seule table
  par clé (`DEFINITIONS_DE_FILTRE`,
  [`lib/filtre-de-recherche.ts:18-35`](../../lib/filtre-de-recherche.ts#L18-L35)), qui porte le champ
  encodé, l'arité, le nom accessible de la puce et la validation du `prix`. Ni les clients ni
  l'orchestration ne lisent un champ : la barre latérale passe par `valeursRetenues`
  ([`components/storefront/search-filters.tsx:324`](../../components/storefront/search-filters.tsx#L324),
  `:373`, `:395`), les résultats par `nombreDeFiltres`
  ([`components/storefront/search-results.tsx:40`](../../components/storefront/search-results.tsx#L40)),
  et l'orchestration résout les noms de catégorie par `valeursRetenues(filters, "categorie")`
  ([`lib/use-cases/search.ts:173-174`](../../lib/use-cases/search.ts#L173-L174)). `SearchSort`,
  `SearchFacet` et `SearchView` gardent leurs noms et leur maison, comme ADR-0023 les a laissés.

- **La grammaire d'URL vit avec les règles.** `lireFiltres`
  ([`:89-116`](../../lib/filtre-de-recherche.ts#L89-L116)) rogne et déduplique les marques, lit une
  `marque` unique héritée comme une liste d'un élément (`:60-67`), retient la première valeur d'une
  clé unique répétée (`:54-58`) et ignore un `prix` hors des cinq bandes (`:109-111`).
  `parametresDeFiltre` (`:118-130`) répond des paires ordonnées — marques, catégorie, `prix` — dans
  l'ordre de la table, et n'écrit aucun `URLSearchParams`. Le module de paramètres garde son métier :
  `parseSearchParams` lui délègue les trois clés et garde `q`, `tri` et `page`
  ([`lib/search-params.ts:46-66`](../../lib/search-params.ts#L46-L66)) ; `buildSearchHref` écrit les
  paires après `q`, et garde la fusion des surcharges, le tri par défaut et l'omission de la page 1
  ([`lib/search-params.ts:73-92`](../../lib/search-params.ts#L73-L92)). Le module importe
  `SearchFilters` en type seulement, donc la dépendance de valeur va dans un seul sens, de
  `search-params` vers le module.

- **Une seule entrée assemble.** `etatDesFiltres(repartitions, filtres, nomsDeCategories)`
  ([`:288-304`](../../lib/filtre-de-recherche.ts#L288-L304)) répond `{ options, filtresActifs }` et
  garde privés les trois assembleurs et la projection des puces (`:195-258`, `:260-286`). Le libellé
  d'une puce est donc celui de son option par construction : `projeterFiltresActifs` lit l'option par
  `optionDeValeur` (`:260-269`), dont le jet est inatteignable parce que les assembleurs émettent
  toute valeur retenue. La voie du moteur indisponible appelle la même entrée avec des répartitions
  vides et une `Map` vide
  ([`lib/use-cases/search.ts:99-115`](../../lib/use-cases/search.ts#L99-L115)), et
  `optionsSansRepartition` a disparu.

- **Les opérations sont des valeurs pures, lues sur une table.** `choisirValeur` (`:132-149`) ajoute
  une marque et remplace une clé à valeur unique ; `retirerValeur` (`:175-193`) retire une marque et
  efface une clause unique quand elle correspond ; `retirerFacette` (`:166-173`) retire la clause
  entière pour la règle de décompte d'ADR-0016 ; `nombreDeFiltres` (`:158-164`) compte chaque marque
  et une par clé unique ; `valeursRetenues` (`:151-156`) rend les valeurs retenues d'une clé. Toutes
  lisent `DEFINITIONS_DE_FILTRE` au lieu de dispatcher sur la clé. Aucune ne mute son argument — les
  copies sont neuves — et un retrait supprime la clé au lieu de la vider
  (`delete restants[DEFINITIONS_DE_FILTRE[cle].champ]`, `:171`). « Tout effacer » est la valeur vide,
  pas une opération : la barre latérale navigue vers `{}`
  ([`components/storefront/search-filters.tsx:237`](../../components/storefront/search-filters.tsx#L237)),
  et `buildSearchHref` garde `q` et `tri` tout en appliquant la règle de page 1 existante, sans
  changer la pagination.

- **La visibilité est une fonction pure.** `optionsVisibles(options, plafond?, deplie)` (`:306-322`)
  cache une option à zéro non retenue (`:311-313`), ne cache jamais une retenue (`:319`), replie le
  reste sous le plafond et compte les cachées (`:318-321`). Un plafond omis ne replie rien
  (`:314-316`) : c'est le groupe Prix, seul appelant sans plafond
  ([`components/storefront/search-filters.tsx:342`](../../components/storefront/search-filters.tsx#L342)).
  La barre latérale garde ses deux drapeaux de dépliage (`:320-321`) et son plafond de huit (`:61`),
  et ne refait plus l'arithmétique.

- **La couture du moteur perd une règle de domaine.** `retirerFacette` quitte
  [`lib/moteur-recherche.ts`](../../lib/moteur-recherche.ts), qui ne garde que ses types et
  `MoteurRecherche` (`:8-38`). L'orchestration tient la seule
  table exhaustive clé -> facette du moteur (`FACETTE_DU_MOTEUR`,
  [`lib/use-cases/search.ts:30-34`](../../lib/use-cases/search.ts#L30-L34)) et s'en sert pour les
  trois requêtes de facette (`:117-126`) comme pour les répartitions (`:167-171`). Le vocabulaire de
  Meilisearch s'arrête à la couture, ADR-0016 garde sa règle au-dessus d'elle, et ADR-0023 garde son
  opération unique : `chercher`.

- **La barre latérale n'emprunte rien au cas d'usage serveur.** Elle importe le module et le module
  de paramètres, et rien d'autre (`:44-59`) ; la frontière l'épingle
  ([`lib/use-cases/search-frontiere.test.ts:74-80`](../../lib/use-cases/search-frontiere.test.ts#L74-L80)),
  et sa règle de corpus — aucun module client n'emprunte une valeur à un module serveur — reste la
  même (`:52-72`). Le type de suggestion suit le cavalier d'ADR-0022 : il est déclaré par le serveur
  (`SearchSuggestionCategory`,
  [`lib/use-cases/search.ts:227-230`](../../lib/use-cases/search.ts#L227-L230)) et le client
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
  s'émet à zéro ([`lib/filtre-de-recherche.ts:239-258`](../../lib/filtre-de-recherche.ts#L239-L258))
  au lieu de disparaître ; aucune URL du site ne la produit, puisque `lireFiltres` écarte un `prix`
  inconnu (`:109-111`). L'unique suite qui l'exerce passe un `SearchFilters` construit à la main
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
  (une ligne dans `DEFINITIONS_DE_FILTRE`, une dans `FACETTE_DU_MOTEUR`, ses cas explicites de
  grammaire et d'assemblage, et un groupe de la barre latérale), mais rien n'en est décidé ici.

## Invariants

- Tout Filtre de recherche est identifié par sa clé d'URL : la charge utile des options, les
  répartitions, les puces et les groupes de la barre latérale sont indexés par `CleDeFiltre`. Un
  quatrième filtre serait une ligne dans la table d'identité, plus ses cas explicites de grammaire et
  d'assemblage et son groupe dans la barre latérale — pas une règle redérivée dans cinq modules.
- `lib/filtre-de-recherche.ts` est neutre — aucune directive, aucune base, aucun en-tête, aucun
  `server-only`, aucun SDK de moteur, aucun React, aucun cas d'usage serveur — et la frontière le
  verrouille.
- Une seule table par clé porte le champ encodé, l'arité, le nom accessible de la puce et la
  validation du `prix` ; les opérations et la projection des puces la lisent au lieu de dispatcher
  sur la clé.
- `SearchFilters` est l'encodage, pas un vocabulaire client : ni les clients ni l'orchestration n'en
  lisent les champs ; le module et les adaptateurs du moteur les lisent.
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
