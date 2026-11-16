# Le Retour, l'Encaissement et le Remboursement sont trois faits distincts

Une Commande Livrée portait trois choses dans un seul Statut de commande : la marchandise partie, l'argent reçu et l'argent rendu. `Livrée` valait encaissement ; `Retournée` valait à la fois retour de toutes les lignes, remboursement complet et réapprovisionnement. Le schéma n'avait aucune place pour un retour partiel, une rétractation datée, un refus ou un remboursement distinct, alors que la FAQ et les conditions promettent un droit de rétractation de sept jours et un remboursement.

[ADR-0009](0009-ca-encaisse-delivered-only.md) lit encore le Chiffre d'affaires au Statut. Cette décision ne l'amende pas : elle sépare les faits que la lecture utilise, et la bascule des lectures est le ticket #1032, qui écrit ADR-0056.

## Décision

- **Un Retour est le fait des marchandises.** Il porte une Commande, un motif, la date à laquelle le Client a exercé son droit (`requestedAt`), et des Lignes du Retour qui déclarent une quantité par Article du panier. Sa persistance est `Return` / `ReturnLine` (`prisma/schema.prisma`). Un Retour naît `requested`, puis devient `received` ou `refused`. Le recevoir et réapprovisionner ses quantités revendables est le ticket #1030 ; déclarer et refuser est le ticket #1029.

- **Un Encaissement est le fait de l'argent reçu.** Il porte un montant, un mode, un instant et l'administrateur acteur. Il est écrit dans la transaction qui marque la Commande Livrée ; une Commande Retournée n'en reçoit pas et le backfill n'en invente pas. Sa persistance est `Payment` (ticket #1028).

- **Un Remboursement est le fait de l'argent rendu.** Il porte un montant, un mode, un instant, l'administrateur acteur et une clé d'idempotence, contre un Encaissement précis ; son lien à un Retour est optionnel. Il peut exister sans Retour et précéder la réception des marchandises. Sa persistance est `Refund` (ticket #1031).

- **Le Statut de commande ne porte ni argent ni stock.** Il garde ses libellés et ses transitions. `Retournée` ne sera atteint que lorsque toutes les unités commandées auront été reçues, depuis la transaction de réception, et jamais depuis la déclaration ou le refus (#1030). Une Commande intégralement remboursée reste `Livrée` et garde ses lignes d'argent.

- **Les trois faits se composent, ils ne se remplacent pas.** Un Retour peut exister sans Encaissement — la Commande n'a pas été livrée, le colis est refusé à la porte. Un Remboursement peut exister sans Retour. Un refus de Retour ne supprime jamais un Remboursement déjà accordé : le refus est une écriture du seul Retour, il n'émet aucune suppression, et le Remboursement ne pend pas à la survie du Retour.

- **La fenêtre légale se lit sur `deliveredAt`, jamais sur `updatedAt`.** Une rétractation demandée plus de sept jours après la livraison est enregistrée en `goodwill`, jamais en `withdrawal`. Une demande tardive n'est pas bloquée : elle est enregistrée sous le motif qui dit la vérité. Sans date de livraison, la fenêtre n'a pas commencé et le motif déclaré reste le motif enregistré. Les autres motifs — non-conformité, geste commercial, autre — n'ont pas de fenêtre.

- **Le plafond cumulé est une règle de transaction, l'unicité de la demande ouverte une règle de base.** Le cumul des quantités déclarées, tous Retours non refusés confondus, ne dépasse jamais la quantité commandée pour chaque Article du panier. La déclaration verrouille la ligne de la Commande (`SELECT … FOR UPDATE`), puis lit les cumuls et écrit : deux déclarations concurrentes se sérialisent et la seconde voit la première. Au plus une demande `requested` par Commande est garanti par l'index partiel `Return_orderId_ouvert_key`, pas par une lecture préalable ; une violation de cet index est présentée comme une demande déjà ouverte.

- **Le refus est légal, borné et sans destruction.** Seule une demande `requested` peut être refusée. Le refus porte un code de la liste `out_of_window`, `excluded_by_law`, `not_received`, `condition_mismatch`, `other`, et une note facultative. Il ne touche ni au stock ni au Statut de commande, ne supprime ni le Retour ni ses lignes, et ne supprime aucun Remboursement.

- **Les règles vivent dans deux modules.** Les motifs, les codes et la fenêtre de rétractation sont purs (`lib/retours.ts`, `motifEnregistre`). La déclaration et le refus portent la transaction (`lib/use-cases/retours.ts`, `declarerRetour`, `refuserRetour`). La migration `20261116140000_retour_declaration_et_refus` porte l'index partiel et les deux `CHECK` de quantité, que Prisma ne modélise pas.

## Ce que la décision n'implique pas

- Aucune surface n'est ajoutée : ni écran d'Administration, ni formulaire client. Les chemins d'écriture et leurs preuves viennent d'abord ; les écrans sont une surface additive ultérieure.
- Aucun e-mail de Retour n'est envoyé dans cette tranche.
- Aucun échange, avoir ou remboursement par ligne n'est introduit.
- Le stock ne bouge pas à la déclaration ni au refus ; il ne bougera qu'à la réception des quantités revendables (#1030).
- L'histoire monétaire des Commandes déjà `Retournée` sous l'ancien schéma reste inconnue et n'est pas inventée.
- La copie publique des conditions et de la FAQ — « 7 jours après réception », « article ouvert non repris » — est un ticket séparé ; cette décision consigne le droit, elle ne réécrit pas la page.

## Options envisagées

- **Garder le Statut de commande comme registre** — rejeté : il ne peut exprimer ni un retour partiel, ni deux retours successifs, ni un remboursement sans réception, ni une date de demande distincte de la saisie.
- **Déduire l'argent du Statut** — rejeté : l'argent reçu et rendu sont des faits enregistrés, pas des conséquences d'un libellé ; [ADR-0009](0009-ca-encaisse-delivered-only.md) le faisait faute de ligne d'argent, pas comme une fin.
- **Refuser les demandes tardives** — rejeté : la loi ne demande pas de bloquer la demande, elle demande de ne pas la qualifier de rétractation. Enregistrer `goodwill` dit la vérité sans fermer la porte au Client.
- **Vérifier le plafond en lecture applicative seule** — rejeté : deux créations concurrentes passeraient toutes deux la lecture. Le verrou de la Commande est la condition de la règle.
- **Vérifier « une seule demande ouverte » en lecture applicative** — rejeté : même course. La garantie est l'index partiel, et la lecture n'est qu'un confort.
- **Faire du Retour une transition de Statut** — rejeté : cela ramènerait l'argent et le stock dans le Statut, et rendrait un refus impossible sans effacer un fait.

## Invariants

- Pour chaque Article du panier, la somme des `ReturnLine.declaredQuantity` des Retours non `refused` est inférieure ou égale à `OrderItem.quantity`.
- Il existe au plus une ligne `Return` de statut `requested` par `Order`.
- `ReturnLine.declaredQuantity > 0`, et `ReturnLine.receivedQuantity` est nulle ou comprise entre zéro et la quantité déclarée.
- Une rétractation demandée plus de sept jours après `Order.deliveredAt` est persistée en `goodwill`.
- Un refus part d'un Retour `requested` et le laisse en place ; il n'écrit que `status`, `refusalCode`, `refusalNote` et `updatedAt`.
- Déclarer ou refuser un Retour n'écrit ni `ProductVariant.stock`, ni `Order.status`, ni une ligne de `Payment` ou de `Refund`.
