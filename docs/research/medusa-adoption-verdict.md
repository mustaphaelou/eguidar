# Medusa v2 as the eguidar admin and catalogue: adoption verdict and answers to eight questions

> **Research-only document.** Every factual claim below is traced to a primary source: `docs.medusajs.com`, the `medusajs/medusa` repository and its release/npm metadata, the npm registry, and the vendor pages of the alternatives named. All new sources were retrieved on 15 October 2026 (UTC). Facts carried over from the companion document [`medusa-js-catalogue.md`](./medusa-js-catalogue.md) (retrieved 6 October 2026, pinned to Medusa `v2.21.2` unless stated) are attributed to it rather than re-fetched. No application code, schema or configuration in this checkout was modified.

## Summary

- **Is Medusa a drop-in for admin, categories and products? No.** The admin half decides it. `@medusajs/dashboard` is a Vite app compiled and served by the Medusa server at `/app`, and `admin.backendUrl` "specifies the URL of the Medusa application", so there is no documented way to point it at a non-Medusa REST API or a Prisma schema ([deployment](https://docs.medusajs.com/learn/deployment/general), [admin](https://docs.medusajs.com/learn/fundamentals/admin)). The catalogue half is a yes-with-migration. Categories, products and variants are first-class and merchant-manageable, but the catalogue has to live in Medusa's own Postgres schema, and the data-model conversions and gaps are catalogued in [`medusa-js-catalogue.md`](./medusa-js-catalogue.md) (§2, §4, §7.2).
- **Current line: 2.x.** Latest release `v2.21.2` (2026-09-28); npm `@medusajs/medusa` and `@medusajs/dashboard` at 2.21.2, preview/snapshot builds of 2.22.0. No v3 exists ([release](https://github.com/medusajs/medusa/releases/tag/v2.21.2), [npm](https://registry.npmjs.org/@medusajs/medusa)).
- **The five domain questions, in one line each.** MAD is a first-party currency. VAT-inclusive prices are first-party, per currency or region. COD is covered by the built-in `pp_system` provider, which "acts similarly to a cash-on-delivery method". Per-city delivery fees are partial. The data model has `GeoZone.city`, but the documented admin UI manages countries only, so the city granularity costs API-level setup and one fulfillment-set/service-zone/shipping-option/price chain per city. Free shipping over a threshold is first-party in the merchant UI, because a shipping option can carry a conditional price with a minimum cart total. Facebook login is not available; Medusa ships only emailpass, Google and GitHub, so Facebook needs a custom auth provider.
- **Deployment is a second backend.** Medusa is an Express-style Node server that listens on its own port (default 9000) and cannot run inside the Next.js process. Documented production posture: PostgreSQL, Redis and the app in server and worker modes, "at least 2GB of RAM" ([deployment](https://docs.medusajs.com/learn/deployment/general)).
- **Licence.** MIT except the Enterprise Edition materials listed in `ENTERPRISE-LICENSE.md` (RBAC, SSO; "a separate, valid commercial agreement" required); the dashboard ships in the same repository and is editable in source, but the docs forbid re-skinning it (see §7).
- Alternatives that can sit on top of the existing Prisma/Postgres schema without owning it are Refine, React Admin, AdminJS (Prisma adapter) and Directus (database introspection). Payload and Medusa cannot (§8).

---

## 1. Is `@medusajs/dashboard` usable against a non-Medusa backend?

**No.** The dashboard is a Vite application inside the Medusa repository (`packages/admin/dashboard`, published as `@medusajs/dashboard`), built during `medusa build` and served by the Medusa server at `/app`; `admin.disable` or `DISABLE_MEDUSA_ADMIN=true` stops the build from compiling it ([medusa-config `admin`](https://docs.medusajs.com/learn/configurations/medusa-config#admin-configurations-admin), [deployment](https://docs.medusajs.com/learn/deployment/general)). Its only backend switch is `admin.backendUrl`, documented as "the URL of the Medusa application" (the default is the browser origin; it exists for serving the admin on a separate domain from the API). The deployment guide is explicit about the contract: "The Medusa Admin is built and hosted statically. To send requests to the Medusa server application, you must set the backend url" ([deployment](https://docs.medusajs.com/learn/deployment/general)).

**Documented extension points.** All of them run inside the Medusa Admin shell and call Medusa's Admin API:

| Mechanism | What it is | Docs |
|---|---|---|
| Admin widgets | React components injected into fixed zones of existing pages | [widgets](https://docs.medusajs.com/learn/fundamentals/admin/widgets) |
| UI routes | New pages under `src/admin/routes/**` | [UI routes](https://docs.medusajs.com/learn/fundamentals/admin/ui-routes) |
| Custom admin API routes | `src/api/admin/**` route files on the Medusa server, authenticated as admin | [API routes](https://docs.medusajs.com/learn/fundamentals/api-routes) |
| Admin SDK | `@medusajs/admin-sdk` for building the above | [admin](https://docs.medusajs.com/learn/fundamentals/admin) |

**No "bring your own backend" story was found.** No page in the documentation index (`https://docs.medusajs.com/llms.txt`) or the resources index describes pointing the dashboard at an arbitrary REST API, at a Prisma schema, or at a backend other than Medusa. The only documented way out of Medusa's admin UI is building your own admin against the Admin API, and the docs state the limit of the built-in admin: "You can't customize the admin dashboard's layout, design, or the content of the existing pages (aside from injecting widgets). You also can't change the Medusa logo used in the admin dashboard" ([admin](https://docs.medusajs.com/learn/fundamentals/admin), quoted in [`medusa-js-catalogue.md`](./medusa-js-catalogue.md) §3).

Two adjacent facts worth keeping: custom admin authentication (for example reusing an existing identity provider for admin users) is supported since v2.12.0 ([how-to](https://docs.medusajs.com/resources/how-to-tutorials/how-to/admin/auth)), and the Admin API can be called with a session cookie, bearer JWT, or secret API key (`Authorization: Basic sk_...`) ([`medusa-js-catalogue.md`](./medusa-js-catalogue.md) §3).

**Consequence for eguidar.** Replacing `app/admin` with the Medusa admin means moving the catalogue into Medusa, adopting Medusa's UI kit (undoing ADR-0008), and accepting a UI that cannot be restyled beyond widgets. There is no path where `@medusajs/dashboard` becomes a read/write front-end for the existing Prisma catalogue.

---

## 2. Who owns the database, and what has to run?

**Medusa owns its entire schema.** It creates and migrates its own tables (143 distinct tables at v2.21.2, tracked in `mikro_orm_migrations`); migrations are the documented `predeploy` script (`medusa db:migrate`) ([deployment](https://docs.medusajs.com/learn/deployment/general)). There is no adopt-an-existing-schema path. The default schema is `public` via `configModule.projectConfig.databaseSchema || "public"`. That option is effectively undocumented, since it never appears in the configuration reference, and the generic lowercase table names (`user`, `order`, `product`, …) make sharing one `public` schema with better-auth in eguidar's database unsafe as-is ([`medusa-js-catalogue.md`](./medusa-js-catalogue.md) §5, with the source read and the `"user"` collision named). The realistic option is a separate Medusa database, populated from Prisma by a migration script.

**Medusa does not run in the Next.js process.** It is a standalone Node server (`PORT=9000` in the deployment guide; health at `/health`, admin at `/app`). The Next.js storefront is a client of its Store API, just as it is a client of eguidar's Server Actions today.

**Worker and Redis.** `workerMode` is `"shared"` (one process, server and worker), or split into `"server"` and `"worker"`; the docs state that, in production, "you deploy two instances: one in server mode, and one in worker mode", with `DISABLE_MEDUSA_ADMIN=true` on the worker ([worker mode](https://docs.medusajs.com/learn/production/worker-mode), [deployment](https://docs.medusajs.com/learn/deployment/general)). Redis is not an install prerequisite but the documented production companion (session store plus the Redis variants of the event bus, workflow engine, caching and locking modules), and Medusa's own deployment guide lists a Redis database among "what you'll deploy" ([installation](https://docs.medusajs.com/learn/installation), [deployment](https://docs.medusajs.com/learn/deployment/general); the four-module detail and the fact that setting `REDIS_URL` does not auto-swap the self-hosted defaults are in [`medusa-js-catalogue.md`](./medusa-js-catalogue.md) §5).

**Minimum deployment footprint (documented).** A PostgreSQL database, a Redis database, two app instances (or one `shared` process), and at least 2GB of RAM. Required env vars: `DATABASE_URL`, `COOKIE_SECRET`, `JWT_SECRET` ("if not set, an error is thrown"), `STORE_CORS`, `ADMIN_CORS`, `AUTH_CORS`, `MEDUSA_WORKER_MODE`, `DISABLE_MEDUSA_ADMIN`, `PORT`, `REDIS_URL`, and `MEDUSA_BACKEND_URL` on the server instance ([deployment](https://docs.medusajs.com/learn/deployment/general)). Plus whatever the integrations need (R2/S3, Meilisearch, social login).

---

## 3. Catalogue model

| Concern | Medusa v2 answer | Source |
|---|---|---|
| Products, variants, options | First-class, merchant-manageable (create/edit product, variants, options) | [user guide](https://docs.medusajs.com/user-guide/products) |
| Categories | Arbitrary-depth tree via `ProductCategory` (materialized path `mpath`, sibling `rank`, unique `handle`, soft delete); no depth cap; no cycle guard found in source | [`medusa-js-catalogue.md`](./medusa-js-catalogue.md) §4 |
| Collections, tags, types | First-class (`/admin/collections`, product tags, product types) | [`medusa-js-catalogue.md`](./medusa-js-catalogue.md) §3 |
| Brands | No first-class entity. The docs teach building a `Brand` module; `@medusajs/brand` is a 404 on npm | [`medusa-js-catalogue.md`](./medusa-js-catalogue.md) §2 |
| Category images | No native support; tutorial-only | [`medusa-js-catalogue.md`](./medusa-js-catalogue.md) §2 |
| Images | `ProductImage` and `thumbnail`; file module providers include S3-compatible (MinIO, DigitalOcean Spaces) | [S3 provider](https://docs.medusajs.com/resources/infrastructure-modules/file/s3) |
| Arbitrary custom data | `metadata` JSONB on the models, custom modules with their own tables, module links | [modules](https://docs.medusajs.com/learn/fundamentals/modules), [module links](https://docs.medusajs.com/learn/fundamentals/module-links) |
| Meilisearch | The v1 to v2 Meilisearch tutorial is deprecated as of v2.21.1, and the official Search Module ships with PostgreSQL and Medusa Search (Cloud) providers only. A Meilisearch provider must be written against the Search Module provider contract, or be the community `@rokmohar/medusa-plugin-meilisearch` | [deprecated guide](https://docs.medusajs.com/resources/integrations/guides/meilisearch), [search providers](https://docs.medusajs.com/resources/infrastructure-modules/search/providers), [`medusa-js-catalogue.md`](./medusa-js-catalogue.md) §6 |
| How indexing works | Declarative index definitions pick a provider; the module subscribes to events and keeps indexes current and versioned | [search module](https://docs.medusajs.com/resources/infrastructure-modules/search) |

Not carried over from the catalogue document: the search-provider list ("Medusa provides the following Search Module Providers: PostgreSQL, Medusa Search") and the deprecation banner on the Meilisearch guide, both verified first-hand for this document.

---

## 4. Domain fit, feature by feature

| eguidar rule | Medusa v2 | Verdict |
|---|---|---|
| Single store | Regions and sales channels; no multi-store concept | Out of the box |
| MAD only | `MAD: { symbol: "MAD", name: "Moroccan Dirham", symbol_native: "د.م.‏", decimal_digits: 2 }` is a first-party currency in `@medusajs/utils@2.21.2` | Out of the box |
| VAT 20% included in displayed prices | Tax-inclusive pricing is first-party, configured per currency or per region; tax regions and rates exist | Out of the box ([tax-inclusive pricing](https://docs.medusajs.com/resources/commerce-modules/pricing/tax-inclusive-pricing)) |
| Cash on delivery only | The Payment Module's built-in `system` provider "acts as a placeholder payment provider. It doesn't handle payment processing and delegates that to the merchant. It acts similarly to a cash-on-delivery (COD) payment method." Its identifier is `pp_system`, and you enable it in a region from the dashboard | Out of the box ([payment providers](https://docs.medusajs.com/resources/commerce-modules/payment/payment-provider), [Manual Payment integration](https://medusajs.com/integrations/medusajs-payment)) |
| Per-city delivery fees | `GeoZone` holds "country, city, or province code" and `postal_expression`; a fee is a fixed price on a shipping option in a service zone. But the documented admin UI's service-zone "Areas" step manages countries only. Per-city zones therefore need API-level or `fulfillment`-module setup, or a custom admin widget, and one city means setting up a GeoZone, ServiceZone, ShippingOption, PriceSet and Price across the fulfillment and pricing modules | Partial ([GeoZone model](https://docs.medusajs.com/resources/references/fulfillment/models/GeoZone), [concepts](https://docs.medusajs.com/resources/commerce-modules/fulfillment/concepts), [admin locations guide](https://docs.medusajs.com/user-guide/settings/locations-and-shipping/locations), [`medusa-js-catalogue.md`](./medusa-js-catalogue.md) §7.2) |
| Free shipping over a threshold | A shipping option's price can be conditioned on a minimum cart total in the admin. The docs give exactly this example: "make the shipping option free if the cart's total exceeds $100". A "Free Shipping" promotion type (v2.10.0+) also exists, and numeric promotion rules on cart totals (`item_subtotal`, `subtotal`, `total` with `gte`) are API-only | Out of the box for the threshold ([admin locations guide](https://docs.medusajs.com/user-guide/settings/locations-and-shipping/locations), [free shipping promotion](https://docs.medusajs.com/user-guide/promotions/create), [promotion rules](https://docs.medusajs.com/resources/commerce-modules/promotion/concepts)) |
| Facebook / Google social login | Registered providers are `emailpass`, `google` and `github`. Facebook is not among them; a custom auth provider would be needed (`AbstractAuthModuleProvider`), or the community Better Auth plugin (§5) | No ([auth providers](https://docs.medusajs.com/resources/commerce-modules/auth/auth-providers)) |
| Stock restocked on cancel/return | Cancel-before-fulfillment deletes the reservations and the quantity becomes available again; canceling a fulfillment restores released reservations; a return puts items back in stock (or marks them damaged) | Out of the box ([reservations lifecycle](https://docs.medusajs.com/resources/commerce-modules/inventory/reservations-lifecycle), [returns](https://docs.medusajs.com/user-guide/orders/returns)) |
| Per-item free shipping (`anyFreeShippingItem`) | No equivalent found | Gap ([`medusa-js-catalogue.md`](./medusa-js-catalogue.md) §7.2) |
| Devis (all cities priced side by side before ordering) | Shipping prices resolve for the current cart only | Gap ([`medusa-js-catalogue.md`](./medusa-js-catalogue.md) §7.2) |

**Caveat.** Whether the store-side shipping-option resolution actually matches a `GeoZone.city` end-to-end was not verified in this pass. The model field and the admin limitation are documented, but no live check was run, so see this document's open questions. Treat per-city fees as "possible, unverified at runtime, custom to operate".

---

## 5. Auth: Medusa vs Better Auth

**What Medusa ships.** One set of auth routes, `/auth/{actor_type}/{provider}`; actor types are `user` (admin) and `customer` by default, and `authMethodsPerActor` restricts which providers each may use. Providers registered at 2.21.2: `emailpass`, `github`, `google`, `oidc`. Custom providers extend `AbstractAuthModuleProvider` ([auth providers](https://docs.medusajs.com/resources/commerce-modules/auth/auth-providers), [authentication route](https://docs.medusajs.com/resources/commerce-modules/auth/authentication-route), [`medusa-js-catalogue.md`](./medusa-js-catalogue.md) §3).

**The docs say nothing about Better Auth.** No page in the documentation index mentions Better Auth. There is no first-party bridge.

**How people bridge them.** Two options exist outside Medusa:

1. **Write an auth provider** that treats Better Auth as the source of truth. Validate the Better Auth session (for example against the shared database or an internal endpoint) and return a Medusa identity/JWT for the matching actor. This is the supported extension point ([create provider](https://docs.medusajs.com/resources/references/auth/provider)), and it requires custom code.
2. **Community plugin.** `@nualt/medusa-plugin-better-auth` (MIT, v0.1.1, nualt.fr) is "Better Auth as the authentication engine for Medusa v2" and adds social OAuth, magic links, passkeys and 2FA for customers and admin users; its peer range is `@medusajs/medusa ^2.15.0` ([npm metadata](https://registry.npmjs.org/@nualt%2Fmedusa-plugin-better-auth/latest)). The risk is one maintainer, version 0.1.x, and no first-party support.

Custom admin auth (keeping your own IDP in front of the Medusa admin) is documented since v2.12.0 ([how-to](https://docs.medusajs.com/resources/how-to-tutorials/how-to/admin/auth)). eguidar's ADR-0019 dependence on Facebook e-mail is not served by either shipped set of providers. Better Auth has the social providers, and Medusa does not (§4).

---

## 6. Adoption cost

**Migration tooling from a custom schema.** None exists. What Medusa documents is the admin's CSV product import (one row per variant; `Product Category N` columns take category ids) ([import](https://docs.medusajs.com/user-guide/products/import)), plus platform guides for [Shopify](https://docs.medusajs.com/learn/introduction/build-with-llms-ai/docs-mcp-server/migrate-from-shopify), [Magento](https://docs.medusajs.com/resources/integrations/guides/magento) and WooCommerce ([`medusa-js-catalogue.md`](./medusa-js-catalogue.md) §3). Nothing consumes a Prisma schema, so the mechanical path for eguidar is a seed/migration script run with the Medusa CLI (`medusa exec`, [custom CLI scripts](https://docs.medusajs.com/learn/fundamentals/custom-cli-scripts/seed-data)) plus the admin CSV import, after the conversions in §7.2 of the companion document:

- **Money.** eguidar centimes (Int, `price + priceDelta` relative) convert to `Price.amount` in major units, absolute per variant.
- **Stock.** `ProductVariant.stock` becomes an `InventoryItem` plus an `InventoryLevel` at a stock location, and the variant must be linked to the item.
- **Categories.** Create parents before children (the parent's `mpath` is required at create), set `is_active: true` explicitly because the default is `false`, and choose a sibling order because eguidar has no ordering column.
- **No destination.** `brand`, `Category.image`, `isFeatured`/`featuredOrder`, `freeShipping` and the "Sans Structure" orphan semantics have no Medusa equivalent.

The minimum deployment footprint is §2 above: Postgres, Redis and two app processes (or one `shared`) on at least 2GB RAM, with the server serving the built admin, migrations as `predeploy`, and health at `/health`. In a Coolify context this is a Docker Compose stack. Medusa documents a Docker installation path ([Docker guide](https://docs.medusajs.com/learn/installation/docker)), and Coolify deploys Docker Compose resources ([Coolify docs](https://coolify.io/docs/applications/builds/docker-compose)).

---

## 7. Licensing, the dashboard's source, and deployment

- **MIT except Enterprise materials.** The repository LICENSE is MIT; `ENTERPRISE-LICENSE.md` carves out specific paths (RBAC, SSO/OIDC) requiring "a separate, valid commercial agreement with MedusaJS, Inc.", and says files outside the list remain MIT. The npm `license` field of the published packages is the non-SPDX string `SEE LICENSE IN LICENSE` ([LICENSE](https://raw.githubusercontent.com/medusajs/medusa/develop/LICENSE), [ENTERPRISE-LICENSE.md](https://raw.githubusercontent.com/medusajs/medusa/develop/ENTERPRISE-LICENSE.md), [`medusa-js-catalogue.md`](./medusa-js-catalogue.md) Summary).
- **The admin is open source and editable in source, with a documented limit.** It ships in the main repo (`packages/admin/dashboard`, npm `@medusajs/dashboard`) and can be extended with widgets and UI routes, but the docs forbid changing its layout, design, existing page content, or the Medusa logo ([admin](https://docs.medusajs.com/learn/fundamentals/admin)). "Editable in source" therefore means *you may fork it and own the fork*, not *Medusa supports restyling it*.
- **Self-hosting is first-class.** The docs ship a Docker installation guide, the deployment guide covers the general steps, and the package builds into `.medusa/server` for container images ([Docker guide](https://docs.medusajs.com/learn/installation/docker), [deployment](https://docs.medusajs.com/learn/deployment/general)). Coolify supports Docker Compose deployments, so eguidar's ADR-0020 host can run the stack ([Coolify docs](https://coolify.io/docs/applications/builds/docker-compose)).

---

## 8. Alternatives, one line each

| Tool | What it is | Can it sit on the existing Prisma/Postgres schema without owning it? |
|---|---|---|
| Refine | React meta-framework for admin UIs; a data provider adapts any REST/GraphQL API, so the schema stays wherever the API says it is | Yes ([data providers](https://refine.dev/docs/data/data-provider/)) |
| React Admin | Same model, 50+ shipped data providers, write one for your API; the admin is a client, never a database owner | Yes ([data providers](https://marmelab.com/react-admin/DataProviders.html)) |
| AdminJS | Resource-based admin panel with an official Prisma adapter, which binds to your Prisma models directly | Yes ([Prisma adapter](https://docs.adminjs.co/installation/adapters/prisma.md)) |
| Directus | Headless data platform that introspects an existing SQL database and layers REST/GraphQL and an admin app on it ("Skip data migrations and schema changes"); adds its own `_directus_*` tables | Yes, with those extra tables ([existing database](https://directus.io/features/existing-database), [docs](https://directus.com/docs/guides/data-model/collections#existing-database-tables)) |
| Payload | Code-first CMS; collections are defined in code and materialised in its own tables through a database adapter (Mongo/Postgres/SQLite) and its migration system | No ([database overview](https://payloadcms.com/docs/database/overview)) |
| Medusa | Full commerce backend: its own schema, its own migrations, its own Admin API; the admin points only at a Medusa application | No (§1, §2) |

**Trade-off summary.** If the goal is a third-party admin over the catalogue as it exists today, the database-owning class (Medusa, Payload) cannot sit on an existing schema, and the choice is between a code-defined admin over your own API (Refine, React Admin) and introspection-based admins (AdminJS over Prisma, Directus over the SQL schema). If the goal is to replace the bespoke catalogue backend entirely, Medusa is the only one of the six that brings orders, payments, fulfilment and inventory with it, at the migration cost in §6 and the domain gaps in §4.

---

## Open questions (not verified in this pass)

1. **Runtime city matching for shipping options.** Whether a `GeoZone` with a `city` actually resolves a shipping option for a cart whose address carries that city. The model and docs say the field exists, and no live check was run.
2. **Service zones via API only.** Confirming that the admin's "Manage areas" country list is the whole UI (no city/province editor) against a running 2.21.2.
3. **Better Auth plugin maturity.** `@nualt/medusa-plugin-better-auth@0.1.1` against Medusa 2.21.x, and whether its admin integration survives a Medusa minor.
4. **Coolify resource cost.** Measured RAM and CPU for Postgres, Redis, the server and the worker on the target host (ADR-0020).

## Sources

**Medusa documentation** (retrieved 15 October 2026): [medusa-config](https://docs.medusajs.com/learn/configurations/medusa-config), [admin](https://docs.medusajs.com/learn/fundamentals/admin), [admin widgets](https://docs.medusajs.com/learn/fundamentals/admin/widgets), [admin UI routes](https://docs.medusajs.com/learn/fundamentals/admin/ui-routes), [API routes](https://docs.medusajs.com/learn/fundamentals/api-routes), [modules](https://docs.medusajs.com/learn/fundamentals/modules), [module links](https://docs.medusajs.com/learn/fundamentals/module-links), [deployment](https://docs.medusajs.com/learn/deployment/general), [worker mode](https://docs.medusajs.com/learn/production/worker-mode), [installation](https://docs.medusajs.com/learn/installation), [Docker](https://docs.medusajs.com/learn/installation/docker), [custom CLI scripts](https://docs.medusajs.com/learn/fundamentals/custom-cli-scripts/seed-data), [admin auth how-to](https://docs.medusajs.com/resources/how-to-tutorials/how-to/admin/auth), [payment providers](https://docs.medusajs.com/resources/commerce-modules/payment/payment-provider), [fulfillment concepts](https://docs.medusajs.com/resources/commerce-modules/fulfillment/concepts), [GeoZone model](https://docs.medusajs.com/resources/references/fulfillment/models/GeoZone), [ServiceZone model](https://docs.medusajs.com/resources/references/fulfillment/models/ServiceZone), [tax-inclusive pricing](https://docs.medusajs.com/resources/commerce-modules/pricing/tax-inclusive-pricing), [promotion concepts](https://docs.medusajs.com/resources/commerce-modules/promotion/concepts), [reservations lifecycle](https://docs.medusajs.com/resources/commerce-modules/inventory/reservations-lifecycle), [auth providers](https://docs.medusajs.com/resources/commerce-modules/auth/auth-providers), [auth route](https://docs.medusajs.com/resources/commerce-modules/auth/authentication-route), [auth provider reference](https://docs.medusajs.com/resources/references/auth/provider), [search module](https://docs.medusajs.com/resources/infrastructure-modules/search), [search providers](https://docs.medusajs.com/resources/infrastructure-modules/search/providers), [deprecated Meilisearch guide](https://docs.medusajs.com/resources/integrations/guides/meilisearch), [Shopify migration](https://docs.medusajs.com/learn/introduction/build-with-llms-ai/docs-mcp-server/migrate-from-shopify), [Magento migration](https://docs.medusajs.com/resources/integrations/guides/magento), [S3 file provider](https://docs.medusajs.com/resources/infrastructure-modules/file/s3). User guide (retrieved 15 October 2026): [products](https://docs.medusajs.com/user-guide/products), [import](https://docs.medusajs.com/user-guide/products/import), [locations & shipping](https://docs.medusajs.com/user-guide/settings/locations-and-shipping/locations), [create promotion](https://docs.medusajs.com/user-guide/promotions/create), [returns](https://docs.medusajs.com/user-guide/orders/returns).

**Medusa repository / npm** (retrieved 15 October 2026): [release v2.21.2](https://github.com/medusajs/medusa/releases/tag/v2.21.2), [registry.npmjs.org/@medusajs/medusa](https://registry.npmjs.org/@medusajs/medusa), [registry.npmjs.org/@medusajs/dashboard](https://registry.npmjs.org/@medusajs/dashboard), [LICENSE](https://raw.githubusercontent.com/medusajs/medusa/develop/LICENSE), [ENTERPRISE-LICENSE.md](https://raw.githubusercontent.com/medusajs/medusa/develop/ENTERPRISE-LICENSE.md), [@nualt/medusa-plugin-better-auth](https://registry.npmjs.org/@nualt%2Fmedusa-plugin-better-auth/latest).

**Alternatives** (retrieved 15 October 2026): [Refine data providers](https://refine.dev/docs/data/data-provider/), [React Admin data providers](https://marmelab.com/react-admin/DataProviders.html), [AdminJS Prisma adapter](https://docs.adminjs.co/installation/adapters/prisma.md), [Directus existing database](https://directus.io/features/existing-database), [Directus collections docs](https://directus.com/docs/guides/data-model/collections#existing-database-tables), [Payload database overview](https://payloadcms.com/docs/database/overview), [Coolify Docker Compose](https://coolify.io/docs/applications/builds/docker-compose).

**In-repo** (retrieved 15 October 2026): [`docs/research/medusa-js-catalogue.md`](./medusa-js-catalogue.md) (retrieved 6 October 2026; pinned `v2.21.2`).
