# Total à payer is a persisted fact of the Commande

The Liste des Commandes exposes a sortable « Total à payer » column. The cell showed
`total + shippingFee`, but the sort ordered by `Order.total` — the Sous-total, without the
Frais de livraison — because Prisma sorts a single field and no field held the displayed
sum. Two Commandes with equal Sous-totaux and different Frais de livraison therefore sorted
in an order that contradicted what the column displayed. The aggregation was right; the sort
key was a proxy. This ADR makes the Total à payer a fact of the Commande, written once at
creation and read where a persisted key is required.

## Decision

- **`Order.totalPayable` is a required Int column**, added by migration with a backfill:
  existing rows are set to `total + shippingFee` before the column becomes non-null.
- **The write site is Commande creation only**, through the canonical pure arithmetic
  `money.totalPayable({ total, shippingFee })`. The shipped money rule keeps its single
  arithmetic site; no admin read re-derives the sum.
- **The admin listing and detail DTOs read the persisted fact** and the `tri === "total"`
  sort orders by `order.totalPayable` — the column sorts by exactly what it displays. The
  DTO shapes are unchanged.
- **The persisted fact is written once and read where a stored key is required** (the admin
  listing and detail). Order history (`getOrder`, `listUserOrders`), the order e-mails and
  the Tableau de bord revenue keep today's derived reads: they need the number, not a
  stored key.
- **The fact is immutable by construction.** `total` and `shippingFee` are written once at
  checkout and never updated; after checkout only Statut transitions touch a Commande. The
  persisted Total à payer can therefore never drift from the Sous-total + Frais de livraison
  pair it was derived from.

## Considered Options

- **Raw-SQL sum ordering** (`ORDER BY total + shippingFee`) — rejected: it moves the
  arithmetic into the read site, a second place for the money rule to live, and forces a
  raw-query escape hatch out of Prisma's typed `orderBy`.
- **A Postgres generated column** (`GENERATED ALWAYS AS (total + shippingFee) STORED`) —
  rejected: the rule would live in SQL, invisible to `lib/money.ts`; every change to the
  money rule would need a migration, and a generated column is not a writable Prisma field,
  so the client's create model would diverge from the table.
- **Relabeling the column** (display « Sous-total », keep sorting by `total`) — rejected: it
  dodges the lie instead of removing it. The Administration wants the amount the customer
  pays; the contradictory sort would remain one label change away.
- **Deriving the sum at every read** (status quo) — rejected: Prisma sorts a single field
  only, so a truthful sort needs the key to exist in the row, not to be computed after it.

## Invariants

- The « Total à payer » sort orders by the exact value the column displays.
- `Order.total` keeps ADR-0009's meaning: the articles Sous-total without the delivery fee.
- No write path updates `totalPayable` after Commande creation.

## Amendement — ADR-0009 (#341)

This decision amends ADR-0009's mechanism only. ADR-0009 had the order DTOs
expose the sum derived via `money.totalPayable`; the admin DTOs
(`AdminOrderSummary`, `AdminOrderDetail`) now read the persisted
`Order.totalPayable` fact instead. The write site remains the canonical pure
arithmetic `money.totalPayable({ total, shippingFee })`.

ADR-0009's rules stay standing, untouched:

- the counting rule — Chiffre d'affaires counts only Commandes Livrées;
- « display sites never re-derive » — display sites still show the DTO's
  amount and never re-derive `total + shippingFee`.

## Amendement — L'exemption est levée, l'arithmétique devient inatteignable (#463)

Le quatrième point du corps de la décision est levé : « Order history
(`getOrder`, `listUserOrders`), the order e-mails and the Tableau de bord
revenue keep today's derived reads: they need the number, not a stored key ».
L'amendement #341, plus bas dans ce même fichier, dit l'inverse : « display
sites still show the DTO's amount and never re-derive `total + shippingFee` ».
Le même fichier accorde et retire la même règle dans la même page ; il n'en
accorde aucune.

Le motif de l'exemption ne tenait pas non plus. La clé était là dès la
migration : `Order.totalPayable` est une colonne requise, rétro-alimentée puis
non-null. Aucun des sites nommés n'avait « le nombre plutôt que la clé » — il
avait la clé. Les trois surfaces que l'exemption énumère lisent aujourd'hui le
fait persisté ; aucune lecture dérivée ne leur reste à conserver.

Le reste de la décision tient :

- la colonne, sa migration et son remplissage ;
- les DTO d'Administration lisent le fait persisté, et le tri `tri === "total"`
  ordonne par `order.totalPayable` — la colonne trie exactement ce qu'elle
  affiche ;
- `Order.total` garde le sens d'ADR-0009 : le sous-total des Articles, sans
  les Frais de livraison ;
- aucune écriture ne touche `totalPayable` après la création d'une Commande.

Les deux mentions de `money.totalPayable({ total, shippingFee })` — celle du
corps de la décision et celle de l'amendement #341 — sont périmées sur le nom
**et** sur le cadrage ; ADR-0009 traite le même symbole mort en le déclarant
périmé sans réserve. Le corps ne se contente pas de nommer une règle qui
n'existe plus : il affirme « the shipped money rule keeps its single
arithmetic site », et `lib/money.ts` ne tient plus aucune arithmétique —
seulement le formatage d'affichage et l'encodage de transport. Il n'y a plus
de règle d'argent livrée, donc plus de site unique à tenir. Ce qui survit,
c'est le site d'écriture, la seule création de Commande ; il passe désormais
par `totalAPayerDeLaCommande`, **non exportée**, dans
`lib/use-cases/orders.ts` : l'arithmétique vit à côté du site qui l'écrit, et
l'absence d'export est ce qui l'assure — aucun site d'affichage, aucun module
et aucun test ne peut l'atteindre par `import`.

La règle est vérifiable, pas seulement affirmée. Deux gardes la portent,
chacune sur une Commande dont le Total à payer stocké ne vaut pas son
Sous-total plus ses Frais de livraison — la seule fixture qui distingue la
lecture de la colonne d'un recalcul :

- `lib/use-cases/admin-dashboard.test.ts` : le Chiffre d'affaires encaissé des
  30 derniers jours, le seau du mois et la Commande récente rapportent la
  valeur stockée ;
- `lib/use-cases/orders.test.ts` : le snapshot d'e-mail de la commande, à la
  couture des effets injectés.
