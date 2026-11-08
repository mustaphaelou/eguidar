# L'Après-écriture : une seule déclaration par mutation d'Administration

Le présent ADR est écrit avant les changements de code : la tranche Commande vient d'abord, puis
les autres genres d'écriture un à un. Il enregistre la forme arrêtée, pour que le code ne la
réinvente pas à chaque tranche.

## Décision

- **Une déclaration par genre d'écriture.** Le module Après-écriture est un registre indexé par
  genre d'écriture : `produit.enregistre`, `produit.enregistre.lot`, `produit.supprime`,
  `produit.supprime.lot`, `variante.stock.changee`, `structure.creee`, `structure.modifiee`,
  `structure.supprimee`, `commande.creee`, `commande.statut.changee`. Chaque entrée est une
  fonction pure d'un objet de faits typés vers un plan. Elle n'est pas Prisma, ne prend pas de
  transaction, ne lit rien.

- **Faits typés.** L'écriture fournit uniquement ce que la déclaration demande : identifiants,
  valeurs avant et après, URL d'Images produit retirées, entrées de Galerie pour le Registre, cible
  de rattachement pour une suppression de Structure. Pas de lignes d'entité, pas de transaction.

- **Le plan.** Un ou plusieurs `faits` (déclencheur, entité, charge) plus une liste ordonnée de
  conséquences. Une conséquence est une donnée pure : nom d'effet, nom d'action facultatif, entité
  de journal, message de journal, portée facultative. La charge du `fait` est partagée par les deux
  adaptateurs, car l'action du travailleur lit la charge de l'Événement d'automatisation. Aucune
  fermeture dans la déclaration.

- **Politique de durabilité.** Une conséquence est durable si et seulement si elle n'a pas de
  réparation bornée. Durables : la réindexation, la désindexation, l'invalidation du Catalogue ou de
  la Structure, la purge du bord, l'e-mail de Commande, la réindexation d'une Structure
  (`index.structure`), la suppression R2 (`suppression.images`). Non durables déclarées avec leur
  réparation : le Registre des Images produit (réconciliation par la Bibliothèque des médias), la
  suppression des Brouillons d'Image produit (cycle de vie R2), l'invalidation du cache de Commande
  et la purge (TTL), l'invalidation du cache de stock de variante (TTL), l'invalidation de la
  Livraison (TTL), l'invalidation du Texte alternatif (TTL).

- **Pas d'Événement sans conséquence durable.** Un Événement d'automatisation n'est écrit que
  lorsqu'au moins une conséquence est durable. Les écritures de Livraison et de Texte alternatif
  déclarent leurs conséquences immédiates et aucun Événement ; une future entrée durable commencera
  à l'émettre.

- **La transaction appartient à l'écriture.** Elle appelle la déclaration, écrit le `fait` dans sa
  transaction lorsqu'il en existe un, valide, puis appelle l'adaptateur immédiat avec le plan et le
  port d'effets de l'entité. La déclaration n'écrit jamais et ne paraît jamais transactionnelle ; la
  tentative immédiate ne paraît jamais transactionnelle.

- **L'adaptateur immédiat.** Un par entité (Commande, Catalogue, Structure, Livraison), une
  projection mince du nom d'effet vers le port d'effets existant, répartie sans commutateur global
  d'entité. Il conserve l'ordre déclaré, isole chaque conséquence dans sa propre limite d'échec,
  mesure la durée et écrit une ligne de journal par conséquence. Le journal garde sa forme et gagne
  une portée facultative pour les groupes ; une réindexation groupée n'est plus journalisée sous le
  premier Produit.

- **Bascule du propriétaire.** La scission d'ADR-0044 tient : la tentative immédiate exécute les
  conséquences déclarées sans tenir compte de `enabled` ; la bascule ne gouverne que la reprise,
  l'historique et le réessai manuel. La déclaration n'est pas la Règle du propriétaire. (Voir
  ADR-0044, addendum « ce que la bascule arrête ».)

