# Le cache de détail admet un budget borné de clés, et un refus d'écriture est un miss silencieux

Les lecteurs publics de `/produit/[slug]`, `/categorie/[slug]` et `/blog/[slug]` passent le segment
d'URL brut aux lectures mises en cache à distance. Un slug inconnu est donc caché comme un autre :
[ADR-0011](0011-soft-404-streamed-catalog-pages.md) garde volontairement les résultats nuls en
cache, faute de quoi chaque requête de robot sur un slug inventé atteindrait Postgres. Le défaut
n'est pas cette politique, c'est l'absence de borne agrégée : chaque slug distinct écrit une clé
dans le Redis partagé, avec un TTL de 24 heures, et rien ne plafonne le nombre de clés. Le même
Redis porte les compteurs d'échecs de Connexion et le limiteur de Recherche. Une personne anonyme
peut donc faire croître le keyspace sans limite.

La mesure du défaut, au commit revu : 300 slugs inconnus distincts ont produit exactement 300 clés
retenues (`DBSIZE` passé de 0 à 300), avec des TTL de 86389 à 86396 secondes et le slug présent
dans les tags de chaque entrée ; aucun `del`, `unlink` ni `flushall` n'apparaît sur le chemin de
lecture. Le record d'audit
`cache-handlers/redis-handler.js:set:storefront-slug-remote-cache-keys-unbounded` est confirmé
medium.

## Décision

- **Une entrée de détail est une entrée dont un tag porte un préfixe de détail.** Les préfixes sont
  `product:`, `category:` et `blog:` ; une entrée dont aucun tag ne commence par l'un des trois
  n'est pas une entrée de détail. Les trois préfixes ont un seul propriétaire,
  `cache-handlers/prefixes-detail.js`, que lisent les constructeurs de tags et le handler : la
  couture ne peut pas diverger.

