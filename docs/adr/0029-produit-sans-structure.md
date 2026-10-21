# Un Produit sans Structure survit à la suppression de sa Structure

#522 demandait si un Produit survit à la suppression de sa Structure, et refusait d'engager la réponse
avant une décision de mainteneur. Elle est prise : **il survit**. Ce que supposerait cette réponse —
« `Product.categoryId` devient nullable et un Produit orphelin n'a plus de Structure » — n'est pas un
ajustement de schéma, et la mesure le montre avant toute écriture.

## Ce que la mesure établit

**La contrainte ne s'affaiblit pas.** `Product_categoryId_fkey` est en `ON DELETE RESTRICT`
([`20260810111743_init/migration.sql:239`](../../prisma/migrations/20260810111743_init/migration.sql#L239)),
et `RESTRICT` ne considère que les lignes dont la clé étrangère est **non nulle** : une ligne dont
`categoryId` est `NULL` ne référence rien et n'est jamais comptée. Rendre la colonne nullable
n'affaiblit donc pas `RESTRICT` — **rien n'est orphelin par défaut**. L'orphelinat ne naîtrait que
d'une écriture explicite que `deleteCategory` ferait avant son `tx.category.delete`. Le changement de
schéma et le changement de comportement sont deux décisions séparables, et le premier est presque
inerte. C'est le second qui décide de tout, et c'est lui qui est tranché ici.

**Le rayon de compilation est petit : onze erreurs, quatre fichiers hors tests.** `admin-catalog.ts`
(5), `storefront.ts` (4), `admin-structure.ts` (2), `prisma/seed.ts` (1) — mesuré en rendant la colonne
nullable, en régénérant le client et en lançant `tsc --noEmit`, puis en rétablissant l'arbre. Aucun
de ces sites ne demandait un choix de domaine : ce sont des lectures qui nommaient `category` sans
admettre l'absence.

**Le coût est ailleurs, et TypeScript ne le voit pas.** Trois faits, chacun mesuré dans le code :

1. **Le Catalogue *est* la Recherche.**
   [`app/(boutique)/produits/page.tsx:37`](../../app/(boutique)/produits/page.tsx#L37) appelle
   `searchProducts`. Il n'existe aucune liste de Produits en base : la page « Tous nos produits » est
   une Recherche à filtres vides. **La visibilité d'un orphelin repose donc entièrement sur le
   `categorySlug` de son Document d'index**, et rien d'autre.
2. **Un orphelin reste vendable.** `CartItem` mène à `ProductVariant` puis à `Product` ; `OrderItem`
   fige `productName` et ne lit jamais la Structure
   ([`schema.prisma:197-209`](../../prisma/schema.prisma#L197-L209)). Sans décision, l'orphelinat
   produit un Produit **achetable mais inatteignable depuis une catégorie** : il reste dans le Panier,
   il reste commandable, il n'est dans aucun décompte.
3. **Un orphelin devient non enregistrable.**
   [`admin-catalog.ts:238`](../../lib/use-cases/admin-catalog.ts#L238) est
   `categoryId: z.string().min(1, "catégorie requise")`. Ouvrir un orphelin dans l'Administration,
   changer un prix, enregistrer rend *« catégorie requise »* — et aucun champ du formulaire n'y répond.

Quatre pièges que TypeScript ne voit pas, et quatre réponses. Le premier est la sentinelle que la
première réponse aurait produite : une `categorySlug` vide.
Meilisearch en ferait une valeur de facette offered au Visiteur — mais
[`search-params.ts:78`](../../lib/search-params.ts#L78) fait `if (categorySlug)` et laisse tomber une
chaîne vide. **La puce s'afficherait, cliquable, et ne filtrerait rien.** C'est le piège qui décide du
reste de cette décision : il ne suffit pas de rendre la colonne nullable, il faut une facette qui reste
un fait.

## Décision

- **`Product.categoryId` devient nullable, et la contrainte reste `ON DELETE RESTRICT`.** Elle n'est pas
  relâchée : `RESTRICT` ne peut l'être, et la garder dit ce qu'elle dit toujours — une Structure
  encore visée par un Produit n'est pas supprimable. Ce qui change n'est pas la contrainte mais **qui
  la rencontre** : voir l'amendement d'ADR-0027 plus bas.

- **L'orphelinat est un choix de l'éditeur, jamais un défaut.** `deleteCategory` gagne une option
  `orphanProducts`, de la même façon que #519 a donné `reparentChildrenToCategoryId` : une cible
  choisie, ou rien. Sans elle, le refus reste le refus et `CategoryHasProductsError` reste son nom.
  **La règle ne s'assouplit pas, elle devient saisissable** — la phrase d'ADR-0027 sur
  `reparentChildrenToCategoryId` vaut telle quelle pour `orphanProducts`.

- **Le Document d'index porte une valeur de facette réservée, et elle est totale.** `categoryId`
  devient `string | null` — c'est un fait, et il est vrai qu'il soit nul. `categorySlug` **reste un
  `string`** et vaut `SLUG_SANS_STRUCTURE` quand le Produit est sans Structure. Le fait est partiel,
  la clé de facette ne l'est pas : c'est ce qui permet à la Recherche, à Meilisearch et au double en
  mémoire de rester intacts, sans une branche de moins dans un moteur.

- **La valeur réservée est `_sans-structure`, et son premier caractère est le choix.** La grammaire de
  slug de la Structure est `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`
  ([`admin-structure.ts:216-222`](../../lib/use-cases/admin-structure.ts#L216-L222)) : `_` n'y est pas
  représentable, donc **aucune Structure ne peut porter cette valeur, jamais**. C'est ce qui sépare
  cette décision d'une sentinelle en chaîne vide, et d'un slug ordinaire comme `sans-structure`, qui
  serait collisionnable dès la prochaine Structure créée par un éditeur. Elle est exportée de
  `lib/index-projection.ts` et comparée à raison exacte des deux côtés de la couture.

- **La Résolution des noms connaît la valeur réservée.** `fetchCategoryNames` interroge la base des
  slugs reçus ; la valeur réservée ne s'y trouve pas, et
  [`assemblerCategories`](../../lib/options-de-filtre.ts#L81-L95) retomberait alors sur la valeur
  brute. Elle est donc résolue en amont, dans `search.ts`, avec les Structures réelles. **La puce se
  lit « Sans Structure » et filtre réellement** — c'est la seconde moitié du piège ci-dessus.

- **Le fil d'Ariane se dégrade, il ne ment pas.** `fetchProductPageData` rend une `categoryChain`
  vide pour un orphelin, et la page construit déjà ses miettes par-dessus
  ([`produit/[slug]/page.tsx:58-65`](../../app/(boutique)/produit/[slug]/page.tsx#L58-L65)) :
  `Accueil › Tous nos produits › <nom>`. Aucun changement de rendu n'est nécessaire, et
  `buildProductDonneesStructurees` ne lit pas la Structure — les Données structurées sont donc
  exactes sans travail.

- **La suggestion du Bandeau mène au Catalogue filtré, pas à une page de catégorie.** Les
  suggestions de catégories du Bandeau rendent `/categorie/<slug>`
  ([`search-suggestions.tsx:111`](../../components/storefront/search-suggestions.tsx#L111)) : la valeur
  réservée y produirait un lien mort, `/categorie/_sans-structure` rendant `notFound()` puisque
  **aucune Structure ne porte ce slug** — c'est exactement ce que son caractère réservé garantit. Elle
  mène donc à `/produits?categorie=_sans-structure`, écrit par `buildSearchHref`, que la page du
  Catalogue sait lire. Le filtre survit au voyage, et c'est éprouvé.

- **Les Produits liés disparaissent pour un orphelin, et c'est explicite.** La requête des « Vous
  aimerez aussi » filtre sur `categoryId: product.categoryId`
  ([`storefront.ts:267`](../../lib/use-cases/storefront.ts#L267)) : rendered tel quel, un `null`
   (`WHERE categoryId IS NULL`) et **appariait tous les autres orphelins** — un comportement muet
  qu'aucune suite n'aurait rouge. Le filtre est donc gardé sur une `categoryId` non nulle, et un
  orphelin n'a aucun Produit lié.

- **Un orphelin reste vendable, et c'est une décision, pas un oubli.** Le Panier et la Commande ne
  lisent pas la Structure ; le rendre invendable exigerait un troisième choix — le refuser à la vente,
  ou le publier ailleurs. Le glossaire dit désormais qu'un Produit sans Structure **est vendu
  normalement**. Rendre l'orphelinat commercialement neutre est le choix le moins cher et le moins
  engageant ; le dire est ce qui compte.

- **L'Administration oblige à réaffecter.** Un orphelin s'ouvre, se lit et s'affiche ; il ne
  s'enregistre pas. `getAdminProduct` rend `categoryId: string | null`, le formulaire affiche
  « Sans Structure » et son sélecteur part vide, et **le `min(1)` de la validation reste** : la seule
  façon d'orpheliner est de supprimer une Structure, la seule façon de ne plus l'être est d'en choisir
  une. Le relâcher laisserait l'éditeur **créer** des orphelins par une édition ordinaire, et
  l'invariant serait faux.

- **La liste des Produits se lit, elle aussi.** `listAdminProducts` rend
  `categoryName: produit.category.name` ; l'orphelin y porte le même libellé que la puce de la
  Recherche, parce que deux libellés pour un seul fait finiraient par diverger.

## Options écartées

- **Refuser, et ne rien changer** — écartée : la décision du mainteneur. Elle reste le défaut du
  serveur, ce qui est différent d'être la seule voie.
- **`ON DELETE SET NULL` sur la clé étrangère** — écartée : la suppression deviendrait silencieuse.
  Le refus est la seule chose qui dise à l'éditeur ce qu'il vient de faire, et ADR-0027 a acheté sa
  sérialisation entière pour que la suppression **voie** les Produits au lieu de découvrir leur
  absence. Un `SET NULL` laisserait la décision à la base et la reprise à personne.
- **Une chaîne vide comme sentinelle** — écartée : le piège mesuré ci-dessus. La puce serait
  cliquable et inerte.
- **Un slug ordinaire, `sans-structure`** — écartée : collisionnable. La grammaire l'accepterait, et
  une Structure portant ce slug mélangerait silencieusement deux populations dans une même facette.
  La valeur réservée est choisie précisément pour être **hors** de la grammaire.
- **Un garde-fou : refuser de vendre un orphelin** — écartée pour l'instant, non par principe. Elle
  exigerait que le Panier et la Commande lisent la Structure, donc deux lectures de plus et une
  question de prix. Elle est ouverte, pas tranchée.
- **Une Structure d'accueil par défaut** — écartée : elle invente une Structure qui n'a pas de
  Rapport avec l'achat, et elle n'est pas dans le glossaire. Un éditeur qui veut réaffecter choisit.

## Invariants

- **Une Structure encore visée par un Produit n'est pas supprimable.** `RESTRICT` le dit toujours, et
  `CategoryHasProductsError` le dit avant elle.
- **Un Produit n'est sans Structure que si sa Structure a été supprimée.** Le formulaire de
  l'Administration ne permet pas de l'y laisser ; il oblige au contraire à en choisir une.
- **`_sans-structure` n'est pas un slug de Structure.** La grammaire de
  [`slugSchema`](../../lib/use-cases/admin-structure.ts#L216-L222) le rend inatteignable, et c'est le
  seul endroit qui décide quels slugs existent.
- **`categoryId` est un fait partiel ; `categorySlug` est une clé de facette totale.** Aucun moteur
  de recherche ne reçoit de `categoryId`.
- **Un Produit sans Structure est vendu normalement**, et son absence de Structure ne le retire
  d'aucun décompte du Catalogue : il n'en a pas.
- **La réindexation d'un orphelin est un effet post-commit comme les autres** (ADR-0014) : son
  `categorySlug` change, donc son Document d'index change, donc il est réindexé avec les Produits
  réaffectés, dans le même appel et sous le même `runEffect`.

## Amendement d'ADR-0027 — le piège nommé sur `Product_categoryId_fkey`

Le deuxième piège nommé d'ADR-0027 reste **presque** vrai, et ce qui change doit être dit avec lui.

Ce qui ne change pas : `RESTRICT` n'a jamais été affaibli par la nullabilité, et un Produit créé sur
une Structure supprimée **attend toujours le verrou** puis meurt sur cette contrainte — SQLSTATE
`23503`, code Prisma `P2003`, **du côté Catalogue**, que la surface d'erreurs d'ADR-0027 ne traduit
pas.

Ce qui change : `deleteCategory` **efface lui-même** la colonne avant de supprimer, dans la même
transaction et sous le même verrou grossier. La contrainte ne refuse donc plus les Produits que la
transaction **voit** — elle les a déjà vidés. Elle refuse encore ceux qui arrivent après, et **c'est
mesuré, pas supposé** : l'épreuve de la Tierce partie rejouée avec `orphanProducts` rend toujours
`CategoryBusyError` sur `Product_categoryId_fkey`. L'hypothèse qui semblait évidente — « la colonne
est déjà vide, donc plus rien ne peut la faire échouer » — était fausse.

Ce qui change est donc plus étroit qu'il n'y paraît : **le refus devient un réessai.** Au second
essai le Produit concurrent est committé, donc visible ; la suppression le voit et le vide comme les
autres. Le piège est plus étroit — il ne protège plus que la course — et il protège encore.

La sérialisation, elle, est intacte : le verrou grossier, le délai armé avant lui, la translation des
courses et la frontière énoncée ne bougent pas. Ce qui change, c'est que la **course 1 du tableau**
— « la tierce insère un Produit, puis la suppression part » — a désormais **deux issues** au lieu
d'une, et c'est l'éditeur qui les départage, en choisissant la réaffectation ou l'orphelinat. La
sérialisation garantit qu'il ne s'entrelacent pas ; elle ne dit plus lequel gagne, parce que les deux
gagnent et que le choix est métier.

Aucun test n'est devenu faux — **relevé, pas espéré.** Les épreuves de contention d'ADR-0027 rendent
toutes ce qu'elles rendaient. La preuve neuve est **le réessai**, ajoutée à côté d'elles : le même
fantôme, la même Tierce partie, `orphanProducts` au lieu d'une réaffectation — le premier essai est
refusé sur `Product_categoryId_fkey`, le second aboutit et orpheline les deux Produits. C'est cette
différence qui dit ce que la décision a changé : **rien sur la course, tout sur ce que l'éditeur peut
faire ensuite.**

## Amendement — ce que la preuve a montré de faux dans la décision

Deux phrases de la décision étaient vraies pour l'auteur et fausses pour le code. Aucune n'est
changée ici ; ce qui suit dit ce qui s'est réellement déplacé, et les deux déplacements sont des
**retours à l'intention** plutôt que des choix nouveaux.

### Le Document d'index ne porte plus le fait `categoryId`

La décision dit « `categoryId` devient `string | null` — c'est un fait, et il est vrai qu'il soit
nul », et son invariant dit « aucun moteur de recherche ne reçoit `categoryId` ». Les deux ne
pouvaient pas tenir : `indexProductDocuments` passe le document **entier** à Meilisearch
(`addDocuments(products)`, [`lib/meili.ts:140`](../../lib/meili.ts#L140)), donc un `categoryId` porté
par la projection y entrait bel et bien — non filtrable, donc inoffensif, mais **reçu**. Le champ
n'était lu par rien : la contradiction ne pouvait mettre de suite.

Il est retiré de `IndexableProduct`, et l'invariant est désormais vrai **structurellement** : aucun
chemin ne peut remettre le fait dans le document sans changer la projection, qui est la couture
([^l'épreuve](../../lib/index-projection.test.ts) constate l'absence de la clé, avec une Structure
comme sans — sinon elle ne prouverait que le cas facile). Ce qui decide de la valeur réservée reste
entier : `categorySlug` est **la seule** clé de Structure qu'un moteur reçoit, elle ne manque
jamais, et c'est elle qui porte `_sans-structure`.

Ce qui change donc est plus étroit qu'il n'y paraît : la phrase « `categoryId` devient
`string | null` » parle désormais du **fait en base** — `Product.categoryId`, que le formulaire et
la liste de l'Administration lisent — et non d'une clé du Document d'index. Le fait reste partiel,
et il reste vrai qu'il soit nul ; il a simplement cessé de voyager.

### Le refus de réaffectation est total, et il ne dépend pas du nombre de Produits

La décision décrit l'orphelinat comme « une cible choisie, ou rien », et rien n'y dit que la cible
elle-même se valide. Le code, lui, avait glissé : la garde « une Structure a des Produits »
enfermait les deux contrôles de la cible — « la cible est-elle la source ? », « la cible existe-t-elle
? » — si bien qu'une cible invalide sur une Structure **vide** était lue puis ignorée, et la
suppression aboutissait. **Une mutation de Structure rendait alors une issue qui n'est ni son
succès ni son refus** — ce que le glossaire interdit en une phrase, « une mutation de Structure ne
produit jamais d'autre issue ».

Les contrôles sont donc validés **dès que la cible est choisie**, avant même de regarder les
Produits. La preuve est l'épreuve qui manquait : les deux épreuves de réaffectation plantaient
chacune un Produit, et ne pouvaient donc pas voir la régression ; celle qui la voit est
**une Structure vide, une cible inconnue, un refus** — l'éditeur voit sa Structure, et le serveur
lui dit pourquoi.

### Ce que l'amendement ne change pas

Rien de la décision elle-même : `categoryId` reste nullable, la contrainte reste en `RESTRICT`,
l'orphelinat reste un choix de l'éditeur et jamais un défaut, le `min(1)` du formulaire reste, la
valeur réservée reste `_sans-structure` et hors de la grammaire. Une preuve de plus est venue s'y
ajouter — **le Produit sans Structure se vend normalement** ([`lib/panier.test.ts`](../../lib/panier.test.ts)
l'entre dans le Panier, s'y compte et se commande) — parce que cet invariant du glossaire ne
tenait à rien d'autre qu'à l'absence de garde, et une absence ne se prouve pas en écrivant.

## Amendement — La Résolution des noms passe par la Lecture de la Structure (#693, 2026-10-19)

La décision ne bouge pas : la valeur réservée reste `_sans-structure`, hors de la grammaire, et sa
puce continue de se lire « Sans Structure » et de filtrer réellement. Cet amendement consigne ce que
ce ticket rend faux dans la décision, et rien d'autre.

La puce « **La Résolution des noms connaît la valeur réservée.** » nomme `fetchCategoryNames` et
décrit une lecture de la table `Category` par `search.ts`. Ce n'est plus le code : `fetchCategoryNames`
et `fetchNomsDeFacette` ont disparu, et la Recherche n'importe plus `@/lib/db` ni `prisma`. Les noms se
résolvent désormais par `structure.structureParSlug(slug)?.name`, avec la `Lecture de la Structure`
que `searchProducts` et `searchSuggestions` reçoivent en dépendance — une seule instance pour tous les
slugs d'une Recherche, et `lireStructure()` seulement quand l'appelant n'en fournit pas.

Ce que la puce voulait garantir reste vrai, par une autre voie. **Quand la Recherche résout les
noms**, `_sans-structure` rend `LIBELLE_SANS_STRUCTURE` sans consulter la Structure, quel que soit ce
que celle-ci prétend connaître. Un slug que la Structure ne nomme pas garde sa valeur brute, et le
repli de la nomenclature n'est pas rouvert ici. **Sur le chemin d'un moteur indisponible**, aucune
Structure n'est lue et la catégorie active — `_sans-structure` comprise — garde sa valeur brute. Le
libellé et la valeur restent écrits une seule fois, dans `lib/index-projection.ts` — ce que la puce
n'avait pas à changer.

## Amendement — L'assemblage des options devient privé à la Recherche (#694, 2026-10-19)

La décision ne bouge pas : la valeur réservée reste `_sans-structure`, sa puce se lit « Sans
Structure » et filtre réellement. Cet amendement consigne ce que ce ticket rend faux dans la
décision, et rien d'autre.

La puce « **La Résolution des noms connaît la valeur réservée.** » cite
[`assemblerCategories`](../../lib/options-de-filtre.ts#L81-L95). Le module `lib/options-de-filtre.ts`
est supprimé : `assemblerCategories`, `assemblerMarques`, `assemblerTranches` et leur façade sont
désormais des fonctions privées de `lib/use-cases/search.ts`, que plus personne n'importe. Le lien est
donc mort, et la phrase ne désigne plus qu'une fonction interne. Les types `OptionDeFiltre`,
`OptionsDeFiltre` et `RepartitionsDeFacettes` sont exportés par la Recherche, et les surfaces client ne
les empruntent qu'en types. Ce que la puce garantit reste vrai par la même voie : l'assembleur ne fait
que `noms.get(value) ?? value` et retombe donc sur la valeur brute quand aucun libellé n'est résolu ;
la valeur réservée, elle, est résolue en amont de l'assemblage, dans `resoudreLesNomsDeCategories`,
exactement comme le dit l'amendement #693.

## Amendement — L'assemblage des options a quitté la Recherche (#726, 2026-10-21)

La décision ne bouge pas : la valeur réservée reste `_sans-structure`, sa puce se lit « Sans
Structure » et filtre réellement. Cet amendement consigne ce que #726 rend faux dans l'amendement
#694, et rien d'autre.

L'amendement #694 dit : « Le module `lib/options-de-filtre.ts` est supprimé : `assemblerCategories`,
`assemblerMarques`, `assemblerTranches` et leur façade sont désormais des fonctions privées de
`lib/use-cases/search.ts`, que plus personne n'importe. » C'est faux depuis #728 : les trois
assembleurs et leur façade sont des fonctions privées
de [`lib/filtre-de-recherche.ts`](../../lib/filtre-de-recherche.ts), derrière l'entrée
[`etatDesFiltres`](../../lib/filtre-de-recherche.ts#L275-L291). L'amendement dit aussi : « Les types
`OptionDeFiltre`, `OptionsDeFiltre` et `RepartitionsDeFacettes` sont exportés par la Recherche, et les
surfaces client ne les empruntent qu'en types. » C'est faux depuis #732 : les trois types sont
déclarés et exportés par le module neutre
([`:6-15`](../../lib/filtre-de-recherche.ts#L6-L15)), la Recherche les importe
([`lib/use-cases/search.ts:2-9`](../../lib/use-cases/search.ts#L2-L9)) et ne les réexporte plus
([`lib/use-cases/search-frontiere.test.ts:99-149`](../../lib/use-cases/search-frontiere.test.ts#L99-L149)).

La décision de #694, elle, ne se déplace pas : **l'assembleur reste privé et inimportable.** Aucun
appelant ne peut assembler les options et les puces séparément ; seule sa maison a changé, et le
chemin d'export des types avec elle. Ce qui était vrai le reste : `resoudreLesNomsDeCategories`
([`lib/use-cases/search.ts:69-85`](../../lib/use-cases/search.ts#L69-L85)) résout `_sans-structure`
avant l'assemblage, et les garanties de libellé sont inchangées — le libellé d'une puce est celui de
son option, et une catégorie que la Structure ne nomme pas garde son slug (`noms.get(valeur) ??
valeur`, [`lib/filtre-de-recherche.ts:189-202`](../../lib/filtre-de-recherche.ts#L189-L202)).
