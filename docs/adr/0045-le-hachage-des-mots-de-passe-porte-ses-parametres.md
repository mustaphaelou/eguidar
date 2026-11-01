# Le hachage des mots de passe porte ses paramètres, et se met à niveau à la Connexion

Better Auth hachait les mots de passe avec son scrypt par défaut — `N=2^14`,
`r=16`, `p=1`, soit 32 Mio — et stockait `sel:hex`, sans algorithme ni facteur de
travail. Ce format ne dit rien sur la façon dont l'empreinte a été produite :
augmenter le coût plus tard n'aurait laissé que deux issues, un rehachage en
masse ou une réinitialisation forcée pour tout le monde. OWASP recommande
pourtant de stocker l'algorithme et ses paramètres avec l'empreinte (format PHC
modulaire), et son tableau scrypt place le palier le plus coûteux à `N=2^17`,
`r=8`, `p=1` (128 Mio).

## Décision

- **Le format est un scrypt auto-descriptif inspiré du PHC.** `hacherMotDePasse` écrit
  `$scrypt$N=131072,r=8,p=1$<sel base64url>$<clé base64url>` : un sel de 16
  octets et une clé de 64 octets, `NFKC` appliqué au mot de passe comme le
  faisait la bibliothèque. `verifierMotDePasse` relit `N`, `r` et `p` dans la
  chaîne et recalcule avec ces paramètres ; il compare les tampons en temps
  constant (`timingSafeEqual`, après une garde de longueur).
- **Les paramètres sont ceux du palier OWASP le plus fort**, `N=2^17`, `r=8`,
  `p=1`. Sur la machine de développement (AMD Ryzen 5 PRO 7530U), ce palier
  mesure ~480 ms pour une empreinte, sous la cible d'une seconde ; les paliers
  plus faibles du tableau OWASP mesurent 199 ms (`2^14/8/5`), 274 ms
  (`2^15/8/3`) et 360 ms (`2^16/8/2`). La confirmation sur l'hôte Coolify est le
  geste manuel de #837 ; si elle dépassait une seconde, le palier immédiatement
  inférieur reste dans le tableau OWASP et se change dans
  `PARAMETRES_SCRYPT`, ce qui déclenche le rehachage opportuniste ci-dessous.
- **L'ancien format reste vérifiable.** Une empreinte `sel:hex` est recalculée
  avec les paramètres historiques (`N=2^14`, `r=16`, `p=1`, clé de 64 octets) et
  la même convention de sel que la bibliothèque : la chaîne hexadécimale
  elle-même, encodée en UTF-8. Aucun Compte client existant n'est obligé de
  réinitialiser son mot de passe.
- **Le rehachage est opportuniste, au moment où le mot de passe est vérifié.**
  `verifierMotDePasseEtRehacher` est le couple `hash`/`verify` de Better Auth :
  il s'exécute à chaque vérification d'un mot de passe — Connexion, changement
  de mot de passe, suppression de compte — et, si l'empreinte est historique ou
  sous la cible, réécrit la ligne `account` de fournisseur `credential` qui la
  portait. La Connexion est le chemin qui migre la table ; les autres chemins ne
  font qu'avancer la même ligne. Une erreur d'écriture est journalisée et ne
  ferme pas la Connexion : la migration est un effet de bord du succès, pas une
  condition. Un mauvais mot de passe ne réécrit jamais rien. Une vérification
  correcte suivie d'un refus ultérieur (par exemple e-mail non vérifié) peut
  déjà avoir rehaché : le mot de passe est prouvé, et le format n'attend pas la
  porte suivante.
- **Un hash stocké ne peut pas imposer un scrypt démesuré.** La relecture
  plafonne la mémoire de dérivation à deux fois celle du palier courant
  (`128·N·r ≤ 2·128·2^17·8`, soit 256 Mio) et les passes à huit fois le palier
  courant, avant de dériver ; un paramètre hors bornes, ou une empreinte de plus
  de 1 024 caractères, est un refus, pas une erreur serveur. Le format et les
  paramètres sont ainsi une donnée non fiable lue avec prudence, pas une
  configuration exécutée aveuglément. Le seed de l'Administration utilise le
  même hachage.

## Options envisagées

- **argon2id** — rejeté : aucune dépendance native n'est présente dans l'image,
  et scrypt est nativement supporté par Node. Le gain marginal ne justifie pas
  une nouvelle dépendance de build.
- **Garder le défaut de la bibliothèque et forcer une réinitialisation** —
  rejeté : c'est précisément la migration coûteuse que cette décision évite, et
  le coût actuel est sous le plancher OWASP.
- **Un lot de rehachage hors ligne** — rejeté : il demande une passe sur toute
  la table, un état de progression et une fenêtre d'exécution ; la Connexion
  réussie est le seul moment où le mot de passe en clair est disponible.
- **Lire les paramètres dans une variable d'environnement** — rejeté : le format
  stocké porte déjà ses paramètres, et une variable non versionnée rendrait une
  empreinte illisible après un changement de configuration.
- **Réécrire l'empreinte avant de vérifier** — rejeté : on ne peut pas hacher un
  mot de passe non vérifié, et un refus ne doit jamais modifier la base.

## Invariants

- Toute nouvelle empreinte est un PHC `$scrypt$N=…,r=…,p=…$sel$clé` dont la
  vérification relit les paramètres stockés.
- Une empreinte `sel:hex` reste vérifiable avec les paramètres historiques, et
  n'est réécrite qu'après une Connexion réussie.
- Un mot de passe faux, une empreinte malformée ou des paramètres hors bornes
  rendent `false` sans lever et sans écrire.
- La seule écriture de rehachage cible une ligne `account` de fournisseur
  `credential` dont la colonne `password` vaut l'ancienne empreinte, et elle est
  faite par identifiant après une lecture unique.
- Le mot de passe en clair ne quitte jamais le processus de vérification et
  n'entre dans aucune clé de journal.
