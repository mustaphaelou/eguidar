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
pour une raison qu'elle ne connaît pas. Les trois sont dans la liste du cœur
([`marche-structure-frontiere.test.ts`](../../lib/marche-structure-frontiere.test.ts#L74-L89)) : c'est
la garde de ce module, et le seul endroit du dépôt où elles sont énoncées. `comparerParNom`
figure en outre dans celle de la Lecture
([`lecture-structure-frontiere.test.ts`](../../lib/use-cases/lecture-structure-frontiere.test.ts#L82-L108)),
qui le réexporte — donc deux gardes le nomment, et lui seul énonce les deux autres. **C'est la
dernière phrase qui n'est plus vraie** : le réexport est supprimé et la seconde garde cesse de
le nommer, comme le dit
[l'amendement de #585](#amendement--la-topologie-de-la-structure-a-un-seul-propriétaire-et-une-structure-hors-arbre-se-rend-une-fois-585) ;
les deux premières phrases, elles, tiennent toujours.

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
`comparerParNom` est **exporté** par `marche-structure.ts` ; les projections de la Lecture qui classent
l'importent plutôt que d'écrire le leur — **cinq** sur six : le fil d'Ariane rend un chemin, pas un
classement, et n'a donc rien à comparer. Le départage est l'**identifiant**, non le slug, parce que le cœur est neutre et
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
trois gardes par transit — celle de la Marche, celle de la Lecture et celle des actions d'Administration, les
seules à appeler `directive`, directement ou par `empruntsDeValeur` qui l'appelle pour elles —, et parce que
[`outils-frontiere.test.ts`](../../lib/use-cases/outils-frontiere.test.ts)
est désormais la suite qui possède ces aides : les deux directions du contrat de `directive` — une réclamation
après une autre entrée du prologue **est** reconnue, une chaîne ordinaire qui contient `"use client"` ne
l'est pas — y sont éprouvées avec la limite assumée, et les trois gardes qui les empruntent n'ont plus à le
faire chacune de leur côté. C'est ce qui rend leur consolidation future possible sans le risque d'une
dérive (cf. § hors périmètre du spec : « les douze gardes de frontière »).

## Amendement — L'index inverse est un fait de la marche, bâti une fois à sa construction (#584)

La décision ne bouge pas : des faits et non des verdicts, la mutation qui refuse pendant que les
lectures dégradent, une seule marche pour toute la Structure. Cet amendement consigne une décision
prise après que les deux précédents eurent été écrits, et que ce dépôt n'enregistre nulle part
ailleurs : **à qui appartient l'index inverse des liens**.

### La décision, et le coût qui l'impose

La marche bât cet index — chaque parente et ses enfants, les racines que les liens déclarent — pour
descendre. Il l'était dans `descendance` **puis** dans `horsArbre`, donc une fois par question, et la
liste d'Administration — qui demande la partition de chaque ligne — en demandait un par ligne :
**N+1 sur N lignes, à O(N) chacune**. L'en-tête annonçait depuis le début le contraire, une marche
« assez peu chère pour être construite une fois par requête », et cette promesse n'était tenue qu'en
mots : le code en était l'exception. **Le coût est ce qui décide ici** : c'est l'écran qui interroge
la marche une fois par ligne qui rend cette promesse fausse, et rien d'autre ne le fait.

**La décision : l'index est bâti une fois, à la construction de la marche, et `descendance` comme
`horsArbre` lisent cette instance-là.** La question n'était donc pas « où le bâtir », mais « à qui il
appartient » : c'est un fait de la marche, et non de ses méthodes. Cela ferme deux fenêtres : une
méthode future ne peut plus rebâtir un index sans qu'une épreuve le dise, et le hors arbre comme la
descendance ne peuvent plus dériver de deux topologies concurrentes alors qu'il n'y en a qu'une.

### Ce que cet amendement ne change pas

- **L'interface de la marche ne grandit pas** : ni membre ajouté, ni membre retiré, ni type retypé —
  donc la garde qui énumère les symboles du cœur passe sans amendement.
- **La règle de `indexDesLiens` est celle d'hier** : une parente `null` est une racine, toute autre
  clé est une clé de regroupement. Et tout ce que la marche rend — ancêtres, descendance, hors arbre,
  la partition — rend exactement les mêmes faits qu'avant.
- **Le journal n'est pas touché** : une ligne par cycle et par marche, dédoublonnée par l'ensemble
  **trié** des liens du cycle, résumée au-delà de dix maillons.
- **Le module qui possède la lecture n'est pas édité** :
  [`lib/use-cases/lecture-structure.ts`](../../lib/use-cases/lecture-structure.ts) reste inchangé, et
  rien de ce qu'il demande à la marche n'a bougé.
- **Rien n'est rouvert** : ni l'élargissement de l'interface ni le regroupement dupliqué de la
  Lecture — qui appartiennent à l'issue suivante, distincte de celle-ci —, ni la question de la
  parente absente, ni les deux branches défensives — le garde de boucle de la remontée, la promotion
  dans le regroupement —, ni l'aveuglement de la garde qui surveille les lectures de la relation hors
  du cœur, ni la base et son index absent sur `parentId`.

### Ce que l'épreuve montre aujourd'hui

Le compte vit dans la suite du cœur lui-même —
[`lib/marche-structure.test.ts`](../../lib/marche-structure.test.ts), sans base de données, comme
toutes les épreuves de la marche — et il est pris **à la seule couture où une construction se voit** :
`LiensStructure.parentParId`, la carte que l'appelant fournit, puisque bâtir l'index c'est énumérer
ses paires. Un `Proxy` posé sur elle compte donc les lectures qui énumèrent et laisse passer les
autres — `keys()` et `get()`, que le hors arbre et la remontée font légitimement. Aucune fonction
privée n'est nommée, aucune forme interne n'est affirmée : la preuve ne tient à aucun contenu, donc
elle tient à toute réécriture du cœur. Une épreuve voisine s'assure que la couture **voit** une
énumération quand il y en a une, sans quoi le compte vaudrait aussi bien sur une couture qui ne
compte rien.

Les autres épreuves du cœur — ancêtres, descendances, hors arbre, partition, ordre, cycles, chaînes
longues — passent inchangées : ce sont elles qui disent que les rendus n'ont pas bougé, et la garde
énumère toujours les mêmes symboles.

## Amendement — La topologie de la Structure a un seul propriétaire, et une Structure hors arbre se rend une fois (#585)

La décision ne bouge pas : des faits et non des verdicts, la mutation qui refuse pendant que les
lectures dégradent, une seule marche pour toute la Structure, une neutralité qui tient. Cet amendement
consigne une décision prise après que les trois précédents eurent été écrits, et que ce dépôt
n'enregistre nulle part ailleurs : **à qui appartient la réponse à « qui descend de qui »**.

### La décision, et la duplication qu'elle supprime

Le fait était déduit en **quatre endroits, dans deux modules**, et les quatre déductions ne
répondaient pas à la même question. Le cœur en bâtissait une version — son index inverse, à la
construction depuis [l'amendement de #584](#amendement--lindex-inverse-est-un-fait-de-la-marche-bâti-une-fois-à-sa-construction-584) —
mais ne le rendait à personne : chaque surface regroupait les liens par parente pour elle-même. Et une
de ces copies ne répondait pas comme le cœur : là où la marche range parmi les Structures hors arbre
toute Structure dont la parente ne nomme aucune rangée, le regroupement la **promouvait en racine**. La
boutique lui offrait donc une branche qu'aucune branche ne porte, et la liste d'Administration pouvait
la rendre deux fois — une fois comme souche, une fois comme hors arbre.

Les deux règles ne s'accordaient que parce qu'un filtre hors arbre se tenait entre elles, dans le
contrôle de flux d'un module : un fait de procédure, pas une garantie d'aucun type. **La règle
n'était donc pas en conflit — elle était dupliquée, et sa cohérence ne tenait qu'à un emplacement.**

**La décision : l'interface de la marche rend la topologie.** Deux méthodes, `racines` et `enfantsDe`,
rendent des identifiants dans l'ordre du module ; aucune carte de la topologie ne sort du cœur, donc
aucune surface ne peut la réordonner. Le module qui possède la lecture garde sa carte d'identifiant
vers la **rangée entière** — celle-là répond à une autre question, « quel est le slug de cette
Structure », et la fondre obligerait le cœur à connaître un slug, une image et un compte de Produits,
donc à cesser d'être neutre (ADR-0028).

Ce qui change dans les faits, et dans une seule direction : **une Structure dont la parente ne nomme
aucune rangée n'est plus rendue deux fois dans l'Administration**, et n'est plus offerte comme racine
à la boutique. Ses listes de cibles, son compte de sous-catégories et sa ligne unique ne changent pas —
c'est une **dégradation**, pas une perte, et c'est la dégradation que ce document promettait déjà.

### Ce que cet amendement rend faux, et où le lire

Comme l'amendement de #564, celui-ci ne réécrit aucune ligne de la décision : il consigne à côté ce
qui n'est plus vrai. Deux passages la décrivent, et c'est le présent amendement qu'il faut y lire :

- la dernière phrase de « La troisième preuve de la garde s'inverse, la garde ne tombe pas » —
  « `comparerParNom` figure en outre dans celle de la Lecture […], **qui le réexporte** — donc deux
  gardes le nomment ». Le réexport est supprimé : la Lecture **emprunte** le comparateur et ne le rend
  plus, donc sa garde cesse de l'énoncer. Les deux phrases précédentes — le comparateur est dans la
  liste du cœur, et cette liste est le seul endroit où les trois formes sont énoncées — restent vraies,
  et cet endroit est aujourd'hui **unique** ;
- la puce « **L'interface de la marche ne grandit pas** » de l'[amendement de #584](#amendement--lindex-inverse-est-un-fait-de-la-marche-bâti-une-fois-à-sa-construction-584)
  — ni membre ajouté, ni membre retiré, ni type retypé. Elle ne vaut plus : `MarcheStructure` gagne
  `racines` et `enfantsDe`. Elle reste vraie pour l'amendement de #584 lui-même, et c'est la forme que
  ce changement prend qu'il faut y lire : **une interface qui s'élargit**, et une garde qui s'allonge
  mécaniquement.

L'en-tête du cœur et celui du module de lecture disent la même chose de la topologie — l'un par la
place qu'elle occupe dans la liste des surfaces qui traversent le cœur, l'autre par celle qu'elle occupe
parmi les questions d'une lecture — et tous deux se corrigent avec le code, non depuis ce document.

### Ce que cet amendement ne change pas

- **Aucune contradiction avec la décision.** Elle fixe la neutralité du cœur, sa synchronie et le fait
  que le lien de parenté est consommé en mémoire ; elle n'énumère pas les faits que le cœur peut
  détenir. Deux méthodes qui répondent à des questions que le cœur calcule déjà sont dans cette marge,
  et la neutralité se prouve toujours par le graphe d'imports
  ([`marche-structure-frontiere.test.ts`](../../lib/marche-structure-frontiere.test.ts)), qui n'a pas
  bougé.
- **La règle de terminaison ne change pas** : toute revisite arrête, comme avant. La **finité** de la
  topologie de l'arbre, elle, devient une **promesse** de l'interface, et c'est ce qui permet au cumul
  des Produits de l'accueil de perdre son garde de boucle : une boucle ne peut pas pendre à une racine,
  parce que chaque maillon d'un cycle a sa parente *dans* le cycle. Le cas n'est pas rare, il est
  impossible, et une garde dont la nécessité est un commentaire est un commentaire avec un coût
  d'exécution.
- **Aucune profondeur maximale** n'est introduite : ADR-0027 l'a refusée, et la finité qui vient d'être
  promise ne s'en approche pas.
- **La divergence boutique/mutation tient en entier** : la boutique dégrade, la mutation refuse,
  `CategoryAncestorCycleError` reste le seul à lever ce refus.
- **La forme du retour de l'écran d'Administration n'est pas touchée** — deux tableaux parallèles,
  joints par identifiant sur la page, avec une assertion non nulle. C'est une préoccupation de forme et
  non de duplication, et ADR-0030 consigne déjà son coût et le jour où il sera payé.
- **Rien n'est rouvert** : ni le seuil qui surveille les lectures de la relation hors du cœur — dont
  l'angle mort est un travail distinct —, ni la prémisse des deux gardes de frontière, qui reste une
  recherche de sous-chaîne, ni le schéma et son index absent sur `parentId`, ni la catégorie d'un
  document de recherche.

### Ce que l'épreuve montre aujourd'hui

Les deux méthodes sont éprouvées dans la suite du cœur, sur des **littéraux**, sans base :
[`lib/marche-structure.test.ts`](../../lib/marche-structure.test.ts) — racines dans l'ordre du module,
fratrie dans l'ordre du module, la parente absente qui **n'est pas** une racine, la finité de la
topologie prouvée en descendant réellement, et le compte des lectures qui énumèrent les liens, repris
de l'amendement de #584 pour montrer que ces deux questions lisent le même index.

L'épreuve qui manquait le plus est **entre les deux coutures** :
[`lecture-structure-portes.test.ts`](../../lib/use-cases/lecture-structure-portes.test.ts) fait lire
la table par une porte de lecture, projette les mêmes rangées par sa jumelle pure, et **compare les
deux sorties** — pour les six portes, chacune son `lire…` et son `projeter…`. Chaque question se
prouvait deux fois, dans deux fichiers, sans que les deux preuves soient jamais confrontées : c'est là
que la divergence s'était logée. La comparaison ne se cache plus derrière « c'est l'autre chemin qui
fait ça ».

Et l'invariant que ce travail fixe est désormais nommé : une Structure dont la parente ne nomme
aucune rangée apparaît **exactement une fois** dans la liste d'Administration, et **absente** de
l'arbre d'accueil. Aucune épreuve ne l'énonçait, et c'est pourquoi la duplication était invisible.

## Amendement — Une lecture de la relation est une exception nommée, et la liste est la règle (#604)

La décision ne bouge pas : des faits et non des verdicts, la mutation qui refuse pendant que les lectures
dégradent, une seule marche pour la Structure, une neutralité qui tient. Cet amendement consigne une
décision prise après que les quatre précédents eurent été écrits, et que ce dépôt n'enregistre nulle
part ailleurs : **ce que le seuil qui surveille les lectures de la relation hors du cœur appelle une
lecture, et où passe la ligne**.

### Ce que le seuil appelle une lecture, et où passe la ligne

Le seuil tient en quatre sujets, chacun dans sa suite : la frontière client dans
[`lecture-structure-frontiere.test.ts`](../../lib/use-cases/lecture-structure-frontiere.test.ts), la
reconnaissance dans
[`lecture-structure-reconnaissance.test.ts`](../../lib/use-cases/lecture-structure-reconnaissance.test.ts),
la liste nommée dans
[`lecture-structure-seuil.test.ts`](../../lib/use-cases/lecture-structure-seuil.test.ts), la porte par
écran dans
[`lecture-structure-portes.test.ts`](../../lib/use-cases/lecture-structure-portes.test.ts). Sa forme
n'est écrite en littéral nulle part : `formeDeLaStructure` la lit dans
[`schema.prisma`](../../prisma/schema.prisma), et rend le modèle, son délégué, la seule rangée qui
porte la relation vers lui, et le champ de cette relation. Un second modèle qui se porterait lui-même ne
ferait pas _désarmer_ la reconnaissance : il la **fait tomber**, sur un schéma qui en porterait deux.

Deux voies, et le seuil les compte l'une et l'autre.

- **Le délégué, par n'importe quel récepteur** — `prisma`, `tx`, `client`, `session`. La Transaction et
  la poignée comprises, parce que ce ne sont pas là des noms propres à une mutation : `assertUniqueCategorySlug`
  et `assertCategoryParent` reçoivent leur client en paramètre
  ([`admin-structure.ts:198`](../../lib/use-cases/admin-structure.ts#L198),
  [`:208`](../../lib/use-cases/admin-structure.ts#L208)), et c'est sous cette forme que la lecture se
  fait, au moment où le refus se décide. Le délégué est vu qu'il soit atteint par une propriété nommée
  ou par un nom lié : `const { category } = prisma`, `const alias = prisma.category`, et l'appel en
  optionnel `prisma.category.findMany?.()` sont trois lectures, non trois souvenirs. Un nom qui n'est
  pas le délégué, ou un nom lié sans appel, ne réveille rien.
  Les délégations d'écriture sont exemptées, et **l'exemption vient d'une liste tenue au seuil**,
  `ECRITURES_DELEGUEES`. Ce que la suite prouve de cette liste est un seul sens : chacune de ses
  entrées est bien une délégation que le client généré documente. Elle ne prouve pas que cette liste
  soit complète, et l'amendement ne l'affirme pas — l'ensemble est complet aujourd'hui, le code ne le
  démontre pas.
- **La relation, atteinte par une rangée qui l'amène** — en `include` ou en `select`, d'un niveau ou de
  deux. Le seuil suit le pointeur à travers `variants` comme à travers `product`, ce qui vaut pour
  [`admin-catalog.ts:489`](../../lib/use-cases/admin-catalog.ts#L489) autant que pour une rangée de
  premier niveau.

Ce que le seuil **ne** voit pas est écrit en clair dans la même suite, sous forme de sources dont la
reconnaissance doit rendre une liste vide : un filtre scalaire `where: { categoryId }`, un filtre de
relation `where: { category: { is: null } }`, une écriture qui raccorde une catégorie, et l'accès à une
propriété déjà chargée, qui n'est pas une requête.

**La ligne : le cœur possède la topologie, et une rangée n'en est qu'un pointeur.** C'est la
formulation qu'emploient les raisons voisines — « le pointeur d'une seule rangée, pas sa place dans
l'arbre », « l'existence d'une seule rangée portant ce slug, pas sa place dans l'arbre ». Aucune des
huit lectures de la relation ne demande _qui descend de qui_ : chacune demande le nom ou le slug qu'une
rangée porte, d'une rangée que la requête a déjà nommée. Un filtre scalaire ne demande rien du tout ;
une écriture qui raccorde une catégorie écrit une arête sans en lire aucune. La ligne ne se déplace donc
pas quand une lecture change de forme : elle se vérifie à chaque fois, et c'est ce que la comparaison
de la liste fait.

### Le compte, et le chiffre que le spec donne de travers

Le seuil trouve seize sites et la suite en nomme seize : huit par la relation, huit par le délégué — et
parmi ces huit, **quatre par la poignée**, deux `tx` et deux `client`, toutes dans
[`admin-structure.ts`](../../lib/use-cases/admin-structure.ts). Quatre entrées sont héritées du seuil
précédent, douze sont ajoutées par ce travail, et la suite compte les deux nombres.

Le fait « héritée » est porté une seule fois, par le champ `herite` de l'entrée. Il ne l'est plus par
un préfixe de raison, qui était un second énoncé de la même chose : changer l'un des deux laissait
l'autre mentir en silence.

Le spec dit **cinq** lectures de production. Il y en a **huit** par la relation et **quatre** par la
poignée. Le huit est bon ; le cinq ne l'est pas, et c'est le huit qu'il faut tenir : le compte à écrire
n'est pas celui de ce que la décision décrit, c'est celui de ce que le dépôt écrit.

### Aucune des douze n'a été routée par le cœur

Chacune est une exception nommée, avec sa raison, dans la liste que le seuil compare par égalité à ce
que la reconnaissance trouve. Aucune n'a été demandée au cœur, et aucune n'y a été donnée.

- **[`admin-catalog.ts`](../../lib/use-cases/admin-catalog.ts)**, quatre fois : le Document d'index du
  produit qu'une transaction vient d'écrire ([`296`](../../lib/use-cases/admin-catalog.ts#L296)) et du
  produit qu'elle relit à sa sortie ([`426`](../../lib/use-cases/admin-catalog.ts#L426)) ; le produit
  portant la variante dont le stock change, atteint par deux joins
  ([`489`](../../lib/use-cases/admin-catalog.ts#L489)) ; et le seul nom de la catégorie de la liste des
  Produits de l'Administration ([`541`](../../lib/use-cases/admin-catalog.ts#L541)). Les trois premiers
  sont le même fait — le nom de la catégorie dans un Document d'index — et le dernier est une chaîne.
- **[`admin-structure.ts`](../../lib/use-cases/admin-structure.ts)**, six fois : l'unicité du slug
  ([`198`](../../lib/use-cases/admin-structure.ts#L198)) et la présence du parent visé
  ([`208`](../../lib/use-cases/admin-structure.ts#L208)), tous deux par la poignée que la mutation leur
  passe, et le second est le refus « catégorie parente inconnue », écrit le 2026-08-10 en
  [`7c4f258`](https://github.com/eloaurdi/eguidar/commit/7c4f25838422ade7b1eac22b8027ae01ba8c3c0d),
  sept semaines avant qu'ADR-0027 ne vienne le consigner le 2026-10-01 — elle l'a documenté, elle ne
  l'a pas posé ; la rangée
  qu'on s'apprête à réécrire ([`327`](../../lib/use-cases/admin-structure.ts#L327)) et les enfants et
  produits d'une Structure qu'on supprime, pour décider d'un refus
  ([`394`](../../lib/use-cases/admin-structure.ts#L394)), tous deux par la Transaction ; et les deux
  lectures de la voie d'index, à la réaffectation
  ([`270`](../../lib/use-cases/admin-structure.ts#L270)) et à la suppression
  ([`439`](../../lib/use-cases/admin-structure.ts#L439)).
- **[`storefront.ts`](../../lib/use-cases/storefront.ts)**, une fois : le nom de la catégorie du produit
  affiché, pour amorcer son fil d'Ariane
  ([`137`](../../lib/use-cases/storefront.ts#L137)) — le pointeur d'une rangée, la descente restant à la
  Lecture.
- **[`prisma/seed.ts`](../../prisma/seed.ts)**, une fois : le nom de la catégorie dans les Documents
  d'index écrits par l'outillage d'exploitation
  ([`338`](../../prisma/seed.ts#L338)).

**La voie d'index garde son exclusion, et elle prend la forme que le seuil lui impose.**
[`readIndexableCategoryProducts`](../../lib/use-cases/admin-structure.ts#L265) est toujours un `where: { categoryId }`
plat, et ADR-0030 l'a déjà écrit : elle ne traverse pas la marche. Mais l'`include: { category: true }`
qui se tient à côté — [`270`](../../lib/use-cases/admin-structure.ts#L270) — est **maintenant vu par le
seuil**, et il est une entrée nommée comme les onze autres. L'exclusion ne tient donc plus à une
propriété de la requête ; elle tient à une raison écrite, ce qui est sa forme la plus forte : la
première disait « ce n'est pas une marche », la seconde dit « ce n'est pas la topologie, et voici
pourquoi ». Une réaffectation ne réindexe toujours que les Produits de la Structure déplacée, pas ceux
de ses descendantes — fait connu, hors de cette décision, et que l'amendement de #585 laissait ouvert.

### La facette garde son propriétaire

L'issue demandait si la facette de catégorie de la Recherche devait passer par le cœur. Non, et la
décision était déjà celle du dépôt avant qu'on la pose : la valeur réservée `_sans-structure` et son
libellé sont écrits une fois, dans [`lib/index-projection.ts`](../../lib/index-projection.ts) — le
module neutre d'ADR-0028 — et
[`index-projection-frontiere.test.ts`](../../lib/index-projection-frontiere.test.ts) le prouve sur tout
le corpus : une seule écriture de la valeur, une seule déclaration de chacun des deux noms, et quatre
producteurs nommés, dont chacun l'emprunte au propriétaire — la voie d'écriture du Document d'index, la
nomenclature de la Recherche, la puce de l'Administration, la suggestion du Bandeau.

Ce que la question cherchait à créer était un **second** propriétaire, non un propriétaire mieux
placé. Il n'y en a pas : les producteurs lisaient déjà le bon, et ce qui restait était la preuve, non
la dérivation. La lecture que la Recherche fait pour sa nomenclature —
[`search.ts:78`](../../lib/use-cases/search.ts#L78), un `findMany` par slug — n'est pas plus la topologie
que les autres : c'est une entrée héritée du seuil, nommée « les noms d'une facette, lus par slug »
(ADR-0029). La facette ne traverse donc ni le cœur ni la Lecture, et la question n'a pas à être
reposée.

### Ce seuil est le plus haut disponible pour la règle

Un seuil plus profond n'est pas disponible pour _cette_ règle, et il ne le sera pas sans une autre
décision. Ce qu'il faudrait ajouter est précisément ce que la suite refuse aujourd'hui : les filtres
scalaires, les filtres de relation sur une absence, les écritures qui raccordent une catégorie. Or
aucun de ces trois n'est une lecture de la topologie — ils sont, pris ensemble, **la voie d'écriture de
la Structure et les refus d'ADR-0027**. Les garder hors du seuil ne laisse donc rien sans surveillance :
une lecture de la topologie reste signalée partout où elle se produit, et ce que le seuil laisse passer
est ce qu'ADR-0027 a déjà placé sous le gros verrou. Un seuil qui les prendrait ne garderait plus la
décision de ce document ; il en garderait une autre, qui n'a pas été prise.

### Ce que cet amendement rend faux, et où le lire

Deux passages décrivent un état qui n'est plus le leur ; c'est le présent amendement qu'il faut y lire
à côté.

- la puce « **L'écriture de l'index ne traverse pas la marche** » des conséquences — «
  [readIndexableCategoryProducts](../../lib/use-cases/admin-structure.ts) est un `where: { categoryId }`
  plat ». Elle tient toujours, et c'est la forme que le seuil lui donne qu'il faut y lire : la raison
  qu'elle invoque — le `where` plat — ne porte plus l'exclusion à elle seule, puisque l'`include` qui
  l'accompagne est vu, et nommé ;
- la phrase « Le glossaire le nomme, et **son en-tête déclare les deux lectures qui restent hors de
  lui** » de l'[amendement de #564](#amendement--la-lecture-de-la-structure-possède-la-lecture-et-le-client-ne-traverse-plus-la-marche-564).
  Le module n'a plus d'en-tête : `667d916` a supprimé les commentaires du code de première partie
  (#599), et rien ne l'a rétabli. Ce qui déclarait ces lectures est aujourd'hui **la liste exécutable du
  seuil** — seize sites, seize raisons — et c'est elle qui les porte. L'[amendement de #585](#amendement--la-topologie-de-la-structure-a-un-seul-propriétaire-et-une-structure-hors-arbre-se-rend-une-fois-585)
  l'avait déjà dit en général — « tous deux se corrigent avec le code, non depuis ce document » ; le
  présent ne fait que nommer ce qui s'est corrigé.

### Ce que cet amendement ne change pas

- **Aucune contradiction avec la décision.** Elle fixe la neutralité du cœur, sa synchronie et le fait
  que le lien de parenté est consommé en mémoire ; elle n'énumère pas les requêtes qu'un module a le
  droit de poser sur une rangée. Aucune des douze n'est une marche : chacune rend un fait d'une rangée
  nommée, et le cœur ne rend pas cela.
- **Le cœur n'a pas bougé** : ni lecture, ni directive, ni crochet, ses deux points d'entrée conservés,
  et son interface ne grandit pas — donc la garde qui énumère ses symboles passe sans amendement.
- **La règle de terminaison ne change pas** : toute revisite arrête, comme avant.
- **La divergence boutique/mutation tient en entier** : la boutique dégrade, la mutation refuse,
  `CategoryAncestorCycleError` reste le seul à lever ce refus, et `assertAcyclicCategoryTree` reste lié
  à sa transaction.
- **Aucune profondeur maximale** n'est introduite : ADR-0027 l'a refusée, et rien ici ne s'en approche.
- **Rien n'est rouvert** : ni la prémisse des deux gardes de frontière, qui reste une recherche de
  sous-chaîne, ni le schéma et son index absent sur `parentId`, ni la catégorie d'un document de
  recherche. L'angle mort que l'[amendement de #585](#amendement--la-topologie-de-la-structure-a-un-seul-propriétaire-et-une-structure-hors-arbre-se-rend-une-fois-585)
  disait « un travail distinct » est ce travail ; il est pris, non rouvert.

### Ce que l'épreuve montre aujourd'hui

Le seuil se prouve sur le dépôt réel et non sur un exemple : le compte de seize, la répartition huit
par huit, la répartition des récepteurs — quatre lectures par `prisma`, deux par `tx`, deux par `client`
— et le fait que le seul `select: category` du dépôt soit dans
[`admin-catalog.ts`](../../lib/use-cases/admin-catalog.ts), sont tous énoncés dans la suite. La liste
nommée est comparée **par égalité** à ce que la reconnaissance trouve, dans les deux sens : ce qui
interdit aussi bien une lecture sans nom qu'un nom sans lecture.

Trois contre-épreuves tiennent la garde honnête. Une relation plantée dans un fichier réel — un site
nommé de plus — la fait tomber. Une **raison sans lecture derrière elle** la fait tomber de l'autre
sens : le site's retiré de
[`storefront.ts`](../../lib/use-cases/storefront.ts#L137) laisse une raison sans fait, et la garde
tombe. Une lecture par `Transaction` est vue, et se nomme comme les autres.

**Les entrées sont liées à la déclaration qui les porte, non à leur place dans le fichier.** La clé
d'une entrée n'est pas son rang parmi les lectures de même forme, mais **la déclaration qui la
porte** — `createProduct`, `assertCategoryParent`, `fetchProductPageData`. Ce que la clé garantit est
donc que deux lectures de même forme se distinguent par ce qui les appelle, et non par l'ordre où la
source les écrit : une édition qui décale les lignes laisse la liste intacte, et une lecture de même
forme déplacée d'une déclaration à l'autre change de clé au lieu de se banaliser dans un rang. La suite
le prouve dans les deux sens : une lecture de même forme plantée dans `assertUniqueCategorySlug` laisse
la clé de `assertCategoryParent` **inchangée**, et deux lectures de même forme dans une même
déclaration rendent la clé deux fois, qu'il faut nommer deux fois.

Ce que la clé **ne** garantit pas, et qu'il faut dire avec la même netteté, tient en une phrase
mesurée : **échanger deux raisons entre deux entrées correctes laisse la garde verte.** Ce n'est pas
une déduction, c'est un constat — les deux entrées portant sur la même lecture de même forme dans deux
déclarations distinctes, leur clé ne dépend pas de leur raison. La déclaration qui porte une lecture
est le site de la reconnaissance, non sa nature : la clé distingue deux lectures, elle ne dit pas si
l'une est légitime. La limite est donc de **justesse**, et non de lisibilité — elle existait déjà sous
le rang, qui était plus fragile encore, et elle est celle qu'un travail distinct, qui demanderait à la
reconnaissance de rendre le sens de la lecture, pourrait lever.

## Amendement — Une seule lecture de la Structure, et des questions qui sont ses faits (#618)

La décision ne bouge pas : des faits et non des verdicts, la mutation qui refuse pendant que les
lectures dégradent, une seule marche pour la Structure, une neutralité qui tient. Cet amendement
consigne une décision prise après que les cinq précédents eurent été écrits, et que ce dépôt
n'enregistre nulle part ailleurs : **de quoi est fait le module qui possède la lecture, et ce que
ses noms désignent**.

### Ce que cet amendement rend faux, et où le lire

Comme l'amendement de #564, celui-ci ne réécrit aucune ligne de la décision : il consigne à côté ce
qui n'est plus vrai. Cinq passages décrivent un état qui n'est plus le leur ; c'est le présent
amendement qu'il faut y lire :

- la liste de ce qu'une surface demande et la clause « **et une porte peut en rendre plus d'une** »
  de l'entrée « Lecture de la Structure » du glossaire
  ([`GLOSSARY.md:160-174`](../../GLOSSARY.md#L160-L174)), avec l'exemple de l'écran de la liste
  d'Administration qui rend « les lignes d'une part et, dans leur propre forme, les cibles de
  suppression ». Les deux tombent dans le même temps que le présent amendement : la règle qui les
  rendait nécessaires — une seule porte par écran — tombe avec la suite qui l'énonçait, et plus rien
  n'interdit à une surface de demander deux fois. L'entrée est réécrite dans la même passe ;
- « **deux portes au cœur**, comme [`devis.ts`](../../lib/use-cases/devis.ts) au-dessus de
  [`devis-coeur.ts`](../../lib/use-cases/devis-coeur.ts) », dans l'[amendement de
  #564](#amendement--la-lecture-de-la-structure-possède-la-lecture-et-le-client-ne-traverse-plus-la-marche-564).
  La forme est celle du Devis, dont les deux portes lisent deux choses différentes ; elle n'est plus
  celle de la Lecture, dont les six portes lisaient la même table. Ce qui reste vrai de la forme,
  c'est le cœur pur et l'entrée serveur au-dessus — et le nombre de portes au cœur tombe à une ;
- « les projections de la Lecture qui classent l'importent plutôt que d'écrire le leur — **cinq**
  sur six », dans le même amendement. Les projections disparaissent : ce qu'elles classaient est
  devenu des questions d'une valeur, et le comparateur ne traverse plus la couture qu'en **trois**
  sites du module ;
- « cette liste est le seul endroit où les trois formes sont énoncées […] et cet endroit est
  aujourd'hui **unique** », dans l'[amendement de
  #585](#amendement--la-topologie-de-la-structure-a-un-seul-propriétaire-et-une-structure-hors-arbre-se-rend-une-fois-585).
  Le cœur énumère toujours `comparerParNom`, `liensDesStructures` et `StructureOrdonnee` dans la
  liste de sa garde de frontière, et elle reste le seul endroit du dépôt qui les énumère **tous** ;
  mais la lecture énumère désormais, elle aussi, les noms qu'elle emprunte — `comparerParNom` et
  `liensDesStructures` parmi eux — pour les comparer par égalité aux imports que sa source déclare.
  L'unicité ne tient plus ;
- « **la porte par écran** dans
  [`lecture-structure-portes.test.ts`](../../lib/use-cases/lecture-structure-portes.test.ts) », le
  quatrième des quatre sujets que compte l'[amendement de
  #604](#amendement--une-lecture-de-la-relation-est-une-exception-nommée-et-la-liste-est-la-règle-604).
  Sa section et sa contre-épreuve sont supprimées, et le seuil n'a plus que **trois** sujets. La
  propriété qu'elle gardait — une surface, une porte — n'est pas abandonnée : elle est rendue par le
  compte des lectures complètes, mesuré là où une surface demande.

### La décision : une porte, une valeur, une construction pure

Le module qui possède la lecture rend **une valeur**. `lireStructure()` lit la table une fois, par
la lecture privée qu'il garde, et rend ce que la construction pure `lectureDesStructures(faits)`
bâtit sur ces faits. Les trois noms reprennent la forme que le cœur de la Marche possède déjà — une
valeur bâtie de faits, son constructeur, et une porte au-dessus.

Les **neuf questions** ne portent le nom d'aucun écran : `arbreAccueil()`, `lignesAdmin()`,
`ciblesSuppression()`, `options()`, `structure(id)`, `structureParSlug(slug)`, `filAriane(id)`,
`enfants(id)`, `branche(id)`. Le compte monte de six à neuf pendant que l'export tombe de
vingt-deux noms à cinq : les neuf sont les faits que les six réponses d'écran portaient,
désagrégés. Une page de plus n'ajoute aucun nom ici, et qui l'écrit demande les questions qu'il rend
sans reprendre une décision.

Deux des neuf ne sont qu'une clé : `structure` et `structureParSlug` rendent la même fiche, l'un
par identifiant pour l'éditeur, l'autre par slug pour la boutique — deux noms plutôt qu'une
signature qui devine. `branche(id)` prend la place des parentes exclues du formulaire d'édition et
sert la requête des Produits de la page de catégorie : le nom appartient au fait — une Structure et
sa branche, dans l'ordre du module — et non à la prop du formulaire.

Les trois réponses d'écran **meurent**, et les deux duplications avec elles : les candidates du
formulaire d'édition n'étaient que les options du sélecteur réécrites quarante lignes plus loin, et
le fil d'Ariane de la page de catégorie réécrivait celui que la Lecture rend déjà. Elles ne sont pas
gardées comme commodités : chaque appelant les délie aujourd'hui, et chaque appariement appartient à
la page qui les joint par identifiant.

Le fil d'Ariane **garde le comportement de la projection pure** : une parente que les faits ne
nomment pas ne contribue aucun lien. La réponse d'écran affirmait le contraire, et la divergence des
deux — l'une sautant un identifiant, l'autre l'affirmant — se résout en faveur de la dégradation.

### La réouverture refusée : le comparateur reste sur la couture

« Que la Marche rende l'ordre. » La question est posée, et la réponse est consignée ici pour qu'elle
ne soit pas reposée : **le comparateur reste sur la couture**, importé et appliqué par le module qui
possède la lecture, comme l'exige déjà la décision de l'[amendement de #564 sur
l'ordre](#amendement--une-seule-promesse-dordre-et-elle-est-écrite-dans-le-cœur-564). La marche ne
gagne pas de question qui rende l'ordre d'un ensemble quelconque d'identifiants : une telle réponse
serait une seconde promesse d'ordre, écrite hors du cœur, et c'est exactement ce que cet
amendement-là a fait disparaître. La raison est celle qu'il a déjà donnée — le comparateur est écrit
une fois, dans le cœur neutre, et le départage par l'identifiant ne demande aucun fait que le module
n'ait déjà sous la main.

### La construction paresseuse, et l'écart avec l'amendement de #584

Une seule décision s'écarte ici de l'[amendement de
#584](#amendement--lindex-inverse-est-un-fait-de-la-marche-bâti-une-fois-à-sa-construction-584) :
l'index y est bâti **à la construction de la marche** ; ici la marche — et les cartes d'identifiant
et de slug — est bâtie **paresseusement, à la première question qui en a besoin, et au plus une
fois**.

La raison est un compte : trois des neuf questions — les options, la fiche, la fiche par slug —
n'ont besoin ni de la marche ni des cartes, et leurs trois surfaces ne paient donc aucune marche
aujourd'hui. Une construction immédiate leur en ferait payer une. Le « au plus une fois » de
l'amendement de #584, lui, **tient** : c'est la seule des deux décisions qui soit reprise, et elle
tient par la même raison qu'alors — une question future ne rebâtit pas ce que la première a bâti.

### Le compte, et le bilan honnête

- les **noms exportés** tombent de vingt-deux à cinq : `lireStructure`, `lectureDesStructures`,
  `LectureStructure`, `FaitStructure`, `NoeudAccueil`. Les autres formes d'arrêt cessent d'être
  exportées, et se déduisent là où une garde a besoin d'une forme ;
- la **liste figée** que les gardes énumèrent tombe de vingt-quatre entrées à dix-huit — et l'une
  des vingt-quatre était un **fantôme**. La garde de frontière vérifie la présence d'un nom par
  sous-chaîne ([`lecture-structure-frontiere.test.ts:52-54`](../../lib/use-cases/lecture-structure-frontiere.test.ts#L52-L54)),
  et `complementDe` était satisfait par le **préfixe** d'un autre nom, celui de l'import
  `complementDepuis`. L'entrée que la composition supprimée croyait laisser en place était donc
  gardée par une rencontre de lettres ;
- les **questions** passent de six à neuf ;
- les **noms qu'une surface doit apprendre** passent de un à cinq au plus large.

Le compte des lectures ne bouge pas, et la masse des gardes non plus : seules la section de la porte
par écran et sa contre-épreuve sortent.

### Ce que cet amendement ne change pas

- **Aucune contradiction avec la décision.** Elle fixe la neutralité du cœur, sa synchronie et le
  fait que le lien de parenté est consommé en mémoire ; elle n'énumère ni les questions d'un module
  ni les noms qu'un module exporte.
- **Le cœur garde sa marche, ses trois constructeurs, son comparateur et sa partition**, et son
  appelant de production reste unique. `complementDe` et `descendanceDe` perdent leur seul
  appelant : deux compositions sur une marche que personne ne leur passe.
- **La divergence boutique/mutation tient en entier** : la boutique dégrade, la mutation refuse,
  `CategoryAncestorCycleError` reste le seul à lever ce refus, et `assertAcyclicCategoryTree` reste
  lié à sa transaction.
- **La lecture privée ne bouge pas** : mêmes colonnes, même compte des Produits directs, aucun
  filtre, et aucune seconde lecture n'apparaît nulle part. L'entrée du seuil qui la nomme garde son
  nom et sa place.
- **Les gardes qui doivent passer inchangées** — la frontière, le seuil, la reconnaissance, les deux
  recettes partagées, les suites de comportement des surfaces — restent des descriptions du même
  dépôt.
- **Rien n'est rouvert** : ni plafond de profondeur, ni index absent sur `parentId`, ni la création
  qui n'appelle toujours pas la marche d'acyclicité. Ni les deux branches défensives de la
  construction de la marche, ni le schéma, ni la forme de la lecture.

### Ce que l'épreuve montre aujourd'hui

La lecture comptée **garde sa maison dans les suites des surfaces**, et c'est elle qui devient la
preuve : les assertions d'exactement une lecture complète par rendu valent toujours, et valent
désormais pour une liste qui demande deux questions et une page qui en demande quatre.

La suite des portes devient **une lecture et neuf comparaisons** sur les mêmes faits, au lieu de six
paires porte contre jumelle ; elle garde ses deux terrains, la table de substitution et la table
plantée. La liste figée est comparée **par égalité dans les deux sens, sur ses deux moitiés** — les
noms empruntés contre les imports que la source déclare, les neuf questions contre les membres que
la valeur déclare —, ce qui fait tomber autant un nom sans fait qu'un fait sans nom. La suite de
comportement ne bouge pas dans sa substance : ses descriptions passent des six projections aux neuf
questions, ses imports à la construction unique, et pas une assertion sur un rendu n'est touchée.

**Un manque nommé.** La construction paresseuse n'est éprouvée par aucune des deux coutures : la
marche se bât **dans** la valeur, et ce dépôt ne simule pas ses propres modules. Ce qui est éprouvé,
c'est que la lecture a lieu une fois par surface ; que la marche se bât **au plus** une fois est
tenu par le code et énoncé ici, non affirmé par une épreuve.
