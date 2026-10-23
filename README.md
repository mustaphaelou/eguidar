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

## Construire avec le catalogue

Le build prérend des documents à partir du catalogue qu’il lit à la construction. `npm run build` commence donc par un preflight (`scripts/verifier-catalogue-de-build.ts`) : il ouvre `DATABASE_URL` avec un délai court, compte les produits, catégories et articles publiés, et s’arrête avec `ECHEC : catalogue — …` si la base est absente ou injoignable. Un catalogue joignable mais vide n’échoue pas : le build continue, et les routes dynamiques rendront le paramètre de repli de `lib/parametre-de-repli.ts`. En local, `DATABASE_URL` vient de `.env`.

En Docker, la crédential est un secret BuildKit monté pour le seul `RUN` du build, jamais un `ARG` ni un `ENV` : elle n’entre dans aucune couche et n’apparaît pas dans `docker history`. Le contexte de construction exclut `.env` et `.env.*`, donc le secret ne peut pas non plus arriver par un fichier.

| Build | Crédential | Où elle est définie |
| --- | --- | --- |
| Local | `DATABASE_URL` | `.env` |
| CI (job `build`) | `DATABASE_URL` vers `eguidar_probe` | base éphémère du job, migrée et semée ; aucun secret de dépôt |
| Coolify | `DATABASE_URL_BUILD`, en lecture seule | environnement du processus Compose, livré au build par `secrets: database_url` |

La CI migre et sème `eguidar_probe`, puis passe son URL au build hôte par `DATABASE_URL`. L’image reçoit la même valeur par l’input `secrets` de `docker/build-push-action` — sous l’identifiant `database_url` — et `add-hosts: host.docker.internal:host-gateway` laisse le conteneur de build joindre la base publiée sur l’hôte. Rien de tout cela ne lit un secret de dépôt (ADR-0020).

Pour Coolify, `docker-compose.yml` déclare `build.secrets: [database_url]`, dont la source est `database_url: environment: DATABASE_URL_BUILD` : la valeur n’est jamais écrite dans le fichier. `build.network: host` laisse le build joindre la base publiée sur `127.0.0.1:5433` par le service `postgres` ; renseignez donc `DATABASE_URL_BUILD` avec une crédential **en lecture seule** et une URL joignable depuis le réseau de l’hôte. L’injection des secrets de build Compose par Coolify reste à vérifier au premier déploiement : si elle manque, le build s’arrête en nommant le catalogue, et #763 inscrit alors le repli (pas de prérendu, génération à la demande) dans l’ADR.

## Vérifier l’image de déploiement

La CI construit les deux cibles que Coolify déploie — `runner` et `migrate` — puis sonde l’artefact. La même commande tourne en local, contre les images qu’on vient de construire :

```bash
# 1. Services (Postgres, Redis, Meilisearch)
docker compose up -d postgres redis meilisearch

# 2. Les deux cibles, chargées dans le démon local. Le build de la runner lit
#    le catalogue : l'URL voyage en secret BuildKit, et --network host laisse
#    le conteneur de build joindre la base publiée sur 127.0.0.1:5433.
DATABASE_URL=postgresql://eguidar:eguidar@127.0.0.1:5433/eguidar_test \
  docker build --network host --secret id=database_url,env=DATABASE_URL \
    --target runner -t eguidar-runner:local .
docker build --target migrate -t eguidar-migrate:local .

# 3. La sonde, pointée sur la base de test
IMAGE_RUNNER=eguidar-runner:local \
IMAGE_MIGRATE=eguidar-migrate:local \
DATABASE_URL=postgresql://eguidar:eguidar@localhost:5433/eguidar_test \
MEILI_URL=http://localhost:7700 \
MEILI_MASTER_KEY=meili-dev-master-key \
REDIS_URL=redis://localhost:6379 \
ADMIN_NAME=Administrateur \
ADMIN_EMAIL=admin@eguidar.com \
ADMIN_PASSWORD=change-me-admin-password \
BETTER_AUTH_SECRET=replace-with-a-long-random-secret \
bash scripts/verifier-image-deploiement.sh
```

