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

## Amendement — La Lecture de la Structure possède la lecture, et le client ne traverse plus la marche (#564)

La décision ne bouge pas : des faits et non des verdicts, la mutation qui refuse pendant que les
lectures dégradent, une seule marche pour toute la Structure. Ce qui change, c'est **qui traverse la
marche** — et c'est la raison pour laquelle sa neutralité avait été argumentée qui tombe.

### Ce que cet amendement rend faux, et où le lire

Aucune ligne de la décision n'est changée, comme le veut la convention du fichier. Cinq passages
décrivent un état qui n'est plus le leur ; c'est le présent amendement qu'il faut y lire à côté :

- la première phrase de « Ce que la mesure établ » — « **Huit lectures de la Structure** », dont six
  se confondent en une seule sous le module qui les prend ;
- la première puce de la décision — « le même contrat de neutralité que `lib/carte-produit.ts`
  (ADR-0022) et `lib/formulaire-produit.ts` (ADR-0026), **parce qu'un de ses appelants est client** » ;
- la deuxième puce — « C'est l'argument déjà écrit à
  [delete-category-button.tsx:89-97](../../components/admin/delete-category-button.tsx#L89-L97) » : la
  citation de ligne n'est pas périmée, elle **ne désigne plus rien**. Le passage qui
  portait cet argument — le `descendDe` qui écartait d'une liste de cibles ce qui
  descend de la Structure supprimée — n'a pas été déplacé : il a été **supprimé**,
  parce que la règle qu'il portait est devenue une projection du cœur. `raisonVisible`,
  aux lignes 85-97 du fichier d'aujourd'hui, est la contrainte affichée avant tout
  clic, et n'a rien à voir avec la divergence boutique/mutation ; un lecteur qui
  s'y rendrait lirait un autre sujet. C'est l'amendement de #573 qu'il faut lire à
  cet endroit, comme ci-dessous ;
- la première puce des conséquences — « **Six lectures traversent une couture :** […] la boîte de
  suppression côté client » ;
- la troisième option écartée — « la divergence que
  [delete-category-button.tsx:93-97](../../components/admin/delete-category-button.tsx#L93-L97) argues
  ligne à ligne ».

L'en-tête du cœur énonce la même raison
([`marche-structure.ts:14-19`](../../lib/marche-structure.ts#L14-L19)), et le prologue de la garde
la répète ([`marche-structure-frontiere.test.ts:10-36`](../../lib/marche-structure-frontiere.test.ts#L10-L36)).
L'un et l'autre se corrigent avec le code qui retire la raison, non depuis un document : ni un module
de production ni une suite ne se réécrivent dans un ADR.

### Un module au-dessus du cœur, sur la forme du Devis

[`lib/use-cases/lecture-structure.ts`](../../lib/use-cases/lecture-structure.ts) est le module serveur
qui possède la lecture de la Structure : il lit la table une fois par exécution, en déduit une marche,
et répond de ce que la marche a parcouru comme de ce qu'une surface demande. C'est la forme que le
dépôt connaît déjà — un cœur pur, une entrée serveur au-dessus, deux portes au cœur, comme
[`devis.ts`](../../lib/use-cases/devis.ts) au-dessus de
[`devis-coeur.ts`](../../lib/use-cases/devis-coeur.ts) — et ce n'est pas un doublon de
[`admin-structure.ts`](../../lib/use-cases/admin-structure.ts) : celui-ci garde les mutations et les
lectures qu'elles jugent sous le verrou, que ce module ne sert pas (ADR-0027). **Il n'est pas neutre et
ne prétend pas l'être** : il lit la base. Le glossaire le nomme, et son en-tête déclare les deux
lectures qui restent hors de lui.

### Le compte des appelants, et leur nature

Cinq traversées restent, toutes serveur : le fil d'Ariane, la descendance d'une page de catégorie,
l'exclusion de réaffectation du formulaire d'édition, la liste de l'Administration et l'arbre
d'accueil. Les quatre premières perdent le `vus` qu'elles avaient écrit à la main et le tiennent
désormais par le module ; les deux dernières gardent ce qu'elles ne pouvaient pas avoir, le nom de ce
qu'elles effacent. **La sixième disparaît** : la boîte de suppression ne traverse plus la marche, elle
reçoit deux listes de cibles et une table de noms que la page lui passe, et `descendDe` disparaît
avec elle. La page les calculait alors sur la lecture qu'elle demandait à la Lecture ; elle les reçoit
aujourd'hui dans la forme que cette lecture rend (voir l'amendement suivant). Ce qui traverse alors la couture client, ce sont des identifiants et des noms — la règle
d'ADR-0028 appliquée à une forme plus large, jamais une fonction.

La marche se retrouve ainsi avec **un seul appelant de production**, le module qui la possède. Les
quatre qu'elle avait — [`storefront.ts`](../../lib/use-cases/storefront.ts),
[`app/admin/categories/page.tsx`](../../app/admin/categories/page.tsx),
[`app/admin/categories/[id]/page.tsx`](../../app/admin/categories/[id]/page.tsx) et le composant
client — passent tous par lui.

### La neutralité reste, sa raison change

Le contrat tient toujours, et la garde qui le prouve aussi : la projection pure qui produit la
partition et son complément reste dans le cœur, donc **importable des deux côtés**. C'est ADR-0028 qui
décide qu'une valeur partagée par le serveur et par le client habite un module qu'aucun des deux ne
réclame ; la forme qu'elle prend ici est plus grande qu'une constante, pas différente. Ce qui
disparaît, c'est l'appelant qui rendait cette exigence actuelle : plus aucun module `"use client"`
n'atteint la marche, et l'exigence devient une condition de conception — le jour où une surface
cliente aura de nouveau besoin d'une projection pure de la Structure, elle la trouvera ici sans qu'une
décision soit à reprendre.

Le module qui possède la lecture porte **l'épreuve inverse** : il n'atteint aucun module client, et il
le prouve par le même graphe d'imports. Les deux gardes sont inverses l'une de l'autre, et c'est ce
qui permet de les écrire toutes les deux sans rien inventer.

### La divergence reste visible, et elle change de forme

L'option écartée « un module qui rend le verdict » reste la bonne option, et sa raison aussi : un
verdict rendu par la marche rendrait la boutique et l'Administration identiques. Mais l'argument ne se
lit plus dans un composant client. Il se lit dans le fait que la boîte **propose** et que le serveur
seul **refuse** : la page lui passe des cibles déjà triées, `deleteCategory` garde seul le refus d'une
cible cyclique, et un cycle déjà en base laisse la cible proposée. La boutique dégrade comme devant ;
c'est la forme de la divergence qui change, pas sa direction.

### La troisième preuve de la garde s'inverse, la garde ne tombe pas

[`marche-structure-frontiere.test.ts`](../../lib/marche-structure-frontiere.test.ts) comptait sept
épreuves, et la troisième — « le composant client traverse la Marche, et n'atteint ni la base ni une
lecture serveur », lignes 159-196 — affirmait l'inverse de ce que ce changement décide. **Elle n'a
pas disparu : elle a été retournée.** C'est
[#573](https://github.com/eloaurdi/eguidar/issues/573) qui l'a fait, et non le présent amendement,
qui ne touche aucune suite ; là où elle affirmait qu'un module client atteignait le cœur, elle
affirme aujourd'hui qu'**aucun** module `"use client"` du dépôt ne l'atteint, sur l'ensemble des
clients déduits de leur directive.

La forme inverse est plus forte que la forme qu'elle remplace, et c'est pour cela qu'elle vaut
mieux que sa suppression : l'ancienne prouvait la neutralité *actuelle* — un client atteignait
réellement le cœur —, la nouvelle la prouve *structurelle*, sur tout le dépôt et non sur un
composant. La liste des symboles que le module doit porter s'est allongée de trois entrées au
passage — `liensDesStructures`, `comparerParNom` et la forme `StructureOrdonnee` qui porte les
deux faits que l'ordre compare — parce qu'une garde qui n'énonce pas ce qu'elle garde est verte
pour une raison qu'elle ne connaît pas.

Restent la neutralité du module lui-même, la neutralité **par transit** du graphe de valeur, le
parcours non vacuant, l'affirmation que les aides de frontière sont hors du graphe, et surtout **les
deux contre-épreuves** — la violation synthétique écrite dans le vrai fichier, et le voisin qui
l'emprunte sans être la graine. Elles interdisent qu'une garde verte le soit parce qu'elle ne suit
rien, et leur valeur ne dépendait pas de la troisième épreuve : celle-ci n'était qu'une forme
positive de plus, et sa forme positive est désormais portée par l'autre garde.

### Ce que cet amendement ne change pas

- **La règle de terminaison reste dans le cœur pur**, et le cœur n'a pas bougé : ni lecture, ni
  directive, ni crochet, ses deux points d'entrée conservés.
- **La divergence boutique/mutation tient en entier** : la boutique dégrade, la mutation refuse, et
  `CategoryAncestorCycleError` reste le seul à lever ce refus.
- **Rien n'est rouvert** : ni le plafond de profondeur, ni l'index absent sur `parentId`, ni la
  création qui n'appelle toujours pas la marche d'acyclicité.
- **Les neuf classes de refus** et la réindexation d'une Structure déplacée restent hors de ce
  travail ; elles ont leur chantier.

### Ce que l'épreuve montre aujourd'hui

Relevé sur l'arbre avant que le code ne bouge : la marche a **quatre** appelants de production, dont
[`components/admin/delete-category-button.tsx`](../../components/admin/delete-category-button.tsx) —
un module `"use client"` — ; la garde passe ses sept épreuves, contre-épreuves comprises, et la
contre-épreuve de type échoue bien là où elle doit échouer, ce qui distingue `atteignables` d'`importeDe`.
L'épreuve de ce changement appartient à [#573](https://github.com/eloaurdi/eguidar/issues/573) : la
boîte ne rend plus de parcours sur des littéraux, et la garde du cœur n'affirme plus de client. Ce que
le présent amendement rend mesurable est le compte — quatre appelants, dont un client — qu'il fait
tomber à un.

## Amendement — Une seule promesse d'ordre, et elle est écrite dans le cœur (#564)

La décision ne bouge pas : des faits et non des verdicts, la mutation qui refuse pendant que les lectures
dégradent, une seule marche pour toute la Structure. Cet amendement consigne deux décisions que le travail a
prises **après** que l'amendement précédent eut été écrit, et que ce dépôt n'enregistre nulle part
ailleurs.

### Une seule promesse d'ordre, écrite dans le cœur neutre

L'amendement ci-dessus dit « le module promet un ordre, et le propre » : le tri se fait en JavaScript, avec
la comparaison que le dépôt écrivait déjà. Il ne dit pas **où cette comparaison est écrite**, et la question
a reçu deux réponses pendant un temps.

Pendant une forme, deux comparateurs coexistaient : `comparerParNom` dans
[`marche-structure.ts`](../../lib/marche-structure.ts) — nom en français départagé par l'**identifiant** — et
`comparerDesFreres` dans [`lecture-structure.ts`](../../lib/use-cases/lecture-structure.ts) — nom en français
départagé par le **slug**. Les deux étaient exacts, tous deux rendaient l'ordre total, et rien ne les
rapprochait : les cibles de suppression d'une page d'Administration se classaient par `cuid` pendant que les
lignes de la même page, le sélecteur d'un formulaire, les puces d'une catégorie et les candidats d'un
formulaire se classaient par slug. Une page pouvait donc servir deux catalogues à un éditeur, et US 5, US 30
et US 31 — « une seule promesse d'ordre » — étaient fausses sans qu'aucune des deux règles ne soit fausse.

**La décision : le comparateur est écrit une fois, dans le cœur, et le module le reprend tel quel.**
`comparerParNom` est **exporté** par `marche-structure.ts` ; les six projections de la Lecture l'importent
plutôt que d'écrire le leur. Le départage est l'**identifiant**, non le slug, parce que le cœur est neutre et
que `StructureLue` ne porte pas de slug : l'ajouter contraindrait chaque appelant — y compris une future
surface cliente qui n'aurait qu'un `cuid` sous la main — à fournir un fait dont la comparaison n'a pas besoin.
L'identifiant est unique, donc l'ordre reste total et ne dépend d'aucune machine, ce qui est exactement la
promesse qu'US 30 demande.

**Ce qui est prouvé, et où.** Une recette partagée — [`test/ordre-structures-recette.ts`](../../test/ordre-structures-recette.ts)
— porte la fixture et l'ordre attendu, et chaque projection la rejoue. La fixture croise les deux règles : deux
Structures de même nom dont les slugs sont rangés à l'opposé de leurs identifiants, et deux noms dont la
collation française inverse l'ordre des octets. Sans ce croisement, deux départages différents donneraient la
même suite et la contradiction resterait invisible. Une seconde épreuve compare les rendus **côte à côte**,
parce que tenir chaque projection à un ordre écrit ne dit pas qu'elles classent pareil.

### Les cibles de suppression quittent la ligne d'Administration

L'amendement ci-dessus dit que la boîte de suppression « reçoit deux listes de cibles et une table de noms que
la page a calculées ». Il ne dit pas **quelle forme** les porteait, et la forme écrite était la ligne
elle-même : `LigneStructureAdmin` portait `ciblesProduits` et `ciblesSousCategories`, donc chaque ligne
portait les cibles de toutes les autres. C'est le contredit de l'exigence que cet amendement porte par
ailleurs — « une surface ne reçoit pas plus qu'elle n'a demandé » (US 32).

Les deux listes ont donc **leur propre forme**, `CiblesSuppression`, rendue par la même projection dans le
même retour : une lecture, une marche, une ligne de journal par cycle, et deux formes étroites. L'écran
d'Administration joint les deux par identifiant, et ne reçoit plus sur une ligne un fait qui n'est pas le
sien.

**Le coût en props n'est pas supprimé, et il reste consigné** : une liste de cibles par ligne, sur une page
qui a une ligne par Structure, donc des props au carré du nombre de Structures. Le § Further Notes du spec
l'énonce et ne le traite pas ; cet amendement le reprend tel quel, et la forme `EcranAdminStructure` est le
lieu où il se lit. Passé deux cents Structures, la partition devrait être hissée dans un module client unique
qui rendrait toutes les boîtes — décision qui appartient à ce module, pas à une page.

### Ce que cet amendement ne change pas

- **La règle de terminaison** reste dans le cœur pur, et le cœur n'a pas bougé : ni lecture, ni directive, ni
  crochet, ses deux points d'entrée conservés.
- **La divergence boutique/mutation** tient en entier, et la forme qu'elle prend dans la boîte ne change pas.
- **La neutralité du cœur** reste une condition, et sa garde reste la même — à l'exception du changement
  consigné plus bas sur l'instrument de ses contre-épreuves.
- **Rien n'est rouvert** : ni le plafond de profondeur, ni l'index absent sur `parentId`, ni la création qui
  n'appelle toujours pas la marche d'acyclicité.

### L'instrument de frontière, et le changement qu'il a reçu

Les gardes de ce dépôt se lisent sur la **directive** d'une source. `directive`, dans
[`outils-frontiere.ts`](../../lib/use-cases/outils-frontiere.ts), lisait la **première** entrée du prologue ;
il lit désormais la première réclamation **reconnue** de tout le prologue. Une source qui ouvre par
`"use strict";` puis réclame `"use client"` passait donc pour neutre, et une garde qui déduisait ses modules
clients d'une telle lecture était verte par une absence de classement et non par une absence d'arête — le
défaut que toute contre-épreuve doit traquer.

Le changement **n'était demandé par aucun ticket** : il a été fait pour que le balayage de la nouvelle garde
ne puisse pas être contourné par un `use strict` en tête de fichier. Il est consigné ici parce qu'il touche
cinq gardes par transit, et parce que [`outils-frontiere.test.ts`](../../lib/use-cases/outils-frontiere.test.ts)
est désormais la suite qui possède ces aides : les deux directions du contrat de `directive` — une réclamation
après une autre entrée du prologue **est** reconnue, une chaîne ordinaire qui contient `"use client"` ne
l'est pas — y sont éprouvées avec la limite assumée, et les cinq gardes qui les empruntent n'ont plus à le
faire chacune de leur côté. C'est ce qui rend leur consolidation future possible sans le risque d'une
dérive (cf. § hors périmètre du spec : « les douze gardes de frontière »).
