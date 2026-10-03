# Un module serveur n'emprunte à un module client que des types

L'Administration de la Structure ne pouvait ni renommer ni supprimer une Structure, et ne disait
pas pourquoi : l'écran renvoyait toujours le même Refus de la Structure, « Données invalides :
catégorie parente inconnue », un message qui nomme un symptôme et jamais sa cause. La cause
tenait en une ligne d'import. `app/admin/categories/actions.ts:5` d'avant
[#518](https://github.com/eloaurdi/eguidar/issues/518) — voir
`git show 53eb10b^:app/admin/categories/actions.ts` — un module `"use server"`,
empruntait la constante `NO_PARENT_VALUE` — déclarée à `components/admin/category-form.tsx:20`
d'avant [#518](https://github.com/eloaurdi/eguidar/issues/518) — pour décider si le champ
`parentId` d'un `FormData` désigne une Structure parente ou son absence.

Aucune des vérifications habituelles ne pouvait attraper cela, et il faut comprendre pourquoi avant
d'écrire une règle qui tienne.

**La transformation RSC remplace les exportations du client par des mandataires.** Next.js applique
au graphe serveur une étape de compilation propre aux React Server Components. Lorsqu'un module
serveur atteint un module `"use client"`, cette étape réécrit ce que le serveur voit de ce module :
ses exportations ne sont plus des valeurs, elles deviennent des **références client** — des objets
sondes qui retiennent le nom du fichier et le nom de l'exportation, et rien d'autre. Le mandataire
est appelable, et l'appeler lève. `NO_PARENT_VALUE` n'est donc plus `"none"` côté serveur.

**Une comparaison contre un mandataire est toujours fausse.** `"none" !== mandataire` est vrai, quelle
que soit la chaîne reçue. Le test censé distinguer « pas de parente » de « une parente » ne
distingue plus rien : il répond « il y a une parente ». La comparaison
`parentIdRaw !== NO_PARENT_VALUE` (`actions.ts:20-21` d'avant
[#518](https://github.com/eloaurdi/eguidar/issues/518) — voir
`git show 53eb10b^:app/admin/categories/actions.ts`) devient une constante vraie, et la branche qui
devait produire `null` ne s'exécute jamais. Même verdict au même endroit pour la réaffectation de
suppression (`actions.ts:66-70`, même état antérieur) : le champ caché
`reassignToCategoryId` était rendu inconditionnellement (`delete-category-button.tsx:79`
d'avant [#519](https://github.com/eloaurdi/eguidar/issues/519)), hors du seul `productCount > 0`
qui gouvernait le sélecteur, donc la sentinelle partait toujours. Le mode de défaillance est le
pire qui soit : il ne lève pas, ne journalise pas, ne rend pas une erreur — il prend l'autre
branche, et la suite de l'action échoue plus loin, sur un motif qui ne parle plus de la
frontière.

**Aucune suite de tests ne reproduit la transformation.** Vitest exécute du TypeScript transformé par
Vite, qui ne comporte pas d'étape RSC. `NO_PARENT_VALUE` y est la vraie chaîne `"none"`, la
comparaison y est honnête, l'assertion passe. La suite et le bundle serveur ne sont pas le même
programme : la suite dit la vérité sur une version du code que personne n'exécute. C'est pourquoi le
défaut est resté invisible, et c'est pourquoi [#517](https://github.com/eloaurdi/eguidar/issues/517)
a pu établir que la surface n'avait jamais fonctionné.

Il ne s'agissait donc pas d'une faute de code à corriger, mais d'une frontière que rien n'énonçait.
Le système de types n'y peut rien : `NO_PARENT_VALUE` est un `string`, et comparer un `string` à un
`string` est valide dans les deux cas — la comparaison est juste dans la suite et fausse dans le
bundle, sans qu'aucun outil n'ait quoi que ce soit à signaler. [#518](https://github.com/eloaurdi/eguidar/issues/518)
supprime la sentinelle ; cet ADR écrit la règle, pour que la prochaine valeur partagée n'invente pas
la même.

## Décision

- **La frontière client/serveur ne se traverse qu'en types, et rien d'autre.** Un `import type` est
  effacé à la compilation : il ne produit aucun code, donc aucune valeur ne peut se remplacer par une
  autre à l'exécution. C'est la seule catégorie d'emprunt que la frontière autorise. Le dépôt en
  porte le seul exemple écrit sous cette forme — [`app/admin/commandes/actions.ts:5`](../../app/admin/commandes/actions.ts#L5)
  tire `OrderStatus` du client Prisma généré par import de type seul. Il faut dire ce que cet
  exemple prouve et ce qu'il ne prouve pas : sa cible, `@/lib/generated/prisma/client`, ne porte
  **aucune directive** — c'est un module neutre, comme ceux de la décision suivante. Aucun côté ne
  le réclame, donc rien ne le réécrit, donc **aucune frontière n'y est traversée** : l'emprunt
  serait légal par type *et* par cible neutre, et il ne démontre rien sur la frontière seul. Ce
  qu'il démontre, c'est la moitié du chemin — la frontière autorise un emprunt de type — et c'est
  pourquoi le dépôt n'a pas d'exemple légal d'un emprunt de type **vers un module client** : il n'y
  en a pas, et c'est ce que la suite de frontière vérifie.

- **Une valeur réellement partagée par les deux côtés habite un module qu'aucun côté ne réclame** :
  ni `"use client"`, ni `"use server"` — un module neutre, que le formulaire client et l'action
  serveur importent comme n'importe quelle bibliothèque. Cette discipline est déjà celle du dépôt et
  elle est tenue par des tests, pas par convention : `lib/carte-produit.ts` (ADR-0022) n'a même pas
  d'import, et `lib/formulaire-produit.ts` (ADR-0026) est atteint par un module de rendu client comme
  par le code serveur qui lui fait face.

- **Ce qui n'est pas partagé ne franchit pas la frontière : il se duplique, ou se rend côté serveur.**
  Une étiquette de champ, un libellé de bouton, un titre n'ont aucune raison d'être importés par un
  module serveur. Ils sont écrits là où ils s'affichent, et personne n'a à se demander si la
  transformation en a fait autre chose.

- **L'absence se dit par l'absence du champ, jamais par une valeur qui la désigne.** Un champ non
  soumis est absent du `FormData`, `formData.get(…)` rend `null`, et `null` est déjà la réponse
  exacte du domaine : pas de Structure parente. Aucune constante n'est déclarée, donc rien ne peut
  être remplacé par un mandataire, donc aucune comparaison ne peut devenir fausse par accident.
  Les surfaces voisines ne le font pas autrement — la forme Produit lit son champ de transport par un
  simple repli sur `""` ([`lib/formulaire-produit.ts:361`](../../lib/formulaire-produit.ts#L361)),
  sans jamais le comparer à une constante importée. La surface Structure était la seule à inventer
  une sentinelle *et* à la faire franchir la frontière.

- **Une sentinelle est une valeur qu'il faut comparer des deux côtés d'une frontière asynchrone, et
  rien n'en tient les comparaisons honnêtes.** Le transport sérialise, la transformation RSC
  réécrit, l'action serveur relit : trois occasions de lire autre chose que ce qui a été écrit, et
  aucune de ces lectures qui échoue bruyamment. Une absence, elle, ne peut pas malencontreusement
  devenir une valeur : le champ manquant se lit `null`, et `null` reste `null`. L'absence est donc la
  seule forme de ce genre qui survive à la frontière sans surveillance — c'est la raison de la
  décision précédente, et non une préférence de style.

- **L'échappatoire — quand une constante est réellement partagée par les deux côtés, elle va dans un
  module neutre.** Trois questions, dans cet ordre, et la première en écarte la plupart :

  1. **Faut-il vraiment une valeur ?** Si le seul travail de la constante est d'être comparée à une
     chaîne qui signifie « rien », c'est la forme de la sentinelle : on écrit l'absence du champ et
     la question est réglée sans constante. C'est le cas résolu par
     [#518](https://github.com/eloaurdi/eguidar/issues/518), et il n'a demandé aucun module neuf.
  2. **Survit-elle à cette question ?** Un jeu d'états, une table de libellés, un prédicat partagé —
     des valeurs qui ont un sens hors de « est-ce l'absence ? » — méritent d'exister. Elles ne
     peuvent simplement pas vivre dans un module qu'un des deux côtés réclame.
  3. **Où, alors ?** Dans un module neutre, et **jamais** dans un module `"use client"` « pour la
     commodité du formulaire ». Le critère de choix n'est pas la proximité du lecteur, c'est
     l'absence de directive. La neutralité de ce module s'éprouve : un test de frontière en vérifie
     l'absence de base de données, d'en-tête de requête et de directive, comme
     [`lib/carte-produit-frontiere.test.ts:55-68`](../../lib/carte-produit-frontiere.test.ts#L55-L68)
     le fait pour le module Carte produit.

  Il n'y a pas d'exception, et c'est ce qui compte : une constante partagée a un domicile, et ce
  domicile n'est jamais un module client. La question n'est donc plus jamais « cette valeur est-elle
  sûre à emprunter ? » — elle l'est par construction, parce qu'elle ne l'est pas.

- **Cet ADR n'amende rien.** ADR-0025 reste tel quel. Les deux énoncent la même idée sous deux axes
  distincts : ADR-0025 interdit au squelette partagé de mutation d'apprendre une entité ou une base
  ([`mutation-squelette.ts`](../../lib/use-cases/mutation-squelette.ts)), cet ADR interdit à une
  valeur de franchir la frontière. Aucun des deux n'autorise ce que l'autre exclut : un module neutre
  qui porte une constante partagée n'est pas un mécanisme — c'est une feuille, sans effet, sans
  transaction, sans concept de domaine. La frontière client/serveur ne s'applique pas à lui parce
  qu'il n'enjambe rien. ADR-0014, ADR-0022, ADR-0026 et ADR-0027 sont également confirmés inchangés.

## Options écartées

- **Un garde de frontière comme unique garantie** — écarté : un test attrape le défaut après coup, à
  la suite suivante, et ne dit rien de l'endroit où il faut poser la constante. Un garde existe
  pourtant — [`app/admin/actions-frontiere.test.ts`](../../app/admin/actions-frontiere.test.ts)
  applique la règle aux cinq modules `app/admin/<un dossier>/actions.ts`, la surface où le défaut est
  né — et il garde une règle ; il n'est pas la règle. Dire la même règle à l'écriture, par une règle
  ESLint `no-restricted-imports`, reste le suivi de
  [#520](https://github.com/eloaurdi/eguidar/issues/520), distincte de cet ADR.

- **Une liste des valeurs sûres à emprunter** — écarté : la question « quelles valeurs de ce module
  client restent des valeurs après la transformation ? » n'a pas d'énumération stable. Elle dépend du
  nom de l'exportation, du fichier et de la version de Next.js. Une liste serait fausse au moment de
  sa rédaction, ce qui est pire que son absence.

- **`server-only` sur le module qui porte la constante** — écarté : `server-only` empêche un module
  d'entrer dans le bundle *client* ; il ne fait rien pour une valeur qu'un module serveur va
  chercher *dans* un module client. C'est la mauvaise direction, et sous Vitest il n'est de toute
  façon pas honnête : il est neutralisé par un alias
  ([`vitest.config.ts:9-12`](../../vitest.config.ts#L9-L12)).

- **Un `Symbol()` comme sentinelle** — écarté : un symbole ne traverse pas `FormData`. Il y serait
  sérialisé en texte, donc la comparaison d'identité reviendrait à comparer deux chaînes — c'est-à-dire
  au défaut qu'on voulait éviter. Le symbole paraît protégé parce qu'il paraît incomparable ; c'est
  une illusion de langage, pas de frontière.

- **Un jeton (`Symbol.for`) partagé par `globalThis`** — écarté : les deux côtés ne partagent pas un
  `globalThis`, c'est précisément ce que la frontière sépare. Il faudrait faire transiter le jeton par
  le transport, donc réintroduire la comparaison qu'on voulait supprimer.

- **Comparer la sentinelle par son type plutôt que par sa valeur** — écarté : au point de comparaison,
  la valeur est déjà une chaîne. Son type a été perdu à l'entrée du `FormData`, et c'est précisément
  là que la comparaison se fait.

## Invariants

- **Piège nommé — Vitest n'applique pas la transformation RSC, et aucune suite de ce dépôt ne le
  fait.** Une suite verte ne dit rien de ce qu'un module serveur voit réellement d'un module client.
  Les deux conditions sont nécessaires — le module client réécrit, la comparaison fausse — et c'est
  leur réunion qui produit le défaut. Aucune des deux ne se laisse attraper par une exécution de test :
  il faut donc ouvrir le bundle compilé pour le constater. Aucune suite ne peut le faire à la place du
  lecteur : c'est tout le sujet.

- **Piège nommé — la règle porte sur les valeurs, pas sur l'atteignabilité.** Un composant serveur
  rend volontairement des composants clients : la page des Structures importe
  [`DeleteCategoryButton`](../../components/admin/delete-category-button.tsx) à
  [`app/admin/categories/page.tsx:5`](../../app/admin/categories/page.tsx#L5) et le rend à
  [`:138`](../../app/admin/categories/page.tsx#L138). Un garde écrit sur « tout fichier non client »
  s'allumerait sur des dizaines d'imports légitimes. La frontière à garder porte sur ce qui est
  *emprunté comme valeur*, pas sur ce qui est *atteint comme module*.

- **Piège nommé — `importeDe` voit les imports de type.**
  ([`lib/use-cases/outils-frontiere.ts:95-99`](../../lib/use-cases/outils-frontiere.ts#L95-L99))
  [`referencesDeSource`](../../lib/use-cases/outils-frontiere.ts#L33-L68) en distingue bien la
  clause `import type` (ligne 43), mais
  [`importeDe`](../../lib/use-cases/outils-frontiere.ts#L95-L99) l'ignore. Un garde qui laisse
  passer le type seul doit donc filtrer lui-même, sur `typeOnly` :
  s'appuyant sur `importeDe` seul, il signalera
  [`app/admin/commandes/actions.ts:5`](../../app/admin/commandes/actions.ts#L5) comme une violation,
  alors que cet emprunt est doublement permis — il est un emprunt de type, et sa cible est de
  surcroît neutre. Le complément qui applique ce filtre est
  [`empruntsDeValeur`](../../lib/use-cases/outils-frontiere.ts#L241-L254), qui jette l'emprunt de
  type avant de résoudre le spécifieur : la garde appelle ce complément, et non `importeDe`.

- **Piège nommé — la neutralité d'un module se vérifie par transit.** Un module neutre qui n'importe
  rien de notable peut tout de même atteindre un module client ou serveur par un intermédiaire. La
  vérification utile parcourt le graphe des imports de valeurs, comme le fait
  [`atteignables`](../../lib/use-cases/outils-frontiere.ts#L276-L289) pour ADR-0026 ; une vérification
  en direct laisse passer la moitié des chemins.

- **Un module neutre ne devient pas un fourre-tout.** Il ne reçoit une valeur partagée que parce
  qu'elle est réellement partagée, et il garde son contenu habituel : ni base de données, ni en-tête
  de requête, ni dépendance de serveur.

## Comment ce résultat a été éprouvé

Ce résultat n'est pas un raisonnement sur ce qui pourrait arriver : le dépôt a été parcouru, et le
défaut y a été trouvé, puis vérifié dans le bundle.

**Le balayage.** Les 8 modules portant `"use server"` et les 73 portant `"use client"` de `app/`,
`components/` et `lib/` ont été parcourus en cherchant, depuis chaque module serveur, un import de
**valeur** vers un module client. Une seule violation est apparue : `app/admin/categories/actions.ts`
vers `components/admin/category-form.tsx` — celle que
[#518](https://github.com/eloaurdi/eguidar/issues/518) supprime. Le même balayage a rencontré le
seul emprunt que le dépôt fasse **vers un module client par type** — et il n'en fait pas : la seule
ligne de cette forme qu'il ait produites,
[`app/admin/commandes/actions.ts:5`](../../app/admin/commandes/actions.ts#L5), `import type`, vise
le client Prisma généré, qui est neutre. Autrement dit : **le dépôt n'a aucun exemple légal d'un
emprunt de type vers un module client, parce qu'il n'en a aucun, interdit ou non.** C'est ce qui
rend la suite de [#520](https://github.com/eloaurdi/eguidar/issues/520) utile : elle fabrique ce
cas pour elle-même, puisqu'il ne s'est jamais produit.

**Le bundle.** [#517](https://github.com/eloaurdi/eguidar/issues/517) a relevé dans le bundle serveur
compilé l'exportation réécrite en mandataire enregistré sous le nom du fichier et de l'exportation, et
la comparaison devenue inconditionnellement vraie. C'est la seule observation qui ne pouvait pas venir
d'une suite : elle demande le bundle, précisément parce qu'aucune suite ne le produit.

**La suite, à l'inverse.** `app/admin/categories/actions.test.ts` construit ses `FormData` sans
jamais envoyer la sentinelle ([`:52-63`](../../app/admin/categories/actions.test.ts#L52-L63)) et passe
malgré tout. Les cas verts et le bundle faux coexistent — c'est la démonstration, non le présupposé,
que l'absence de reproduction de la transformation est la cause du silence.

**La garde de frontière.** `app/admin/actions-frontiere.test.ts` n'exécute rien : elle lit la
source, sans build ni transformation RSC, et la règle porte sur ce qui est importé, non sur ce
que l'exécution en fait. Elle tient les cinq modules `app/admin/<un dossier>/actions.ts` à zéro
emprunt de valeur vers un module `"use client"`, et elle se prouve elle-même par deux gestes
inverses : elle remet dans `app/admin/categories/actions.ts` la ligne exacte que
[#518](https://github.com/eloaurdi/eguidar/issues/518) avait retirée —
`import { NO_PARENT_VALUE } from "@/components/admin/category-form"`, celle que donne
`git show 53eb10b^:app/admin/categories/actions.ts` — et attend que la garde la nomme ; le même
emprunt écrit `import type` passe. La liste des cinq actions gardées est écrite, non déduite
du parcours, et le témoin de non-vacuité la compare à ce que le parcours trouve : une action
neuve échoue au témoin jusqu'à ce qu'on la nomme.
