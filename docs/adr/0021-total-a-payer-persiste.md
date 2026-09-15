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
- **Only the admin sort key is persisted.** Order history (`getOrder`, `listUserOrders`),
  the order e-mails and the Tableau du bord revenue keep today's derived reads: they need
  the number, not a stored key.
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
