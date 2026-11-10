# Décisions d'architecture

Chaque fichier de ce dossier garde **une décision**, ses alternatives et ce qu'elle a coûté. Une décision ne se réécrit pas : elle s'**amende** par une section `## Amendement`, ou se **remplace** par une décision postérieure qui la nomme.

Pour la carte qui situe ces décisions — les couches, les coutures, les lois —, lire [`../ARCHITECTURE.md`](../ARCHITECTURE.md).

## Comment lire

1. **Le titre** dit la décision, au présent, en une phrase.
2. **La décision** est la partie qui fait foi. Le reste — contexte, alternatives, coûts — explique *pourquoi*, et vieillit plus vite.
3. **`## Amendement`** corrige ou étend la décision sans la réécrire. Un amendement postérieur à une autre décision l'emporte sur elle.
4. **Les ancres sont des symboles.** Un ADR antérieur cite parfois `fichier.ts:101` : c'est une dette connue, consignée dans la spec #916. Une ancre de ligne ne survit pas à un remaniement ; un nom de fonction, si.

## Numérotation

- **0036 n'a jamais été écrite.** Le numéro est sauté, pas perdu : aucune référence ne le cite.
- **0039 est la porte JSON de l'Administration.** Le Bandeau, publié le même jour sous le même numéro, porte désormais **0051** ; son unique référence — l'amendement d'ADR-0037 — a suivi.
- **0050 est réservée** à une décision en cours : le déploiement ne sème plus de Données de démonstration.

## Les décisions

★ marque les décisions les plus citées par les autres ADR et par le code : ce sont elles qu'il faut lire d'abord.

### Coutures et effets

| N° | Décision | |
| --- | --- | --- |
| [0010](0010-task-action-refusals-redirect-through-mutation-shell.md) | Task-action refusals redirect through the mutation shell | |
| [0014](0014-encapsulated-domain-mutation-effects.md) | Domain mutation effects are encapsulated in the mutations, never caller-injected | ★ amendé par 0044 |
| [0025](0025-mutation-squelette-shared-mechanism.md) | Commande, Catalogue, Structure and Livraison share one mutation mechanism | ★ amendé par 0049 |
| [0028](0028-frontiere-client-serveur-types-seuls.md) | Un module serveur n'emprunte à un module client que des types | ★ |
| [0044](0044-des-effets-post-commit-durables.md) | Les effets post-commit deviennent des automatisations durables, réclamées en `SKIP LOCKED` | ★ |
| [0048](0048-le-cycle-de-vie-d-une-execution-d-automatisation-a-un-proprietaire.md) | Le cycle de vie d'une Exécution d'automatisation a un propriétaire | |
| [0049](0049-l-apres-ecriture-une-seule-declaration-par-mutation.md) | L'Après-écriture : une seule déclaration par mutation d'Administration | ★ |

### Authentification et sécurité

| N° | Décision | |
| --- | --- | --- |
| [0001](0001-modal-auth.md) | Modal-based login and sign-up (no dedicated auth pages) | ★ |
| [0002](0002-password-reset-flow.md) | Password reset flow via OTP on dedicated page | |
| [0006](0006-boutique-refusals-modal-in-place.md) | Boutique refusals open the Connexion modal in place, never a navigation | |
| [0015](0015-modal-controller-owns-connexion-url-seam.md) | The modal controller owns the connexion URL seam | |
| [0019](0019-facebook-email-trusted-social-providers.md) | Facebook e-mail counts as verified; social providers are Facebook and Google | |
| [0024](0024-session-courante-one-read.md) | One Session courante module owns the Client and its role | |
| [0041](0041-la-revocation-de-l-acces-non-prouve-appartient-a-la-bibliotheque.md) | La révocation de l'accès non prouvé appartient à la bibliothèque | |
| [0042](0042-le-limiteur-d-authentification-lit-l-adresse-client.md) | Le limiteur d'authentification lit l'adresse client derrière Cloudflare | |
| [0043](0043-codes-haches-et-mots-de-passe-compromis.md) | Les codes sont hachés au repos, les mots de passe compromis sont refusés | |
| [0045](0045-le-hachage-des-mots-de-passe-porte-ses-parametres.md) | Le hachage des mots de passe porte ses paramètres, et se met à niveau à la Connexion | |
| [0046](0046-suppression-des-donnees-facebook.md) | Une demande de suppression Facebook supprime le Compte client en entier | |
| [0047](0047-le-compteur-d-echecs-est-tenu-par-adresse.md) | Le compteur d'échecs d'une Connexion est tenu par adresse normalisée, dans Redis | |
| [0053](0053-les-flux-d-authentification-possedent-leur-etat.md) | Les flux d'authentification possèdent leur état ; la modale compose sans en garder | |

