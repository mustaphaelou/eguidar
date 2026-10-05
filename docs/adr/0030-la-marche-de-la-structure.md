# La Marche de la Structure a un seul propriétaire, et il ne décide de rien

Un cycle dans la table `Category` rendait trois marches du dépôt sans borne, et la règle qui les
borne était écrite à la main quatre fois. ADR-0027 l'a dit en son nom : « Le renvoi lui-même —
"Suivi à part" — reste exact : **c'est ce suivi** » ([0027:495](0027-serialisation-des-mutations-de-structure.md)).
Le suivi est pris ici.

## Ce que la mesure établ

**Huit lectures de la Structure, quatre implémentations de la règle, et pas une borne là où l'on
attendait l'être.** Le verrou d'ADR-0027 interdit de former un cycle par l'interface — pas d'en
recevoir un : un import, une reprise, une correction manuelle. Le schéma ne peut pas l'empêcher
non plus, `Category_parentId_fkey` étant `ON DELETE SET NULL` sans garde
([schema.prisma:86-87](../../prisma/schema.prisma)).

**Ce qui bouclait ne ralentissait rien : cela ne s'arrêtait pas.** Les trois marches sans borne
lisent une `Map` en mémoire et leur corps de boucle ne fait **aucune I/O**. Aucun
`statement_timeout`, aucune option de `$transaction`, aucun `maxDuration` dans
[next.config.ts](../../next.config.ts) ne les atteindrait : le délai de 5 000 ms de Prisma ne
s'applique qu'à une transaction, et ces lectures n'en sont pas une. Le rendu serveur
([storefront.ts:212-243](../../lib/use-cases/storefront.ts)) tourne donc sur une CPU et un tas
qui croissent, et ne se résout jamais. Pire sous `"use cache: remote"`
([storefront.ts:326-333](../../lib/use-cases/storefront.ts)) : un seul tour brûle une entrée de
cache pendant toute sa durée de vie.

**L'invisibilité a deux formes, et la pire n'est pas celle qu'on attendait.** `buildRows`
([app/admin/categories/page.tsx:27-47](../../app/admin/categories/page.tsx)) et `buildCategoryTree`
([storefront.ts:88-110](../../lib/use-cases/storefront.ts)) ne bouclent pas : ils descendent
depuis le nœud racine et **effacent** les Structures cycliques sans un mot. La seconde est
côté boutique. Une branche entière disparaît de la page d'accueil.

## Décision

- **Un module neutre possède la marche.** `lib/marche-structure.ts` — ni `"use client"`, ni
  `@/lib/db`, ni `next/headers`, ni `server-only` : le même contrat de neutralité que
  `lib/carte-produit.ts` (ADR-0022) et `lib/formulaire-produit.ts` (ADR-0026), parce qu'un de ses
  appelants est client. Son interface est **synchrone** et purement fonctionnelle : des faits
  (`parentId` en mémoire) en entrée, des faits en sortie.

- **Elle répond des faits, jamais des verdicts.** Elle arrête la boucle — **toute** revisite, sans
  exception qui la laisserait passer — et rend ce qu'elle a parcouru. Ce qu'un cycle signifie
  reste à l'appelant. C'est l'argument déjà écrit à
  [delete-category-button.tsx:89-97](../../components/admin/delete-category-button.tsx), qui n'avait
  jusqu'ici aucune couture où vivre : il devient un paramètre au lieu d'une convention.

- **La divergence entre le client et le serveur est délibérée, et c'est le cœur de la décision.**
  La mutation **refuse** une Structure cyclique ; les lectures **dégradent** et rendent une page.
  Ce n'est pas une incohérence à corriger : la boutique n'a personne à qui rendre une faute, et
  refuse déjà ainsi une colonne JSON abimée. Le `console.warn` qui nomme la Structure et le cycle
  est la seule exception, et il vit dans la marche — donc journalisé une fois par cycle, non
  une fois par surface.

- **Les Structures hors arbre se nomment dans l'Administration.** La liste des catégories affiche
  ce qu'aucune branche n'atteint. C'est le seul endroit du dépôt où un cycle devient visible d'un
  être humain, donc le seul depuis lequel on peut le réparer. La boutique journalise et n'expose
  rien : un visiteur n'a ni action ni vocabulaire pour cela.

