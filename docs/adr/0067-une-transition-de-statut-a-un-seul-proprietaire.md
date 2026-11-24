# Une Transition de statut a un seul propriétaire, et il vit dans le module Commande

`updateOrderStatus` et la clôture d'un Retour écrivaient la même Transition de statut en deux
exemplaires : verrou, garde, revendication optimiste, Encaissement, Changement de statut,
Réapprovisionnement, déclaration du plan et écriture des faits. Neuf lignes sur dix étaient
identiques, et la seconde copie avait été transcrite à la main — `toOrderEmailSnapshot` existait
en double, mot pour mot, dans `orders.ts` et `retours.ts`.

La règle, elle, avait déjà un propriétaire : `lib/statut-de-commande.ts` porte deux tables
d'arêtes, `TRANSITIONS_ADMINISTRATION` (la Transition manuelle, qui n'offre jamais `Retournée`) et
`TRANSITIONS_TOUTES_VOIES` (la clôture du Retour, qui l'atteint). Ce qui manquait n'était donc pas
la règle mais les **lignes** qu'elle déclenche.

## Décision

- **Un seul module écrit une Transition**, `effectuerLaTransition` dans
  `lib/use-cases/commande.ts` — le dossier de concept qui porte déjà le stock de la Commande.
  Il prend la transaction, la Commande déjà verrouillée et lue, le Statut visé, l'acteur, l'origine
  et l'instant ; il rend la Commande relue, le Plan et l'Écriture de stock.
- **L'origine est une donnée, pas un drapeau.** `origine: "administration" | "retour"` choisit la
  table d'arêtes. L'appelant nomme la voie qui l'invoque ; il ne re-décide aucune arête et ne
  peut pas en inventer une.
- **Le Statut visé décide des conséquences.** `delivered` encaisse, `cancelled` réapprovisionne,
  `returned` ne fait ni l'un ni l'autre — la réception du Retour a déjà rendu les unités
  (GLOSSARY, « Réapprovisionnement »). Aucun paramètre ne porte ces différences : elles sont une
  fonction du Statut, et le module les tient.
- **Le verrou reste chez l'appelant.** Les deux appelants verrouillent avant de lire, parce que la
  suite de leur transaction en dépend : `updateOrderStatus` pour la Transition seule,
  `recevoirRetour` pour la réception entière. Le module ne prend donc pas d'identifiant et ne
  relit pas : il reçoit la Commande que le verrou protège déjà.
- **Le snapshot d'e-mail a un propriétaire.** `toOrderEmailSnapshot` vit dans le même module et
  sert les trois écrivains de Commande — la création, la Transition manuelle, la clôture du Retour.
- **La façade ne change pas.** `updateOrderStatus` garde sa signature, son verrou, sa transaction
  et l'exécution post-commit ; la clôture du Retour garde la sienne, qui porte aussi les
  mouvements de stock de la réception. ADR-0014 et ADR-0025 tiennent : les effets restent
  encapsulés, et le squelette partagé garde `runEffect`.

## Considérations

- **Faire porter le verrou au module** — rejeté : `recevoirRetour` lit la Commande pour ses
  lignes, ses cumuls et ses quantités avant de clôturer ; un second verrou et une seconde lecture
  auraient ajouté deux requêtes à une transaction déjà longue.
- **Passer la table d'arêtes en paramètre** — rejeté au profit de `origine` : une table est une
  structure ouverte, et l'appelant pourrait en composer une troisième. L'union fermée dit
  exactement les deux voies qui existent.
- **Sortir la Transition dans un fichier neuf** — rejeté : `lib/use-cases/commande.ts` est déjà le
  dossier de concept de la Commande (stock, réservation, Réapprovisionnement) ; la Transition y
  rejoint ses invariants au lieu d'ouvrir un troisième fichier qui porte le même nom de domaine.

## Coûts

- **Une lecture de plus pour la clôture du Retour** : le module relit la Commande après la
  revendication pour le snapshot, là où la clôture transpirait la sienne. C'est une requête dans
  une transaction qui en compte déjà une dizaine, achetée contre une duplication.
- **Le verrou est une précondition non vérifiée.** Le module ne peut pas prouver que l'appelant
  l'a pris. Les deux appelants le prennent, et leurs suites éprouvent la concurrence ; la garde
  est là, pas dans le type.

## Invariants

- Une seule implémentation écrit `Payment`, `OrderStatusChange` et le Réapprovisionnement d'une
  Transition.
- `transition` inconnue ⇒ `InvalidOrderTransitionError`, levée au même endroit pour les deux voies.
- L'instant du Changement de statut est celui que l'appelant passe ; la clôture du Retour le
  partage avec `receivedAt`, et sa suite l'éprouve.
- Aucune Transition ne s'écrit hors d'une transaction fournie par l'appelant.
