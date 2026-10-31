# Le document anonyme est le même pour tous, le Bandeau de navigation lit le Panier après peinture

La boutique rendait un document par Visiteur. Le layout de la boutique rend le **Bandeau de
navigation**, dont le badge tirait son compteur du **Panier** et l'**Aperçu du Panier** son corps du
Panier et de la **Session courante** pendant le rendu ; `cookies()` et `headers()` faisaient donc
reprendre chaque document après un _resume_ de PPR, et Next répondait un document dynamique. Mesuré
le 2026-10-23 pour #752 sur le site en service : `/`, `/produits`, `/blog`, `/faq`, `/produit/*`,
`/categorie/*` et `/blog/*` répondaient
`cache-control: private, no-cache, no-store, max-age=0, must-revalidate` et
`cf-cache-status: DYNAMIC`, pour un TTFB de 184 à 292 ms ; `/mot-de-passe-oublie`, hors du layout de
la boutique, répondait `s-maxage=31536000` et restait `DYNAMIC` ; seul
`/_next/static/**` était `HIT`, avec un `age` d'environ 3,5 jours. `/faq` n'a pourtant aucune lecture
de requête : le layout seul suffisait à le faire reprendre.

Deux conséquences, et aucune ne se règle par configuration. Un document qui porte « 2 articles »
pour un Visiteur et « Votre panier est vide » pour le suivant ne peut pas être partagé : mis en
cache, il servirait le Panier de quelqu'un d'autre. Et même un document cacheable ne l'était pas :
Cloudflare ne cache pas le HTML sans extension par défaut. #752 renverse la cause — le document
anonyme devient une constante par URL, et tout ce qui est personnel arrive après peinture. #754 à
#760 et #762 ont bâti les pièces ; #763 consigne la décision. Elle s'écrit à côté d'ADR-0007 (le
Panier d'un Visiteur est un cookie), ADR-0011 (le soft-404), ADR-0012 (la configuration de la zone
edge) et ADR-0018 (une seule couture pour les mutations du Panier), et elle ne les contredit pas.
Elle n'ajoute aucun terme au glossaire.

## Décision

### Le document est le même pour tous ; le Panier se lit après peinture

- **Le Bandeau de navigation ne lit plus la requête pendant le rendu.** Le badge et l'Aperçu du
  Panier quittent le rendu serveur : `PanierBadge` et `ApercuPanier` deviennent des composants
  clients. `StorefrontHeader` les compose encore sous `Suspense`, mais aucun descendant ne lit
  `cookies()` ou `headers()` ; `components/storefront/header.test.tsx` rend la coquille avec les
  deux fonctions qui lèvent, et échoue si une lecture de requête revient. Le layout de la boutique
  est sans requête, et un document de la boutique est identique pour un Visiteur et pour un Client.
  « Constant par URL » veut dire indépendant du cookie et de la Session courante, pas immuable : le
  document change quand le Catalogue change, par `cacheLife` et par purge.

- **Deux lectures HTTP privées, à deux moments.** `GET /api/panier` répond `{ itemCount }` et le
  badge la demande au montage ; `GET /api/panier/apercu` répond l'état vide ou les Articles du
  panier, et l'Aperçu ne la demande qu'à l'ouverture — une page dont l'Aperçu ne s'ouvre jamais ne
  paie pas sa lecture. Les deux lisent le Panier courant, le badge par son compteur et l'Aperçu par
  ses Articles du panier, à travers `app/api/panier/lecture-du-panier.ts` : ce module réutilise
  `lirePanier`, `lireSession` et `compterArticlesDuPanier` sans changer leur sémantique, et répond
  `Cache-Control: private, no-store` ; le `fetch` client porte `cache: "no-store"`
  (`components/storefront/lecture-du-panier-http.ts`).

- **Seul `connecte` traverse depuis la Session courante.** L'Aperçu n'a besoin que de savoir s'il y
  a un Client pour choisir « Connexion » ou « Déconnexion » et pour supprimer l'invitation à se
  connecter. Le booléen `connecte` accompagne les deux états du corps (`lib/panier-transport.ts`),
  et aucun fait d'identité ne traverse : l'ancien composant recevait le Client entier pour n'en
  tirer qu'un booléen, et le document anonyme ne porte ni nom, ni fait du Compte client, ni Article
  du panier.

