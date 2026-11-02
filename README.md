# Eguidar

**La boutique en ligne d'électronique au Maroc.** Catalogue, panier, commande en paiement à la livraison (COD) et une Administration complète — en français, en dirhams marocains, TVA 20 % incluse.

[![Next.js](https://img.shields.io/badge/Next.js-16.4-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org) [![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=black)](https://react.dev) [![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io) [![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org) [![Licence MIT](https://img.shields.io/badge/licence-MIT-22c55e)](LICENSE)

![Page d'accueil d'eguidar.com](docs/screenshots/accueil.png)

> Les captures de ce README sont prises sur une instance locale de démonstration (`npx prisma db seed`), avec deux commandes saisies pour l'exemple ; les noms, adresses et coordonnées y sont floutés.

## Sommaire

- [Aperçu](#aperçu)
- [Fonctionnalités](#fonctionnalités)
- [Stack](#stack)
- [Architecture](#architecture)
- [Démarrer](#démarrer)
- [Qualité](#qualité)
- [Exploitation](#exploitation)
  - [Images produits et Brouillons d'Image](#images-produits-et-brouillons-dimage)
  - [Cache et purge de l'edge](#cache-et-purge-de-ledge)
  - [Build et déploiement](#build-et-déploiement)
- [Scripts](#scripts)
- [Licence](#licence)

## Aperçu

Le parcours va du catalogue à la confirmation de commande, sans paiement en ligne : le client règle en espèces à la livraison. L'habillage reprend celui d'apple.com — une seule couleur d'accent, un thème clair unique, et le [Voile dépoli](GLOSSARY.md) pour les surfaces flottantes.

### La boutique

<table>
  <tr>
    <td width="50%" align="center" valign="top">
      <a href="docs/screenshots/catalogue.png"><img src="docs/screenshots/catalogue.png" alt="Catalogue" width="100%"></a><br>
      <sub><b>Catalogue</b> — recherche Meilisearch, facettes marque / catégorie / prix, tri.</sub>
    </td>
    <td width="50%" align="center" valign="top">
      <a href="docs/screenshots/produit.png"><img src="docs/screenshots/produit.png" alt="Fiche produit" width="100%"></a><br>
      <sub><b>Fiche produit</b> — variantes, prix TTC, stock et ajout au panier.</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center" valign="top">
      <a href="docs/screenshots/panier.png"><img src="docs/screenshots/panier.png" alt="Panier" width="100%"></a><br>
      <sub><b>Panier</b> — quantités, devis par ville, livraison offerte.</sub>
    </td>
    <td width="50%" align="center" valign="top">
      <a href="docs/screenshots/confirmation.png"><img src="docs/screenshots/confirmation.png" alt="Confirmation de commande" width="100%"></a><br>
      <sub><b>Confirmation</b> — adresse, frais de livraison et total à payer à la livraison.</sub>
    </td>
  </tr>
</table>

### L'Administration

<table>
  <tr>
    <td width="50%" align="center" valign="top">
      <a href="docs/screenshots/admin-tableau-de-bord.png"><img src="docs/screenshots/admin-tableau-de-bord.png" alt="Tableau de bord de l'Administration" width="100%"></a><br>
      <sub><b>Tableau de bord</b> — chiffre d'affaires encaissé, commandes à traiter, stock faible.</sub>
    </td>
    <td width="50%" align="center" valign="top">
      <a href="docs/screenshots/admin-produits.png"><img src="docs/screenshots/admin-produits.png" alt="Liste des produits" width="100%"></a><br>
      <sub><b>Produits</b> — liste filtrable, tri, actions groupées, mise en avant.</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center" valign="top">
      <a href="docs/screenshots/admin-produit.png"><img src="docs/screenshots/admin-produit.png" alt="Édition d'un produit" width="100%"></a><br>
      <sub><b>Édition d'un produit</b> — stock rapide, variantes, images, mise en avant.</sub>
    </td>
    <td width="50%" align="center" valign="top">
      <a href="docs/screenshots/admin-commande.png"><img src="docs/screenshots/admin-commande.png" alt="Détail d'une commande" width="100%"></a><br>
      <sub><b>Commande</b> — client, livraison, articles et transitions de statut.</sub>
    </td>
  </tr>
</table>

### Sur mobile

<table>
  <tr>
    <td width="33%" align="center" valign="top">
      <a href="docs/screenshots/mobile-accueil.png"><img src="docs/screenshots/mobile-accueil.png" alt="Accueil sur mobile" width="100%"></a><br>
      <sub><b>Accueil</b> — mise en avant plein écran, navigation minimale.</sub>
    </td>
    <td width="33%" align="center" valign="top">
      <a href="docs/screenshots/mobile-catalogue.png"><img src="docs/screenshots/mobile-catalogue.png" alt="Catalogue sur mobile" width="100%"></a><br>
      <sub><b>Catalogue</b> — grille deux colonnes, filtres et tri.</sub>
    </td>
    <td width="33%" align="center" valign="top">
      <a href="docs/screenshots/mobile-produit.png"><img src="docs/screenshots/mobile-produit.png" alt="Fiche produit sur mobile" width="100%"></a><br>
      <sub><b>Fiche produit</b> — variantes et barre d'achat fixe.</sub>
    </td>
  </tr>
</table>

## Fonctionnalités

### Boutique

- **Catalogue** — catégories en arbre, produits et variantes (prix, stock), produits mis en avant, livraison offerte par produit.
- **Recherche** — Meilisearch : suggestions dès la frappe, facettes marque / catégorie / prix, tri par pertinence, prix ou nouveauté.
- **Panier** — cookie visiteur (30 jours, 20 articles) rejoué dans le panier du Compte à la connexion ; aperçu latéral, quantités, retrait par glissement.
- **Devis** — frais de livraison par Ville, seuil de livraison offerte, total à payer calculé côté serveur puis persisté avec la Commande.
- **Commande** — paiement à la livraison uniquement ; adresse, téléphone, Ville ; confirmation et e-mails transactionnels (Resend).
- **Compte client** — e-mail et mot de passe, Google ou Facebook ; vérification par code, réinitialisation, profil et historique des commandes.
- **Contenu** — blog, FAQ, à propos, contact, conditions et page de suppression des données.
- **Mobile** — barre d'achat fixe, filtres en feuille et gestes tactiles ; thème clair unique.

### Administration

- **Tableau de bord** — chiffre d'affaires encaissé, commandes, en attente, stock faible, points de vigilance et commandes récentes.
- **Commandes** — recherche, filtre par statut, détail, transitions de statut ; l'annulation et le retour réapprovisionnent le stock.
- **Produits** — liste filtrable et triable, actions groupées (Structure, mise en avant, livraison offerte, stock), édition avec stock rapide, variantes et images.
- **Catégories** — arbre du catalogue, sous-catégories, déplacement et ordre.
- **Villes et Livraison** — les villes desservies, leurs frais et le seuil de livraison offerte.
- **Médias** — bibliothèque d'images produit, textes alternatifs et usages.
- **Automatisations** — Règles déclencheur → condition → action, exécutions durables sur pg-boss (confirmation, e-mail de statut, indexation).
- **Sécurité** — accès réservé au rôle admin, session admin à 24 h, verrou de connexion par adresse après dix échecs, jetons fournisseur chiffrés au repos.

## Stack

| Couche | Technologie | Rôle |
| --- | --- | --- |
| Application | Next.js 16 (App Router, RSC, Cache Components) | Pages, rendu serveur, Server Actions |
| Interface | React 19, Tailwind CSS 4, shadcn/ui (Base UI), Hugeicons | Composants, styles, icônes |
| Données | Prisma 7, PostgreSQL 16 | Schéma, migrations, seed |
| Authentification | Better Auth (e-mail / mot de passe, OAuth, OTP, Turnstile) | Comptes, sessions, rôles |
| Recherche | Meilisearch 1.52 | Index `products`, facettes, suggestions |
| Cache et files | Redis 7, pg-boss | Cache Next, limiteurs, Automatisations durables |
| E-mails | Resend | Codes de vérification, confirmations, statuts |
| Images | Cloudflare R2 et URLs pré-signées | Téléversement direct, Brouillons d'Image |
| Edge | Cloudflare Cache Rules et purge | Documents au PoP, purge au déploiement |
| Déploiement | Docker Compose, Coolify, GitHub Actions | Images `runner` et `migrate`, CI |

## Architecture

Eguidar est une application Next.js unique. Les pages sont des Server Components ; les lectures et écritures métier vivent dans `lib/use-cases/`, et les composants client ne reçoivent que des types et des ports.

```text
app/
├── (boutique)/        # la boutique : accueil, catalogue, panier, commande…
├── admin/             # l'Administration, protégée par un gate de session
└── api/               # auth, panier, recherche, pré-signature R2
components/            # kit UI, composants boutique, admin et auth
lib/
├── use-cases/         # lectures et écritures métier (la couture serveur)
├── generated/prisma/  # client Prisma généré
├── panier.ts          # Panier
└── meili.ts           # adaptateur Meilisearch
prisma/                # schéma, migrations, seed
infra/                 # artefacts Cloudflare versionnés et contrat de la Porte
scripts/               # checks, assistant fournisseurs, sondes
docs/adr/              # décisions d'architecture
GLOSSARY.md            # vocabulaire du domaine
```

Le cycle d'une Commande, du Panier au chiffre d'affaires :

```mermaid
flowchart LR
  panier["Panier"] --> devis["Devis par Ville"]
  devis --> commande["Commande COD"]
  commande --> statut{"Administration"}
  statut -->|Confirmer puis Expédier| expedition["Expédiée"]
  expedition -->|Marquer livrée| livree["Livrée — CA encaissé"]
  statut -->|Annuler ou Retourner| stock["Stock réapprovisionné"]
```

Quelques règles qui tiennent le dépôt :

- **Le domaine parle français.** `GLOSSARY.md` fixe le vocabulaire — Produit, Commande, Devis, Ville de livraison, Brouillon d'Image produit — et chaque ADR de `docs/adr/` garde une décision et ses alternatives.
- **Un fait n'a qu'un propriétaire.** Les artefacts d'infrastructure (`infra/*.json`) sont dérivés du code et un test échoue dès qu'ils divergent ; le domaine fait de même pour ses prix calculés et ses statuts.
- **La CI est la porte.** Cinq contextes — `build`, `format`, `lint`, `test`, `typecheck` — sont le contrat de fusion de `main`, et `bash scripts/checks.sh` rejoue la même liste en local.
- **Le flux de travail est écrit.** Les issues, le triage et le domaine sont décrits dans [`docs/agents/`](docs/agents/) ; les standards de code sont dans [`CODING_STANDARDS.md`](CODING_STANDARDS.md).

## Démarrer

### Prérequis

- Node.js 22 (le dépôt porte `.nvmrc`)
- npm
- Docker et Docker Compose

### Mise en route

```bash
git clone https://github.com/mustaphaelou/eguidar.git
cd eguidar

# 1. Dépendances (installe aussi le crochet pre-commit)
npm install

# 2. Environnement — remplissez les secrets (BETTER_AUTH_SECRET, ADMIN_PASSWORD…)
cp .env.example .env

# 3. Services : PostgreSQL 16, Redis 7, Meilisearch 1.52
docker compose up -d --wait postgres redis meilisearch

# 4. Base de test de `npm test` (une seule fois ; « already exists » est sans effet)
docker compose exec postgres createdb -U eguidar eguidar_test || true

# 5. Schéma et données de démonstration (idempotent)
npx prisma migrate dev
npx prisma db seed

# 6. Application
npm run dev
```

`docker compose up -d` sans noms de services démarrerait aussi `migrate`, `purge-edge` et `app` : la commande ci-dessus ne lance que les trois services dont le développement a besoin.

La boutique répond sur <http://localhost:3000> et l'Administration sur <http://localhost:3000/admin>, avec le compte créé par le seed (`ADMIN_EMAIL` / `ADMIN_PASSWORD` dans `.env`).

| Service | Adresse locale | Détail |
| --- | --- | --- |
| Application | `http://localhost:3000` | `npm run dev` |
| PostgreSQL | `127.0.0.1:5433` | bases `eguidar` et `eguidar_test` |
| Redis | `127.0.0.1:6379` | cache Next et limiteurs |
| Meilisearch | `http://localhost:7700` | index `products` |

Postgres est publié sur `127.0.0.1:5433`, et non sur 5432, pour ne pas entrer en conflit avec une instance locale. La base de test `eguidar_test` se crée une fois avec le `createdb` ci-dessus ; les tests ne touchent jamais la base de développement.

### Fournisseurs externes (facultatif)

La boutique démarre sans ces clés ; chacune active une fonction.

| Variables | Service | Effet |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET` | Connexion sociale | boutons Google et Facebook |
| `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile | protection des formulaires d'authentification |
| `RESEND_API_KEY`, `EMAIL_FROM` | Resend | e-mails transactionnels |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` | Cloudflare R2 | téléversement des images produit |
| `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_API_TOKEN` | Cloudflare | Cache Rules et purge de l'edge |

La Connexion sociale s'active avec les couples `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` et `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET` ; Turnstile et Resend dès que leurs clés sont renseignées dans `.env`.

Pour Facebook, l'application doit aussi déclarer l'URL de suppression des données — `https://<domaine>/api/facebook/suppression-donnees`, sur l'hôte de `BETTER_AUTH_URL` — comme « Data Deletion Request URL » dans le tableau de bord Meta (HTTPS public exigé). C'est le seul geste manuel de la suppression ; la route, sa signature et sa page d'état sont dans le dépôt (ADR-0046).

Un assistant interactif complète la configuration : `bash scripts/setup-providers.sh` guide la création du widget Cloudflare Turnstile, restaure les variables de base de test (`TEST_DB_NAME`, `TEST_DATABASE_URL`) dans `.env`, applique la règle de cycle de vie R2 des Brouillons d'Image produit, applique la politique CORS qui autorise le téléversement depuis l'Administration, et rend les documents de la boutique éligibles au cache de l'edge.

Les images produits sont envoyées vers Cloudflare R2 via des URLs pré-signées : renseigner les cinq variables `R2_*` dans `.env`. La recherche (Meilisearch) est ré-indexée automatiquement à chaque enregistrement ou suppression d'un produit.

## Qualité

Les cinq checks de la CI — `lint`, `format`, `typecheck`, `test`, `build` — s'exécutent d'un coup, dans l'ordre du flux :

```bash
bash scripts/checks.sh
```

### Tests

Les tests utilisent une base PostgreSQL séparée (`eguidar_test`, créée par le `createdb` de la mise en route) — jamais la base de développement.

```bash
npm test          # exécution unique (migrations appliquées automatiquement)
npm run test:watch
```

### La Porte de fusion

`main` n'accepte une fusion que par une pull request dont les cinq contextes requis sont verts et dont la branche est à jour. Cette **Porte de fusion** est un contrat versionné, `infra/porte-de-fusion.json` : les contextes `build`, `format`, `lint`, `test`, `typecheck` — triés —, une pull request exigée, une branche à jour avec `main`, aucune revue exigée et aucun contournement. Le contrat est la source de vérité, même quand GitHub ne peut pas l'appliquer.

Un test pur compare ce contrat aux noms de jobs de `.github/workflows/ci.yml`, dans les deux sens, à chaque passage de `npm test` : ajouter un job sans l'exiger, ou exiger un contexte qu'aucun job ne fournit, rend la CI rouge en nommant le contrat, le contexte et le correctif.

La lecture du ruleset vivant est un **docteur local**, jamais une garde de CI :

```bash
npm run porte:verifier
```

Il lit le ruleset du dépôt qui couvre `refs/heads/main` et le compare aux seuls faits du contrat ; les règles non liées, identifiants, versions et horodatages sont ignorés. Il est **vérificateur seul** : il n'applique jamais le contrat et n'écrit rien dans GitHub.

| Code | Sens                                              |
| ---- | ------------------------------------------------- |
| `0`  | le ruleset vivant est conforme au contrat         |
| `1`  | dérive : le docteur imprime chaque fait divergent |
| `2`  | ruleset illisible : ce n'est pas une dérive       |

Un `2` est le résultat honnête quand le plan GitHub, la visibilité du dépôt ou les droits du jeton ne permettent pas de lire les rulesets (`403`/`404`), ou quand aucun dépôt ou jeton n'est disponible : dans ces cas, le docteur nomme le remède — rendre le dépôt public, passer à un plan qui autorise les rulesets, fournir un jeton qui peut les lire (`GH_TOKEN`, ou une session `gh`), ou définir `GITHUB_REPOSITORY`. Les autres causes d'illisibilité — tentatives épuisées, réponse malformée, plusieurs rulesets couvrant `main` sans départage par le nom du contrat — sortent aussi `2` et impriment leur cause, sans promettre de remède. Un `2` n'est pas une porte absente et ne doit pas être traité comme un `0`.

Le docteur n'est pas dans `bash scripts/checks.sh` et aucun job de la CI ne l'appelle : la CI reste en `contents: read`, sans secret ni jeton d'administration. Il résout le dépôt par `GITHUB_REPOSITORY` ou la session `gh`, et le jeton par `GH_TOKEN` ou `gh auth token` — jamais le `GITHUB_TOKEN` de la CI. Le chemin `403`/`404` est prouvé par les tests à fixtures ; un poste dont la session `gh` lit un ruleset conforme sort `0`.

### Crochet pre-commit

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

## Exploitation

Ces mécanismes ne se voient pas depuis la boutique : ils rendent les images, le cache de l'edge et le déploiement sûrs et reproductibles.

### Images produits et Brouillons d'Image

Les images sont téléversées directement du navigateur vers Cloudflare R2, par URL pré-signée. Deux configurations du fournisseur les rendent possibles : l'expiration des Brouillons d'Image et la politique CORS du bucket.

#### Expiration des Brouillons d'Image produit

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

#### CORS du téléversement depuis l'Administration

Le PUT d'une Image produit est pré-signé : le navigateur envoie les octets directement à `<compte>.r2.cloudflarestorage.com`, une origine différente de celle de l'Administration. Le bucket doit donc répondre à la pré-vol CORS, sinon le navigateur bloque le PUT **sans aucune trace côté serveur** — un bucket neuf échoue à l'upload alors que tout le reste fonctionne.

La politique est versionnée dans [`infra/cors-r2.json`](infra/cors-r2.json) : une seule règle, les origines exactes de l'Administration (production et développement local), la seule méthode `PUT`, l'en-tête `content-type` et `ETag` exposé. [`infra/cors-r2.ts`](infra/cors-r2.ts) dérive ces origines de `site.url` et de la liste de développement, et [`infra/cors-r2.test.ts`](infra/cors-r2.test.ts) échoue si le JSON ne correspond plus, si une méthode ou un en-tête s'élargit, ou si une origine joker apparaissait.

L'étape « R2 CORS » de `bash scripts/setup-providers.sh` fait le `PUT` du corps `rules` de l'artefact, puis relit la politique vivante et la compare au fichier. Comme pour le cycle de vie, elle affiche les règles que l'artefact ne décrit pas et demande une seconde confirmation avant de les remplacer. Le même appel, à la main :

```bash
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/$R2_ACCOUNT_ID/r2/buckets/$R2_BUCKET/cors" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary '{"rules":[{"id":"televersement-administration","allowed":{"origins":["https://eguidar.com"],"methods":["PUT"],"headers":["content-type"]},"exposeHeaders":["ETag"],"maxAgeSeconds":3600}]}'
```

Un lien pré-signé expiré répond `403 ExpiredRequest` **sans en-têtes CORS** : le JavaScript ne peut pas lire la cause et voit un échec réseau. Le client renouvelle donc le lien une fois, puis rend le refus générique si la seconde tentative échoue aussi ; il ne tente jamais d'afficher un refus typé que le navigateur n'a pas pu lire.

### Cache et purge de l'edge

Deux mécanismes distincts gardent ce cache cohérent — les Cache Rules qui rendent un document éligible, et la purge qui retire les documents d'une image précédente avant qu'ils ne servent des chunks disparus.

#### Documents à l'edge (Cache Rules)

Un document de la boutique est le même pour tous les Visiteurs : Cloudflare peut le stocker au PoP le plus proche. Il ne le fait pas par défaut — « The Cloudflare CDN does not cache HTML or JSON by default » ([default cache behavior](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/)) — et la même URL répond pourtant deux choses différentes selon les en-têtes : un document HTML, ou un payload RSC pour la navigation client. La clé de cache de Cloudflare ignore `RSC` ; une entrée partagée entre les deux casserait la navigation d'une manière qui ressemble à un bug sans rapport.

La configuration de zone est versionnée dans [`infra/regle-cache-edge.json`](infra/regle-cache-edge.json), et `infra/regle-cache-edge.ts` la dérive de `HOTE_EDGE` ([`lib/zone-edge.ts`](lib/zone-edge.ts)) — jamais d'une seconde écriture du domaine. Deux règles, dans cet ordre :

1. **`rsc-et-prefetch-hors-cache`** contourne le cache dès que `RSC` ou `Next-Router-Prefetch` est présent.
2. **`documents-anonymes-eguidar`** rend le HTML de `eguidar.com` éligible au cache, en excluant `/api/`, `/_next/` et le repli `/__placeholder__` des trois routes dynamiques, et en niant les deux mêmes têtes.

Le repli `/__placeholder__` — le slug qu'une route dynamique rend quand le Catalogue est vide — répond un 404 qui porte `s-maxage`. La seconde règle nie explicitement tout chemin qui finit par ce segment, sur `/produit`, `/categorie` et `/blog` : ce 404 ne devient jamais une entrée partagée.

Le troisième point de la spécification est une absence : **aucune règle pour `/_next/image`**. Les images relèvent d'un autre ticket.

Les [Cache Rules s'empilent](https://developers.cloudflare.com/cache/how-to/cache-rules/order/) et **la dernière règle qui fixe un réglage l'emporte** : le contournement en premier ne suffit donc pas, et la seconde règle répète la négation de `RSC` et `Next-Router-Prefetch` dans sa propre expression. [`infra/regle-cache-edge.test.ts`](infra/regle-cache-edge.test.ts) échoue si l'une des deux expressions perd une tête, si l'ordre change, ou si une règle `/_next/image` apparaît.

Le TTL de la seconde règle vaut `bypass_by_default` : Cloudflare honore `s-maxage` quand l'origine l'envoie, et ne stocke rien quand elle n'envoie pas de `Cache-Control`. Un `Set-Cookie` ne peut pas être testé dans une expression de Cache Rules — ces expressions ne lisent que la requête. La sécurité vient du [mode de TTL](https://developers.cloudflare.com/cache/how-to/cache-rules/settings/) : avec `bypass_by_default` (ou `respect_origin`) et **aucun** TTL explicite, Cloudflare conserve `Set-Cookie` et ne met pas la réponse en cache ([cache behavior](https://developers.cloudflare.com/cache/concepts/cache-behavior/)). `override_origin` ou un `status_code_ttl` retireraient le cookie et cacheraient la réponse : le test interdit ces deux clés.

##### Appliquer

L'étape « Cache Rules (Documents à l'edge) » de `bash scripts/setup-providers.sh` fait le travail, après la règle R2 : elle lit le ruleset vivant, affiche toute règle que l'artefact ne décrit pas et demande une **seconde** confirmation explicite avant de la remplacer, valide le corps avec `?dry_run=true`, écrit l'entrypoint de la phase, puis relit et compare une projection des seuls champs rédigés (`id`, `version` et `last_updated` sont ajoutés par l'API). Il faut un jeton portant **Zone > Cache Rules > Edit** ; `CLOUDFLARE_API_TOKEN` et `CLOUDFLARE_ZONE_ID` sont lus dans `.env`. Sans l'un des deux, l'étape s'arrête **avant** le moindre appel à la zone.

Un `PUT` remplace **tout** l'entrypoint de la phase `http_request_cache_settings` : il n'y a pas de création règle par règle, et les règles que l'artefact ne décrit pas sont supprimées. Le même appel, à la main, sans retaper l'artefact :

```bash
node -e 'const a = require("./infra/regle-cache-edge.json"); process.stdout.write(JSON.stringify({ rules: a.rules }))' \
| curl -X PUT "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/rulesets/phases/http_request_cache_settings/entrypoint" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @-
```

##### Revenir en arrière

Un seul appel suffit, et l'étape imprime la commande avec l'identifiant du ruleset :

```bash
# supprime toutes les versions du ruleset de la phase
curl -X DELETE "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/rulesets/$RULESET_ID" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"

# ou vide le ruleset sans le supprimer
curl -X PUT "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/rulesets/phases/http_request_cache_settings/entrypoint" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary '{"rules":[]}'
```

##### Vérifier à la main

La vérification est **manuelle par nature** : la CI n'a ni jeton ni zone. Sur une URL prérendue, deux requêtes suffisent — la première remplit l'edge, la seconde doit répondre `cf-cache-status: HIT` :

```bash
curl -sSI https://eguidar.com/faq | grep -i cf-cache-status
curl -sSI https://eguidar.com/faq | grep -i cf-cache-status   # HIT
curl -sSI https://eguidar.com/produit/<slug-prérendu> | grep -i cf-cache-status
curl -sSI https://eguidar.com/produit/<slug-prérendu> | grep -i cf-cache-status   # HIT
```

Un payload n'est jamais un document : une requête portant `RSC: 1` (ou `Next-Router-Prefetch`) doit contourner le cache et ne jamais recevoir le HTML stocké :

```bash
curl -sSI -H 'RSC: 1' https://eguidar.com/faq | grep -i cf-cache-status   # jamais HIT
curl -sS  -H 'RSC: 1' https://eguidar.com/faq | head -c 120               # un payload RSC, jamais le HTML
```

`/faq` et les slugs prérendus répondent `HIT` ; `/produits` (qui lit `searchParams`) et les slugs inconnus restent des rendus d'origine : leur réponse ne porte pas de `s-maxage`, donc l'edge ne les stocke pas. Cette étape rend la zone **éligible** : la purge (déploiement, écriture admin) est un autre mécanisme, décrit dans la section suivante, et une réponse qui porte encore `Set-Cookie` ou `no-store` reste non stockée.

#### Purge de l'edge au déploiement

Chaque déploiement change l'identifiant de build, donc les noms de chunks de `/_next/static/`. Un document encore stocké au PoP référence alors des actifs que la nouvelle image ne sert plus : il ne doit pas être servi. La zone est donc entièrement purgée **avant** que le nouveau conteneur ne prenne le trafic.

L'ordre est porté par [`docker-compose.yml`](docker-compose.yml), pas par un champ de l'interface Coolify — pour un déploiement Docker Compose, seule la composition est honorée :

1. `migrate` termine ;
2. `purge-edge` s'exécute une fois et sort 0 ;
3. `app` démarre.

`purge-edge` est un service one-shot (`restart: "no"`) construit sur la cible `migrate` de l'image : elle copie tout le contexte, donc le script y est présent sans modifier la cible `runner`. Sa commande est `node scripts/purger-edge.mjs`, son `depends_on.migrate` porte `condition: service_completed_successfully`, et `app.depends_on.purge-edge` porte la même condition. L'application n'a **plus** de dépendance directe à `migrate` : ce serait une arête qui contourne la purge. [`purge-edge-deploiement.test.ts`](purge-edge-deploiement.test.ts) échoue si l'ordre change, si le service redevient facultatif, si la cible de build change, ou si une arête `app → migrate` réapparaît.

[`scripts/purger-edge.mjs`](scripts/purger-edge.mjs) est du JavaScript nu, sans build ni dépendance : il envoie un seul `POST` à `…/purge_cache` avec `{"purge_everything": true}`. C'est idempotent et sans état — relancer la purge est sans danger, et un déploiement ne purge qu'une fois. Le jeton et la zone sont les mêmes noms que ceux de la purge des écritures d'administration : `CLOUDFLARE_ZONE_ID` et `CLOUDFLARE_API_TOKEN`, lus dans l'environnement du processus Compose (`.env` en local, variables Coolify en production).

##### Crédential et portée

Créez un jeton d'API Cloudflare portant **Zone → Cache Purge → Purge** sur la zone `eguidar.com` (la portée s'appelle « Cache Purge »). Un même jeton peut aussi porter « Workers R2 Storage: Edit » si l'étape de cycle de vie R2 l'utilise (voir plus haut), mais un jeton dédié à la purge est plus sûr. `CLOUDFLARE_ZONE_ID` identifie la zone et se lit dans la console Cloudflare. Le plan gratuit autorise 5 purges globales par minute : un déploiement en fait une, c'est sans objet.

Sans ces variables (ou avec `PURGE_EDGE=off`), la phase est un **no-op journalisé** : elle affiche `purge ignorée` et sort 0, le déploiement se poursuit. C'est l'état par défaut tant que le jeton n'est pas fourni.

##### Échec, compromis et retour arrière

Avec les crédentials, une purge refusée (HTTP non-2xx, `success: false`, transport injoignable) fait sortir le script en 1 : le service échoue, donc `app` ne démarre pas. Le compromis est assumé : un déploiement retenu vaut mieux que des documents pointant vers des chunks inexistants. Contrepartie : une panne de l'API Cloudflare bloque les déploiements.

Pour dégager ce verrou **sans changer le code** : `PURGE_EDGE=off` dans `.env` (ou dans l'environnement Coolify), ou retirez `CLOUDFLARE_ZONE_ID` / `CLOUDFLARE_API_TOKEN`. La phase redevient un no-op journalisé et le déploiement passe. Ne déplacez pas la purge dans `pre_deployment_command` / `post_deployment_command` de Coolify : le premier tourne avant le build et n'a aucun conteneur au premier déploiement ; le second tourne après le routage du trafic et ses exceptions sont avalées. Les deux contredisent l'ordre que le test protège.

##### Fenêtre résiduelle, dite telle quelle

Même avec cet ordre, une fenêtre subsiste : entre le moment où la purge réussit et celui où le nouveau conteneur reçoit le trafic, **l'ancien conteneur peut repeupler l'edge** avec des documents bâtis sur l'ancienne image. Sa durée est la réconciliation Compose (quelques secondes), pas la durée du build — c'est précisément pourquoi la purge ne tourne pas avant le build. La fermer entièrement demanderait une seconde purge une fois `app` en service (par exemple un `post_start` sur `app`), au prix d'un second appel ; elle n'est pas faite ici. `purge_everything` étant idempotent, cette seconde purge serait sans risque : c'est une décision explicite, pas un oubli.

##### Vérifier et purger à la main

La CI n'a ni jeton ni zone : la vérification est manuelle. Après déploiement, la première requête doit manquer l'edge (`cf-cache-status: MISS`, ou `DYNAMIC` pour une route non cacheable), puis un second appel peut répondre `HIT` sur une URL prérendue. Pour purger à la main sans démarrer la pile, réutilisez le service — Compose lit `.env` :

```bash
docker compose run --rm --no-deps purge-edge
```

Le script journalise `zone … purgée (purge_everything)` et sort 0 ; sans crédential, il journalise `purge ignorée` et sort 0.

### Build et déploiement

Le build prérend le catalogue qu'il lit à la construction, et l'image de déploiement reçoit sa crédential sans la figer dans une couche.

#### Construire avec le catalogue

Le build prérend des documents à partir du catalogue qu’il lit à la construction. `npm run build` commence donc par un preflight (`scripts/verifier-catalogue-de-build.ts`) : il ouvre `DATABASE_URL` avec un délai court, compte les produits, catégories et articles publiés, et s’arrête avec `ECHEC : catalogue — …` si la base est absente ou injoignable. Un catalogue joignable mais vide n’échoue pas : le build continue, et les routes dynamiques rendront le paramètre de repli de `lib/parametre-de-repli.ts`. En local, `DATABASE_URL` vient de `.env`.

En Docker, la crédential est un secret BuildKit monté pour le seul `RUN` du build, jamais un `ARG` ni un `ENV` : elle n’entre dans aucune couche et n’apparaît pas dans `docker history`. Le contexte de construction exclut `.env` et `.env.*`, donc le secret ne peut pas non plus arriver par un fichier.

| Build            | Crédential                             | Où elle est définie                                                            |
| ---------------- | -------------------------------------- | ------------------------------------------------------------------------------ |
| Local            | `DATABASE_URL`                         | `.env`                                                                         |
| CI (job `build`) | `DATABASE_URL` vers `eguidar_probe`    | base éphémère du job, migrée et semée ; aucun secret de dépôt                  |
| Coolify          | `DATABASE_URL_BUILD`, en lecture seule | environnement du processus Compose, livré au build par `secrets: database_url` |

La CI migre et sème `eguidar_probe`, puis passe son URL au build hôte par `DATABASE_URL`. L’image reçoit la même valeur par l’input `secrets` de `docker/build-push-action` — sous l’identifiant `database_url` — et le constructeur partage le réseau de l’hôte (`driver-opts: network=host`), ce qui laisse le `RUN` du build joindre `127.0.0.1:5432` ; le driver `docker-container` ne sait pas résoudre `host-gateway`. Rien de tout cela ne lit un secret de dépôt (ADR-0020).

Pour Coolify, `docker-compose.yml` déclare `build.secrets: [database_url]`, dont la source est `database_url: environment: DATABASE_URL_BUILD` : la valeur n’est jamais écrite dans le fichier. Le build reste sur le réseau bridge par défaut et joint la base par le gateway de l’hôte (`build.extra_hosts: host.docker.internal:host-gateway`), que `postgres` publie sur `POSTGRES_HOST_BIND` — `127.0.0.1:5433` en local, et `10.0.1.1:5433` sous Coolify, où l’on pose `10.0.1.1` (l’IP de `docker0`) dans les variables d’environnement de l’application, buildtime comprises. Pas de `build.network: host` : Buildx 0.37.2+ refuse ce réseau si l’appelant ne passe pas `--allow=network.host`, et `docker compose build` — la commande que Coolify exécute — n’a pas ce drapeau ; `build.entitlements` ne l’accorde pas, un target bake ne fait que *demander* le privilège. Renseignez donc `DATABASE_URL_BUILD` avec une crédential **en lecture seule** et une URL en `host.docker.internal`.

La nouvelle adresse de publication ne prend effet qu’à la recréation du service `postgres`. Avant le premier build qui suit ce réglage, recréez-le une fois (`docker compose up -d postgres` depuis le répertoire de déploiement, ou `docker compose -p <projet> up -d postgres` avec le fichier courant) : tant qu’il publie encore `127.0.0.1`, le build ne joint que le loopback et s’arrête en nommant le catalogue. L’injection des secrets de build Compose par Coolify reste à vérifier au premier déploiement : si elle manque, le build s’arrête de la même façon, et #763 inscrit alors le repli (pas de prérendu, génération à la demande) dans l’ADR.

#### Vérifier l’image de déploiement

La CI construit les deux cibles que Coolify déploie — `runner` et `migrate` — puis sonde l’artefact. La même commande tourne en local, contre les images qu’on vient de construire :

```bash
# 1. Services (Postgres, Redis, Meilisearch)
docker compose up -d postgres redis meilisearch

# 2. Les deux cibles, chargées dans le démon local. Le build de la runner lit
#    le catalogue : l'URL voyage en secret BuildKit, et --network host +
#    --allow=network.host laissent le conteneur de build joindre la base
#    publiée sur 127.0.0.1:5433 (docker compose build ne sait pas passer
#    --allow, d'où le bridge dans docker-compose.yml).
DATABASE_URL=postgresql://eguidar:eguidar@127.0.0.1:5433/eguidar_test \
  docker build --allow=network.host --network host \
    --secret id=database_url,env=DATABASE_URL \
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

## Scripts

| Commande | Description |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` / `start` | Build (avec preflight du catalogue) et serveur de production |
| `npm run typecheck` | Vérification TypeScript |
| `npm run lint` | ESLint |
| `npm run format` | Met le code TypeScript et TSX en forme (écriture) |
| `npm run format:check` | Signale les fichiers mal formés, sans les toucher |
| `npm test` | Tests vitest (unitaires + intégration), sur `eguidar_test` |
| `npm run test:watch` | Tests en continu |
| `npx prisma migrate dev` | Applique les migrations |
| `npx prisma db seed` | Données de démo (idempotent) |
| `npm run porte:verifier` | Docteur local de la Porte de fusion (0 conforme, 1 dérive, 2 illisible) |
| `bash scripts/checks.sh` | Les cinq checks de la CI, dans l'ordre |
| `bash scripts/setup-providers.sh` | Assistant Turnstile, R2, CORS et Cache Rules |
| `bash scripts/verifier-image-deploiement.sh` | Sonde des images `runner` et `migrate` |

## Licence

Le code est publié sous **licence MIT** — [`LICENSE`](LICENSE). `package.json` porte `"license": "MIT"`, et GitHub lit l'un comme l'autre.

Elle autorise sans rien demander : l'usage, la copie, la modification, la fusion, la publication, la distribution, la sous-licence et la vente, **usage commercial compris**. Une seule contrepartie, celle de la MIT : conserver l'avis de copyright et le texte de la licence dans toute copie ou partie substantielle. Le logiciel vient sans garantie.

Trois choses restent hors de la concession :

- **Le nom et le logo « Eguidar »**. Un fork peut reprendre le code ; il ne peut pas se présenter comme la boutique eguidar.com, ni laisser croire qu'il en est l'émetteur.
- **Le contenu de la boutique** — textes, photos produits, descriptions —, que la MIT ne concède pas. Le code qui l'affiche est libre ; les visuels qu'il affiche ne le sont pas.
- **Les ressources tierces** — `vendor/`, polices, icônes, dépendances de `node_modules` —, qui gardent leurs propres licences, dans leurs fichiers respectifs.

`"private": true` ne restreint rien : il empêche seulement une publication accidentelle du paquet sur npm. Le code se reprend depuis GitHub ou depuis un clone, aux conditions ci-dessus.