- **Le budget vit dans un sorted set Redis, et son score est l'instant d'expiration.** La clé est
  `eguidar:cache:detail-budget` ; le membre est la clé de cache, le score est l'instant
  d'expiration en millisecondes (`Date.now() + ttl * 1000`). Sur une écriture de détail, le handler
  ajoute le membre ou met à jour son score, purge les membres dont le score est échu
  (`zRemRangeByScore` jusqu'à maintenant), puis lit la cardinalité. Le sorted set est donc purgé
  par score et ne survit pas à l'expiration des entrées.

- **Le plafond est de 10 000 clés de détail par défaut, et `CACHE_DETAIL_KEYS_MAX` est lue à
  chaque écriture.** La variable d'environnement est lue à l'appel, jamais au chargement du module,
  pour qu'un test ou un opérateur puisse la changer sans modifier le code. Absente, vide, non
  numérique, non finie ou inférieure ou égale à zéro, la valeur par défaut s'applique ; une valeur
  positive décimale est plancherée. Aucun autre plafond n'entre par cette décision.

- **Le refus est un miss silencieux.** Quand la cardinalité dépasse le plafond après l'ajout, le
  handler retire le membre de l'écriture courante et n'écrit pas l'entrée ; il ne lève jamais. Le
  rendu de la page suit son cours, et la lecture suivante est un miss, pas une erreur. Une panne
  Redis sur le chemin du budget est avalée de la même façon : l'entrée est écrite comme avant, et
  le contrat best-effort du cache ne change pas.

- **L'accueil, les listes et l'Administration ne sont ni comptés ni refusés.** Une écriture sans tag
  de détail ne consulte ni ne modifie le budget ; aucune commande de sorted set n'est appelée pour
  elle. Il n'y a pas de plafond global : un budget de détail plein n'arrête pas le cache de la page
  d'accueil ou des listes.

- **Les entrées déjà admises ne sont pas évincées.** Un refus ne retire que le membre de l'écriture
  courante ; le budget ne fait jamais de place en supprimant une autre entrée admise. Une entrée
  réécrite reçoit un nouveau score et reste dans le budget.

- **Le TTL de 24 heures et le plafond de 30 jours restent inchangés.** Le handler écrit toujours
  `EX: ttl` avec le même encodage (`value`, `tags`, `stale`, `timestamp`, `expire`, `revalidate`) ;
  cette décision borne la cardinalité, pas la durée de vie. Le plafond de 30 jours du handler
  demeure.

- **Le budget est approximatif entre répliques, sans verrou ni script.** Deux écrivains
  concurrents peuvent dépasser le plafond, et le dépassement vaut au plus le nombre d'écritures
  simultanées. Aucun verrou distribué, aucun script Lua et aucun service de coordination n'est
  ajouté : un budget approximatif suffit à fermer la croissance non bornée.

- **Les clés écrites avant le déploiement ne sont comptées qu'à leur réécriture.** Le sorted set
  naît vide ; le keyspace existant n'est pas rétro-rempli. Les 24 premières heures après le
  déploiement peuvent donc dépasser le plafond du nombre de clés déjà présentes, jusqu'à ce que
  chacune soit réécrite ou expire. C'est une conséquence assumée, pas une mesure exacte.

## ADR-0011 tient : les résultats nuls restent cachés

[ADR-0011](0011-soft-404-streamed-catalog-pages.md) garde les résultats nuls en cache, et cette
décision ne la réécrit pas. Un résultat nul porte le tag de détail de son slug : il est une entrée
de détail comme une autre, compté et admis tant que le budget a de la place. Sans ce cache, chaque
requête de robot sur un slug inventé atteindrait Postgres ; le budget borne la cardinalité, il
n'arrête pas la politique des nuls. Les deux décisions se composent : un nul n'est refusé que
lorsque la capacité manque, et le refus reste un miss rendu.

## Ce qui reste non observé

- Le `maxmemory` et la politique d'éviction du Redis déployé. Le budget borne le nombre de clés ; il
  ne garantit pas que le Redis déployé a la mémoire pour les admettre.
- Les règles de débit de Cloudflare devant les routes publiques.
- Les courses entre répliques, qui rendent le plafond approximatif.

Le budget ferme la cardinalité non bornée du cache de détail. L'épuisement déployé, lui, dépend
encore de la capacité du Redis et des règles de l'edge : cette décision ne les remplace pas.

## Hors du budget

- Le durcissement du déploiement (`maxmemory`, politique d'éviction, dimensionnement).
- L'arrêt du cache des résultats nuls ; ADR-0011 le refuse et cette décision le conserve.
- La limitation du débit des routes publiques.
- L'éviction des entrées de détail légitimes déjà présentes.

## Options envisagées

- **Réduire le TTL des entrées de détail** — rejeté : cela ralentit la croissance sans la borner, et
  le handler ne sait pas distinguer un nul d'un Produit existant au moment de l'écriture.
- **Plafonner toutes les entrées du cache** — rejeté : un budget de détail plein arrêterait aussi
  l'accueil et les listes, que la spec #999 protège.
- **Évincer une entrée admise pour faire de la place** — rejeté : le budget évincerait des entrées
  légitimes pour admettre des slugs indésirables, et ferait varier le cache des pages valides.
- **Un verrou ou un script Lua pour un compte exact** — rejeté : le coût de coordination dépasse le
  besoin ; un dépassement borné par les écritures concurrentes est acceptable.
- **Arrêter le cache des résultats nuls** — rejeté par ADR-0011 : chaque slug indésirable
  atteindrait Postgres.
- **Limiter le débit des routes publiques** — rejeté dans ce budget : c'est une autre décision, avec
  ses propres règles d'edge.

## Invariants

- Une entrée dont un tag commence par `product:`, `category:` ou `blog:` est une entrée de détail ;
  aucune autre ne l'est.
- Le budget n'ajoute qu'une clé Redis, `eguidar:cache:detail-budget` ; aucune autre clé n'est
  créée ni modifiée par cette décision.
- Avec un plafond N et un budget vide, les N premières clés de détail distinctes sont admises, la
  N+1ᵉ est refusée et devient un miss.
- Un refus d'écriture ne lève jamais et ne défait pas le rendu ; une erreur Redis sur le chemin du
  budget laisse l'écriture se faire comme avant.
- Le TTL de 24 heures et le plafond de 30 jours restent ceux du handler ; une entrée admise n'est
  jamais évincée par une écriture postérieure.