- **Les mutations rafraîchissent par la couture existante.** Les surfaces qui mutent le Panier
  passent par `useMutationsDuPanier` (ADR-0018) : sur un succès, il signale le changement
  (`components/storefront/panier-qui-change.ts`), et le badge comme un Aperçu ouvert relisent leur
  adresse. Le `refresh()` de la Server Action ne re-rend plus ces surfaces, puisqu'elles sont
  clientes.

- **Le coût est un badge et un corps en retard.** Le Visiteur voit la page d'abord, puis le compte
  et les Articles du panier. Le badge est posé dans le conteneur `relative` du déclencheur, en
  absolu, donc son arrivée ne déplace rien ; un Panier vide le laisse absent, jamais « 0 ».
  L'Aperçu affiche son squelette jusqu'à sa réponse. Une lecture qui échoue laisse le badge absent
  et le squelette en place : aucun repli serveur ne réintroduit le Panier dans le document. C'est le
  prix assumé de documents partageables.

### Le Catalogue est prérendu par URL, et un slug inconnu reste un rendu d'origine

- **`generateStaticParams` par URL.** Produit, Structure et article de blog rendent les slugs que
  leurs cas d'usage lisent déjà (`parametresDesProduits`, `parametresDesCategories`,
  `parametresDesArticles`) ; les articles prérendus sont ceux dont le statut est `publie` ou
  `archive` : un article en brouillon n'a pas d'URL publique. Le build prérend un document par URL,
  et deux builds du même Catalogue rendent la même liste, triée.

- **L'accueil et le blog cessent d'attendre.** `await connection()` disparaît des deux pages : leurs
  données vivent déjà en `"use cache: remote"` avec `cacheLife`, et l'appel ne faisait que forcer un
  _resume_. Les deux documents deviennent statiques et répondent `s-maxage`. Au ticket #760,
  `/faq` répondait `s-maxage=31536000` et les documents du Catalogue
  `s-maxage=900, stale-while-revalidate=85500` ; un slug inconnu et `/produits` répondaient
  `private, no-store` et restaient des rendus d'origine.

- **`/produits` reste dehors.** Il lit `searchParams` : filtrer par query string est un autre
  problème que servir un document constant, et chaque combinaison de filtres n'est pas une URL
  prérendue. Il reste un rendu d'origine, non caché à l'edge.

- **Un slug inconnu reste le soft-404 d'ADR-0011.** Il n'est pas dans `generateStaticParams`, n'est
  pas prérendu, répond la coquille `200 + noindex` et ne porte pas de `s-maxage` : l'edge ne le
  stocke pas. On ne met pas de lecture de base dans `proxy.ts` pour obtenir un vrai 404 ; ADR-0011 a
  déjà pesé ce coût.

- **Le paramètre de repli ne change pas la règle.** Un Catalogue vide ne doit pas rendre une liste
  de slugs vide à `generateStaticParams` : le build échouerait. Chaque route rend donc
  `__placeholder__` (`lib/parametre-de-repli.ts`), que la page traite comme un slug inconnu.
  Conséquence observée au build de #760 : le repli d'un blog sans article cuit un vrai 404, et ce
  404 porte `s-maxage` à l'origine — mais la seconde règle de zone exclut tout chemin qui finit par
  `/__placeholder__` (`/produit`, `/categorie`, `/blog`), donc il n'est jamais stocké à l'edge.
  Aucun slug réel ne peut le percuter puisque `slugify` ne le produit pas. `estLeSlugDeRepli` reste
  exporté et sans appelant hors de son test : #760 n'a pas eu besoin de distinguer le repli d'un
  slug inconnu, et il demeure le contrat neutre documenté.

- **`partialPrefetching` reste non activée.** L'option est absente de `next.config.ts` : elle change
  le comportement de navigation et n'a pas de mesure qui la réclame ici.

### La zone applique deux règles, et l'absence d'une troisième est une décision

