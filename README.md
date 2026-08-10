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

Le compte admin par défaut est créé par le seed (`ADMIN_EMAIL` / `ADMIN_PASSWORD` dans `.env`). Les fournisseurs Google/Apple, Turnstile et Resend fonctionnent dès que leurs clés sont renseignées dans `.env`.

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