- **Semis.** La déclaration possède les Règles par défaut. Le semis est créateur seulement : il crée
  une ligne manquante et ne met jamais à jour une ligne existante. L'inventaire a grandi tranche par
  tranche. Les identités existantes sont réutilisées : `confirmation-commande`, `statut-commande`,
  `indexation-produit`, `invalidation-catalogue`, `purge-catalogue`, `desindexation-produit`,
  `invalidation-catalogue-suppression`, `indexation-stock`, `invalidation-structure`,
  `invalidation-structure-modifiee`, `invalidation-structure-supprimee`, ainsi que les trois Règles
  planifiées (`digest-stock-bas`, `reconciliation-recherche`, `digest-proprietaire`). Les tranches
  ont créé `suppression-images-produit-enregistre`, `suppression-images-produit`,
  `purge-catalogue-suppression` — la Règle de purge que la liste durable de `produit.supprime`
  n'avait pas —, `indexation-structure`, `suppression-images-structure-modifiee`,
  `indexation-structure-supprimee` et `suppression-images-structure-supprimee`. Une définition par
  défaut modifiée est une migration explicite, jamais une réécriture implicite.

- **Deux nouvelles actions du vocabulaire fermé.** `index.structure` réindexe la branche touchée
  d'une Structure ; pour une suppression, le `fait` porte la cible de rattachement et l'action
  réindexe la branche de destination, puisque la branche supprimée n'existe plus. `suppression.images`
  supprime les objets R2 nommés dans le `fait` ; lors d'une mise à jour ce sont les images
  retirées, lors d'une suppression de Produit ce sont toutes ses images. Libellés éditeur :
  « Indexation de la Structure » et « Suppression des images » (généralisé à l'image d'une
  Structure, #872).

- **Conséquences groupées.** Une écriture groupée a un genre groupé. Elle émet un Événement
  d'automatisation par Produit et peut déclarer une réindexation groupée pour toute la sélection ;
  la conséquence porte sa portée pour le journal. Le groupe n'est pas N copies de la déclaration
  unitaire.

- **Ordre de déploiement.** Commande d'abord (`commande.creee`, `commande.statut.changee`), puis
  `produit.enregistre` et son genre groupé, puis `produit.supprime` et son genre groupé,
  `variante.stock.changee`, les genres de Structure, enfin les écritures de maintenance. Chaque
  tranche ajoute l'entrée du registre, migre le site d'appel, ajoute les tests du plan et supprime
  la déclaration en double au site d'appel.

- **Aucun schéma, conteneur ni file.** L'outbox, le travailleur, l'historique d'Exécution et le
  registre d'actions existent déjà. Les deux nouvelles actions utilisent le travailleur existant. La
  portée du journal et les champs de charge sont du code, pas des tables.

## Invariants

- Une déclaration est pure : mêmes faits typés, même plan. Épinglé par la suite de tests du plan,
  sans base.
- Un Événement d'automatisation n'existe que s'il existe au moins une conséquence durable. Épinglé
  par les tests du plan et d'intégration de l'écriture.
- Chaque conséquence durable a exactement une Règle d'automatisation par défaut par déclencheur ;
  chaque conséquence non durable en a aucune. Épinglé par le test d'invariant.
- La charge du `fait` est immuable après écriture ; le travailleur lit, il ne réécrit pas.
- L'adaptateur immédiat conserve l'ordre déclaré et isole chaque conséquence ; un échec n'arrête
  pas le suivant. Épinglé par la suite du journal et des effets ordonnés.
- La bascule ne gouverne que le durable ; l'imédiat s'exécute quel que soit `enabled`.
  (ADR-0044.)
- Le semis est créateur seulement ; une Règle désactivée ou éditée survit. (ADR-0044, phase 5.)
- Une conséquence groupée porte sa portée réelle dans le journal.

## Ce que cet ADR rend faux

- ADR-0014, « Invariants », dernier point (« No schema change, no queues/outbox ») : déjà remplacé
  par ADR-0044, et le présent ADR n'y ajoute ni schéma, ni file, ni conteneur.
- ADR-0044 reste vrai dans son entier : scission de la bascule, outbox dans la transaction, reprise,
  file morte, actions enveloppant l'existant. Le présent ADR y ajoute la déclaration unique et la
  politique de durabilité ; il ne la contredit pas.

## Addendum — pointeur depuis ADR-0044

ADR-0044, addendum « ce que la bascule arrête », gagne un pointeur vers le présent ADR pour la
déclaration unique, la politique de durabilité et le semis créateur seulement. Ses invariants
tiennent ; aucune décision concurrente n'est ouverte.

## Addendum — la charge d'un Fait est un contrat fermé

- **Module neutre.** `lib/automations/charge.ts` importe uniquement Zod et porte les dix
  schémas de charge, un par déclencheur, la correspondance déclencheur → type d'entité, et
  les types dérivés.
- **Porte d'écriture.** `enregistrerEvenement` valide la charge et le type d'entité dans
  la transaction ; une violation lève `ContratChargeError`, un erreur de programmeur nommée.
- **Analyse unique.** `executerActionOuRedeclaration` analyse la charge une fois, quand une
  Règle s'exécute — jamais pour un événement expiré, ignoré ou sans Règle. Elle transmet la
  charge analysée à l'action planifiée ; la redéclaration la reçoit déjà validée par
  `declarerDepuisLaChargeValidee`. Une Charge invalide lève `ContratChargeError`.
- **Noms canoniques.** `produitId`, `slug`, `slugPrecedent`, `categoryId`,
  `categoryIdPrecedent`, `imagesRetirees`, `categorieId`, `destinations`, `snapshot`,
  `statut`, `jour`.

## Amendement — les écritures de maintenance sont un second genre

La décision nomme dix genres d'écriture ; le registre en porte **quinze**. #874 a ajouté, après le
présent ADR, cinq genres que l'énumération ne pouvait pas prévoir :

- `ville.creee`, `ville.modifiee`, `ville.supprimee` ;
- `livraison.reglee` ;
- `image.texte-alternatif`.

Ce ne sont pas cinq noms oubliés : c'est un **second genre d'entrée**. Les dix premiers déclarent au
moins un `fait` et peuvent porter une conséquence durable ; les cinq autres passent par
`planDeMaintenance`, qui rend `faits: []` et une conséquence **non durable** avec sa réparation
nommée. Ils partagent le registre — une écriture d'Administration n'a qu'un seul chemin de
déclaration — mais ils n'émettent aucun Événement d'automatisation et ne reçoivent aucune Règle par
défaut. `GENRES_DERIVES` dérive les Règles du registre et exclut les genres groupés ; les genres de
maintenance n'y ajoutent rien, puisqu'ils n'ont aucune conséquence durable.

Le registre reste exhaustif par le type (`Record<GenreEcriture, Declaration>`) : ajouter un genre
sans déclaration ne compile pas. Depuis #916, une garde l'épingle aussi à l'exécution —
`lib/apres-ecriture-frontiere.test.ts` compare les genres déclarés aux clés du registre, et vérifie
que le module n'importe que des types.

## Addendum — la couture d'exécution réalisée

L'ADR décrivait l'adaptateur immédiat et le travailleur ; #952–#958 ont réalisé la couture. Ce qui
suit enregistre sa forme atteinte ; le corps et les addenda précédents restent la décision telle
qu'elle fut écrite.

- **Charge utile typée.** Une conséquence porte `payload`, dérivé des faits typés du genre
  (`FaitsParGenre`). `PlansTypés` et `PlanParGenre` font rendre à `declarerApresEcriture` le plan
  typé du genre ; les conséquences d'une entité sont discriminées par leur effet
  (`ConsequenceCommande`, `ConsequenceCatalogue`, `ConsequenceStructure`, `ConsequenceLivraison`).
  La Charge du Fait garde son schéma : la déclaration n'y copie que les champs durables ; les faits
  d'immédiat restent hors de la Charge et voyagent dans la charge utile de la conséquence.

- **`lectures`, une entrée nommée par plan.** Les lectures après commit passent par une seule entrée
  `lectures` par plan, paresseuse et mémoïsée : aucune lecture n'est faite avant qu'une conséquence
  l'exige, et une même lecture n'est faite qu'une fois par plan. Une lecture absente échoue par son
  nom — `LectureManquanteError("structure")` ; la tentative immédiate la journalise en conséquence
  échouée sans interrompre les suivantes, `executerUne` la laisse remonter pour que l'Exécution
  échoue.

- **Un exécuteur partagé, un adaptateur par entité.** `lib/use-cases/apres-ecriture/executeur.ts`
  porte `executerPlan`, `executerUne`, `GestionnairesPour` et `LectureManquanteError`.
  `commande.ts`, `catalogue.ts`, `structure.ts` et `livraison.ts` projettent les ports de leur
  entité ; tous exposent `executer` pour la tentative immédiate et `executerUne` pour le
  travailleur. La carte des gestionnaires est **totale** sur les effets de l'entité : un effet
  déclaré sans gestionnaire ne compile pas, un gestionnaire en trop non plus ; un port facultatif
  absent échoue par son nom (`PortCatalogueManquantError`), jamais en silence.

- **Le travailleur redéclare le plan unitaire.** `lib/apres-ecriture-redeclaration.ts` valide la
  Charge et la rejoue dans la déclaration du genre (`GENRE_PAR_DECLENCHEUR`,
  `declarerDepuisLaCharge`, qui délègue à `declarerDepuisLaChargeValidee` sur une Charge déjà
  analysée) ; les genres groupés n'y entrent pas, leurs Événements étant unitaires, et un
  déclencheur planifié rend `null` parce qu'il n'a pas de genre.
  `lib/automations/execution-durable.ts` tient la porte unique, `executerActionOuRedeclaration` :
  elle filtre les conséquences du plan redéclaré sur l'action de la Règle et les exécute dans
  l'ordre du plan, par le pont de l'entité (`lib/automations/ponts.ts`). Le réessai manuel
  (`lib/use-cases/automatisations.ts`) partage cette porte ; un échec de conséquence fait échouer
  l'Exécution et déclenche sa reprise.

- **Une lecture fournie qui omet un Produit échoue par son nom.** Quand le pont fournit la
  lecture `evenements`, un Événement Catalogue requis absent lève
  `EvenementCatalogueIntrouvableError(produitId)` — jamais un événement fabriqué. Le changement
  de stock, qui n'a pas d'Événement Catalogue durable, lève
  `EvenementCatalogueNonDurableError` si on le lui demande ; il ne réindexe qu'un document.

- **Les lectures du pont sont mémoïsées par plan.** `pontStructure` partage une seule lecture de
  l'arbre et une lecture de documents par branche résolue, même quand `executerUne` reconstruit
  sa carte de gestionnaires à chaque conséquence : une Structure supprimée à N destinations ne
  lit pas l'arbre N fois. Le pont Catalogue mémoïse de même `documents` et `evenements`.

- **Une Règle dont l'action n'est pas déclarée n'exécute rien.** La conséquence n'existe pas dans le
  plan redéclaré : le filtre la laisse hors du plan, l'Exécution réussit sans effet. La déclaration
  reste la seule source de vérité ; une action retirée d'un genre n'est pas une erreur du
  travailleur.

- **`ACTIONS` se réduit aux déclencheurs planifiés.** `lib/automations/actions.ts` ne garde que
  `digest.stock-bas`, `digest.proprietaire` et `reconciliation.recherche`, qui n'ont pas de genre.
  Les actions durables n'ont plus de corps dans `ACTIONS` : leur comportement est le plan déclaré,
  exécuté par l'adaptateur de l'entité.

- **La scission d'ADR-0044 tient.** La bascule ne gouverne que la reprise, l'historique et le
  réessai manuel ; la tentative immédiate exécute le plan quel que soit `enabled`.

- **Le registre reste exhaustif par le type.** `REGISTRE` est
  `{ [G in GenreEcriture]: DeclarationPour<G> }` : ajouter un genre sans déclaration ne compile
  pas ; `lib/apres-ecriture-frontiere.test.ts` continue d'épingler la couverture exacte à
  l'exécution.

- **Les genres de maintenance sont typés et exécutés par leur entité.** L'amendement « les écritures
  de maintenance sont un second genre » garde son diagnostic — aucun fait, aucune conséquence
  durable, aucune Règle. Ce qui a changé depuis : les cinq genres `ville.creee`, `ville.modifiee`,
  `ville.supprimee`, `livraison.reglee` et `image.texte-alternatif` rendent un plan typé (`PlanLivraison`, `PlanCatalogue`) exécuté par
  l'adaptateur de leur entité (`livraison.ts`, `catalogue.ts`), et non plus par un
  `planDeMaintenance` partagé. L'ancien texte n'est pas réécrit : il reste l'état de #874.