- **L'artefact est versionné et dérivé.** `infra/regle-cache-edge.json` est la configuration
  applicable ; `infra/regle-cache-edge.ts` la dérive de `HOTE_EDGE` (`lib/zone-edge.ts`), jamais
  d'une seconde écriture du domaine. `infra/regle-cache-edge.test.ts` échoue si les deux divergent,
  si l'ordre change, ou si une règle `/_next/image` apparaît.

- **Deux règles, dans cet ordre.** `rsc-et-prefetch-hors-cache` contourne le cache dès que `RSC` ou
  `Next-Router-Prefetch` est présent ; `documents-anonymes-eguidar` rend le HTML de l'hôte éligible
  au cache, exclut `/api/`, `/_next/` et tout chemin qui finit par `/__placeholder__`, et **répète
  la négation des deux mêmes têtes**. Ce n'est pas une redondance : les Cache Rules s'empilent et la
  dernière règle qui fixe un réglage l'emporte, donc le contournement placé en premier ne protège
  pas l'éligibilité qui le suit. Une requête `RSC: 1` seule répond d'ailleurs un 307 vers `?_rsc` :
  le document et le payload ne sont pas la même réponse, et une entrée partagée casserait la
  navigation client.

- **La troisième décision est une absence.** Aucune règle pour `/_next/image` : les images sont
  l'autre moitié de la latence d'un Visiteur lointain, mais elles ont leur propre risque et leur
  propre ticket. Le test interdit la règle, pour qu'elle ne revienne pas par distraction.

- **`bypass_by_default`, et aucun TTL explicite.** La seconde règle honore `s-maxage` quand l'origine
  l'envoie et ne stocke rien quand elle n'envoie pas de `Cache-Control` : l'échec est fermé. Surtout,
  elle ne porte ni `override_origin` ni `status_code_ttl`. Une expression de Cache Rules ne lit que
  la requête, jamais la réponse : `Set-Cookie` ne peut donc pas être testé dans l'expression. C'est
  le mode de TTL qui protège — avec `bypass_by_default` (ou `respect_origin`) et aucun TTL explicite,
  Cloudflare conserve `Set-Cookie` et ne met pas la réponse en cache ; `override_origin` ou un
  `status_code_ttl` retireraient le cookie et cacheraient la réponse, donc un document personnel.
  C'est le piège que le test ferme.

- **C'est une configuration d'opérateur, pas de l'application.** L'étape « Cache Rules » de
  `bash scripts/setup-providers.sh` lit le ruleset vivant, affiche les règles que l'artefact ne
  décrit pas, demande une seconde confirmation, valide un `?dry_run=true`, écrit l'entrypoint de la
  phase, puis relit et compare. Il faut un jeton portant **Zone > Cache Rules > Edit**. Rien dans
  l'application n'applique ces règles au démarrage ; son seul appel à l'API de zone est la purge,
  sur une écriture.

- **Le retour en arrière coûte un appel.** Supprimer le ruleset de la phase, ou le vider par
  `PUT {"rules":[]}`, défait l'éligibilité sans redéploiement ; l'étape imprime la commande avec
  l'identifiant du ruleset.

- **`cf-cache-status: HIT` est une vérification d'opérateur.** La CI n'a ni jeton ni zone ; cet ADR
  ne prétend pas l'avoir observé. Deux requêtes sur `/faq` et sur une URL prérendue, puis un second
  appel qui répond `HIT`, restent le contrôle manuel qui ferme la boucle.

### Le déploiement purge la zone entre la migration et le nouveau conteneur

- **Un service one-shot, dans l'ordre.** `docker-compose.yml` porte `migrate` → `purge-edge` →
  `app`. `purge-edge` est construit sur la cible `migrate` (le contexte y est copié, sans toucher la
  cible `runner`), tourne `node scripts/purger-edge.mjs`, a `restart: "no"`, dépend de `migrate` par
  `condition: service_completed_successfully`, et `app` dépend de `purge-edge` par la même condition.
  L'application n'a plus d'arête directe vers `migrate` : ce serait un chemin qui contourne la purge,
  et `purge-edge-deploiement.test.ts` échoue si l'ordre change.

