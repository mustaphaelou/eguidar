# Chiffre d'affaires encaissé counts only Commandes Livrées

Eguidar's only payment method is Paiement à la livraison: money becomes real only when the courier collects it, i.e. at statut `delivered` (`Livrée`). Revenue metrics on the Tableau de bord therefore sum **only** orders with statut `Livrée`, deliberately excluding `pending`, `confirmed` and `shipped` even though those are legitimate in-flight orders — do not "fix" the where-clause to include them; add a separate order-book metric instead if needed. In code the rule lives in the Statut de commande module `lib/statut-de-commande.ts`: `STATUTS_ENCAISSÉS` declares the encaissée statuts (exactly `Livrée`) and `estEncaissée` answers whether a Commande's money is collected, pinned by `lib/statut-de-commande.test.ts`.

Two constraints not obvious from the code: `Order.total` stores the articles subtotal **without** the delivery fee (see `lib/use-cases/orders.ts`), so any collected amount must be computed as `total + shippingFee` ("Total à payer"); and the same rule applies retroactively to chart buckets.

The read path is enforced in code: every module that produces the numbers exposes the sum already computed — order DTOs (`OrderDetail`, `OrderSummary`, `AdminOrderDetail`, `AdminOrderSummary`), the `OrderEmailSnapshot`, and the Devis' `ShippingQuote.total` — via `money.totalPayable`. Display sites show `totalPayable` and must not re-derive `total + shippingFee`.

## Amendement — La lecture passe par le fait persisté (#463)

Les deux chemins cités au premier paragraphe sont corrigés sur place : le
module du Statut de commande s'appelle `lib/statut-de-commande.ts` et sa suite
`lib/statut-de-commande.test.ts` — il a été renommé sur le nom de son
domaine. Elle épingle toujours `estEncaissée` et `STATUTS_ENCAISSÉS`. Aucun
symbole n'a bougé, aucune décision n'est touchée : seuls les pointeurs.

Le mécanisme du dernier paragraphe, lui, est périmé.

- « via `money.totalPayable` » — ce helper n'existe plus. L'arithmétique du
  Total à payer est `totalAPayerDeLaCommande`, **non exportée**, dans
  `lib/use-cases/orders.ts` : appelée une fois, à la création de la
  Commande, dans la transaction. `lib/money.ts` ne tient plus que le
  formatage d'affichage et l'encodage de transport.
- « every module that produces the numbers exposes the sum already computed »
  — rien n'est plus exposé « via » un helper partagé. Ce qui applique la
  règle est la colonne `Order.totalPayable`, fait de la Commande écrit une
  seule fois et relu par tous les chemins de lecture. C'est plus fort qu'une
  somme canonique qu'un site d'affichage pouvait ignorer : l'arithmétique
  n'est plus atteignable par import.
- le `ShippingQuote.total` du Devis parmi ces modules. Un Devis chiffre un
  Panier : il n'a pas de Commande derrière lui, donc rien de persisté à
  lire, et son total reste légitimement `sousTotal + shippingFee`
  (`lib/use-cases/devis.ts`). Ce n'est pas une lecture de Commande, c'est le
  chiffrage d'avant-naissance ; la Commande née de ce Devis écrit cette
  valeur dans la colonne.
- « any collected amount must be computed as `total + shippingFee` » (deuxième
  paragraphe) — vrai de la naissance du montant, faux de toute lecture. Le
  montant encaissé se lit, il ne se recalcule pas.

Le reste tient :

- le décompte — le Chiffre d'affaires encaissé ne compte que les Commandes
  Livrées, et la règle vaut rétroactivement pour les seaux du graphique ;
- « les sites d'affichage montrent `totalPayable` et ne re-dérivent jamais
  `total + shippingFee` » ;
- `Order.total` reste le sous-total des Articles, sans les Frais de livraison.

« Enforced in code » ne se dit plus d'un mécanisme mais d'une preuve. Deux
gardes portent la règle, chacune sur une Commande dont le Total à payer stocké
ne vaut pas son Sous-total plus ses Frais de livraison — un état qu'aucun
chemin de production ne peut produire, et le seul qui distingue la lecture de
la colonne d'un recalcul :

- `lib/use-cases/admin-dashboard.test.ts` : le Chiffre d'affaires encaissé des
  30 derniers jours, le seau du mois et la Commande récente rapportent la
  valeur stockée ;
- `lib/use-cases/orders.test.ts` : le snapshot d'e-mail de la commande lit la
  valeur stockée, à la couture des effets injectés.

## Amendement — Le Devis chiffre, la Commande copie (#656, 2026-10-20)

Le paragraphe de l'amendement #463 qui nomme `totalAPayerDeLaCommande`,
**non exportée**, dans `lib/use-cases/orders.ts` est périmé : cette fonction
n'existe plus, et `orders.ts` ne tient plus aucune arithmétique d'argent.

Le mécanisme courant est le chiffrage du Devis. `chargerDevis`
(`lib/use-cases/devis.ts`) calcule `total = sousTotal + shippingFee` ;
`montantsDeLaCommande` (`lib/use-cases/montants-commande.ts`) recopie ce total
dans la Commande à sa création, et `placeOrder` refuse la Commande quand ce
total ne correspond plus à celui que le Client a lu (`DevisPériméError`).
L'arithmétique n'est donc plus inatteignable par import : elle vit dans le
Devis, que l'affiché et l'écrit partagent. Le reste de l'amendement #463 tient,
y compris ses deux gardes de lecture.
