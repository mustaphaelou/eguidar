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