- **Pourquoi pas les crochets de Coolify.** `pre_deployment_command` tourne avant le build et n'a
  aucun conteneur au premier déploiement ; `post_deployment_command` tourne après le routage du
  trafic et ses exceptions sont avalées. Les deux contredisent l'ordre que l'on veut : purger après
  la migration et avant que le nouveau conteneur ne prenne le trafic.

- **L'échec arrête le déploiement ; l'absence de crédential ne l'arrête pas.** Sans
  `CLOUDFLARE_ZONE_ID` et `CLOUDFLARE_API_TOKEN`, le script journalise `purge ignorée` et sort 0 ;
  avec `PURGE_EDGE=off`, même no-op. Avec les deux, un transport injoignable, un HTTP non-2xx ou un
  `success: false` fait sortir le script en 1 : le service échoue, et `app` ne démarre pas. C'est
  voulu : un déploiement retenu vaut mieux que des documents pointant vers des chunks supprimés. Le
  corollaire est assumé : avec des identifiants, un déploiement dépend de la disponibilité de
  Cloudflare, et `PURGE_EDGE=off` est la sortie de secours sans changement de code.

- **La fenêtre résiduelle est réduite par l'ordre, pas fermée.** Entre la purge réussie et le moment
  où le nouveau conteneur reçoit le trafic, l'ancien conteneur peut repeupler l'edge avec des
  documents bâtis sur l'ancienne image. L'ordre — purge après migration, avant routage — réduit cette
  fenêtre à la réconciliation Compose (quelques secondes), pas à la durée du build ; il ne la ferme
  pas. La fermer demanderait une seconde purge après le démarrage de `app` ; elle n'est pas faite, et
  c'est une décision, pas un oubli (#758 dit « réduite par l'ordre »). Sans identifiants, il n'y a
  pas de purge du tout : la fenêtre reste ouverte jusqu'à une purge manuelle ou un déploiement avec
  identifiants.

### Le build lit un Catalogue en lecture seule par un secret BuildKit

- **Le prérendu a besoin d'un Catalogue, pas d'une base factice.** `next build` prérend les
  documents à partir du Catalogue réel. `npm run build` commence par
  `scripts/verifier-catalogue-de-build.ts`, qui ouvre `DATABASE_URL` avec un délai court
  (`lib/acces-catalogue-build.ts`), compte les Produits, les Structures et les articles dont le
  statut est `publie` ou `archive`, et s'arrête avec `ECHEC : catalogue — …` si la base est absente
  ou injoignable. Le build ne prérend jamais une base factice en silence.

- **La crédential voyage en secret BuildKit.** Le `Dockerfile` monte
  `RUN --mount=type=secret,id=database_url,env=DATABASE_URL npm run build` : la valeur est montée
  pour ce `RUN` seulement, jamais en `ARG` ni en `ENV`, donc ni dans une couche ni dans
  `docker history` ; le contexte exclut `.env` et `.env.*`. `docker-compose.yml` déclare
  `build.secrets: [database_url]`, dont la source est
  `database_url: environment: DATABASE_URL_BUILD` ; le build reste sur le réseau bridge par défaut et
  joint la base publiée sur `POSTGRES_HOST_BIND:5433` par le gateway de l'hôte
  (`build.extra_hosts: host.docker.internal:host-gateway`). Pour Coolify, la lecture seule est une
  exigence d'exploitation, pas une garantie du code : l'opérateur fournit une crédential qui ne peut
  pas écrire.

- **Le build ne demande pas le réseau de l'hôte, parce que personne ne peut le lui accorder.** Un
  target bake ne fait que *demander* un privilège : `build.entitlements: [network.host]` ne le
  accorde pas, et Buildx 0.37.2+ refuse `network: host` si l'appelant ne passe pas
  `--allow=network.host`. Or `docker compose build` — la commande que Coolify exécute, sans terminal
  — n'a pas ce drapeau, et Compose ne l'ajoute pour `build.network: host` qu'à partir du correctif
  docker/compose#14325, absent de Compose 5.6.1. Le build joint donc Postgres par le gateway du
  bridge, et le service `postgres` publie `5433` sur `POSTGRES_HOST_BIND` : `127.0.0.1` en local,
  `10.0.1.1` sous Coolify, valeur que l'opérateur pose dans les variables d'environnement de
  l'application, buildtime comprises. Le conteneur `postgres` doit être recréé une fois pour publier
  cette adresse ; avant, le build ne joint que le loopback. La CI garde `network: host` :
  `docker/build-push-action` sait passer `allow: network.host`.

