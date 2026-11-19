# Le chiffre d'affaires lit les Encaissements et les Remboursements

[ADR-0009](0009-ca-encaisse-delivered-only.md) déduisait l'argent reçu du Statut de commande : `Livrée` valait Encaissement, et le Tableau de bord sommait les Totaux à payer des seules Commandes Livrées. [ADR-0055](0055-le-retour-l-encaissement-et-le-remboursement-sont-trois-faits-distincts.md) a séparé les faits — le Retour, l'Encaissement et le Remboursement — sans changer les lectures. Cette décision bascule les lectures : le Chiffre d'affaires encaissé est la somme des Encaissements, et le Chiffre d'affaires net en soustrait les Remboursements.

## Décision

- **Le brut est la somme des Encaissements.** Le Chiffre d'affaires encaissé d'une fenêtre est `Σ Payment.amount` pour les Encaissements dont `collectedAt` tombe dans la fenêtre. Aucune lecture ne filtre sur `Order.status` : un Encaissement compte même si la Commande n'est plus `Livrée`, et une Commande `Livrée` sans Encaissement ne compte pas.

- **Le net est le brut moins les Remboursements.** Le Chiffre d'affaires net d'une fenêtre est le brut de la fenêtre moins `Σ Refund.amount` pour les Remboursements dont `refundedAt` tombe dans la même fenêtre. Un Remboursement sort de la fenêtre où il a été accordé, pas de celle de l'Encaissement qu'il rembourse.

- **Le Statut de commande ne porte plus aucun prédicat d'argent.** `STATUTS_ENCAISSÉS`, `FRAGMENT_WHERE_ENCAISSÉS` et `estEncaissée` sont supprimés de `lib/statut-de-commande.ts`. Le module ne garde que les libellés, les tons, les verbes et la matrice de transitions.

- **Le Tableau de bord expose le brut et le net.** `getDashboardStats` rend `chiffreAffairesBrut30j`, `chiffreAffairesNet30j`, la variation du net contre la fenêtre précédente, et les seaux de la période en net. La carte principale affiche le net et rappelle le brut ; le graphique trace le net.

- **Les lectures de Commande exposent le brut, le remboursé et le net.** `getOrder`, `listUserOrders`, `getAdminOrder` et `listAdminOrders` rendent `montantEncaisse` (somme des Encaissements), `montantRembourse` (somme des Remboursements de ces Encaissements) et `montantNet` (la différence).

- **Une Commande intégralement remboursée reste `Livrée`.** Son Encaissement et son Remboursement restent en place, et son net vaut zéro. Aucune transition de Statut n'est écrite par un Remboursement.