### Catalogue, Structure, Recherche, médias

| N° | Décision | |
| --- | --- | --- |
| [0004](0004-r2-public-images-key-from-url.md) | Images produit dans Cloudflare R2, servies publiquement, clé dérivée de l'URL | ★ |
| [0013](0013-catalogue-dto-computed-prices.md) | Catalogue DTOs expose computed prices — display surfaces never re-derive | |
| [0016](0016-facet-counts-ignore-their-own-filter.md) | Facet counts ignore their own filter | |
| [0022](0022-carte-produit-projection.md) | The Carte produit projection and the Produit URL have one owner | ★ |
| [0023](0023-moteur-recherche-adapter.md) | The Recherche engine crosses a seam; Meili stays inside its adapter | |
| [0026](0026-lecture-et-formulaire-produit-administration.md) | La lecture du Produit et la langue de son formulaire ont chacune leur propriétaire | |
| [0027](0027-serialisation-des-mutations-de-structure.md) | Les mutations de Structure sont sérialisées | ★ |
| [0029](0029-produit-sans-structure.md) | Un Produit sans Structure survit à la suppression de sa Structure | ★ |
| [0030](0030-la-marche-de-la-structure.md) | La Marche de la Structure a un seul propriétaire, et il ne décide de rien | |
| [0033](0033-televersement-des-brouillons-un-port-client.md) | Le téléversement des Brouillons d'Image produit quitte le composant, le protocole a son port | ★ |
| [0034](0034-l-enregistrement-du-produit-possede-la-promotion-de-ses-brouillons.md) | L'enregistrement du Produit possède la promotion de ses Brouillons d'Image produit, en trois phases | ★ |
| [0035](0035-le-filtre-de-recherche-a-un-proprietaire-neutre.md) | Le Filtre de recherche a un propriétaire neutre, et son interface n'est pas l'assembleur | |
| [0040](0040-le-contenu-d-un-article-de-blog-reste-une-chaine-a-grammaire-fermee.md) | Le contenu d'un Article de blog reste une chaîne à grammaire fermée | |

### Panier, Commande, Livraison

| N° | Décision | |
| --- | --- | --- |
| [0007](0007-visiteur-cookie-panier.md) | The Visiteur owns a cookie Panier; the Compte client is demanded at Checkout | |
| [0009](0009-ca-encaisse-delivered-only.md) | Chiffre d'affaires encaissé counts only Commandes Livrées | ★ |
| [0017](0017-ville-de-livraison-public-slug.md) | The slug is the public identifier of the Ville de livraison | |
| [0018](0018-panier-mutations-one-client-seam.md) | One client seam for the Panier mutations, with an injected transport | |
| [0021](0021-total-a-payer-persiste.md) | Total à payer is a persisted fact of the Commande | |

### Interface et navigation

| N° | Décision | |
| --- | --- | --- |
| [0008](0008-base-ui-hugeicons-not-radix-lucide.md) | Base UI and hugeicons instead of Radix and lucide in the Administration shell | |
| [0032](0032-le-retrait-au-doigt-a-ses-ressorts.md) | Le retrait au doigt a ses ressorts, sa décision se prend au point projeté | |
| [0037](0037-le-bandeau-na-plus-quune-entree-vers-le-compte.md) | Le Bandeau n'a plus qu'une entrée vers le Compte, et c'est l'Aperçu du Panier | |
| [0051](0051-le-bandeau-ne-porte-plus-les-pages-de-la-boutique.md) | Le Bandeau ne porte plus les pages de la boutique ; le pied de page les porte seul | |

### Bord, CI et outillage

| N° | Décision | |
| --- | --- | --- |
| [0003](0003-typescript-7-native-port-alias.md) | TypeScript 7 (native port) via npm alias, keeping TS 6 for the ESLint toolchain | |
| [0005](0005-security-headers-cloudflare.md) | Security headers served via Cloudflare, not the app | |
| [0011](0011-soft-404-streamed-catalog-pages.md) | Soft-404 (200 + noindex) accepted for streamed catalog pages | |
| [0012](0012-stray-wildcard-subdomains-503.md) | Stray wildcard subdomains are left to answer the origin's 503 | |
| [0020](0020-ci-github-actions-deployment-coolify.md) | CI lives in GitHub Actions; deployment stays with Coolify | |
| [0031](0031-copie-vendue-de-braces.md) | Une copie vendue de `braces` porte la garde de profondeur | |
| [0038](0038-document-anonyme-a-l-edge.md) | Le document anonyme est le même pour tous, le Bandeau de navigation lit le Panier après peinture | |
| [0039](0039-la-porte-json-administration-est-une-route.md) | La porte JSON de l'Administration est une route, et les deux téléversements la traversent | |
