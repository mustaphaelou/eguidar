# Architecture d'Eguidar

Ce document dit **où vit chaque chose**, **quelle couture sépare deux modules** et **quelle loi rien ne franchit**. Il ne réexplique aucune décision : chaque section renvoie à l'ADR qui l'a prise. Le vocabulaire du domaine est dans [`GLOSSARY.md`](../GLOSSARY.md) ; celui de l'architecture, au [§6](#6-vocabulaire-de-larchitecture).

Le dépôt applique cette architecture depuis longtemps — vingt-six tests `*-frontiere`, quatre suites `*-contrat`, un analyseur de graphe d'imports de 251 lignes. Ce document ne l'invente pas : il la rend lisible.

## Sommaire

1. [Forme du système](#1-forme-du-système)
2. [Les cinq couches](#2-les-cinq-couches)
3. [Les neuf coutures](#3-les-neuf-coutures)
4. [Les onze lois](#4-les-onze-lois)
5. [Lire ce dépôt](#5-lire-ce-dépôt)
6. [Vocabulaire de l'architecture](#6-vocabulaire-de-larchitecture)

## 1. Forme du système

Eguidar est **une application Next.js unique**, servie par un seul processus Node.

| Élément | Rôle |
| --- | --- |
| Next.js 16 — App Router, RSC, Cache Components | les pages, les Server Actions, sept routes HTTP sous `app/api/` |
| PostgreSQL 16 + Prisma 7 | les données |
| Redis 7 | le cache Next (`cache-handlers/`), les limiteurs, le compteur d'échecs de Connexion |
| Meilisearch 1.52 | la Recherche |
| Cloudflare R2 | les Images produit |
| pg-boss, sur le PostgreSQL existant | le travailleur des Automatisations |
| Cloudflare, devant l'origine | le cache — **et rien d'autre** |

**Le bord ne calcule rien.** Cloudflare porte des règles de cache versionnées dans `infra/` et une purge ; il n'exécute aucun code d'Eguidar. L'application tourne dans un conteneur Docker, déployée par Coolify (ADR-0020). Une lecture qui suppose du calcul au bord — un middleware, une fonction à la demande — se trompe de déploiement.

**L'ordre du déploiement est une décision.** `docker-compose.yml` enchaîne `migrate`, puis `purge-edge`, puis `app` : le cache est purgé avant que le trafic n'arrive, et `app` ne dépend pas de `migrate` mais de `purge-edge`.

**Un seul fait a un propriétaire.** Les artefacts d'infrastructure (`infra/*.json`) sont dérivés du code, et un test échoue dès qu'ils divergent. Le même principe vaut pour les prix cuits, les statuts et les totaux.

## 2. Les cinq couches

| Couche | Où | Ce qu'elle a le droit de faire |
| --- | --- | --- |
| **Surfaces** | `app/`, `components/` | rendre, lire l'URL, appeler un cas d'usage ou une Server Action |
| **Cas d'usage** | `lib/use-cases/` | porter la transaction, la Session courante, la validation, l'autorisation |
| **Domaine pur** | les modules de `lib/` sans aucun `import` | calculer, sans Next, sans Prisma, sans entrée-sortie |
| **Adaptateurs** | `lib/meili.ts`, `lib/r2.ts`, `lib/purge-edge-cloudflare.ts`, `lib/redis.ts`, `lib/emails.ts` | parler à un service extérieur, derrière un port |
| **Infrastructure** | `lib/db.ts`, `lib/configuration-critique.ts`, `cache-handlers/`, `prisma/` | tenir les connexions et la configuration |

**La règle d'import va vers le bas, jamais vers le haut.** Aucune page ni aucune action de production ne touche `lib/db` : seuls les tests le font, pour semer leurs faits. Trente et un modules de `lib/` n'ont aucun import du tout — `carte-produit.ts`, `marche-structure.ts`, `money.ts`, `blog-contenu.ts`, `panier-transport.ts` — et ce sont eux qui portent les calculs.

**La couture client-serveur est une règle de type.** Un module serveur ne prête au client que des types (ADR-0028). Cent fichiers portent `"use client"`, quatorze portent `"use server"` ; le graphe qui les sépare est vérifié, pas supposé.

## 3. Les neuf coutures

Une **couture** est une frontière que deux côtés doivent traverser pour faire leur travail. Elle a un propriétaire de chaque côté, un ADR qui la nomme, et une **garde** qui échoue quand on la franchit de travers. Ce n'est pas une couche : c'est un contrat.

### 3.1 Écriture — la déclaration et ses deux adaptateurs

- **Côté déclarant** : `lib/apres-ecriture.ts` — un registre pur, indexé par `GenreEcriture`, qui rend un `Plan`.
- **Côté exécutant** : `lib/use-cases/mutation-squelette.ts` — l'adaptateur immédiat ; `lib/automations/executeur.ts` — le travailleur.
- **ADR** : 0049 (la déclaration), 0014 (les effets encapsulés), 0044 (la durabilité).
- **Garde** : `lib/apres-ecriture-frontiere.test.ts`, `lib/apres-ecriture.test.ts`, `test/mutation-squelette-recette.ts`.

Une écriture d'Administration déclare son plan **dans sa transaction** ; le commit est autoritatif ; les conséquences durables deviennent des Événements d'automatisation, les autres sont réparées par un moyen borné nommé.

### 3.2 Entrée — comment une requête devient un appel autorisé

- **Côté surface** : les `actions.ts` de `app/`, les routes de `app/api/admin/`.
- **Côté cas d'usage** : `lib/use-cases/mutation-actions.ts` (`gate`), `lib/use-cases/admin-json-route.ts` (`adminJsonRoute`).
- **ADR** : 0010, 0025, 0039.
- **Garde** : `lib/use-cases/mutation-actions.test.ts`, `lib/use-cases/admin-json-route.test.ts`, `app/admin/actions-frontiere.test.ts`.

Toute action d'Administration passe par `gate` : Session courante, refus typé, `next` replié sur le Lien de connexion. Toute route JSON d'Administration passe par `adminJsonRoute` : 401, analyse Zod, correspondance de statut.

### 3.3 Panier — le cœur pur et son port client

- **Côté cœur** : `lib/panier-coeur.ts` — `creerPanierStore`, ports `StockagePanier` et `CataloguePanier`.
- **Côté serveur** : `lib/panier.ts` — Prisma et Session ; `lib/panier-transport.ts` — le contrat de fil.
- **Côté client** : `components/storefront/use-mutations-du-panier.ts` — `PortMutationsDuPanier`.
- **ADR** : 0007 (le Visiteur), 0018 (un seul seam client).
- **Garde** : `lib/panier-coeur.test.ts`, `lib/panier-transport-frontiere.test.ts`.

Le succès d'une mutation se signale par **deux canaux** : le `refresh()` de l'action serveur, et `signalerUnChangementDuPanier()` — parce que `refresh()` ne re-rend plus certains composants. Un seul module porte l'état ; les quatre surfaces qui l'utilisent l'injectent.

### 3.4 Projection — la Carte produit

- **Côté producteur** : `lib/carte-produit.ts` — `projeterCarteProduit`, `urlProduit`, sans aucun import.
- **Côté consommateurs** : `lib/use-cases/storefront.ts`, `lib/use-cases/blog.ts`, `lib/use-cases/search.ts`, et les composants de carte.
- **ADR** : 0022 (la projection et l'URL), 0013 (les prix cuits).
- **Garde** : `lib/carte-produit-frontiere.test.ts`.

Aucune surface ne redérive un prix : le DTO le porte cuit.

### 3.5 Recherche — le port et son adaptateur

- **Côté port** : `lib/moteur-recherche.ts` — `MoteurRecherche`, `ReponseDocuments | ReponseIndisponible`.
- **Côté adaptateur** : `lib/meili.ts` — `moteurMeili`, `chercherAvecMeili`, `indexProductDocuments`.
- **Côté grammaire** : `lib/search-params.ts`, `lib/filtre-de-recherche.ts`, `lib/index-projection.ts`.
- **ADR** : 0023 (la couture), 0016 (les facettes), 0035 (le propriétaire du Filtre).
- **Garde** : `lib/moteur-recherche-frontiere.test.ts`, `test/contrat-limiteur-recherche.ts`, `lib/meili-correspondance.test.ts`.

L'indisponibilité du moteur est un cas typé, pas une exception : `ReponseIndisponible` remonte jusqu'à la surface.

### 3.6 Images — le stockage et le cycle de vie

- **Côté contrat** : `lib/r2.ts` — `ResultatStockageImageProduit`, `CodeEchecStockage`.
- **Côté cycle de vie** : `lib/cycle-vie-image-produit.ts` — les gestes des Brouillons d'Image produit, la rétention, la promotion.
- **Côté espace de noms** : `lib/espace-de-noms-image-produit.ts`.
- **ADR** : 0004 (les clés publiques), 0033 (le port client), 0034 (la promotion appartient à l'enregistrement).
- **Garde** : `lib/cycle-vie-image-produit-frontiere.test.ts`, `test/contrat-stockage-image-produit.ts`, `test/contrat-registre-brouillon.ts`, `infra/regle-cycle-vie-r2.test.ts`.

Un échec de stockage est un résultat, jamais une exception qui remonte : il a un code fermé.

### 3.7 Automatisation — du Fait à l'Exécution

- **Côté déclencheur** : `lib/automations/evenements.ts`, `lib/automations/charge.ts`.
- **Côté décision** : `lib/automations/decision.ts` — pure, sans base, sans port.
- **Côté trace** : `lib/automations/executions.ts` — un seul module écrit `AutomationRun`.
- **Côté travailleur** : `lib/automations/executeur.ts` (réclamation `FOR UPDATE SKIP LOCKED`) et `lib/automations/file.ts` (pg-boss).
- **ADR** : 0044, 0048, 0049.
- **Garde** : les suites de `lib/automations/` et de `app/admin/automatisations/`.

Le travailleur ne démarre qu'en production, jamais pendant le build, jamais sous Vitest : `instrumentation.ts` en est le seul point d'entrée.

### 3.8 Session — une seule lecture

- **Côté propriétaire** : `lib/use-cases/session-courante.ts` — `lireSession`, `estAdmin`.
- **Côté rôles** : `lib/role.ts`, `lib/session-constants.ts`, `lib/session-expiration.ts`.
- **ADR** : 0024 (une lecture), 0001 (le gate d'Administration), 0006 (le refus de la Boutique).
- **Garde** : `lib/use-cases/session-courante.test.ts`, `proxy.test.ts`, `app/admin/layout.test.tsx`.

Le refus reste composé par la surface qui l'exige : la lecture ne refuse jamais.

### 3.9 Cache et bord — la publication

- **Côté producteur** : `lib/use-cases/cache-invalidation.ts` — les étiquettes, `revaliderCatalogue`, `purgerEdgeDurable`.
- **Côté bord** : `infra/regle-cache-edge.json`, `scripts/purger-edge.mjs`.
- **ADR** : 0005 (les en-têtes), 0038 (le document anonyme), 0014 (l'invalidation est un effet).
- **Garde** : `lib/use-cases/cache-invalidation.test.ts`, `infra/regle-cache-edge.test.ts`, `test/contrat-purge-edge.ts`, `purge-edge-deploiement.test.ts`.

**Deux emplacements qui surprennent.** `lib/use-cases/ville-url.ts` est neutre — un seul import de type, une garde `*-frontiere` — mais il vit sous `use-cases/`, et un composant client l'importe pour sa valeur `villeVersParam`. Et `lib/panier-transport.ts` est le contrat de fil du Panier, pas un cas d'usage.

## 4. Les onze lois

Une loi est une règle que rien ne peut franchir, et chaque loi nomme sa **garde** — le test qui échoue quand on la franchit. Une loi sans garde est un vœu : elle n'entre pas dans cette liste.

| # | Loi | Garde |
| --- | --- | --- |
| 1 | **Un fait n'a qu'un propriétaire** | `infra/*.test.ts` — chaque artefact est dérivé, et un test échoue dès qu'il diverge |
| 2 | **Un module serveur ne prête au client que des types** (ADR-0028) | `app/admin/actions-frontiere.test.ts`, `lib/use-cases/outils-frontiere.ts` |
| 3 | **Une valeur partagée habite un module neutre** | les vingt-six tests `*-frontiere.test.ts` |
| 4 | **Le commit est autoritatif** (ADR-0014) | `lib/use-cases/mutation-squelette.ts` ne jette pas ; `test/mutation-squelette-recette.ts` |
| 5 | **Pas d'Événement d'automatisation sans conséquence durable** (ADR-0049) | `lib/apres-ecriture.test.ts` |
| 6 | **Une déclaration par genre d'écriture** (ADR-0049) | `lib/apres-ecriture-frontiere.test.ts` — le registre est exhaustif par le type |
| 7 | **La déclaration est pure** — ni Prisma, ni transaction, ni `await`, ni fermeture | `lib/apres-ecriture-frontiere.test.ts` |
| 8 | **L'argent est un entier de centimes** | `lib/use-cases/montants-commande.test.ts`, `lib/use-cases/orders.test.ts` |
| 9 | **Le bord ne calcule rien** | `infra/regle-cache-edge.test.ts`, `purge-edge-deploiement.test.ts` |
| 10 | **Aucun secret n'entre dans le contexte de build** | `hygiene-secrets.test.ts`, `build-secrets.test.ts` |
| 11 | **La Porte de fusion est un contrat versionné** | `infra/porte-de-fusion.test.ts`, `npm run porte:verifier` |

## 5. Lire ce dépôt

Pour une tâche qui touche au domaine, dans cet ordre :

1. [`GLOSSARY.md`](../GLOSSARY.md) — le mot juste. S'il manque, c'est un signal : soit on invente un vocabulaire que le projet n'utilise pas, soit il y a un vrai trou.
2. **Ce document** — la couche où la modification appartient, puis la couture qu'elle traverse.
3. **L'ADR de la zone** — l'index est dans [`docs/adr/README.md`](adr/README.md). Il dit *pourquoi*, pas *où*.
4. **La garde `*-frontiere` du fichier touché** — elle dit ce que le module n'a pas le droit d'importer.
5. `bash scripts/checks.sh` — les checks de la CI, dans l'ordre. C'est la définition de « terminé » ([`CODING_STANDARDS.md`](../CODING_STANDARDS.md)).

Un agent qui suit cet ordre n'a pas besoin de lire 175 entrées de `lib/`.

## 6. Vocabulaire de l'architecture

Ce vocabulaire est **propre à l'architecture** ; il n'entre pas dans `GLOSSARY.md`, qui reste le vocabulaire du domaine.

**Couche**:
Une des cinq strates de [§2](#2-les-cinq-couches). Une couche n'importe que vers le bas.

**Couture**:
Une frontière que deux côtés traversent, avec un propriétaire de chaque côté, un ADR qui la nomme et une garde qui la tient. Une couture n'est pas une couche : c'est un contrat. Voir [§3](#3-les-neuf-coutures).
_Avoid_: seam, frontière (réservé au suffixe des gardes), interface

**Côté**:
Un des deux bords d'une couture. Le côté déclarant écrit le contrat ; le côté exécutant le consomme.

**Garde**:
Le test qui échoue quand une couture est franchie de travers ou qu'une loi est rompue. Une garde qui ne peut pas tomber n'est pas une garde : chaque famille `*-frontiere` éprouve sa propre chute sur une violation synthétique.
_Avoid_: guard rail, assertion, check

**Module neutre**:
Un module sans directive, sans import de Next, de Prisma ou de React, partagé par le serveur et le client. Sa neutralité est prouvée par une garde `*-frontiere`, pas supposée.

**Port**:
L'interface qu'un côté attend d'un service extérieur. L'**adaptateur** est l'implémentation qui la remplit ; une suite `*-contrat` la fait passer aux deux.

**Ancre**:
La référence qui relie un document au code. **Une ancre est un symbole, jamais un numéro de ligne** : un nom de fonction ou de type survit à un remaniement, un `:101` non. Les ADR antérieurs à ce document citent encore des lignes — c'est une dette connue, consignée dans la spec #916.
_Avoid_: lien, pointeur, référence de ligne

**Fait**, **Plan**, **Conséquence durable**:
Le vocabulaire de l'écriture, défini dans [`GLOSSARY.md`](../GLOSSARY.md) et gouverné par l'ADR-0049. Ce document ne le redéfinit pas.
