# Term map — the English word to the French module

The repository speaks French and most prompts do not. This table is the shortest path from the word an agent has to the module that owns it: the English word on the left, the French term the code and [`GLOSSARY.md`](../GLOSSARY.md) use, and the path to read first.

[`GLOSSARY.md`](../GLOSSARY.md) owns the definition. This file owns the route. Every path below is checked by [`test/carte-des-termes.test.ts`](../test/carte-des-termes.test.ts): a module that moves must move here in the same change.

## Cart and order

| English | Français | Owning path |
| --- | --- | --- |
| cart | Panier | [`lib/panier.ts`](../lib/panier.ts) — the server read and write |
| cart core | Panier (cœur) | [`lib/panier-coeur.ts`](../lib/panier-coeur.ts) — the pure store, no Prisma |
| quote | Devis | [`lib/use-cases/devis.ts`](../lib/use-cases/devis.ts) — the one quote read |
| delivery city | Ville de livraison | [`lib/use-cases/livraison.ts`](../lib/use-cases/livraison.ts) — cities, fees and the free-shipping settings |
| shipping fee | Frais de livraison | [`lib/use-cases/livraison-prix.ts`](../lib/use-cases/livraison-prix.ts) — fee and threshold computation |
| order | Commande | [`lib/use-cases/orders.ts`](../lib/use-cases/orders.ts) — checkout, lifecycle and status change; [`lib/use-cases/commande.ts`](../lib/use-cases/commande.ts) — the stock seam |
| order status | Statut de commande | [`lib/statut-de-commande.ts`](../lib/statut-de-commande.ts) — transitions and labels |

## Money and returns

| English | Français | Owning path |
| --- | --- | --- |
| payment received | Encaissement | [`lib/use-cases/remboursements.ts`](../lib/use-cases/remboursements.ts) — the target of a refund; `updateOrderStatus` writes it when a Commande is marked Livrée in [`lib/use-cases/orders.ts`](../lib/use-cases/orders.ts) |
| refund | Remboursement | [`lib/use-cases/remboursements.ts`](../lib/use-cases/remboursements.ts) — the write; the expected amount is [`lib/remboursements.ts`](../lib/remboursements.ts) |
| return | Retour | [`lib/use-cases/retours.ts`](../lib/use-cases/retours.ts) — declare, refuse, receive |
| return reason | Motif de Retour et Code de refus | [`lib/retours.ts`](../lib/retours.ts) — the closed vocabularies |
| revenue | Chiffre d'affaires | [`lib/use-cases/admin-dashboard.ts`](../lib/use-cases/admin-dashboard.ts) — the dashboard read |
| money | Montant | [`lib/money.ts`](../lib/money.ts) — cents, formatting, parsing |

## Catalogue

| English | Français | Owning path |
| --- | --- | --- |
| product, write | Produit | [`lib/use-cases/admin-catalog.ts`](../lib/use-cases/admin-catalog.ts) — create, update, delete, bulk |
| catalogue, storefront read | Catalogue, Boutique | [`lib/use-cases/storefront.ts`](../lib/use-cases/storefront.ts) — home, category and product-page reads |
| product card | Carte produit | [`lib/carte-produit.ts`](../lib/carte-produit.ts) — the projection and the Produit URL |
| structure, write | Structure | [`lib/use-cases/admin-structure.ts`](../lib/use-cases/admin-structure.ts) — create, move, delete |
| structure, read | Lecture de la Structure | [`lib/use-cases/lecture-structure.ts`](../lib/use-cases/lecture-structure.ts) — the one server read |
| structure walk | Marche de la Structure | [`lib/marche-structure.ts`](../lib/marche-structure.ts) — ancestry and descent, no database |
| import batch | Lot d'import | [`lib/use-cases/import-produits.ts`](../lib/use-cases/import-produits.ts) — upload, verify, apply |
| product image | Image produit | [`lib/images-produit/cycle-vie.ts`](../lib/images-produit/cycle-vie.ts) — drafts, promotion, retention |
| image storage | stockage des Images produit | [`lib/images-produit/r2.ts`](../lib/images-produit/r2.ts) — the R2 port and its keys |

## Search

| English | Français | Owning path |
| --- | --- | --- |
| search | Recherche | [`lib/use-cases/search.ts`](../lib/use-cases/search.ts) — results and suggestions |
| search engine | Moteur de recherche | [`lib/moteur-recherche.ts`](../lib/moteur-recherche.ts) — the neutral port |
| search filter | Filtre de recherche | [`lib/filtre-de-recherche.ts`](../lib/filtre-de-recherche.ts) — the filter grammar |
| index document | Document d'index | [`lib/index-projection.ts`](../lib/index-projection.ts) — the indexable product |

## Account and authentication

| English | Français | Owning path |
| --- | --- | --- |
| session | Session courante | [`lib/use-cases/session-courante.ts`](../lib/use-cases/session-courante.ts) — the one session read |
| last login method | Moyen de connexion | [`lib/moyen-de-connexion.ts`](../lib/moyen-de-connexion.ts) — the shared vocabulary, cookie name and display rule |
| sign in, sign up | Connexion, Inscription | [`components/auth/auth-dialogs.tsx`](../components/auth/auth-dialogs.tsx) — the modals, on every storefront page |
| authentication refusal | Refus d'authentification | [`lib/refus-authentification.ts`](../lib/refus-authentification.ts) — codes and French sentences |
| security check | Test de sécurité | [`lib/test-de-securite.ts`](../lib/test-de-securite.ts) — Turnstile and the protected sends |
| profile | Compte client | [`lib/use-cases/account.ts`](../lib/use-cases/account.ts) — the client's profile |
| authentication pathways | les sept voies | [`docs/auth-pathways.md`](auth-pathways.md) — the normative declaration |

## Content and automation

| English | Français | Owning path |
| --- | --- | --- |
| announcement | Annonce | [`lib/use-cases/storefront.ts`](../lib/use-cases/storefront.ts) — the site-wide storefront ribbon read; [`components/storefront/ruban-annonce.tsx`](../components/storefront/ruban-annonce.tsx) — the storefront ribbon |
| blog | Blog | [`lib/use-cases/blog.ts`](../lib/use-cases/blog.ts) — landing, article, related articles |
| after-write | Après-écriture | [`lib/apres-ecriture.ts`](../lib/apres-ecriture.ts) — the one declaration per Administration write |
| automation | Automatisation | [`lib/automations/executeur.ts`](../lib/automations/executeur.ts) — the worker that claims and executes |
| automation rule | Règle d'automatisation | [`lib/automations/regles.ts`](../lib/automations/regles.ts) — the trigger → condition → action registry |
| cache invalidation | Invalidation du cache | [`lib/use-cases/cache-invalidation.ts`](../lib/use-cases/cache-invalidation.ts) — tags, revalidation, edge purge |
| order email | E-mail de commande | [`lib/emails/index.ts`](../lib/emails/index.ts) — sending; the letters are [`lib/emails/lettres-commande.ts`](../lib/emails/lettres-commande.ts) |

## Data

| English | Français | Owning path |
| --- | --- | --- |
| prisma client | client Prisma | [`lib/generated/prisma/client.ts`](../lib/generated/prisma/client.ts) — generated; `prisma generate` writes it |
| database schema | Schéma Prisma | [`prisma/schema.prisma`](../prisma/schema.prisma) — tables, enums and indexes |