- **Le Statut ne réapprovisionne plus.** Le drapeau `réapprovisionne` disparaît avec le réapprovisionnement qu'il pilotait. `updateOrderStatus` ne réapprovisionne plus que pour une Annulation, nommée explicitement dans la transition. La réception d'un Retour réapprovisionne les seules quantités reçues et revendables, et clôt la Commande quand toutes les unités sont revenues (#1030).

## Ce que la décision n'implique pas

- Aucune surface nouvelle : la carte, le graphique et les deux lectures d'Administration existants sont étendus ; aucun écran de Remboursement ou de Retour n'est ajouté.
- Aucun changement de schéma ni de migration : les faits sont ceux d'ADR-0055, #1028 et #1031.
- Aucune réécriture du backfill : il continue d'écrire un Encaissement par Commande déjà Livrée, `collectedAt = updatedAt`, et n'invente rien pour les Commandes Retournées.
- Aucune lecture de Commande client n'affiche le brut ou le net : `getOrder` et `listUserOrders` les exposent, les surfaces client continuent de montrer le Total à payer.

## Fenêtres et instants

- Les 30 jours du KPI sont une fenêtre glissante de 30 × 24 h ; la variation compare le net de la fenêtre précédente, et reste indéfinie quand celle-ci vaut zéro.
- Le graphique range chaque fait à son propre instant : `Payment.collectedAt` pour le brut, `Refund.refundedAt` pour la soustraction. Un seau peut donc être négatif si les Remboursements y dépassent les Encaissements.
- La preuve de neutralité exigée par le ticket se lit sur la copie restaurée du point de restauration #1026 : elle ne contient aucune Commande, donc le net y vaut zéro avant comme après la bascule.

## Options envisagées

- **Garder le prédicat au Statut en plus des lignes d'argent** — rejeté : deux sources pour un même fait, et un Remboursement ne pourrait jamais réduire le net d'une Commande restée Livrée.
- **Déduire le net des Retours plutôt que des Remboursements** — rejeté : les marchandises et l'argent sont deux faits distincts (ADR-0055) ; un Remboursement peut précéder la réception, et un refus ne l'efface pas.
- **Attribuer le Remboursement à la fenêtre de son Encaissement** — rejeté : le net d'une fenêtre doit dire l'argent rendu pendant cette fenêtre, pas réécrire une fenêtre passée déjà lue.
- **Laisser le graphique au brut et n'exposer le net qu'en carte** — rejeté : le ticket demande que le net soit lu dans le Tableau de bord, et c'est le net qui répond au propriétaire.
- **Conserver `réapprovisionne` comme table de vérité** — rejeté : le Statut ne doit plus décider du stock ; l'Annulation nomme son réapprovisionnement, la réception du Retour possède le sien.

## Invariants

- `Order.status` n'entre dans aucune agrégation de Chiffre d'affaires.
- Le brut d'une fenêtre est exactement la somme des `Payment.amount` dont `collectedAt` est dans la fenêtre.
- Le net d'une fenêtre est exactement le brut de la fenêtre moins la somme des `Refund.amount` dont `refundedAt` est dans la fenêtre.
- Une Commande dont tous les Encaissements sont intégralement remboursés garde `status = delivered`, ses lignes `Payment` et ses lignes `Refund`, et `montantNet = 0`.
- Une Annulation réapprovisionne toutes les unités de la Commande ; le passage à `Retournée` par une Transition de statut ne réapprovisionne rien.
- Aucun module de production n'importe `STATUTS_ENCAISSÉS`, `FRAGMENT_WHERE_ENCAISSÉS`, `estEncaissée` ou `réapprovisionne` : ces symboles n'existent plus.

## Amendement d'ADR-0009

La règle d'ADR-0009 — « le Chiffre d'affaires encaissé ne compte que les Commandes Livrées » — est remplacée par la présente décision. `Livrée` reste l'instant où le Paiement à la livraison produit son Encaissement, mais la lecture somme les lignes d'argent : un Encaissement peut survivre à une Commande qui n'est plus Livrée, et un Remboursement réduit le net sans changer le Statut. Les deux gardes citées par ADR-0009 restent des preuves de lecture du montant persisté, désormais portées par les Encaissements.

## Amendement — La fermeture manuelle n'existe plus

L'observation qui a motivé cet ADR — un passage manuel à `Retournée` n'apporte ni stock ni
Encaissement — reste vraie, mais elle n'est plus atteignable : `updateOrderStatus` lit la table
étroite des transitions et refuse `Retournée`. Seule la réception d'un Retour, lorsque toutes les
unités commandées sont revenues, peut fermer la Commande, et elle le fait par la table large. Un
`Encaissement` n'est toujours écrit que par le passage manuel à `Livrée`, et un `Remboursement` ne
change jamais le statut. La lecture du chiffre d'affaires n'a donc pas varié : elle additionne les
Encaissements et soustrait les Remboursements, sans filtre sur le Statut de commande. Les deux
chemins de statut sont enregistrés dans [ADR-0055](0055-le-retour-l-encaissement-et-le-remboursement-sont-trois-faits-distincts.md) ;
le corps de la présente décision n'est pas réécrit.