- **La CI prête un Catalogue au build, sans secret de dépôt.** Le job `build` migre et sème
  `eguidar_probe`, passe son URL au build hôte par `DATABASE_URL`, et livre la même valeur au build
  Docker par l'input `secrets` sous l'identifiant `database_url`. Le constructeur partage le réseau
  de l'hôte (`driver-opts: network=host`) et le `RUN` du build joint `127.0.0.1:5432` : le driver
  `docker-container` ne résout pas `host-gateway`. Aucun secret de dépôt n'est lu (ADR-0020).

- **Un Catalogue vide construit quand même.** Le preflight le journalise
  (`[catalogue] joignable mais vide`) et le build continue : les routes dynamiques rendent
  `__placeholder__`, et le document de ce slug est un vrai 404 portant `s-maxage` à l'origine, mais
  exclu de l'éligibilité par la seconde règle, donc jamais stocké à l'edge ; pas un document de
  Catalogue. La coquille soft-404 (200 + `noindex`) décrit les routes dynamiques réelles ; le repli
  de build est un 404 assumé, et #759 a été amendé en ce sens. Un premier déploiement ou un Catalogue
  effacé ne fait pas échouer un build.

- **Le chemin choisi est le secret de build ; le repli est consigné, pas exercé.** #759 autorise un
  repli si la plateforme de déploiement ne peut pas livrer de secret de build : renoncer au prérendu
  à la construction et laisser l'origine générer à la demande. Ce repli n'est pas choisi : BuildKit
  sait livrer le secret et la CI le fait déjà. Mais l'injection des secrets de build Compose par
  Coolify n'a pas encore été observée ; le premier déploiement doit la confirmer. Si elle manque, le
  build s'arrête en nommant le Catalogue — le comportement voulu — et le repli devra être rouvert
  explicitement, car il coûte le prérendu et donc le cache d'edge. Aucune des deux issues n'est
  silencieuse.

### Les écritures d'administration et les Commandes purgent les mêmes documents que `revalidateTag`

- **Un seul vocabulaire de tags.** `revalidateTag(tag, "max")` rafraîchit l'origine ;
  `demandeDePurge(tags)` traduit les mêmes tags en URLs d'edge (`/`, `/produit/<slug>`,
  `/categorie/<slug>`), et un tag qui couvre tout le Catalogue (`CATEGORY_TAG`, ou `PRODUCT_TAG`
  sans Produit nommé) rend `{ kind: "tout" }`. Aucun second vocabulaire : les deux chemins partent
  des mêmes `tagsCatalogue` et `tagsStructure` (`lib/use-cases/cache-invalidation.ts`).

- **Un port, deux implémentations, un contrat.** `PortPurgeEdge` (`lib/purge-edge.ts`) a une
  implémentation Cloudflare (`lib/purge-edge-cloudflare.ts`) et une implémentation en mémoire pour
  les tests (`test/purge-edge-memoire.ts`) ; `lib/purge-edge-contrat.test.ts` fait passer les deux
  par les mêmes scénarios, dont un Produit renommé (ancien et nouveau slug) et une purge de tout le
  Catalogue. Les purges partent par lots de 100 URLs (`LIMITE_URLS_PAR_APPEL_PURGE`),
  dédupliquées.

- **Une purge qui échoue ne défait pas l'écriture.** Sans identifiants, le port rend
  `non-configure` et `purgerEdge` journalise un avertissement ; une erreur de transport, un HTTP
  non-2xx ou un `success: false` est journalisé de la même façon. Une écriture d'administration
  réussit, une Commande reste placée : c'est la même règle qu'un e-mail de confirmation non envoyé.
  La purge au déploiement, elle, est l'inverse et arrête le déploiement — deux moments, deux
  exigences.