**Un build `standalone` recopie les fichiers d’environnement dans sa sortie.** Next.js copie `.env` et `.env.production` dans `.next/standalone` : un build lancé sur une machine qui porte de vrais secrets les embarque, et la cible `runner` recopie ensuite tout `.next/standalone` (`COPY --from=builder /app/.next/standalone ./`). C’est pourquoi `.dockerignore` exclut `.env` et `.env.*` : l’image ne se construit qu’à partir d’un contexte sans secret. Un artefact `standalone` produit hors Docker ne doit donc voyager que depuis un environnement de construction **sans secret** — les secrets s’injectent à l’exécution — et `.next/standalone` reste jetable : ne le conservez pas et ne le copiez jamais hors de la machine de build.

**La sonde migre et sème la base que `DATABASE_URL` désigne** : pointez-la sur `eguidar_test`, jamais sur la base de développement. Elle ne construit aucune image et ne démarre aucun service ; elle exige les trois services et les deux images déjà là. Ses conteneurs sortent en réseau hôte et joignent les services par `localhost` (Docker Engine sous Linux ; le réseau hôte de macOS est hors périmètre). Le port de la sonde est 3100, pour ne pas croiser un `npm run dev` resté sur 3000.

Les variables requises sont `IMAGE_RUNNER`, `IMAGE_MIGRATE`, `DATABASE_URL`, `MEILI_URL`, `MEILI_MASTER_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` et `BETTER_AUTH_SECRET` : la première absente est nommée, et la sonde s’arrête avant tout appel à Docker. Les optionnelles sont `REDIS_URL`, `BETTER_AUTH_URL` (défaut `http://localhost:3100`), `PROBE_PORT` (défaut 3100), `PROBE_TIMEOUT` (défaut 90 secondes) et `ADMIN_NAME`.

Ses neuf phases, dans l’ordre : preflight, secrets (ni `DATABASE_URL` dans l’historique de l’image, ni dans son environnement figé, ni dans son environnement d’exécution), migration, faits du seed, seconde migration, comptes inchangés, import du cache-handler dans l’image `runner`, mise en service, surface HTTP (accueil 200, un actif `/_next/static/` 200, `/admin` 307). Un échec s’annonce par `ECHEC : <phase> — <cause>`, suivi des dernières lignes du conteneur.

## Crochet pre-commit

Le dépôt embarque un crochet qui refuse un commit dont **les fichiers indexés** ne respectent pas la configuration Prettier — et rien d'autre. Ni lint, ni types, ni tests, ni build. Il porte sur le format seul, et son refus ne réécrit rien : ni `git add`, ni fichier touché dans votre dos.

Il vit dans `.githooks/pre-commit`, et **`npm install` le branche** : `npm run prepare` fait pointer `core.hooksPath` sur `.githooks`. Un clone neuf l'a donc dès qu'il a installé ses dépendances, sans qu'on ait à s'en souvenir. Pour le brancher à la main, ou le rebrancher après qu'un autre réglage a pris la place :

```bash
git config core.hooksPath .githooks
```

Pour revenir en arrière : `git config --unset core.hooksPath`. **Il ne protège que le clone où il est branché** — un clone qui n'a jamais installé ses dépendances n'en a pas — et c'est précisément pour cela que **la CI reste la porte qui fait autorité** : elle rejoue la même vérification sur chaque demande de fusion, crochet installé ou pas. Un commit refusé par le crochet reste donc poussable ; il ne s'agit que d'un écho, pas d'un verrou. Un crochet privé de son bit d'exécution est ignoré tout aussi silencieusement.

Quand le crochet refuse, il nomme le fichier fautif et s'arrête là. Le correctif reste le vôtre :

```bash
npm run format   # corrige l'arbre
git add -u       # on réindexe
```

## Scripts

| Commande | Description |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` / `start` | Build et serveur de production |
| `npm run typecheck` | Vérification TypeScript |
| `npm run lint` | ESLint |
| `npm test` | Tests vitest (unitaires + intégration) |
| `npm run format` | Met le code TypeScript et TSX en forme (écriture) |
| `npm run format:check` | Signale les fichiers mal formés, sans les toucher (lecture) |
| `npx prisma db seed` | Données de démo (idempotent) |
