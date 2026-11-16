# Structuring a relational database for an e-commerce site: a design guide for the schema owner

> **Research-only document.** Every factual claim below is traced to a primary source: `postgresql.org/docs/current`, `prisma.io/docs` (pinned to the Prisma ORM **v7** pages, the major version this repo runs), the model definitions in `github.com/medusajs/medusa` read at tag **v2.21.2**, `github.com/saleor/saleor` read at release tag **3.23.49**, `docs.saleor.io`, `shopify.dev` (Admin GraphQL object reference), and `docs.stripe.com`. The single exception is the expand/contract *pattern* in §11.1, for which no primary source was found — that section says so and names the documented behaviour that forces it. All remote sources were retrieved on **2026-11-15 (UTC)**. Every URL is listed in [Sources](#sources); URLs that failed or redirected are recorded in [Sources checked, not used / failed to fetch](#sources-checked-not-used--failed-to-fetch) so the next reader does not repeat them. Two version notes matter and are not decorative: `postgresql.org/docs/current` resolves to **PostgreSQL 18** documentation at retrieval time, while `docs/ARCHITECTURE.md` pins this project to **PostgreSQL 16**; and `prisma.io/docs` now defaults to Prisma ORM 8, so the Prisma citations below are the `/orm/v7/…` URLs, which were fetched explicitly (see the redirect log). No application code, schema, migration or configuration in this checkout was modified.

## Summary

- **Money is an integer in minor units plus a currency code on every row that carries an amount — and this repo has the integer half without the currency half.** PostgreSQL *recommends* `numeric` for money and calls integer arithmetic "very slow" by comparison ([8.1. Numeric Types](https://www.postgresql.org/docs/current/datatype-numeric.html)); Stripe's wire format is "a positive integer … in the smallest currency unit" ([PaymentIntent object](https://docs.stripe.com/api/payment_intents/object)); Medusa uses a `bigNumber` wrapper and Saleor a `DecimalField`. The invariant is not which of the two you pick, it is that the amount and its currency are one fact stored together.
- **`Order` must be an immutable snapshot, and its status must be a history table, not a column.** Saleor stores `product_name`, `variant_name`, `product_sku`, and net/gross unit prices **on the order line** ([order/models.py](https://raw.githubusercontent.com/saleor/saleor/3.23.49/saleor/order/models.py)) and keeps an `OrderEvent` row per lifecycle step; Medusa's `OrderLineItem` copies `product_title`, `variant_sku`, `variant_title`, `unit_price` ([line-item.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/order/src/models/line-item.ts)).
- **Payment, fulfillment and the order are three aggregates, and every primary source separates them.** Shopify's `Order` exposes `displayFinancialStatus`, `displayFulfillmentStatus` *and* a `fulfillmentOrders` connection, and tells you to "use the Fulfillment Order object" for detail ([Order](https://shopify.dev/docs/api/admin-graphql/latest/objects/Order)); Saleor's `Order` carries `status`, `authorize_status` and `charge_status` as three independent fields.
- **Stock belongs to (variant, location) with reservation rows — not to a single integer on the variant.** Medusa's `InventoryLevel` holds `stocked_quantity`, `reserved_quantity`, `incoming_quantity` and a computed `available_quantity`, unique on `(inventory_item_id, location_id)` ([inventory-level.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/inventory/src/models/inventory-level.ts)); Saleor adds `Stock.quantity_allocated` and an `Allocation` row per order line.
- **The oversell race is closed by a conditional `UPDATE`, not by a read-then-write.** PostgreSQL states plainly that `SELECT FOR UPDATE` "does not ensure that a concurrent transaction will not update or delete a selected row" and that under `READ COMMITTED` it is "very difficult to enforce business rules regarding data integrity" ([13.4. Data Consistency Checks at the Application Level](https://www.postgresql.org/docs/current/applevel-consistency.html)). This repo already uses the correct primitive — `updateMany({ where: { id, stock: { gte: quantity } } })` — and the guide defends it.
- **A cart may hold a price, but it is never the price authority at checkout.** Saleor merges cart and checkout into one `Checkout` object on purpose ([Checkout](https://docs.saleor.io/developer/checkout/overview)); Medusa keeps `Cart` and `Order` apart, with `LineItem` and `OrderLineItem` as different entities and `Cart.completed_at` marking the conversion. The separation is what makes "re-price, compare, then write" possible; this repo does that comparison explicitly (`DevisPériméError`).
- **Idempotency is a schema feature, not a retry policy.** Stripe keeps the status and body of the first request per `Idempotency-Key` for 24 hours and errors if the parameters differ ([Idempotent requests](https://docs.stripe.com/api/idempotent_requests)); webhook consumers must log processed event IDs because "webhook endpoints might occasionally receive the same event more than once" ([Webhooks](https://docs.stripe.com/webhooks)). Any write a browser or a webhook can replay needs a unique key in the table.
- **Enum or `varchar` + `CHECK` or lookup table: Prisma's enums are native PostgreSQL enums, and PostgreSQL will not let you remove or reorder a value** — "short of dropping and re-creating the enum type" ([8.7. Enumerated Types](https://www.postgresql.org/docs/current/datatype-enum.html)). Verdict for this repo: keep enums for closed sets, add a `CHECK` for numeric invariants, and use a table only for sets an editor must extend.
- **Eighteen concrete gaps in `prisma/schema.prisma`, ranked by risk, and none of them needs a column to change meaning** — the worst three are that no retention or accounting policy is representable (ADR-0046 deliberately makes deletion total, so the schema has no way to keep an invoice if that policy ever changes), that `OrderItem.variantId` has no foreign key at all, and that no amount in the schema carries a currency — the unit is a constant in `lib/money.ts`, not a row fact.

---

## 1. The non-negotiable invariants

These are the rules that are expensive to retrofit. Each is stated as a decision, with the primary-source reason.

### 1.1 Amounts: integer minor units plus an explicit currency

Three primary sources disagree on the representation, and the disagreement is worth reporting rather than flattening:

| Source | Representation | What the source actually says |
|---|---|---|
| PostgreSQL | `numeric` | "especially recommended for storing monetary amounts … Calculations with numeric values yield exact results where possible"; but "calculations on numeric values are very slow compared to the integer types" ([8.1. Numeric Types](https://www.postgresql.org/docs/current/datatype-numeric.html)) |
| PostgreSQL | `money` | *Not* the answer: precision "is determined by the database's `lc_monetary` setting", output is locale-sensitive, and the docs warn that dumps may not reload across `lc_monetary` settings ([8.2. Monetary Types](https://www.postgresql.org/docs/current/datatype-money.html)) |
| Stripe | integer | "A positive integer representing how much to charge in the smallest currency unit (e.g., 100 cents to charge $1.00 or 100 to charge ¥100, a zero-decimal currency)" ([PaymentIntent object](https://docs.stripe.com/api/payment_intents/object)) |
| Medusa v2.21.2 | `bigNumber` wrapper | money fields (`unit_price`, `amount`) are declared `model.bigNumber()`; the SQL type it materialises was not verified ([price.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/pricing/src/models/price.ts)) |
| Saleor 3.23.49 | decimal | `unit_price_net_amount` / `unit_price_gross_amount` are `DecimalField` ([order/models.py](https://raw.githubusercontent.com/saleor/saleor/3.23.49/saleor/order/models.py)) |
| Prisma ORM v7 | decimal by default | a `Decimal` field maps to `decimal(65,30)` on PostgreSQL, not to a money-shaped scale; `@db.Decimal(p, s)` narrows it ([Prisma schema reference](https://www.prisma.io/docs/orm/v7/reference/prisma-schema-reference)) |

**Decision.** Keep integers in minor units (Law 8 in `docs/ARCHITECTURE.md` §4, "L'argent est un entier de centimes") *and* store the currency code next to every amount. Reasons that survive the disagreement:

- Integer arithmetic is exact and cheap; `numeric` is exact and slow (PostgreSQL's own words above), and a `decimal(65,30)` column invites a scale mismatch between the application and the database.
- An integer column cannot silently acquire a fractional cent through a division; a `numeric` column can.
- The currency code is what makes the integer interpretable. This repo's unit is the centime, a hundredth *of a dirham*; the moment the shop quotes EUR or USD the same integer means a different amount, and nothing in the current schema records which currency a row was written in.

**What this does not solve.** Minor-unit integers push the rounding decision into the application (tax per line, discount allocation, FX). That is a deliberate trade: one rounding rule in `lib/`, versus an unknown scale factor in every row.

**Anti-pattern to avoid:** a `currency` column that exists but is never constrained (two rows in one order with different currencies). Either a single-currency store with a constant, or a `Currency`/`PriceList` table that every amount references.

### 1.2 Orders are immutable snapshots

Once an order exists, the names, SKUs, unit prices and addresses that the customer agreed to must be rows on the order, not joins to the catalogue. Evidence that this is the industry shape, not a preference:

- Saleor's order line stores `product_name` (max 386), `variant_name`, `translated_product_name`, `translated_variant_name`, `product_sku`, `product_variant_id`, `unit_price_net_amount`, `unit_price_gross_amount`, and the `undiscounted_unit_price_*` pair, while the `variant` foreign key is `on_delete=models.SET_NULL` ([order/models.py](https://raw.githubusercontent.com/saleor/saleor/3.23.49/saleor/order/models.py)).
- Medusa's order line is a separate entity (`OrderLineItem`) from the cart line (`LineItem`), and carries its own `product_title`, `variant_sku`, `variant_title`, `product_handle`, `unit_price`, `is_tax_inclusive` ([line-item.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/order/src/models/line-item.ts)); the order's `OrderItem` then adds the fulfilled/delivered/shipped/return quantities ([order-item.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/order/src/models/order-item.ts)).
- Medusa gives the order its own address entity, `OrderAddress`, with `first_name`, `last_name`, `address_1`, `city`, `country_code`, `postal_code`, `phone` — a copy, not a pointer to the customer's address book ([address.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/order/src/models/address.ts)).

**Corollary.** A nullable FK on a snapshot line is correct *and* must be `ON DELETE SET NULL`: the snapshot survives the catalogue, and the FK still prevents a typo'd id. Saleor does exactly that (`variant` → `SET_NULL`).

### 1.3 Every foreign key is declared, in the database

A foreign key is not documentation. PostgreSQL requires the referenced columns to be "either a primary key or form a unique constraint, or … columns from a non-partial unique index", and notes that "the declaration of a foreign key constraint does not automatically create an index on the referencing columns" ([5.5. Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)). Two consequences:

1. Declaring the FK does not index it; a `SELECT … WHERE variantId = $1` on an unindexed FK column is a sequential scan.
2. A nullable FK column that is never declared (a bare `String?`) accepts any string. Nothing detects a dangling id until a join returns null at the worst possible moment — during a restock, a refund, or a support call.

Prisma's defaults if you omit `onDelete` are `SetNull` for optional relations and `Restrict` for mandatory ones, `Cascade` for `onUpdate` in both cases ([Referential actions](https://www.prisma.io/docs/orm/v7/prisma-schema/data-model/relations/referential-actions)). *Restrict* on a mandatory relation is a load-bearing decision and should be written down (see §7).

### 1.4 Unique constraints encode business rules

A unique constraint is the only place a business rule is enforced under concurrency, because it is enforced by the index rather than by a preceding `SELECT`. "Adding a unique constraint will automatically create a unique B-tree index"; and "a uniqueness restriction covering only some rows cannot be written as a unique constraint, but it is possible to enforce such a restriction by creating a unique partial index" ([5.5. Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)).

Rules that belong in the schema, not only in a use case:

| Rule | Constraint | Caveat |
|---|---|---|
| one product per slug | `UNIQUE (slug)` | if soft delete is used, the constraint must be partial: `WHERE deleted_at IS NULL` |
| one SKU per variant | `UNIQUE (sku)` | nullable SKUs are allowed and multiple `NULL`s do not collide — "two null values are not considered equal" ([5.5. Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)) |
| one line per (cart, variant) | `UNIQUE (cart_id, variant_id)` | **not universal**: Saleor deliberately allows two lines of the same variant when `data` differs, and says so in the model docstring ([checkout/models.py](https://raw.githubusercontent.com/saleor/saleor/3.23.49/saleor/checkout/models.py)) |
| one stock row per (variant, location) | `UNIQUE (inventory_item_id, location_id)` | Medusa declares it partial, `where: "deleted_at IS NULL"` |
| at most one import running | `UNIQUE (statut) WHERE statut = 'en_cours'` | this repo already does it (`20261110210203_lot_import_un_seul_en_cours`) |

Prisma v7 can express the partial form in the schema — `@unique(where:)`, `@@unique(where:)` and `@@index(where:)` accept `raw("SQL expression")` or `{ field: value }` — but only under the `partialIndexes` **Preview** feature ([Prisma schema reference](https://www.prisma.io/docs/orm/v7/reference/prisma-schema-reference)). The string `partialIndexes` is present in the schema-engine binary shipped with the installed `prisma@7.10.1`, so the feature exists in this checkout's toolchain; it is preview, which is a reason to keep the hand-written index and its comment until the flag is enabled.

### 1.5 Timestamps are `timestamptz`, and the type is a decision

All timezone-aware values "are stored internally in UTC" and "converted to local time in the zone specified by the `TimeZone` configuration parameter before being displayed" ([8.5. Date/Time Types](https://www.postgresql.org/docs/current/datatype-datetime.html)). A `timestamp` without time zone stores a wall-clock reading with no offset: it is only unambiguous if every writer and every reader share a timezone, forever.

Prisma's default for `DateTime` on PostgreSQL is `timestamp(3)` — no time zone — and `@db.Timestamptz(3)` is the opt-in ([Prisma schema reference](https://www.prisma.io/docs/orm/v7/reference/prisma-schema-reference)). The hazard is generic, not local: a `timestamp` column is only unambiguous while every writer and every reader agrees on one timezone and that timezone never changes its offset. The database will never warn when that assumption breaks.

**Decision.** `@db.Timestamptz(3)` on every new timestamp column, and one migration to convert existing columns. `createdAt`/`updatedAt` may look harmless, but "when was this order placed" is exactly the column that ends up in a dispute.

### 1.6 Soft delete versus hard delete

There is no free option; there is a choice per table.

| | Soft delete (`deleted_at`) | Hard delete |
|---|---|---|
| Referential integrity | the row still exists, so FKs keep working | `ON DELETE` action decides what dies with it |
| Unique constraints | must become **partial** (`WHERE deleted_at IS NULL`), or a deleted slug blocks reuse forever | constraints stay simple |
| Every query | must filter `deleted_at IS NULL`, and one forgotten filter resurrects deleted data in a list | nothing to forget |
| GDPR | the row is still there; "deleted" must mean scrubbed | deletion is deletion |
| Cost | index bloat (Medusa carries an `IDX_…_deleted_at` index on almost every model, e.g. [order.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/order/src/models/order.ts)) | irreversible |

Medusa takes soft delete nearly everywhere for catalogue and order rows, with partial unique indexes (`IDX_product_handle_unique … where: "deleted_at IS NULL"`, [product.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/product/src/models/product.ts)). Saleor's order lines instead use `SET_NULL` + snapshot columns, which is hard delete of the catalogue plus an immutable copy. **Pick soft delete for catalogue entities an editor can retire (product, category, city); pick hard delete + snapshot for anything the customer was promised.**

### 1.7 Idempotency for anything that can be replayed

A retried request, a double-clicked button, a webhook delivered twice, a worker that dies after the write and before the ack — all produce the same requirement: the second execution must be a no-op, and the database must be what makes it one.

- Stripe: the idempotency layer "compares incoming parameters to those of the original request and errors if they're not the same to prevent accidental misuse"; keys may be pruned after 24 hours; all `POST` requests accept them and `GET`/`DELETE` do not ([Idempotent requests](https://docs.stripe.com/api/idempotent_requests)).
- Stripe webhooks: "Webhook endpoints might occasionally receive the same event more than once. You can guard against duplicated event receipts by logging the event IDs you've processed"; do not use `created` for ordering or deduplication ([Webhooks](https://docs.stripe.com/webhooks)).

**Schema shape.** Either a natural unique constraint that makes the duplicate insert fail (`UNIQUE (provider, provider_event_id)` on a `WebhookEvent` table; `UNIQUE (idempotency_key)` on a `Payment`), or a state claim (`UPDATE … WHERE status = 'pending'`) whose affected-row count is the decision. Both are index-enforced; neither needs a lock held across the request.

---

## 2. Catalogue

### 2.1 Product, variant, option, option value

The three-level shape is standard and every source agrees on it; what differs is where the price lives and how options are attached.

```
Product ─┬─ ProductVariant ──── (sku, price, stock)
         ├─ ProductOption ──── ProductOptionValue
         └─ ProductImage
```

- Medusa: `Product` holds title, handle, description, status, thumbnail, dimensions, `discountable`, metadata; `ProductVariant` is a separate model with `sku`, `barcode`, `ean`, `upc`, `allow_backorder`, `manage_inventory`, `variant_rank`, and a many-to-many to `ProductOptionValue` through `product_variant_option` ([product.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/product/src/models/product.ts), [product-variant.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/product/src/models/product-variant.ts)).
- `ProductOption` is a first-class table with its own `values` collection and a `is_exclusive` flag ("Exclusive options are removed when they are no longer associated with any product") ([product-option.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/product/src/models/product-option.ts)).
- Saleor copies `product_sku` onto the order line as plain text (`max_length=255, null=True`) rather than joining for it, so a deleted variant does not erase the SKU the warehouse needs ([order/models.py](https://raw.githubusercontent.com/saleor/saleor/3.23.49/saleor/order/models.py)).

**Sparse variants.** The trap is a variant matrix: three colours × four sizes is twelve rows, and only nine may exist. Two shapes:

1. **Variant rows only** (what Medusa and this repo do). Absence of a row means "not for sale". No `is_active` needed; the query is a join.
2. **Full matrix + availability flag.** Twelve rows, three of them `is_active = false`. Simpler admin UI, worse data hygiene: a disabled variant is still a variant, and every query must remember the flag.

Rule: the *purchasable unit* is the row; a variant that cannot be bought should not exist. `is_active` on a variant is a soft delete in disguise, and it needs the partial-index treatment of §1.6.

### 2.2 Price: never a column on the product

Of the three sources read here, one has a dedicated catalogue price entity, one resolves the price onto the order line, and one only shows that the amount and its currency travel together:

- Medusa: `Price` has `currency_code`, `amount`, `min_quantity`, `max_quantity`, `price_set_id`, optional `price_list_id`, and `price_rules` ([price.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/pricing/src/models/price.ts)). A variant points at a **price set**, not at a number.
- Saleor: the order line stores the resolved `unit_price_net_amount`, `unit_price_gross_amount` and `currency`, and the `CheckoutLine` stores its own `currency` and unit/total amounts — the price is materialised onto the line that needs it ([order/models.py](https://raw.githubusercontent.com/saleor/saleor/3.23.49/saleor/order/models.py), [checkout/models.py](https://raw.githubusercontent.com/saleor/saleor/3.23.49/saleor/checkout/models.py)). Saleor's catalogue-side price tables were **not** read in this pass.
- Stripe: the amount "in the smallest currency unit" always sits beside a `currency` field ([PaymentIntent object](https://docs.stripe.com/api/payment_intents/object)) — a reminder that an amount is a pair, never a scalar.

The reason is not abstraction for its own sake. A price has at least three independent dimensions: **which variant**, **which currency**, and **which audience or quantity band** (retail, wholesale, promotion, `min_quantity` band). A column on `Product` can express none of them without a second table, and a `priceDelta` on the variant can express only "this one is dearer than that one".

**The trap this repo has.** `Product.price Int` is the base, `ProductVariant.priceDelta Int @default(0)` is a *relative* offset, and ADR-0013 bakes `price + priceDelta` into DTOs so no surface re-derives it. That mitigates the display problem and leaves four schema problems:

1. **No absolute price is storable.** A discount of "20% off this variant" is computable only from the derived sum, so the discounted price cannot be stored, indexed, or compared in SQL; every promotion becomes application arithmetic over two columns.
2. **No price per currency.** Adding a second currency multiplies the problem: `priceDelta` is an offset in centimes, and an offset that is correct in MAD is meaningless in EUR unless the whole ladder is re-pegged.
3. **No price history.** Repricing overwrites. "What did this cost on the day of the order" is answerable only from the order line — which is fine for orders, and useless for margin reporting on quotes that never became orders.
4. **Sorting by price cannot be index-accelerated.** `ORDER BY price + priceDelta` is a computed expression: the query is possible, but no btree on `price` or `priceDelta` serves it, so the sort happens after the rows are read. The storefront avoids it by sorting in Meilisearch; any admin list or export that wants "cheapest first" pays for it.

**Smallest migration out:** keep `priceDelta` for the admin editor (it is an editing affordance), add an absolute `ProductVariant.price Int` backfilled to `Product.price + priceDelta`, and move the pair into a `VariantPrice(variantId, currency, amount, validFrom)` table when the second currency or the first promotion becomes real. Absolute beats relative because it is a fact; a delta is a derivation waiting to be re-derived.

### 2.3 Categories: adjacency list, closure table, or `ltree`

| Shape | Read a subtree | Move a node | Integrity | Where it is documented |
|---|---|---|---|---|
| Adjacency list (`parent_id`) | `WITH RECURSIVE` per query | one `UPDATE` | a cycle is representable | [7.8. WITH Queries](https://www.postgresql.org/docs/current/queries-with.html) |
| Closure table | one join on the closure rows | rewrite the node's closure rows | cycles are representable in the base table | no dedicated PostgreSQL doc; the pattern is a join table |
| `ltree` | `@>` / `<@` operators on a label path, GiST-indexable | rewrite descendants' paths | a label path cannot contain a cycle by construction | [F.22. ltree](https://www.postgresql.org/docs/current/ltree.html) |

PostgreSQL documents `ltree` as "a data type for representing labels of data stored in a hierarchical tree-like structure", with a label path such as `Top.Countries.Europe.Russia`, and its operators support ancestor/descendant tests ([F.22. ltree](https://www.postgresql.org/docs/current/ltree.html)). The price is a maintained path column: every move rewrites every descendant.

The adjacency list is the correct default for a shallow, editor-managed tree, and the one this repo has (`Category.parentId` self-relation, `position`, `@@index([parentId, position])`). A recursive query is the documented way to walk it. Note what neither shape gives you: PostgreSQL "does not support CHECK constraints that reference table data other than the new or updated row being checked", so no `CHECK` can forbid a cycle ([5.5. Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)). A trivial self-cycle *is* expressible: `CHECK (id <> parent_id)`.

### 2.4 Attributes: columns versus JSONB

PostgreSQL's rule is about indexing, not aesthetics: `jsonb` "supports indexing, which can be a significant advantage", and "GIN indexes can be used to efficiently search for keys or key/value pairs occurring within a large number of jsonb documents", with the default operator class supporting `?`, `?|`, `?&`, `@>` and the jsonpath operators, and `jsonb_path_ops` supporting `@>`, `@?`, `@@` with a smaller index ([8.14. JSON Types](https://www.postgresql.org/docs/current/datatype-json.html), [11.2. Index Types](https://www.postgresql.org/docs/current/indexes-types.html)).

**Decision table.**

| Need | Shape |
|---|---|
| the value is filtered or sorted on by the storefront | real column (+ btree or GIN as appropriate) |
| the value is a spec sheet, displayed verbatim, never filtered | `jsonb` (or even `json` if key order matters — it does not here) |
| the value has a fixed small vocabulary that grows rarely | enum (see §8) |
| the value is a per-product user-defined attribute that *is* faceted | `jsonb` + GIN, or an EAV table if counts must be cheap |

The honest caveat: a GIN index on `jsonb` accelerates existence and containment, not a range scan on a nested number. "Cheapest product under 500 MAD" cannot use it; that question needs a column (or an external index, which is what this repo does with Meilisearch).

Prisma supports `Json` and the PostgreSQL `type` argument on `@@index` ("Allows you to specify an index access method. Defaults to `BTree`. PostgreSQL and CockroachDB only") ([Prisma schema reference](https://www.prisma.io/docs/orm/v7/reference/prisma-schema-reference)). The exact literal for a GIN access method in the Prisma schema was **not verified** in this pass — see [Open questions](#open-questions); `CREATE INDEX … USING GIN` is ordinary PostgreSQL ([11.2. Index Types](https://www.postgresql.org/docs/current/indexes-types.html)) and can always be written by hand in a migration.

### 2.5 Slug or handle, and publication state

- A URL handle is a business key and must be unique. Medusa makes `handle` unique **partially** (`where: "deleted_at IS NULL"`) so a retired product's handle can be reused ([product.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/product/src/models/product.ts)).
- Publication is a state, not a boolean. Medusa's `Product.status` is an enum defaulting to `DRAFT` ([product.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/product/src/models/product.ts)); only published rows reach the storefront. If "published" must differ per audience (channel, region, B2B), the state belongs on the audience join, not on the product — a second axis, not a second boolean.
- If publication is a `Boolean`, the third state ("archived but URL still works") becomes a second boolean, and the pair eventually contradicts itself.

### 2.6 Media

Two shapes, and the difference matters:

1. **URLs in a JSON array on the product** (this repo: `Product.images Json`). Cheap, ordered, no join; no referential integrity, no per-image metadata in the same row, and no way to find "which products use this image".
2. **An image table plus a join table with `position`.** Medusa: `ProductImage` with a `product_id`, plus `product_variant_product_image` when a variant has its own gallery ([product.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/product/src/models/product.ts)).

The second is required the moment an image has attributes of its own (alt text, dimensions, rights) and a lifecycle independent of the product — which this repo has: `ImageProduit` is a registry keyed by `publicUrl`, written outside the product's transaction. Two tables with the same images and no FK between them is the state to fix (§12, gap 9).

---

## 3. Inventory

### 3.1 Stock is per (variant, location), with named quantity states

A single integer answers "how many", and nothing else. Every source that has shipped inventory separates the states:

| Field | Medusa `InventoryLevel` | Shopify `InventoryLevel.quantities` | Saleor `Stock` |
|---|---|---|---|
| physical on hand | `stocked_quantity` | `on_hand` | `quantity` |
| reserved but not shipped | `reserved_quantity` | `committed` | `quantity_allocated` |
| incoming | `incoming_quantity` | `incoming` | — |
| derived available | `available_quantity` (computed) | `available` | `quantity - quantity_allocated` |

Medusa's level is unique on `(inventory_item_id, location_id)` and declares `available_quantity` as `computed()` ([inventory-level.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/inventory/src/models/inventory-level.ts)). Shopify describes the same object as "the quantities of an inventory item at a specific location. Each inventory level connects one Inventory Item to one Location, tracking multiple quantity states like available, on-hand, incoming, and committed" ([InventoryLevel](https://shopify.dev/docs/api/admin-graphql/latest/objects/InventoryLevel)). Saleor's `Stock` is unique on `(warehouse, product_variant)` and keeps `quantity` plus `quantity_allocated` as two integers ([warehouse/models.py](https://raw.githubusercontent.com/saleor/saleor/3.23.49/saleor/warehouse/models.py)).

### 3.2 Reservations are rows, not a decrement

Two designs:

- **Decrement on order.** The stock column is the truth, and an order takes from it immediately. Simple, and correct for a shop where an order is a commitment (cash on delivery included, arguably).
- **Reserve, then decrement on fulfillment.** An order creates allocation rows; the stock column is only decremented when goods leave. Cancellation deletes the reservation.

Both are defensible; the deciding question is *what a stock number means to the operator*. If it means "units I can promise today", decrementing at order time is honest. If it means "units physically in the warehouse", the number must not move until shipment, and reservations carry the promise.

The primary sources take the second shape because they support partial fulfillment:

- Medusa: `ReservationItem` with `inventory_item_id`, `location_id`, `line_item_id`, `quantity`, `allow_backorder` ([reservation-item.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/inventory/src/models/reservation-item.ts)).
- Saleor: `Allocation` unique on `(order_line, stock)` with `quantity_allocated`, plus `Reservation` unique on `(checkout_line, stock)` for carts that have not become orders yet ([warehouse/models.py](https://raw.githubusercontent.com/saleor/saleor/3.23.49/saleor/warehouse/models.py)). Saleor's docs describe the hierarchy as warehouse → stock → allocation → order line ([Stock Allocation](https://docs.saleor.io/developer/stock/stock-allocation)).
- Shopify: "Each fulfillment order groups line items that are fulfilled together, allowing an order to be processed in parts if needed" ([Order.fulfillmentOrders](https://shopify.dev/docs/api/admin-graphql/latest/objects/Order)).

**If you keep a single integer, you have decided that partial fulfillment does not exist.** That is a legitimate decision for a small COD shop, but it must be written down, because it is the reason a `Return` table cannot be added later without a stock rewrite.

### 3.3 The oversell race, and the three ways to close it

The race: two checkouts read `stock = 1`, both write `stock = 0`, two orders are created.

**Option A — conditional update (best).** One statement decides:

```sql
UPDATE "ProductVariant" SET stock = stock - $1
 WHERE id = $2 AND stock >= $1;
-- 0 rows affected => out of stock, no lock was taken, no retry needed
```

It is atomic under `READ COMMITTED`, and the documentation says so in the mechanism's own words: if the row "has already been updated … by another concurrent transaction by the time it is found", "the second updater will … attempt to apply its operation to the updated version of the row. The search condition of the command (the `WHERE` clause) is re-evaluated to see if the updated version of the row still matches the search condition. If so, the second updater proceeds with its operation using the updated version of the row" ([13.2. Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html)). That re-evaluation *is* the row-version check; a preceding `SELECT` has no such guarantee — PostgreSQL states that `SELECT FOR UPDATE` "does not ensure that a concurrent transaction will not update or delete a selected row. To do that in PostgreSQL you must actually update the row, even if no values need to be changed" ([13.4. Data Consistency Checks at the Application Level](https://www.postgresql.org/docs/current/applevel-consistency.html)).

**Option A still needs a lock order.** The primitive updates one row; a cart is several rows. This repo's `reserverStock` (`lib/use-cases/orders.ts`) loops one conditional `updateMany` per cart line inside the order transaction, in cart order. Two checkouts whose carts hold the same two variants in opposite order can therefore each hold one row and wait for the other: transaction 1 locks variant A and wants B, transaction 2 holds B and wants A. PostgreSQL documents that this is not a property of explicit locking — "deadlocks can also occur as the result of row-level locks (and thus, they can occur even if explicit locking is not used)" — that it "detects deadlock situations and resolves them by aborting one of the transactions involved", and that "the best defense against deadlocks is generally to avoid them by being certain that all applications using a database acquire locks on multiple objects in a consistent order" ([Deadlocks](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-DEADLOCKS)). Nothing in `placeOrder` retries, so the aborted checkout is a failed checkout.

The smallest fix makes the order consistent rather than adding retry machinery: sort the lines by `variantId` before the loop, so every transaction reaches the same rows in the same order. A single statement over a `VALUES` list removes the round trips as well, but its internal lock order is the executor's, so it is not by itself the guarantee that sorting is. If consistent ordering is ever impossible, the same page names the fallback — "deadlocks can be handled on-the-fly by retrying transactions that abort due to deadlocks" — and that retry wraps the whole `$transaction`, not the loop.

**Option B — `SELECT … FOR UPDATE`, then write.** Correct but blocking: the lock is held until commit, so the second checkout waits rather than failing fast, and a long transaction holds the row. It is the documented tool for "protect a row against concurrent updates" ([13.3. Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html)). It is the right tool when the decision needs several rows read *before* the write.

**Option C — `SERIALIZABLE`, with retries.** "Consistent use of Serializable transactions can simplify development … if you can demonstrate that a single transaction, as written, will do the right thing when run by itself, you can have confidence that it will do the right thing in any mix". The cost is explicit: "apps using this level must be prepared to retry transactions due to serialization failures", which "always return with an SQLSTATE value of `40001`" ([13.2. Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html)). If you pick C, the retry loop is part of the design, not an afterthought.

**What none of them fix.** A negative stock is still storable if a code path forgets the condition. `CHECK (stock >= 0)` in the database is the backstop; the conditional update is the mechanism. Prisma has no `CHECK` attribute (none appears in the schema reference's attribute list, and none appears anywhere in this repo's migrations), so the check is hand-written SQL in a `--create-only` migration — which Prisma explicitly supports as the escape hatch for "features that cannot be represented in Prisma Schema Language" ([Development and production](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/development-and-production)).

**Backorders.** A `allow_backorder` boolean (Medusa, Saleor) is what keeps the conditional update from being the whole story: with backorders allowed, the condition becomes `stock >= quantity OR allow_backorder`.

---

## 4. Carts

### 4.1 Anonymous or authenticated: a cart row, a cookie, or both

Three shipped answers:

| Product | Shape | Evidence |
|---|---|---|
| Medusa | `Cart` is a row with **nullable** `customer_id` and `email`, plus `completed_at` | [cart.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/cart/src/models/cart.ts) |
| Saleor | `Checkout` is a row whose **primary key is a UUID token**, with nullable `email` and an optional `user`; the docs say "Anyone who knows this ID can query or modify the checkout" | [checkout/models.py](https://raw.githubusercontent.com/saleor/saleor/3.23.49/saleor/checkout/models.py), [Checkout](https://docs.saleor.io/developer/checkout/overview) |
| This repo | no cart table for guests: an unsigned httpOnly cookie holds `[{variantId, quantity}]`, capped at 20 articles with a 30-day max age, revalidated against the database; `CartItem` requires `userId` | ADR-0007, `lib/panier.ts` |

The cookie design is defensible for this shop and its reasoning is recorded (ADR-0007: cold traffic from shared links, one-time COD buyers, and "the server revalidates every variant, so a forged cookie harms only its carrier"). What it costs is structural, and belongs in this document rather than in a ticket:

- **No cart identity beyond the browser.** Two devices cannot share a cart; a cleared cookie is a lost cart; there is no server-side expiry sweep.
- **No abandoned-cart query.** The only evidence of intent is the cookie, which the server cannot see until the visitor returns.
- **No cart→order link.** An order cannot say which cart produced it (Medusa's `completed_at` and cart id make that a query).
- **A row-level `UNIQUE (user_id, variant_id)` cannot express "the same variant twice".** One cart, one line per variant.

If a cart table is added later, the *token is the capability*, not the user id: `Cart(id, token @unique, userId?, expiresAt)`. Saleor's UUID primary key and Medusa's nullable `customer_id` are the two documented shapes; both make "guest" a value, not a missing row.

### 4.2 Cart line identity and quantity

- Line identity is `(cart, variant)` for this repo and Medusa; for Saleor it is weaker on purpose — its `CheckoutLine` docstring says "Multiple lines in the same checkout can refer to the same product variant if their `data` field is different", which is how it supports per-line customization ([checkout/models.py](https://raw.githubusercontent.com/saleor/saleor/3.23.49/saleor/checkout/models.py)).
- Quantity: Saleor puts `MinValueValidator(1)` on `CheckoutLine.quantity` **and** on `OrderLine.quantity` — a Django *application-level* validator, not a database `CHECK`. That is evidence of the common gap: the rule lives in the framework, so a script or a second service can violate it. In PostgreSQL the durable form is `CHECK (quantity > 0)`, which no framework can bypass.
- An upper bound is usually a business rule (this repo: 20 distinct articles, `MAX_ARTICLES_PANIER_VISITEUR`), and configuration belongs in code, not in a constraint. The split to keep: `CHECK` for what must never be storable by anyone, code for what the shop happens to want today.

### 4.3 Price in the cart: stamped, but not authoritative

Saleor's `CheckoutLine` stores its own `currency`, `undiscounted_unit_price_amount`, `total_price_net_amount`, `total_price_gross_amount` ([checkout/models.py](https://raw.githubusercontent.com/saleor/saleor/3.23.49/saleor/checkout/models.py)); Medusa's cart `LineItem` stores `unit_price` and computed totals ([line-item.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/cart/src/models/line-item.ts)). So a cart *does* hold prices.

The rule is about **who wins at checkout**:

1. The cart's price is a **display cache**, valid at the moment it was written.
2. At order creation, the price is re-resolved from the catalogue, and the total the customer saw is compared with the total about to be written. If they differ, the write is refused and the customer re-confirms.
3. Only then are name/SKU/price copied onto the order (§5).

This repo does exactly step 2 and 3: `chargerDevis` re-prices from the catalogue, and `placeOrder` throws `DevisPériméError` when `montants.totalPayable` no longer equals the `totalAffiche` the customer read (ADR-0021 amendment #656; `lib/use-cases/orders.ts`). That is the right shape and worth keeping: the comparison value comes from the client, the written value comes from the quote.

### 4.4 Expiry

A cart is a promise with a shelf life, and stock is the reason. Saleor's `Reservation` rows are tied to `checkout_line`, so they die with the cart ([warehouse/models.py](https://raw.githubusercontent.com/saleor/saleor/3.23.49/saleor/warehouse/models.py)); Medusa's `Cart.completed_at` is documented as "The timestamp when the cart was completed/converted to an order", which distinguishes a live cart from a spent one but is not itself an expiry. A cart table needs `expiresAt` **and** a sweeper that deletes expired rows and their reservations, or the reservations become invisible stock loss.

---

## 5. Orders

### 5.1 The snapshot

An order is a contract. Its rows must be readable in ten years with the catalogue table empty. The minimum snapshot set, gathered from what the primary sources actually store:

| Fact | Saleor | Medusa | Why |
|---|---|---|---|
| product name | `product_name`, `translated_product_name` | `product_title` | the display name at purchase |
| variant name | `variant_name`, `translated_variant_name` | `variant_title` | the size/colour the customer chose |
| SKU | `product_sku` | `variant_sku` | warehouse and support key |
| unit price (net) | `unit_price_net_amount` | `unit_price` | price excluding tax |
| unit price (gross) | `unit_price_gross_amount` | — (`is_tax_inclusive` + tax lines) | price including tax |
| pre-discount price | `undiscounted_unit_price_net_amount` / `_gross_` | `compare_at_unit_price` | shows the discount later |
| tax | net and gross amounts per line, so the tax is the difference (`unit_price_net_amount` / `unit_price_gross_amount`) | separate `OrderLineItemTaxLine` rows per line ([line-item.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/order/src/models/line-item.ts)) | the rate and the amount at purchase |
| discount | `unit_discount_amount`, `unit_discount_type`, `unit_discount_reason` columns on the line | `OrderLineItemAdjustment` rows | "why was it cheaper" outlives the promotion |
| addresses | `shipping_address` / `billing_address` FKs to `account.Address`, `on_delete=SET_NULL` | dedicated `OrderAddress` rows (a copy) ([address.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/order/src/models/address.ts)) | the courier needs it; the customer may move |
| currency | `currency` on the order and on the line | `currency_code` | makes every amount interpretable |
| email | `user_email = models.EmailField(blank=True, default="")` | `email` on the order | the order survives a profile edit |

The last row is the one most often lost. If the order's e-mail is read by joining `user.email`, then a customer who changes their address rewrites the delivery record of every past order; and a customer whose account is deleted takes the address with them. Store it.

### 5.2 Totals are stored, and their meaning is documented

Store the totals you charged, as integers (or decimals), with the currency: subtotal, shipping, discount total, tax total, grand total. Do **not** recompute the customer's total from the lines at read time — the lines may have been edited by a refund since.

The subtlety this repo already learned the hard way (ADR-0021): if a derived total is also a **sort key**, the derivation and the sort disagree. `Order.total` (subtotal) sorted, `total + shippingFee` displayed. The fix was to persist `totalPayable` and sort by it. Generalise it: *any number the UI sorts or filters on must be a column*, because Prisma sorts a single field and the alternative is raw SQL.

### 5.3 Status is a state machine with a history table

A single `status` column is a *current value*, not a history. It cannot answer: when did it ship, who cancelled it, how long did it sit in `pending`, was it ever delivered before it was returned.

The primary sources all keep history:

- Saleor: `OrderEvent` with `date`, `type`, `order`, `parameters` (JSON), `user`, `app`, and a self-referential `related` for events that amend other events, indexed on `type` and `date` ([order/models.py](https://raw.githubusercontent.com/saleor/saleor/3.23.49/saleor/order/models.py)).
- Medusa: `Order.version` (default 1), an `OrderChange` table with `version`, `change_type`, `status`, and the actor/time pairs `created_by`, `requested_by`/`requested_at`, `confirmed_by`/`confirmed_at`, `declined_by`/`declined_reason`/`declined_at`, `canceled_by`/`canceled_at` ([order-change.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/order/src/models/order-change.ts)), plus `OrderTransaction` rows carrying `version`, `amount`, `currency_code` and a `reference`/`reference_id` pair ([transaction.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/order/src/models/transaction.ts)).

**Recommended shape.**

```
Order.status        -- the current value, written only through a guarded transition
OrderStatusChange   -- (orderId, from, to, at, actorId, reason, and a unique key for idempotency)
```

The transition itself stays a compare-and-set so two operators cannot both "confirm" an order: `UPDATE "Order" SET status = $2 WHERE id = $1 AND status = $3`. The affected-row count is the decision. This repo does exactly that (`updateOrderStatus` → `tx.order.updateMany({ where: { id, status: fresh.status } })`, `lib/use-cases/orders.ts`), which is why the missing piece is only the *history*, not the guard.

**Consequence of not having history**, observed in this repo: `returned` sets `encaissée: false` (`lib/statut-de-commande.ts`), and ADR-0009 says revenue counts `delivered` only. So `delivered → returned` retroactively removes an order from the revenue figure — which is defensible as *net* revenue, but it also erases the fact that cash was collected, because the status that said so no longer exists. With a history table, "collected on the 3rd, refunded on the 9th" is a query.

### 5.4 Order, payment, fulfillment are three aggregates

| Concern | Own table(s) | Evidence |
|---|---|---|
| what was sold, and the money owed | `Order` + `OrderLine` (`OrderItem`) | Saleor `OrderLine`, Medusa `OrderLineItem` |
| what was paid, refunded, cancelled | `Payment`, `Refund`, `Transaction` | Saleor `Payment`/`Transaction`/`TransactionItem`; Medusa `Payment`/`Refund`/`Capture` |
| what was picked, packed, shipped, delivered | `Fulfillment`, `FulfillmentLine` | Saleor `Fulfillment`/`FulfillmentLine`; Shopify `FulfillmentOrder` |

Shopify's `Order` makes the split explicit: `displayFinancialStatus` is "an order's financial status for display", `displayFulfillmentStatus` is "the order's fulfillment status that displays in the Shopify admin … For detailed processing, use the Fulfillment Order object", and `fulfillmentOrders` is "a list of fulfillment orders … allowing an order to be processed in parts if needed" ([Order](https://shopify.dev/docs/api/admin-graphql/latest/objects/Order)). Saleor's `Order` carries three fields, `status`, `authorize_status`, `charge_status`, each with its own enum. Medusa's `Order` has `items`, `shipping_methods`, `transactions`, `credit_lines`, `returns`, `summary` ([order.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/order/src/models/order.ts)).

**Why one status column cannot carry it:** the axes are independent. An order can be `shipped` and `unpaid`; `delivered` and `partially_refunded`; `cancelled` after `partially_fulfilled`. Any single enum either multiplies combinations (`partially_shipped_and_refunded`) or lies.

### 5.5 Partial fulfillment, cancellation, returns: the tables each needs

| Capability | Tables | Key columns |
|---|---|---|
| partial shipment | `Fulfillment(orderId, status, trackingNumber, shippedAt)`, `FulfillmentItem(fulfillmentId, orderItemId, quantity)` | `CHECK (quantity > 0)`; `SUM(quantity) <= orderItem.quantity` enforced in a transaction |
| per-line progress | counters on the order line (`fulfilled_quantity`, `shipped_quantity`, `delivered_quantity`) | Medusa keeps exactly these on `OrderItem` ([order-item.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/order/src/models/order-item.ts)) |
| cancellation | a `cancelledAt` + `cancelReason` on the order, and cancelled quantities on the line if partial | do not reuse the fulfillment tables |
| return | `Return(orderId, status, requestedAt, receivedAt)`, `ReturnItem(returnId, orderItemId, quantity, condition)` | Medusa's counters (`return_requested_quantity`, `return_received_quantity`, `return_dismissed_quantity`, `written_off_quantity`) show the four states a returned unit can be in |
| refund | `Refund(paymentId, amount, currency, reasonId, createdAt, providerRef)` | refunds are *not* returns: a refund can happen with no goods coming back |

The counters are a denormalisation, and they are worth it: "how many of these five shirts have I received back" is asked on every support call, and a `SUM` over three tables is the wrong answer.

---

## 6. Payments and refunds

### 6.1 Three levels, not one

The primary sources converge on a layered model:

| Level | Saleor | Medusa | Stripe |
|---|---|---|---|
| the attempt / intent | `TransactionItem` (with `psp_reference`, `currency`, charged/authorized/refunded/canceled values) | `Payment` (`amount`, `currency_code`, `provider_id`, `captured_at`, `canceled_at`) | `PaymentIntent` (`amount`, `currency`, `status`) |
| the provider conversation | `Transaction` (`gateway_response` JSON) | `PaymentSession` | the intent's `latest_charge` |
| the money movements | `TransactionEvent` | `Capture`, `Refund` | `Charge`, `Refund` |

Saleor's `Payment` docstring states the split plainly: "Several payment methods can be used within a single order. Each payment method may consist of multiple transactions." ([payment/models.py](https://raw.githubusercontent.com/saleor/saleor/3.23.49/saleor/payment/models.py)). Medusa's `Payment` holds `amount`, `currency_code`, `provider_id`, `data` (JSON, the provider payload), `captured_at`, `canceled_at`, with `refunds` and `captures` as children ([payment.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/payment/src/models/payment.ts)).

**Minimum tables for a shop that only takes cash on delivery:** `Payment(orderId, method, amount, currency, status, collectedAt, recordedBy, providerRef?, idempotencyKey?)`. Even with no gateway, this is where "the courier collected 240 MAD on the 3rd" lives. Deriving collection from `Order.status = 'delivered'` works until the first partial collection, the first prepayment, or the first reconciliation.

### 6.2 Provider identifiers are unique, and the uniqueness is the deduplication

Stripe's idempotency contract is per-key and per-parameter-set: retries with the same key "return the saved response", and a key reused with different parameters errors ([Idempotent requests](https://docs.stripe.com/api/idempotent_requests)). That maps to a unique constraint on the key you send, and a unique constraint on the identifier the provider sends back.

Note what the primary sources do *not* do: Saleor indexes `psp_reference` (`BTreeIndex(fields=["psp_reference"])`) but does not make it unique ([payment/models.py](https://raw.githubusercontent.com/saleor/saleor/3.23.49/saleor/payment/models.py)), and Medusa's `provider_id` is indexed but not unique ([payment.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/payment/src/models/payment.ts)). If you integrate a gateway, `UNIQUE (provider, provider_reference)` is the constraint that makes a replayed webhook harmless; report it as a deliberate improvement over both, not as something they document.

### 6.3 Webhook idempotency

Stripe: "Webhook endpoints might occasionally receive the same event more than once… guard against duplicated event receipts by logging the event IDs you've processed, and then not processing already-logged events"; and "Don't use `created` to determine event order or whether you've already processed an event. Track event IDs" ([Webhooks](https://docs.stripe.com/webhooks)).

Schema: `WebhookEvent(provider, eventId, type, receivedAt, processedAt, payload jsonb)` with `UNIQUE (provider, eventId)`. The insert *is* the lock: `INSERT … ON CONFLICT DO NOTHING` returning zero rows means "already handled". The row is also the audit trail for "why did this order's payment status change".

### 6.4 Ledger or mutable balance

A ledger (`PaymentEntry(paymentId, kind, amount, currency, occurredAt, ref)`) is append-only: capture, refund, chargeback are rows, and the balance is `SUM`. A mutable balance (`captured_amount`, `refunded_amount` columns) is faster to read and loses the *when* and the *why*.

Saleor does both: `Payment.captured_amount` and `total` (mutable) *and* `Transaction` rows (append-only). Stripe's refunds page gives the invariant the ledger must enforce: "You can issue more than one refund against a charge, but you can't refund a total greater than the original charge amount" ([Refunds](https://docs.stripe.com/refunds)). Note what kind of constraint that is: a plain `CHECK` cannot aggregate across rows, so the invariant is enforced by a *conditional* insert (`INSERT … SELECT … WHERE captured - refunded >= amount`, and check the affected-row count) or by a trigger — in the same transaction that writes the refund, never in a form validation.

**Decision.** Append-only ledger for anything involving money, with a materialised `remainingRefundable` if reads are hot. The ledger's `UNIQUE` key (provider reference, or `(paymentId, kind, providerRef)`) is what makes a retried refund safe.

### 6.5 Status, again, is an enum with a lifecycle

Stripe's PaymentIntent statuses are `requires_payment_method`, `requires_confirmation`, `requires_action`, `processing`, `requires_capture`, `succeeded`, `canceled`, with documented transitions: "If the payment attempt fails (for example, due to a decline), the PaymentIntent's status returns to `requires_payment_method` so that the payment can be retried", and cancellation "can't be undone" ([PaymentIntent lifecycle](https://docs.stripe.com/payments/paymentintents/lifecycle)). Do not invent a four-value payment enum; either mirror the provider's states or keep a coarse `status` plus a `providerStatus` text column refreshed from webhooks.

---

## 7. Customers, addresses, auth

### 7.1 `user` (identity) versus `customer` (commerce)

They are not the same row, and conflating them is the root of the GDPR problem in §12.

- The identity row is owned by the auth library: a password hash, OAuth account links, sessions, verification codes. Its lifecycle is "can this person log in".
- The customer row is owned by the shop: an address book, a display name, a marketing consent, an order history reference. Its lifecycle is "who bought what".

Medusa keeps `customer_id` on `Cart` and `Order` as a *text id* (nullable), not a foreign key to its auth tables ([cart.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/cart/src/models/cart.ts)). Saleor's `Order.user` is `null=True, on_delete=models.SET_NULL` and the order carries `user_email` separately, so the order survives the account ([order/models.py](https://raw.githubusercontent.com/saleor/saleor/3.23.49/saleor/order/models.py)).

**The invariant:** an order must be readable and shippable with no user row in existence. Everything the order needs about the person is copied onto it (§5.1).

### 7.2 Address book versus snapshot

Both, with different owners:

- `Address(id, customerId, label, recipient, line1, line2, city, region, postalCode, countryCode, phone)` — mutable, many per customer, deletable.
- The order's copy — immutable strings on the order, or a dedicated `OrderAddress` row (Medusa) that is *not* a FK to the address book ([address.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/order/src/models/address.ts)).

The two primary sources disagree here, and the disagreement is instructive. Medusa **copies** the address into `OrderAddress`. Saleor instead keeps `shipping_address` / `billing_address` as foreign keys to the customer's `account.Address` rows with `on_delete=SET_NULL` ([order/models.py](https://raw.githubusercontent.com/saleor/saleor/3.23.49/saleor/order/models.py)). Saleor's shape keeps the order row alive but not the address *text*: once the address row is deleted, the order can no longer be shipped, and the only defence is that addresses are never deleted. For a shop whose courier needs a destination weeks after the order, the copy is the safer shape; for a shop that never deletes addresses, the pointer is less data to keep consistent. Report the choice rather than assuming one is standard.

Free-text `cityName` + `address` on the order (this repo's shape) satisfies the snapshot half; it fails the address-book half and makes any city-based logic (delivery fee by city) depend on a string that must match `DeliveryCity.name` exactly, with no FK to say so.

### 7.3 Deletion: `ON DELETE` is a business decision

Prisma's defaults make the decision silently: `SetNull` for optional relations, `Restrict` for mandatory, `Cascade` on update ([Referential actions](https://www.prisma.io/docs/orm/v7/prisma-schema/data-model/relations/referential-actions)). Two consequences that show up as bugs:

- **`Restrict` on `Order.user`** means a customer with orders cannot be deleted. That is a *correct* accounting stance and it forces the deletion flow to decide what to do with history — which is what happened here: the Facebook deletion path deletes the orders first (`lib/suppression-donnees-facebook.ts`, "`Order.user` n'est pas en cascade : les Commandes partent avant le Compte client").
- **`Cascade` on `session`/`account`** is right: those rows have no meaning without the identity.

The three defensible strategies, in order of preference for a shop with tax obligations:

| Strategy | Shape | Cost |
|---|---|---|
| pseudonymise | `Order.userId` nullable (`SetNull`), copy `email`/`phone`/address onto the order, scrub the identity row | one migration; the order keeps trading data |
| anonymise in place | null the personal columns, keep the row and the totals | needs a documented list of "personal columns" |
| delete | `deleteMany` on orders and their dependents | destroys accounting history; must be a written decision |

**Never** make deletion depend on which relations happen to be `Cascade` today. That is how an order history disappears because someone changed a relation's `onDelete` in a schema review.

### 7.4 PII and audit

The personal data in an e-commerce schema is small and enumerable: name, e-mail, phone, address, IP, user agent, and the order's contents (which are personal data in aggregate). Three schema-level habits:

1. **Keep PII in as few tables as possible** (identity, address book, order snapshot). Every extra copy is another place a deletion request must reach.
2. **Never put PII in a JSON payload you also delete lazily.** This repo's `AutomationEvent.payload` holds a copy of the order — e-mail, city, address, phone, items and totals — and it is deleted explicitly in the Facebook path precisely because it has no FK to the order (`lib/suppression-donnees-facebook.ts` comment). That is a correct fix to a structural problem: a durable event log that copies personal data must be part of every deletion path, forever.
3. **Audit rows need an actor and a reason.** `OrderEvent`/`OrderStatusChange` without `actorId` answers "what happened" and not "who did it"; Saleor's `OrderEvent` has `user` and `app` for that reason.

---

## 8. Lookup tables and enums

### 8.1 The three options, and their real migration cost

| | Native PostgreSQL enum | `varchar` + `CHECK (x IN (…))` | Lookup table + FK |
|---|---|---|---|
| storage | 4 bytes, ordered by declaration | text + a check on write | join per read, or cache |
| add a value | `ALTER TYPE … ADD VALUE` — allowed; "the new value cannot be used until after the transaction has been committed" if run inside one ([ALTER TYPE](https://www.postgresql.org/docs/current/sql-altertype.html)) | rewrite the `CHECK` in a migration | `INSERT` |
| remove a value | **impossible** without dropping and recreating the type ([8.7. Enumerated Types](https://www.postgresql.org/docs/current/datatype-enum.html)) | allowed, if no row still holds it | allowed, if no row references it |
| reorder / rename | rename yes (`RENAME VALUE`), reorder no | reorder is meaningless | reorder is a `position` column |
| who can extend it | a developer with a migration | a developer with a migration | an editor, at runtime |
| typo safety | none at compile time in SQL; the DB rejects unknown labels | same | same, plus an FK |

The decision rule that follows from the costs: **enums for sets a developer owns and a release changes; lookup tables for sets an editor owns.** A `CHECK` is the middle ground when the set is small, closed, and you want the constraint visible in the schema file rather than in a type's history.

### 8.2 Prisma enums are native PostgreSQL enums

Prisma's `enum` block "when supported by your database" ([Models](https://www.prisma.io/docs/orm/v7/prisma-schema/data-model/models)) materialises as `CREATE TYPE` — verifiable in this repo: the initial migration contains `CREATE TYPE "OrderStatus" AS ENUM ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled', 'returned')` (`prisma/migrations/20260810111743_init/migration.sql`). So every cost in the left column of the table above applies to this schema.

Two more facts a schema owner needs:

- **Enum order is creation order**, and comparison operators follow it. So `ORDER BY status` sorts by the order the labels were written, not by lifecycle logic. This repo's `OrderStatus` is declared `pending, confirmed, shipped, delivered, cancelled, returned` — the two exception states sort *after* `delivered`. Any report that groups by status order will read as if a cancelled order progressed furthest.
- **`@map` renames without an `ALTER TYPE`.** A Prisma enum value can be mapped (`@map` a column name or enum value, `@@map` an enum name — [Models](https://www.prisma.io/docs/orm/v7/prisma-schema/data-model/models)). That is the safe way to rename a label in code while leaving the database value alone, which matters because `RENAME VALUE` is possible but irreversible in practice.

### 8.3 Verdict for this repo

**Keep the enums.** `OrderStatus` and the automation/import statuses are developer-owned closed sets, and a lookup table would add a join to every order list for no operator benefit. Three amendments:

1. Add a lifecycle state (a `partially_returned`, say) by `ALTER TYPE … ADD VALUE`, never by reordering the list; and the migration that adds it must not *use* it in the same transaction.
2. Do not add a payment or fulfillment state to `OrderStatus`. Those are separate axes (§5.4) and folding them in is what produces `partially_shipped_and_refunded`.
3. `user.role` is a `String @default("user")`, not an enum — the one status-like field in the schema with no database constraint at all. Either an enum or `CHECK (role IN ('user','admin'))`.

---

## 9. Indexes and query shapes

### 9.1 What the storefront actually asks the database

For this repo, most catalogue reads are *not* SQL: search and facets go to Meilisearch through `lib/meili.ts` (ADR-0023), and product pages are slug lookups. The SQL shapes that matter are:

| Query | Frequency | Index that serves it |
|---|---|---|
| product by slug | every product page | `UNIQUE (slug)` — already there |
| category by slug | category pages | `UNIQUE (slug)` — already there |
| variant by SKU | admin, imports | `UNIQUE (sku)` — already there |
| variants of a product | every product page | `@@index([productId])` — already there |
| category facet, price sort, full-text search | every catalogue page | **not SQL at all**: Meilisearch indexes `categorySlug` and `minPrice` (`lib/index-projection.ts`), so no PostgreSQL index can serve them and none should be added for them |
| cart lines of a user | every cart read | `@@index([userId])` ahead of `UNIQUE (userId, variantId)` — the unique index already covers the prefix, so the extra index is redundant |
| orders of a user, newest first | `/commandes` | `(userId, createdAt DESC)` — the current `@@index([userId])` does not order |
| admin orders by status, sorted by `totalPayable` | every admin list | `(status, totalPayable)` or `(createdAt)` — neither exists |
| automation claim | worker tick | `(status, availableAt)` — already there, and used with `FOR UPDATE SKIP LOCKED` |

The redundant index is worth naming because it is a common tax: a unique index on `(a, b)` is a btree on `a` first, so a separate index on `a` is only useful if the planner prefers a smaller index — and PostgreSQL's documentation says a multicolumn btree "can be used with query conditions that involve any subset of the index's columns, but the index is most efficient when there are constraints on the leading (leftmost) columns" ([11.3. Multicolumn Indexes](https://www.postgresql.org/docs/current/indexes-multicolumn.html)).

### 9.2 Composite order is not a style choice

The rule, from the same page: "equality constraints on leading columns, plus any inequality constraints on the first column that does not have an equality constraint, will always be used to limit the portion of the index that is scanned. Constraints on columns to the right of these columns are checked in the index … but they do not necessarily reduce the portion of the index that has to be scanned."

Practical translation:

- `(status, createdAt)` serves `WHERE status = $1 ORDER BY createdAt DESC` in one index scan.
- `(createdAt, status)` serves it only by scanning all recent rows and filtering.
- `(status, totalPayable)` serves the admin sort; `(totalPayable, status)` does not.
- "Indexes with more than three columns are unlikely to be helpful unless the usage of the table is extremely stylized."

### 9.3 Partial indexes

"A partial index is an index built over a subset of a table; the subset is defined by a conditional expression" and one major reason is "to avoid indexing common values" ([11.8. Partial Indexes](https://www.postgresql.org/docs/current/indexes-partial.html)). The e-commerce uses are exactly the ones this codebase already needs:

- `UNIQUE (statut) WHERE statut = 'en_cours'` — at most one running import (already shipped, `20261110210203_lot_import_un_seul_en_cours`; the migration's own comment records why it is raw SQL, and §1.4 notes that Prisma 7 can now express it behind a preview flag).
- `UNIQUE (handle) WHERE deleted_at IS NULL` — soft-deleted rows must not block handle reuse.
- `(status, availableAt) WHERE status IN ('en_attente','echoue')` — the worker's claim query never looks at finished rows.

### 9.4 `CREATE INDEX CONCURRENTLY`, and `EXPLAIN`

A normal `CREATE INDEX` "locks out writes (but not reads) on the table until it's done"; `CONCURRENTLY` does not, "but `CREATE INDEX CONCURRENTLY` cannot [be performed] within a transaction block", it does two table scans, and a failed unique build leaves an invalid index that still enforces uniqueness ([CREATE INDEX](https://www.postgresql.org/docs/current/sql-createindex.html)). Prisma cannot generate `CONCURRENTLY` ("There are some additional index configuration options that cannot be provided via the Prisma schema yet … Create indexes concurrently with `CONCURRENTLY`"), and says to configure them at the database level ([Prisma schema reference](https://www.prisma.io/docs/orm/v7/reference/prisma-schema-reference)). For a shop of this size, a plain index in a migration that runs before the app starts is acceptable; write down that it is, because the day the orders table is large enough to matter, the migration must change shape.

`EXPLAIN (ANALYZE, BUFFERS)` is the only evidence that an index is used. The discipline: every new list query gets an `EXPLAIN` on representative data, and the plan is pasted into the PR. A sequential scan on a 500-row table is correct and should not be "fixed".

---

## 10. Multi-currency, tax, discounts

### 10.1 Where each lives

| Concern | Shape | Why |
|---|---|---|
| currency | the three-letter currency code on every amount-bearing row (`Order.currency`, `Payment.currency`, a `Price.currency`), plus a store-level default | an amount without a currency is a number |
| price per currency | a `Price` row per (variant/price set, currency, quantity band) | Medusa's `Price` is exactly this ([price.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/pricing/src/models/price.ts)) |
| FX | a `Rate(base, quote, rate, validFrom)` table; **never** convert at read time without a stored rate | a converted total must be reproducible |
| tax rate | `TaxRate(country/region, rate, kind, validFrom)` + a tax *line* per order line | rate changes are historical facts |
| tax amount | on the line (`taxAmount`) and as a `TaxLine(orderItemId, rate, base, amount)` | a single order-level tax total cannot be audited or refunded |
| tax-inclusive vs exclusive | a boolean on the product or the region, snapshotted on the order line | Medusa stores `is_tax_inclusive` on both cart and order lines |
| discount | an entity (`Discount/Promotion` + rules + `OrderAdjustment` rows), not a column | a column cannot say *why*, cannot be per line, cannot be reversed |

### 10.2 Discounts as an entity

The minimum that survives an audit: `Promotion(id, code?, kind, value, currency?, startsAt, endsAt, active)` + `PromotionRule(promotionId, kind, value)` + `OrderAdjustment(orderItemId | orderId, promotionId, amount, currency, code)`.

Why not `Order.discountTotal` alone: the customer will ask which promotion applied, support will need to reverse one of three, and finance will need the discount attributed per line. Medusa's cart line has `adjustments` as a child collection ([line-item.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/cart/src/models/line-item.ts)) for that reason. Saleor's order line takes the middle road — `unit_discount_amount`, `unit_discount_type` and, notably, `unit_discount_reason` are columns on the line ([order/models.py](https://raw.githubusercontent.com/saleor/saleor/3.23.49/saleor/order/models.py)) — which records *why* per line without a promotion entity. That is enough for a shop with hand-entered discounts and not enough to answer "how much did promotion X cost me this quarter". Keep the total as well — it is the sort key (§9.2).

### 10.3 The one rule that saves a migration

Store, on the order line, **the price as charged and the tax as charged**, not a pointer to the rate table. Every source does this (§5.1). The rate table is for *future* calculations; the order line is the record of what happened.

---

## 11. Operational schema concerns

### 11.1 Migrations: expand, then contract

Prisma Migrate compares the schema with the database and generates the difference. The destructive edge is documented: "You want to rename a field (by default, Prisma Migrate will drop the existing field)" — which is why the docs send you to `prisma migrate dev --create-only` to edit the generated SQL before applying it ([Development and production](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/development-and-production)). `migrate reset` is "a development command and should never be used in a production environment".

**No primary source in this research names the expand/contract pattern.** It is not in the PostgreSQL documentation, not in the Prisma docs pages read here, and not in the Medusa or Saleor model files. What the primary sources *do* state is the behaviour that forces it: a rename is a drop plus an add; a dropped column takes its data; and a `NOT NULL` column added to a non-empty table needs a default or a backfill. The pattern is the consequence of those three facts, and this document states it as engineering practice rather than as a citation:

1. **Expand** — add the new nullable column / new table; deploy code that writes both; backfill in a migration or a script.
2. **Migrate reads** — deploy code that reads the new column.
3. **Contract** — drop the old column in a later release, once no deployed code writes it.

Two accidents this prevents: a deploy that runs between the migration and the code (the app sees a column it does not know), and an irreversible drop of data that a rollback would need.

**In this repo**, the deploy order is already explicit (`docker-compose.yml`: `migrate` → `purge-edge` → `app`, per `docs/ARCHITECTURE.md` §1), which means a migration that breaks the *previous* app version is not rolled back by restarting the old container. That is an argument for expand/contract, not against it.

### 11.2 Seed versus production data

Seed data is fixtures, and fixtures in production are a data-integrity problem with a long tail: they look like real rows, they get referenced by orders, and they cannot be deleted. ADR-0050 already decided this ("Le déploiement ne sème plus de données de démonstration"). The schema consequence: **nothing the storefront reads may depend on a seed row existing**, including `ShippingSettings` (a singleton with `id String @default("default")`). If the free-shipping threshold row is missing, the storefront must have a defined default, not a crash.

### 11.3 Audit and event tables

This repo has `AutomationEvent` (durable post-commit effects, ADR-0044/0049) with `payload Json`, `occurredAt`, `expiresAt`, unique keys on `(type, entityId, attemptOf)` and `(entityType, entityId, seq)`, and a claim index `(status, availableAt)`. It is an **outbox**, not an audit log, and the difference is structural:

- it has `expiresAt` — rows are meant to disappear;
- it is deleted during GDPR deletion;
- its ordering key is per-entity (`seq`), not per-actor.

An audit trail must be append-only, must not expire, and must name an actor. Saleor's `OrderEvent` is the model: `type`, `date`, `order`, `parameters`, `user`, `app`, `related` ([order/models.py](https://raw.githubusercontent.com/saleor/saleor/3.23.49/saleor/order/models.py)). Keep the outbox and add a separate history table for anything a human must be able to explain later.

### 11.4 Partitioning: only when justified

Partitioning helps when a table is large relative to memory: "a rule of thumb is that the size of the table should exceed the physical memory of the database server" ([5.12. Table Partitioning](https://www.postgresql.org/docs/current/ddl-partitioning.html)). The documented benefits are bulk load/delete by partition and better locality; the cost is that the partitioned table "is a 'virtual' table having no storage of its own", and — the constraint that usually bites — "to create a unique or primary key constraint on a partitioned table, the partition keys must not include any expressions or function calls and the constraint's columns must include all of the partition key columns" ([5.12. Table Partitioning](https://www.postgresql.org/docs/current/ddl-partitioning.html)). A unique key that does not contain the date you partitioned by is simply not available.

For an e-commerce schema at this scale, the table that eventually qualifies is an append-only log (`WebhookEvent`, `OrderStatusChange`, `AutomationRun`), not `Order`. Partition by month only when retention is a requirement; `DELETE` with an index on the time column is cheaper until then.

### 11.5 Locking and queue tables

The automation worker's claim uses `FOR UPDATE SKIP LOCKED` (`lib/automations/executeur.ts`). PostgreSQL documents the tradeoff precisely: "Skipping locked rows provides an inconsistent view of the data, so this is not suitable for general purpose work, but can be used to avoid lock contention with multiple consumers accessing a queue-like table" ([SELECT](https://www.postgresql.org/docs/current/sql-select.html)). That is the right use, and the quoted sentence is the reason it must not be copied into a checkout path.

---

## 12. Applied to Eguidar

Read for this section: [`prisma/schema.prisma`](../../prisma/schema.prisma) (450 lines), [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md), `GLOSSARY.md` entries for *Commande*, *Statut de commande*, *Panier*, *Article du panier*, *Produit*, *Variante*, *Structure*, *Ville de livraison*, *Total à payer*, ADRs 0007, 0009, 0013, 0021, 0029, 0030, 0046, and the migrations under `prisma/migrations/`. Every field name below was read from the file, not inferred. Following `docs/ARCHITECTURE.md` §6 (*Ancre*: "une ancre est un symbole, jamais un numéro de ligne"), anchors are field and model names.

The table is ordered by the severity of the failure each row permits, not by the urgency of a fix: row 1's "smallest change" is "none now" because ADR-0046 chose that behaviour deliberately, and the row stays first because the cost of the limitation is highest if a retention policy ever appears. "Smallest change" means the additive migration that removes the *risk*, not the redesign that removes the *topic*.

| # | Area | Current shape | Risk | Smallest schema change that removes the risk |
|---|---|---|---|---|
| 1 | Customer deletion is total by decision, and no retention policy is representable | `Order.userId String` + `user user @relation(fields: [userId], references: [id])` with no `onDelete`, so Prisma emits `ON DELETE RESTRICT` (`Order_userId_fkey`). ADR-0046 decides that a valid Facebook deletion request removes the **whole** customer, orders included, and explicitly rejects both anonymising the orders and keeping them beside the account ("il n'existe aucune politique de rétention qui donnerait une base à cette conservation"); `lib/suppression-donnees-facebook.ts` therefore runs `tx.order.deleteMany` and deletes the `AutomationEvent` copies too (amendment #1001). The Facebook route is the only deletion path — no `deleteUser` is exposed in `lib/` or `app/` | The policy is coherent and needs no change today. What the schema cannot do is represent an alternative: no accounting or retention policy is storable, so if one is ever adopted (a legal duty to keep invoices, say) the schema must change **before** the policy can be honoured — and that change amends ADR-0046, it is not a migration that quietly softens a deletion. Separately, the order's e-mail is read live through `user.email` when a notification is built (`toOrderEmailSnapshot(created, user.email)`, and `existing.user.email` on a status change), so a profile edit changes the target of past notifications | None now: ADR-0046 chose this, and states "Aucun changement de schéma Prisma n'est nécessaire". The change to make *first*, if a retention policy is ever adopted: nullable `Order.userId` with `onDelete: SetNull` plus `Order.email String`, landed before the policy and framed as an ADR-0046 amendment |
| 2 | Order line → variant | `OrderItem.variantId String?` with **no relation field and no FK** (verified: no `OrderItem_variantId_fkey` in any migration) | A dangling id is storable; the restock path (`réapprovisionnerArticles`) increments whatever row has that id; nothing prevents a variant from being deleted while orders point at it | Declare `variant ProductVariant? @relation(fields: [variantId], references: [id], onDelete: SetNull)` + the back-relation (Saleor's exact shape, `variant` → `SET_NULL`), in two steps: first `UPDATE "OrderItem" SET "variantId" = NULL WHERE "variantId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ProductVariant" WHERE id = "variantId")`, because variants deleted before the constraint existed left dangling ids that `ADD CONSTRAINT` would reject; then add the FK. Behaviour change: the restock loop's silent no-op on a dangling id becomes the explicit `if (!item.variantId) continue` skip — same outcome, now enforced instead of accidental |
| 3 | Money without currency | `Product.price Int`, `ProductVariant.priceDelta Int`, `OrderItem.price Int`, `Order.total`/`shippingFee`/`totalPayable Int`, `DeliveryCity.fee Int`, `ShippingSettings.freeShippingThreshold Int` — no currency column anywhere | The unit is a code constant, not a row fact: `lib/money.ts` formats with `Intl.NumberFormat("fr-MA", … currency: "MAD")` and parses with `parseMadToCents`, so today's answer is right and lives in one module. What the schema cannot do is *say* it: a second currency, or a gateway that wants amount + ISO code, needs a migration of every table holding an amount, and nothing today forbids two rows of one order being written in different units | Add `currency String @default("MAD")` to `Order` and to `Payment` when it exists; keep integers; add the `Price` table when the second currency is real (not before) |
| 4 | No payment, refund, or collection record | Nothing. `OrderStatus.delivered` is the only evidence that cash moved (ADR-0009: "Chiffre d'affaires encaissé counts only Commandes Livrées"); `returned` sets `encaissée: false` in `lib/statut-de-commande.ts` | No record of who collected, how much, when; no partial collection; no refund amount; a returned order silently leaves revenue with no trace that money was ever received | `Payment(id, orderId, method, amount, currency, collectedAt, recordedBy, providerRef?, idempotencyKey? @unique)` — one row even for COD; `Refund(paymentId, amount, currency, reason, createdAt)` |
| 5 | Status without history | `Order.status OrderStatus @default(pending)` + `@@index([status])`; transitions are guarded by a compare-and-set (`updateMany({ where: { id, status: fresh.status } })`) but nothing records the transition | Cannot answer when/who/why; time-in-state is unrecoverable; the guard's previous value is overwritten; `delivered → returned` erases the collection fact | `OrderStatusChange(id, orderId, from, to, at, actorId?, reason?, @@index([orderId, at]))`, written in the same transaction as the status update |
| 6 | Stock | `ProductVariant.stock Int @default(0)` — one integer, no location, no window; decremented at placement by a conditional `updateMany({ where: { id, stock: { gte: quantity } } })` (correct primitive), incremented on cancel/return | No per-location stock; no reservation record, so a cancel/return restock is only reproducible from `OrderItem`; no `CHECK (stock >= 0)`, so any future write path can go negative; a partial return cannot be expressed; and the per-line `reserverStock` loop takes row locks in cart order, so two carts holding the same variants in opposite order can deadlock (§3.3) | `CHECK (stock >= 0)` via a hand-written migration now; `StockLevel(variantId, locationId, stocked, reserved)` + `Reservation(orderItemId, stockLevelId, quantity)` when a second location or partial fulfillment appears |
| 7 | Returns and partial fulfillment | `OrderStatus.returned` is a single terminal value on the whole order; `réapprovisionnerArticles` increments the **full** `OrderItem.quantity`; `OrderItem` has no fulfilled/shipped/returned counters | One shirt returned out of five is unrepresentable; the restock is all-or-nothing; no return reason, no condition (resellable vs damaged) | `Return(orderId, status, requestedAt, receivedAt)` + `ReturnItem(returnId, orderItemId, quantity, condition)`; keep the enum as the aggregate (Saleor keeps `Fulfillment` + `OrderGrantedRefund` alongside `Order.status`) |
| 8 | Timestamps have no time zone | Every `DateTime` maps to `TIMESTAMP(3)` (Prisma's PostgreSQL default); verified in `20260810111743_init/migration.sql` and the later migrations | A wall-clock reading with no offset; an order placed in Casablanca is ambiguous across an offset change; a dispute over "when" has no authoritative instant | `@db.Timestamptz(3)` on new columns, then one migration converting existing ones (the `USING` clause decides the assumed source zone — pick it deliberately) |
| 9 | Two sources for product images | `Product.images Json` (gallery order, URLs) and `ImageProduit` (`publicUrl @unique`, `alt`, dimensions) with **no FK between them** | Alt text and gallery can drift; deleting a registry row leaves the URL in the gallery; "which products use this image" is a JSON scan | `ProductImage(productId, imageId, position, @@unique([productId, imageId]))`, keeping `ImageProduit` as the registry and `Product.images` as the derived cache until the join table is read |
| 10 | Relative pricing | `Product.price Int` is the base, `ProductVariant.priceDelta Int @default(0)` is an offset; ADR-0013 bakes `price + priceDelta` into the DTO so surfaces do not re-derive it | No absolute variant price is storable, so a discount or a per-currency price cannot be a column; `ORDER BY price + priceDelta` is not indexable; repricing overwrites with no history | `ProductVariant.price Int?` backfilled to `price + priceDelta`; keep `priceDelta` as the admin editing affordance; move to `VariantPrice(variantId, currency, amount, validFrom)` for the second currency |
| 11 | Guest carts have no rows | `CartItem.userId String` (required) + `@@unique([userId, variantId])`; guests are an unsigned httpOnly cookie capped at 20 articles with a 30-day age (ADR-0007), revalidated server-side | No cart identity to link an order to; no abandoned-cart query; a cleared cookie loses the cart; the same variant cannot be in two carts by design, and the cap lives only in code | `Cart(id, token @unique, userId?, expiresAt)` + `CartItem.cartId`, keeping the cookie as the token carrier (Saleor: UUID PK as capability; Medusa: nullable `customer_id`) |
| 12 | Quantity has no database rule | `CartItem.quantity Int @default(1)`, `OrderItem.quantity Int` — no `CHECK`, no minimum; values are validated in `lib/panier-coeur.ts` | A zero or negative quantity is storable by any path that bypasses the use case; `OrderItem.quantity` participates in restock arithmetic | `CHECK (quantity > 0)` on both, hand-written in a `--create-only` migration (no `CHECK` attribute exists in the Prisma schema) |
| 13 | Order has no e-mail snapshot | The order e-mail is read through `user.email` (`updateOrderStatus` includes `user: { select: { email: true } }`; `toOrderEmailSnapshot(order, userEmail)` takes it as an argument) | A customer changing their address rewrites every past order's notification target; a deleted account takes the address with it | `Order.email String` written at placement (Medusa and Saleor both store it on the order) |
| 14 | Address is free text, and the address book is one row | `Order.cityName String`, `Order.address String`, `Order.phone String`; the customer's address lives on `user.shippingAddress String?` and `user.shippingCityId String?` | No structured address; one address per customer; `cityName` can disagree with `DeliveryCity.name` and nothing notices; the fee is resolved from a city id at checkout, not from the order's own copy | `Address(id, userId, label, recipient, line1, cityId, phone)` for the book; keep the order's strings, and resolve `shippingFee` into `Order` from the same quote (already done via `totalPayable`) |
| 15 | `role` is unconstrained text | `user.role String @default("user")`; `estAdmin` compares strings | A typo'd role is a permission bug; no database-level vocabulary | enum `Role { user admin }`, or `CHECK (role IN ('user','admin'))` |
| 16 | Category tree can hold a cycle | `Category.parentId String?` self-relation, `position Int @default(0)`, `@@index([parentId, position])`; ADR-0030 handles cycles by refusing them in code and names the closing edge | A cycle is representable in the database; every reader must be cycle-safe (the repo's `Marche de la Structure` is) | `CHECK (id <> parent_id)` for the trivial case now; an `ltree`/path column only if subtree reads become hot |
| 17 | No price or promotion history | Repricing is an `UPDATE` on `Product.price`/`ProductVariant.priceDelta`; no `validFrom`, no audit | Margin on a past period is unknowable; the only record of a past price is an order line | covered by #10's `VariantPrice` when it exists |
| 18 | `AutomationEvent` is the only durable trace of writes | `AutomationEvent.payload Json`, `expiresAt DateTime`, no FK to the entity; events are deleted in the GDPR path | The outbox is doing duty as an audit log: it expires, it is deletable, and it has no actor | keep the outbox; add the `OrderStatusChange` of #5 and an `actorId` on it |

**What is already right, and should not be "fixed"**: the conditional stock update (§3.3 Option A); the compare-and-set on status; `Order.totalPayable` as a persisted sort key (ADR-0021); the immutable `total`/`shippingFee` write-once discipline; the partial unique index on `LotImport.statut`; the copy-not-derive rule for prices in DTOs (ADR-0013); the explicit deletion order in the Facebook path, which is honest about a schema constraint rather than hiding it.

**Two observations about the shape of the fix.** First, the rows overlap and most of the work is additive: a new table (payment, history, return, cart, address, product image) or a nullable column (`Order.email`, `Order.userId`, variant price, currency). A minority are constraints that must be hand-written in SQL because Prisma has no `CHECK` (stock, quantity, cycle, and the `OrderItem` FK). Only the timestamp conversion changes the type of an existing column, which is why it is ranked below the missing tables despite being the most mechanical. Second, the expensive ones (#1, #4, #5, #7) are expensive for the same reason: **the schema has no `Payment`, no `Return`, and no history, so `Order` is carrying facts it cannot represent.** Adding those three tables is what turns the rest into additive work.

---

## 13. A checklist for any e-commerce schema

Answer yes or no; every "no" is a decision to write down.

1. Does every amount-bearing row carry its currency code, and is the unit (minor or major) written down once?
2. Is there a unique constraint on every business key (slug, handle, SKU, delivery-city name)?
3. Does every nullable FK that only *references* history use `ON DELETE SET NULL`, and every owned child `CASCADE`, explicitly in the schema?
4. Can an order be read, shipped and refunded after its customer row is gone?
5. Does the order line hold name, variant name, SKU, unit price, tax and currency, or does it join to the catalogue for any of them?
6. Is the order's e-mail copied onto the order?
7. Is order status a single column, or a column plus a transition table with actor and timestamp?
8. Are payment and fulfillment separate tables from the order, and are their status axes independent?
9. Is there a payment row for a cash-on-delivery order, and a refund row type that a partial refund can inhabit?
10. Can a partial return be expressed as a quantity on a return line, and does restock use that quantity rather than the order line's?
11. Is stock either reserved per order line or decremented by a conditional `UPDATE`, and can the column go negative?
12. Is there a `CHECK (quantity > 0)` on every quantity column, in the database?
13. Is there a unique key that makes a replayed webhook or a retried payment a no-op?
14. Do all timestamp columns have a time zone, and is there a written reason if any does not?
15. Are prices per currency (a price table or a currency column), and is a past price recoverable after a repricing?
16. Is a cart's price treated as a display cache that is re-resolved and compared at checkout?
17. Is a guest cart representable without inventing a user row?
18. Does the schema forbid (or explicitly document) a category cycle, and does every category reader terminate on one?
19. Are enums limited to developer-owned closed sets, with editor-owned vocabularies in lookup tables?
20. Does every index used by a list query have its column order justified by an `EXPLAIN`?
21. Are unique constraints partial where soft-deleted rows must not collide?
22. Is deletion of a customer a written policy rather than a consequence of `onDelete` defaults?
23. Is the outbox/event table distinct from the audit trail, with the audit trail append-only and actor-bearing?
24. Can the seed be absent without a storefront crash (singleton settings rows have defaults in code)?
25. Is partitioning absent, with a note of the table and the condition that would justify it?

---

## Sources

All retrieved **2026-11-15 (UTC)**. PostgreSQL pages are the `/docs/current` branch, which served **PostgreSQL 18** documentation at retrieval; the repository runs PostgreSQL 16 per `docs/ARCHITECTURE.md`.

**PostgreSQL documentation** (retrieved 2026-11-15)

- [5.5. Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)
- [5.12. Table Partitioning](https://www.postgresql.org/docs/current/ddl-partitioning.html)
- [7.8. WITH Queries (Common Table Expressions)](https://www.postgresql.org/docs/current/queries-with.html)
- [8.1. Numeric Types](https://www.postgresql.org/docs/current/datatype-numeric.html)
- [8.2. Monetary Types](https://www.postgresql.org/docs/current/datatype-money.html)
- [8.5. Date/Time Types](https://www.postgresql.org/docs/current/datatype-datetime.html)
- [8.7. Enumerated Types](https://www.postgresql.org/docs/current/datatype-enum.html)
- [8.14. JSON Types](https://www.postgresql.org/docs/current/datatype-json.html)
- [11.2. Index Types](https://www.postgresql.org/docs/current/indexes-types.html)
- [11.3. Multicolumn Indexes](https://www.postgresql.org/docs/current/indexes-multicolumn.html)
- [11.8. Partial Indexes](https://www.postgresql.org/docs/current/indexes-partial.html)
- [13.2. Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
- [13.3. Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html)
- [13.3.4 Deadlocks](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-DEADLOCKS)
- [13.4. Data Consistency Checks at the Application Level](https://www.postgresql.org/docs/current/applevel-consistency.html)
- [F.22. ltree](https://www.postgresql.org/docs/current/ltree.html)
- [ALTER TYPE](https://www.postgresql.org/docs/current/sql-altertype.html)
- [CREATE INDEX](https://www.postgresql.org/docs/current/sql-createindex.html)
- [SELECT](https://www.postgresql.org/docs/current/sql-select.html)

**Prisma ORM v7 documentation** (retrieved 2026-11-15; pinned to the v7 paths, because `prisma.io/docs` now defaults to Prisma ORM 8 — see the redirect log)

- [Referential actions](https://www.prisma.io/docs/orm/v7/prisma-schema/data-model/relations/referential-actions)
- [Models (enums, `@map`, `@@unique`)](https://www.prisma.io/docs/orm/v7/prisma-schema/data-model/models)
- [Prisma schema reference (type mappings, `@@index`, `@unique(where:)`, `@@unique(where:)`)](https://www.prisma.io/docs/orm/v7/reference/prisma-schema-reference)
- [Development and production (migrations, `--create-only`, renames)](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/development-and-production)

**Medusa v2.21.2 — model definitions** (retrieved 2026-11-15 at git tag `v2.21.2`; the tag, not a file header, is the pin — the repository's root `package.json` carries a changesets version placeholder rather than a literal version)

- [order/src/models/order.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/order/src/models/order.ts)
- [order/src/models/order-item.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/order/src/models/order-item.ts)
- [order/src/models/line-item.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/order/src/models/line-item.ts)
- [order/src/models/address.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/order/src/models/address.ts)
- [order/src/models/transaction.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/order/src/models/transaction.ts)
- [order/src/models/order-change.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/order/src/models/order-change.ts)
- [cart/src/models/cart.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/cart/src/models/cart.ts)
- [cart/src/models/line-item.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/cart/src/models/line-item.ts)
- [payment/src/models/payment.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/payment/src/models/payment.ts)
- [payment/src/models/refund.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/payment/src/models/refund.ts)
- [payment/src/models/payment-session.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/payment/src/models/payment-session.ts)
- [inventory/src/models/inventory-level.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/inventory/src/models/inventory-level.ts)
- [inventory/src/models/reservation-item.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/inventory/src/models/reservation-item.ts)
- [product/src/models/product.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/product/src/models/product.ts)
- [product/src/models/product-variant.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/product/src/models/product-variant.ts)
- [product/src/models/product-option.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/product/src/models/product-option.ts)
- [pricing/src/models/price.ts](https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/packages/modules/pricing/src/models/price.ts)

**Saleor 3.23.49 — model definitions and docs** (retrieved 2026-11-15; release tag read from the GitHub releases API: `3.23.49`, published 2026-11-12)

- [saleor/order/models.py](https://raw.githubusercontent.com/saleor/saleor/3.23.49/saleor/order/models.py)
- [saleor/checkout/models.py](https://raw.githubusercontent.com/saleor/saleor/3.23.49/saleor/checkout/models.py)
- [saleor/warehouse/models.py](https://raw.githubusercontent.com/saleor/saleor/3.23.49/saleor/warehouse/models.py)
- [saleor/payment/models.py](https://raw.githubusercontent.com/saleor/saleor/3.23.49/saleor/payment/models.py)
- [Checkout (docs)](https://docs.saleor.io/developer/checkout/overview)
- [Stock Allocation (docs)](https://docs.saleor.io/developer/stock/stock-allocation)

**Shopify — Admin GraphQL object reference** (retrieved 2026-11-15)

- [Order](https://shopify.dev/docs/api/admin-graphql/latest/objects/Order)
- [FulfillmentOrder](https://shopify.dev/docs/api/admin-graphql/latest/objects/FulfillmentOrder)
- [InventoryLevel](https://shopify.dev/docs/api/admin-graphql/latest/objects/InventoryLevel)

**Stripe** (retrieved 2026-11-15)

- [Idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- [PaymentIntent object](https://docs.stripe.com/api/payment_intents/object)
- [The PaymentIntent lifecycle](https://docs.stripe.com/payments/paymentintents/lifecycle)
- [Refund and cancel payments](https://docs.stripe.com/refunds)
- [Webhooks](https://docs.stripe.com/webhooks)

**In-repo** (read 2026-11-15)

- [`prisma/schema.prisma`](../../prisma/schema.prisma), `prisma/migrations/**`
- [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) — layers, seams, Law 8, the *Ancre* rule
- [`GLOSSARY.md`](../../GLOSSARY.md) — *Commande*, *Statut de commande*, *Transition de statut*, *Réapprovisionnement*, *Panier*, *Article du panier*, *Produit*, *Variante*, *Structure*, *Ville de livraison*, *Total à payer*, *Chiffre d'affaires encaissé*
- ADRs [0007](../adr/0007-visiteur-cookie-panier.md), [0009](../adr/0009-ca-encaisse-delivered-only.md), [0013](../adr/0013-catalogue-dto-computed-prices.md), [0021](../adr/0021-total-a-payer-persiste.md), [0029](../adr/0029-produit-sans-structure.md), [0030](../adr/0030-la-marche-de-la-structure.md), [0046](../adr/0046-suppression-des-donnees-facebook.md)
- `lib/use-cases/orders.ts`, `lib/statut-de-commande.ts`, `lib/panier.ts`, `lib/suppression-donnees-facebook.ts`

### Sources checked, not used / failed to fetch

Recorded so the next reader does not retry them.

**Redirected (content read, but not at the URL that was requested)**

- `https://www.prisma.io/docs/orm/prisma-schema/data-model/models` → `301`/`302` to `https://www.prisma.io/docs/orm/data-modeling`, which is **Prisma ORM 8** documentation. The v7 page was fetched explicitly at `https://www.prisma.io/docs/orm/v7/prisma-schema/data-model/models` and is what is cited.
- `https://www.prisma.io/docs/orm/reference/prisma-schema-reference` → `https://www.prisma.io/docs/orm/v7/reference/prisma-schema-reference`. Served the v7 reference; cited as such.
- `https://www.prisma.io/docs/orm/prisma-migrate/workflows/development-and-production` → `https://www.prisma.io/docs/orm/migrations/applying-a-migration` (Prisma ORM 8 structure). The v7 page was fetched explicitly and is what is cited.

**404**

- `https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/team-development` — 404. No "team development" page exists under the v7 prefix; the redirect target `/orm/migrations/…` was not explored further.
- `https://docs.saleor.io/developer/order/order-lifecycle` — 404. Saleor's order lifecycle is not documented at that path.
- `https://docs.saleor.io/developer/order/orders` — 404.
- `https://www.postgresql.org/docs/current/money-type.html` — 404 (the monetary types page is `datatype-money.html`).

**Checked and deliberately not cited**

- Saleor's `saleor/payment/models.py` `psp_reference` field: present and indexed, but **not unique** — reported in §6.2 as a gap rather than cited as a recommendation.
- Medusa's `model.bigNumber()` was read as a field declaration; the SQL type it materialises was **not** verified in this pass, so no claim is made about it beyond "not integer minor units".
- Vendor blog posts on Medusa/Saleor data modelling were not consulted, per the primary-sources-only rule.

## Open questions

1. **The exact literal for a GIN access method in a Prisma 7 `@@index`.** The schema reference documents the `type` argument ("Allows you to specify an index access method. Defaults to `BTree`. PostgreSQL and CockroachDB only") but no example with GIN was found and no literal for it was confirmed in the installed schema engine. Evidence that would settle it: `prisma validate` on a schema containing `@@index([specs], type: Gin)` with `prisma@7.10.1`.
2. **Whether `partialIndexes` is on by default in `prisma@7.10.1`.** The reference page says "Requires the `partialIndexes` Preview feature"; the string is present in the installed schema-engine binary, but the default flag state was not exercised. Evidence: a `prisma migrate diff` on a schema using `@@unique(where: …)` without the preview flag.
3. **How Medusa's `model.bigNumber()` is stored in PostgreSQL.** Numeric precision and scale would decide whether a Medusa-shaped `Price` table is a drop-in for a cents-based one. Evidence: the module's migration SQL or `information_schema.columns` on a migrated Medusa database.
4. **This repo's actual PostgreSQL column types.** §1.5 and gap 8 rely on the migration SQL (`TIMESTAMP(3)`) rather than on `information_schema.columns` of a running database; a `\d "Order"` on the deployed instance would confirm that no later migration changed the type.
5. **Whether Saleor's `account.Address` rows survive their user.** §7.2 reports that `Order.shipping_address` is `SET_NULL`, so the order loses the address text if the address row is deleted; whether the address row is in fact deleted with the account depends on the `on_delete` of `Address.user`, which was not read. Evidence: `saleor/account/models.py`.
