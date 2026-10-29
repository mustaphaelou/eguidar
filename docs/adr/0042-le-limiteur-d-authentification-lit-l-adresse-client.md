# Le limiteur d'authentification lit l'adresse client derrière Cloudflare

Le limiteur de Better Auth ne lit que `x-forwarded-for`, et refuse de conclure quand cet en-tête
porte plus d'un relais. Derrière Cloudflare puis le proxy Coolify, il en porte deux : le limiteur
retombe alors sur un compartiment unique, `no-trusted-ip|chemin`, partagé par tous les visiteurs.
La règle « trois connexions par dix secondes » devient un plafond pour le site entier, tout en
supprimant toute protection par client. Le défaut est lu dans `better-auth@1.6.26` :
`DEFAULT_IP_HEADERS` vaut `["x-forwarded-for"]`, et sans `trustedProxies` une valeur multi-relais
rend `null` (`node_modules/@better-auth/core/dist/utils/ip.mjs:188-194`). La Recherche, elle, lit
déjà `cf-connecting-ip`, puis `x-real-ip`, puis le dernier relais de `x-forwarded-for` : deux
chemins, deux règles, et la protection que le dépôt croit tenir n'est pas celle qu'il tient
(ticket #819, spec #811).

## Décision

- **`advanced.ipAddress.ipAddressHeaders` est configuré**, dans le même ordre de préférence que
  le résolveur `lib/adresse-client.ts` : `cf-connecting-ip`, puis `x-real-ip`, puis
  `x-forwarded-for`. La constante `ORDRE_ENTETES_ADRESSE_CLIENT` a un seul propriétaire et la
  configuration en prend une copie : la bibliothèque et le dépôt ne peuvent pas diverger. La
  Recherche lit la même fonction pure, `adresseClient()`, et `lib/limiteur-recherche.ts` n'en
  porte plus de copie.

- **`advanced.ipAddress.trustedProxies` est renseigné** avec la chaîne observée : les plages
  publiées de Cloudflare — IPv4 selon
  [ips-v4](https://www.cloudflare.com/ips-v4), IPv6 selon
  [ips-v6](https://www.cloudflare.com/ips-v6), relevées le 29 octobre 2026 — puis les plages
  privées et de boucle d'un proxy d'hébergement (`10.0.0.0/8`, `172.16.0.0/12`,
  `192.168.0.0/16`, `127.0.0.0/8`, `::1/128`). La constante `PROXIES_DE_CONFIANCE` porte la
  liste, et un test de conformité l'épingle sur les options d'authentification.

- **La remontée se fait de droite à gauche, et retient le premier relais non fiable.**
  `better-auth@1.6.26` parcourt la chaîne depuis le dernier relais, saute les plages déclarées
  fiables et rend la première adresse qui n'en fait pas partie
  (`node_modules/@better-auth/core/dist/utils/ip.mjs:178-186`) ; le premier relais, forgeable,
  n'est donc jamais retenu. Vérifié par exécution avec la liste du dépôt :
  `x-forwarded-for: "203.0.113.7, 10.0.0.2"` rend `203.0.113.7`, et `null` sans
  `trustedProxies`. Les en-têtes sont essayés dans l'ordre configuré, et une valeur non résolue
  fait passer au suivant, comme le fait `getIp()` (`…/ip.mjs:201-217`).

- **Le résolveur valide l'adresse avant de la rendre, et nomme le repli.** La valeur retenue
  est validée comme adresse IPv4 ou IPv6 par `node:net` `isIP` ; une valeur qui n'est pas une
  adresse est ignorée, et `adresseClient()` rend `ADRESSE_CLIENT_PARTAGEE` quand aucun en-tête
  utilisable ne reste. C'est la même constante partagée que les deux limiteurs utilisent
  lorsqu'aucune adresse n'est résolue.

## Options considérées

- **Laisser le défaut et désactiver le limiteur** — rejetée : on perdrait la seule protection
  contre le bourrage d'identifiants.
- **Limiter dans le proxy** — rejetée : la règle doit rester lisible depuis la configuration
  d'authentification, et le proxy ne connaît pas les chemins `/api/auth/*` métier.
- **Ne configurer que `ipAddressHeaders`, sans `trustedProxies`** — rejetée : le résolveur
  retient le dernier relais, qui est le proxy Coolify, pas le Client. La règle « premier relais
  non fiable » a besoin de la liste des plages fiables pour remonter jusqu'au Client.
- **Déclarer chaque adresse de proxy plutôt que des plages privées** — rejetée : le proxy
  d'hébergement n'a pas d'adresse stable connue de la configuration applicative ; les plages
  privées couvrent l'origine Coolify. Le risque est borné par l'invariant ci-dessous.

## Invariants

- Deux visiteurs derrière la même adresse ne partagent pas le compteur d'un troisième.
- Aucun compartiment `no-trusted-ip` n'est atteint en production ; un avertissement du limiteur
  dans les journaux est un défaut de configuration, pas un bruit.
- L'ordre de préférence des en-têtes a un seul propriétaire, `lib/adresse-client.ts`, et un test
  de conformité compare les options de Better Auth à cette constante.
- Les plages privées ne sont sûres que tant que l'origine n'est joignable qu'à travers le proxy :
  un client qui atteindrait l'origine directement pourrait poser ses propres en-têtes et se
  déclarer fiable. C'est l'hypothèse de déploiement que la bibliothèque documente elle-même
  (`trustedProxies` « is safe only when your origin is reachable through these proxies and
  clients cannot set forwarded headers directly »).
