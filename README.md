# Eguidar

Boutique en ligne d'électronique (inspirée d'Amazon) avec panneau d'administration — français, MAD, TVA 20 % incluse, paiement à la livraison (COD).

Stack : Next.js 16 App Router, React 19, Tailwind v4, shadcn/ui (Base UI), Prisma 7 + PostgreSQL, Better Auth, Meilisearch, Redis (cache), Resend (e-mails), Docker Compose.

## Mise en route

```bash
# 1. Services (Postgres, Redis, Meilisearch)
docker compose up -d

# 2. Configurer l'environnement
cp .env.example .env   # puis remplir les secrets (BETTER_AUTH_SECRET, ADMIN_PASSWORD, ...)

# 3. Schéma + données de démo
npx prisma migrate dev
npx prisma db seed

# 4. Lancer l'application
npm run dev
```

Le compte admin par défaut est créé par le seed (`ADMIN_EMAIL` / `ADMIN_PASSWORD` dans `.env`). Les fournisseurs Google et Facebook, Turnstile et Resend fonctionnent dès que leurs clés sont renseignées dans `.env` : `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` et `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET` pour la Connexion sociale.

Un assistant interactif complète l'étape 2 : `bash scripts/setup-providers.sh` guide la création du widget Cloudflare Turnstile, restaure les variables de base de test (`TEST_DB_NAME`, `TEST_DATABASE_URL`) dans `.env`, et applique la règle de cycle de vie R2 des Brouillons d'Image produit.

Les images produits sont envoyées vers Cloudflare R2 via des URLs pré-signées : renseigner `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` et `R2_PUBLIC_URL` dans `.env`. La recherche (Meilisearch) est ré-indexée automatiquement à chaque enregistrement ou suppression d'un produit.

## Expiration des Brouillons d'Image produit

Une image téléversée pendant l'édition d'un Produit devient un **Brouillon d'Image produit** : son objet R2 vit sous le préfixe réservé `products/brouillons/`, son expiration est portée par `RETENTION_BROUILLON_IMAGE_PRODUIT_H` (24 h par défaut), et son état est enregistré en base. Le registre est l'unique source de vérité de cet état : il refuse toute revendication à partir de l'instant exact de l'expiration et n'essaie jamais de supprimer l'objet lui-même.

L'expiration hors bande, elle, est une configuration du fournisseur, versionnée dans [`infra/regle-cycle-vie-r2.json`](infra/regle-cycle-vie-r2.json) : une seule règle, sur le seul préfixe `products/brouillons/`, expire les objets après 1 jour. Aucun worker, aucune file, aucun planificateur. Cette règle n'est retypée nulle part : `infra/regle-cycle-vie-r2.ts` dérive le préfixe de `lib/r2.ts` et la rétention du module de cycle de vie, et `infra/regle-cycle-vie-r2.test.ts` échoue si le fichier JSON ne correspond plus, ou si une règle à préfixe vide venait s'y glisser — une telle règle expirerait les Images produit persistées du Catalogue.

Pour la déployer, l'étape « R2 lifecycle » de `bash scripts/setup-providers.sh` fait un `PUT` du corps `rules` de l'artefact sur l'API Cloudflare, puis relit la configuration vivante et la compare au fichier.

**L'API Cloudflare remplace l'ensemble des règles du bucket** : il n'y a pas de création par règle. Relancer l'étape converge donc vers l'artefact au lieu d'empiler des règles, mais un `PUT` supprimerait aussi toute règle déjà présente que l'artefact ne décrit pas. L'étape relit les règles vivantes avant d'écrire, affiche celles qu'elle s'apprête à supprimer et demande une seconde confirmation explicite ; elle refuse aussi d'agir si `R2_BUCKET` dans `.env` ne désigne pas le bucket de l'artefact. Sur un bucket partagé, préférez le formulaire du tableau de bord, qui ajoute la règle sans toucher aux autres. Le même appel, à la main :

```bash
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/$R2_ACCOUNT_ID/r2/buckets/$R2_BUCKET/lifecycle" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary '{"rules":[{"id":"brouillons-image-produit","enabled":true,"prefix":"products/brouillons/","expire":{"days":1}}]}'
```

**La règle doit porter la même rétention que l'application.** Une règle plus courte supprime le fichier d'un Brouillon que l'application juge encore revendicable : l'enregistrement du Produit échoue alors sur une image que l'éditeur croyait pouvoir sauvegarder. Une règle plus longue ne casse rien de fonctionnel — le registre refuse déjà la revendication au-delà de `RETENTION_BROUILLON_IMAGE_PRODUIT_H` — mais elle laisse des octets orphelins. R2 n'exprimant l'expiration qu'en jours entiers, la règle est toujours arrondie au jour supérieur.

## Tests

Les tests utilisent une base PostgreSQL séparée (`eguidar_test`, créée automatiquement par Docker au premier démarrage) — jamais la base de développement.

```bash
npm test          # exécution unique (migrations appliquées automatiquement)
npm run test:watch
```

## Scripts

| Commande | Description |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` / `start` | Build et serveur de production |
| `npm run typecheck` | Vérification TypeScript |
| `npm run lint` | ESLint |
| `npm test` | Tests vitest (unitaires + intégration) |
| `npx prisma db seed` | Données de démo (idempotent) |
