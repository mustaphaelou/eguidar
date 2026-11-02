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
  une ligne manquante et ne met jamais à jour une ligne existante. Les identités existantes sont
  réutilisées (`confirmation-commande`, `statut-commande`, `indexation-produit`, …) ; les deux
  nouvelles Règles sont `indexation-structure` et `suppression-images-produit`. Une définition par
  défaut modifiée est une migration explicite, jamais une réécriture implicite.

- **Deux nouvelles actions du vocabulaire fermé.** `index.structure` réindexe la branche touchée
  d'une Structure ; pour une suppression, le `fait` porte la cible de rattachement et l'action
  réindexe la branche de destination, puisque la branche supprimée n'existe plus. `suppression.images`
  supprime les objets R2 nommés dans le `fait` ; lors d'une mise à jour ce sont les images
  retirées, lors d'une suppression de Produit ce sont toutes ses images. Libellés éditeur :
  « Indexation de la Structure » et « Suppression des Images produit » (généralisé à l'image d'une
  Structure).

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