- **Un seul propriétaire du refus, inchangé.** `assertAcyclicCategoryTree` reste lié à sa
  transaction. ADR-0027:132-134 l'y a mis, et il y reste : il raisonne sur des faits engagés, il
  porte un second refus — « catégorie parente inconnue » — qui n'est pas un cycle, et il doit
  juger sous le gros verrou. Lui seul lève `CategoryAncestorCycleError`. La marche ne le remplace
  pas et ne l'absorbe pas.

## Ce que cette décision refuse de rouvrir

- **Aucune profondeur maximale.** ADR-0027:528-534 l'a déjà rejetée : « il borne sans détecter, et
  il introduirait une règle d'affaires neuve ». La marche rejette les revisites, pas la longueur.
- **`@@index([parentId])` reste absent.** Le schéma n'a ni index sur `parentId` ni garde de cycle,
  alors que `Product` porte `@@index([categoryId])`. C'est une migration à son propre blast radius,
  pas une suite de marche ; elle est signalée, pas reprise ici.
- **`createCategory` n'appelle toujours pas `assertAcyclicCategoryTree`.** Sûr par construction —
  une rangée neuve n'a aucune descendante — mais l'invariant reste implicite et le restera.

## Options écartées

- **Ajouter un `vus` aux trois boucles et s'arrêter là.** Le correctif le plus petit et le plus
  rapide ; il a été écrit d'abord, à la main, quatre fois. Il laisse quatre copies de la règle,
  deux surfaces qui effacent en silence, et nulle part nulle part où la corruption se voie. Écarté parce
  qu'il paie la règle sans la rentsablir.
- **Un résolveur de lien branchable, synchrone ou asynchrone.** Uniformité pour un seul appelant
  asynchrone — et dont la moitié asynchrone **ne peut pas** faire le travail : « catégorie parente
  inconnue » et le gros verrou la rendent autre chose. Écarté : une abstraction dont une branche
  n'a qu'un appelant et ne peut pas le servir.
- **Un module qui rend le verdict.** Le symétrique de la présente décision, et le plus tentant :
  il rend chaque appelant plus court. Écarté parce qu'il rend le client et le serveur identiques —
  c'est-à-dire supprime exactement la divergence que
  [delete-category-button.tsx:93-97](../../components/admin/delete-category-button.tsx) argues
  ligne à ligne, et qu'un prochain lecteur « corrigerait » en voyant deux surfaces se comporter
  différemment sur le même fait.

## Conséquences

- **Six lectures traversent une couture :** le fil d'Ariane, la descendance d'une page de catégorie,
  l'exclusion de réaffectation du formulaire d'édition, la boîte de suppression côté client, et —
  pour la seule détection d'un cycle hors arbre — la liste de l'Administration et l'arbre d'accueil.
  Les quatre premières perdent leur `vus` écrit à la main ; les deux dernières gagnent ce qu'elles
  ne pouvaient pas avoir : nommer ce qu'elles effacent.
- **L'écriture de l'index ne traverse pas la marche.**
  [index-projection.ts](../../lib/index-projection.ts) lit une catégorie, sans `parentId`, et
  [readIndexableCategoryProducts](../../lib/use-cases/admin-structure.ts) est un `where: { categoryId }`
  plat. Une réaffectation ne réindexe donc que les Produits de la Structure déplacée, pas ceux de
  ses descendantes — fait connu, hors de cette décision.
- **Une couture traversable par un module client mérite une garde de frontière.** Le contrat de
  neutralité ci-dessus n'est vrai que parce qu'on l'écrit ; `formulaire-produit-frontiere.test.ts`
  est le modèle.
- La fixture `planterUnCycleEnBase` existe en double
  ([admin-structure.test.ts:100](../../lib/use-cases/admin-structure.test.ts),
  [storefront.test.ts:47](../../lib/use-cases/storefront.test.ts)) et chacune est locale à sa suite.
  Elle rejoint `test/`, aux côtés d'un arbre propre, avant qu'une troisième marche ne la recopie.

*Mesures citées à `7dfabb6` et sur le diff ouvert de #540. L'amendement de #540 — les deux gardes
portées par [storefront.ts](../../lib/use-cases/storefront.ts) — est le premier consommateur de la
marche, et son commentaire « La boutique dégrade, elle ne refuse pas » en est la spécification.*