- **La Commande relève les Produits qu'elle draine dans la transaction, pas leur chaîne.**
  `placeOrder` réserve le stock puis relève les faits que la transaction possède — `{id, slug,
  categoryId}` par Produit touché (`produitsTouches(tx, …)`) — avant le commit ; aucune ligne de
  Commande ne stocke de slug et aucune Lecture de la Structure n'a lieu dans la transaction
  (ADR-0030). Après le commit, une seule `lireStructure()` résout la chaîne de tous les Produits,
  pas une recherche par article (#757). Les effets post-commit enchaînent l'e-mail, l'invalidation
  des surfaces de Commande, puis la purge des documents du Catalogue ; un échec de résolution est
  journalisé et ne défait pas la Commande. Un retour en stock (`updateOrderStatus`) relève de même
  les Produits réapprovisionnés et purge leurs documents après le commit.

### #746 garde son comportement accessible ; seule sa décision de rendu est remplacée

- **Ce qui est remplacé.** #746 spécifiait le corps de l'Aperçu comme un composant serveur streamé
  dans `Suspense`, lisant `lirePanier` et `lireSession`. C'est cette décision de rendu qui rendait
  chaque document non partageable ; #752 la renverse. La supersession est consignée ici ; #746 reste
  ouvert et n'est ni fermé ni réécrit.

- **Ce qui ne change pas.** Le dialogue (rôle, nom accessible, `aria-modal`), le déplacement du
  focus et son piège, le retour du focus au déclencheur, les chemins de fermeture (Échap, Voile
  sombre, second clic sur le déclencheur, défilement de la page, activation du lien d'un Article du
  panier ou de « Voir le panier »), les trois états — vide pour un Visiteur, vide pour un Client,
  garni — et l'absence de sélecteur de quantité restent ceux de #746. Seule l'origine des données
  change : le corps arrive par `GET /api/panier/apercu`, pas dans le document.

## Options envisagées

- **Garder le Bandeau rendu côté serveur** — rejeté : c'est la cause du document personnel et du
  `no-store` ; le badge et le corps resteraient justes, mais aucun document ne serait partageable,
  et le gain de latence de #752 disparaîtrait.
- **Mettre le document en cache par Visiteur** (clé de cache sur le cookie, ou stockage d'une
  réponse `private` par un intermédiaire) — rejeté : la clé de cache de Cloudflare ignore les
  cookies, et un cache par Visiteur ne serait plus un cache partagé ; le risque est de servir le
  Panier d'un autre, pas seulement de rater une optimisation.
- **Personnaliser le document par un Worker Cloudflare à l'edge** — rejeté : un second runtime, un
  second endroit où le Panier se lit, et le risque de remettre des faits personnels dans une
  réponse cacheable. #752 garde l'application Node et ne déplace pas le Panier.
- **Charger le corps de l'Aperçu au chargement de la page** — rejeté : une requête de plus sur
  chaque page, pour une surface que la plupart des visites n'ouvrent pas ; l'ouverture est le seul
  moment où les Articles du panier sont utiles.
- **Fusionner les deux lectures en une seule route** — rejeté : le badge est demandé au montage de
  chaque document, l'Aperçu seulement à l'ouverture ; une route unique ferait payer les Articles du
  panier au badge ou ferait attendre l'Aperçu derrière un contrat de compteur.
- **Lire le Panier par une Server Action** — rejeté : les actions sont les primitives d'écriture du
  dépôt ; une lecture GET a un contrat HTTP, un `Cache-Control` privé et une couture de test qui ne
  passe pas par Next. Le badge et l'Aperçu partagent déjà cette couture.
- **Transporter le Client, ou son nom, dans la réponse** — rejeté : `connecte` suffit à choisir
  « Connexion » ou « Déconnexion » ; tout fait d'identité de plus serait personnel, et n'a aucune
  surface qui le demande.
- **Garder l'accueil et le blog dynamiques** — rejeté : leurs données sont déjà en
  `"use cache: remote"` ; `connection()` ne forçait qu'un _resume_, et les deux documents peuvent
  être statiques sans changer leurs données.
- **Prérendre `/produits` ou ses filtres** — rejeté : la page lit `searchParams` ; chaque
  combinaison de filtres est une URL différente, et le filtrage est un autre problème que le
  document constant. `/produits` reste un rendu d'origine.
- **Activer `partialPrefetching`** — rejeté : l'option est absente de `next.config.ts` ; l'activer
  change la navigation et n'est pas nécessaire pour servir un document constant.
- **Ajouter une règle `/_next/image` au même artefact** — rejeté pour ce ticket : les images sont
  l'autre moitié de la latence, mais leur cache a son propre risque et son propre ticket ; le test
  de l'artefact interdit la règle.
- **Piloter le TTL à l'edge (`override_origin`, `status_code_ttl`)** — rejeté : ces modes retirent
  `Set-Cookie` et cachent la réponse ; le mode `bypass_by_default` sans TTL explicite est ce qui
  rend le `Set-Cookie` sûr, et `s-maxage` reste le contrat de fraîcheur de l'origine.
- **Purger dans `pre_deployment_command` ou `post_deployment_command` de Coolify** — rejeté : le
  premier tourne avant le build et n'a aucun conteneur au premier déploiement ; le second tourne
  après le routage du trafic et avale ses exceptions. Ni l'un ni l'autre ne tient l'ordre
  `migrate` → purge → trafic.
- **Purger au démarrage de l'application** — rejeté : chaque redémarrage purgerait, la purge
  courrait contre la prise de trafic, et un échec ressemblerait à un plantage d'application plutôt
  qu'à un déploiement retenu. Le service one-shot garde l'échec dans la phase de déploiement.
- **Passer la crédential de build en `ARG` ou dans `.env`** — rejeté : elle entrerait dans une
  couche ou dans `docker history`, et le contexte l'exclut déjà ; le secret BuildKit est monté pour
  le seul `RUN`.
- **Construire contre une base semée factice** — rejeté : le build prérendrait un Catalogue qui
  n'est pas celui du déploiement, en silence ; le preflight préfère s'arrêter en nommant le
  Catalogue.
- **Renoncer tout de suite au prérendu (le repli de #759)** — non choisi : BuildKit et la CI
  livrent déjà le secret ; le repli coûterait le prérendu et le cache d'edge, et il reste la
  décision à rouvrir si le premier déploiement Coolify ne livre pas le secret.

## Conséquences

- Le badge et le corps de l'Aperçu arrivent après la page, et le badge coûte une requête HTTP privée
  à chaque chargement de document de la boutique. Un Panier vide garde le badge absent ; une lecture
  qui échoue le laisse absent et laisse le squelette de l'Aperçu en place.
- Le build dépend d'un Catalogue joignable et d'un secret de build. Sans secret, il s'arrête en
  nommant le Catalogue ; un Catalogue vide construit quand même, avec le paramètre de repli.
- L'injection du secret de build par Coolify n'est pas encore observée : le premier déploiement doit
  la confirmer, et c'est la seule hypothèse de cette décision qui reste à vérifier sur la plateforme.
- Une URL de Catalogue créée après le build n'est pas dans les paramètres prérendus : elle rend à la
  demande à l'origine et n'est pas stockée à l'edge ; un redéploiement la rend prérendue et
  cacheable.
- Un slug inconnu reste le soft-404 d'ADR-0011, rendu à l'origine et non caché. Le repli
  `__placeholder__` cuit un 404 qui porte `s-maxage` mais que la règle de zone exclut, sans effet
  sur un slug réel.
- Un déploiement purge la zone avant que le nouveau conteneur ne prenne le trafic. Avec des
  identifiants, une panne de Cloudflare retient le déploiement ; sans identifiants (ou avec
  `PURGE_EDGE=off`), le déploiement passe et ne purge pas.
- La fenêtre entre la purge et la prise de trafic reste ouverte quelques secondes de réconciliation
  Compose ; elle n'est pas fermée par une seconde purge.
- L'application ne pose jamais les règles de zone : sans l'étape d'opérateur, la zone reste
  inéligible au cache et les documents ne sont pas stockés, même s'ils portent `s-maxage`.

## Ce qui reste dehors

- **Cloudflare Workers.** `cacheComponents` suppose un processus Node de longue durée, et la pile
  est Node de bout en bout : Prisma 7 (compilateur WASM, `node:path`, `Buffer`) sur `pg` en TCP, un
  client Redis en TCP dans le cache handler, `sharp` pour l'optimiseur d'images, `better-auth` avec
  `node:crypto`/`node:http`/`node:sqlite`, et `@aws-sdk/client-s3`. C'est une réécriture, pas un
  changement de déploiement.
- **Le cache d'edge de `/_next/image`.** Les images sont l'autre moitié de la latence d'un Visiteur
  lointain ; elles auront leur ticket, avec leurs variantes de largeur et leur propre risque.
- **Le filtrage de `/produits` par query string.** La page reste un rendu d'origine ; découper une
  page d'atterrissage statique et un filtrage client est un autre problème.
- **Le cache de tout document d'un Client.** `/panier`, `/checkout`, `/commandes`, `/profil` et
  `/commande/confirmation/*` continuent de lire leurs données au serveur et restent hors du cache
  partagé.
- **Le cache de l'espace Administration.** Ses pages et ses mutations gardent leurs invalidations
  d'origine ; aucune n'est un document anonyme.

## Invariants

- Une URL de la boutique qui n'est pas un document de Client rend un seul document, identique pour
  un Visiteur et pour un Client ; un document anonyme ne dépend ni du cookie `panier-visiteur`, ni
  de la Session courante.
- Aucun document anonyme ne porte de nom, de fait du Compte client, de compteur d'articles ou
  d'Article du panier. Le badge et l'Aperçu lisent leur Panier après peinture, par deux réponses
  `private, no-store`.
- Le badge peut être absent, puis apparaître ; il ne montre jamais « 0 », ne déplace rien, et une
  lecture en échec le laisse absent.
- Seul `connecte` traverse la frontière pour l'Aperçu ; aucun fait d'identité ne la traverse.
- Une mutation du Panier passe par `useMutationsDuPanier` et signale le changement ; le badge et un
  Aperçu ouvert relisent sans dépendre du `refresh()` de l'action.
- Le Catalogue est prérendu par URL pour les Produits, les Structures et les articles dont le statut
  est `publie` ou `archive` ; `/` et `/blog` sont statiques ; `/produits` et les slugs inconnus
  restent des rendus d'origine.
- `partialPrefetching` reste non activée, et aucune règle `/_next/image` n'est ajoutée à l'artefact.
- L'artefact de zone porte deux règles ordonnées, le contournement `RSC`/`Next-Router-Prefetch`
  avant l'éligibilité, et l'éligibilité répète la négation des deux têtes parce que la dernière
  règle qui fixe un réglage l'emporte.
- Le mode de TTL de l'éligibilité est `bypass_by_default`, sans `override_origin` ni
  `status_code_ttl` ; `Set-Cookie` n'est jamais retiré pour être caché.
- Les règles de zone sont appliquées par une étape d'opérateur, jamais par l'application ; un seul
  appel les retire.
- Un déploiement purge la zone après la migration et avant que le nouveau conteneur ne prenne le
  trafic ; sans identifiants, la purge est un no-op journalisé.
- Avec des identifiants, un déploiement dépend de la disponibilité de Cloudflare : une purge refusée
  retient le déploiement.
- Une URL de Catalogue nouvelle n'est prérendue qu'après un redéploiement ; avant, elle rend à la
  demande à l'origine et n'est pas cachée à l'edge.
- Les écritures d'administration et les Commandes purgent les mêmes documents que `revalidateTag` :
  un seul vocabulaire de tags, un port avec une implémentation en mémoire et une implémentation
  Cloudflare, des lots de 100 URLs, et une purge en échec journalisée, jamais fatale à l'écriture.
- Une Commande relève les Produits qu'elle draine dans la transaction ; aucune ligne de Commande ne
  stocke de slug, et aucune recherche par article ne suit le commit — une seule Lecture de la
  Structure résout la chaîne des Produits touchés.
- Le comportement accessible de #746 reste celui de l'Aperçu : dialogue, focus, chemins de
  fermeture, trois états, pas de sélecteur de quantité. Seule sa décision de rendu serveur est
  remplacée.
