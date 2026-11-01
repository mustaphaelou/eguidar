# Une demande de suppression Facebook supprime le Compte client en entier

Meta impose à toute application qui reçoit des données d'utilisateur un point d'entrée de
suppression des données et une page d'état. Le point d'entrée reçoit un `signed_request` — deux
segments base64url, la signature HMAC-SHA256 du second, signée avec le secret de l'application —
et doit répondre `{ url, confirmation_code }` : l'URL d'une page publique qui confirme la
suppression, et un code que Meta présente à la personne. Le présent ADR enregistre comment
eguidar satisfait cette obligation pour sa Connexion sociale Facebook, et pourquoi la suppression
est complète plutôt qu'anonymisée.

Le dépôt n'a aucune politique de rétention qui justifierait de conserver une Commande après le
départ du Client. Une Commande porte le nom, l'adresse, le téléphone et le contenu du panier
d'une personne : l'anonymiser serait déjà une conservation, et le Client a demandé la
suppression. Meta demande d'ailleurs la suppression « des données de l'utilisateur », pas leur
masquage. La seule réponse honnête est donc la suppression dure.

## Décision

- **Le point d'entrée est public et vit hors de la garde de session.**
  `POST /api/facebook/suppression-donnees`
  (`app/api/facebook/suppression-donnees/route.ts`) est appelé par les serveurs de Meta, jamais
  par un navigateur porteur d'un cookie : il ne lit ni session ni cookie, et le proxy ne le garde
  pas (son `matcher` ne couvre que `/admin`, `/compte`, `/connexion` et `/inscription`). Le corps
  accepté est le formulaire `application/x-www-form-urlencoded` que Meta envoie
  (`signed_request=<...>`) ; un corps JSON portant `signed_request` est accepté par la même route
  pour les essais et les rejeux.

- **La signature se vérifie avant toute lecture, en temps constant.** `verifierSignedRequest`
  (`lib/suppression-donnees-facebook.ts`) coupe le document sur le point, exige exactement deux
  segments non vides, recalcule `HMAC-SHA256(payload_b64, FACEBOOK_CLIENT_SECRET)` et compare les
  octets avec `crypto.timingSafeEqual`, après avoir vérifié que les deux tampons ont la même
  longueur — `timingSafeEqual` lève sur des longueurs différentes, et la garde est donc une
  condition de sûreté, pas une optimisation. La charge utile décodée doit porter un `user_id` non
  vide et `algorithm: "HMAC-SHA256"`. Le secret est lu à l'appel
  (`process.env.FACEBOOK_CLIENT_SECRET`), pas à l'import : les tests le posent sans recharger le
  module, et une rotation d'environnement n'exige pas de redéploiement du code. Une signature
  absente, malformée ou fausse rend `403` et ne supprime rien ; un secret absent rend `500` et ne
  supprime rien non plus.

- **La suppression est complète, dans une seule transaction.** `supprimerDonneesFacebook` cherche
  les lignes `account` de fournisseur `facebook` dont `accountId` est l'identifiant applicatif,
  puis supprime, pour leurs Comptes clients, les `Order`, les lignes `verification` rattachées à
  leurs adresses (la table n'a pas de clé étrangère vers `user`) et les `user` dans un même
  `prisma.$transaction`. Les `OrderItem` suivent leur Commande par cascade ; les `account`,
  `session`, `CartItem` et `BrouillonImageProduit` suivent le Compte client par cascade. Le schéma
  n'a pas changé : `Order.user` n'est pas en cascade, donc les Commandes partent explicitement
  avant le Compte client. Un identifiant inconnu ne supprime rien et rend quand même `200` avec un
  code : Meta rejoue, et une demande déjà satisfaite n'est pas une erreur.

- **Les pages cachées des Commandes sont invalidées après le commit.** `supprimerDonneesFacebook`
  collecte les identifiants des `Order` supprimées et appelle `invalidateCommande` pour chacune,
  après la transaction. ADR-0014 demande que l'invalidation vive à côté de la suppression, et une
  page `/admin/commandes` ou `/commandes` ne doit pas continuer à servir une Commande effacée.

- **La signature malformée est refusée avant le décodage.** Le document doit être exactement deux
  segments base64url non vides (`^[A-Za-z0-9_-]+={0,2}$`) : `Buffer.from(..., "base64url")` ignore
  silencieusement les caractères invalides, donc un segment `sig!###` décoderait les mêmes octets
  qu'une signature valide. La garde rend la promesse de l'invariant vraie.

- **La réponse et ses erreurs ne se mettent pas en cache.** Toutes les réponses portent
  `cache-control: no-store` ; un refus de signature rend `403`, un secret absent ou un échec de la
  transaction rend `500` avec un message générique (`La suppression des données est
  indisponible.`), et le détail reste dans le journal serveur. Le corps d'erreur ne dit pas si
  l'application est configurée.

- **Aucun enregistrement n'est journalisé.** Ni le `signed_request` brut, ni l'identifiant
  applicatif, ni la charge utile ne passent par un journal : le document est un secret porteur
  d'identité, et une ligne de journal suffirait à le rendre lisible par quiconque consulte les
  logs. La route ne journalise rien ; elle répond.

- **La réponse porte exactement les deux champs que Meta attend.** `confirmation_code` est
  16 octets aléatoires en hexadécimal (`randomBytes(16).toString("hex")`), donc non devinable ;
  `url` est une URL absolue vers `/suppression-donnees?code=<code>`, bâtie sur
  `BETTER_AUTH_URL`, à défaut `NEXT_PUBLIC_BETTER_AUTH_URL`, à défaut l'origine de la requête.
  Les deux noms de champs sont le contrat : `url` et `confirmation_code`, sans traduction.

- **La page d'état est publique et ne lit pas la base.**
  `app/(boutique)/suppression-donnees/page.tsx` lit `code` dans `searchParams` (une promesse en
  Next 16), n'affiche que 1 à 64 caractères alphanumériques, confirme en français que la demande a
  été traitée et affiche le code. Elle ne consulte ni session ni base : le code n'est pas une
  preuve à valider, c'est le jeton que Meta a reçu et que la personne peut recopier. Son texte dit
  « si des données étaient rattachées à ce compte Facebook », parce qu'un identifiant inconnu rend
  aussi un code. Elle vit sous `(boutique)` et hérite donc du Bandeau de navigation et du pied de
  page, sans entrée dans la garde du proxy.

- **Le seul geste manuel est l'enregistrement dans le tableau de bord Meta.** La route doit être
  déclarée comme « Data Deletion Request URL » dans l'application Meta, et elle doit être servie
  en HTTPS public : Meta n'appelle pas `localhost`, et son exigence de production ne se contourne
  pas. L'URL complète est `https://<domaine>/api/facebook/suppression-donnees`, où `<domaine>` est
  l'hôte de `BETTER_AUTH_URL` ; le README nomme ce geste à côté des clés Facebook. Aucun autre
  réglage n'est nécessaire côté Meta. C'est le seul pas manuel de cette décision, et il se fait
  une fois par application.

## Options envisagées

- **Anonymiser les Commandes au lieu de les supprimer** — rejeté : il n'existe aucune politique de
  rétention qui donnerait une base à cette conservation, et une Commande anonymisée reste une
  ligne de commande que personne n'a demandée. Le Client a demandé la suppression de ses données ;
  la réponse est la suppression, pas le masquage.
- **Supprimer seulement le Compte client et laisser les Commandes** — rejeté : `Order.user` n'est
  pas en cascade, donc les Commandes survivraient avec le nom, l'adresse et le téléphone du
  Client. Ce serait exactement la donnée que Meta demande d'effacer.
- **Vérifier la signature en comparaison naïve (`===`)** — rejeté : une comparaison qui s'arrête au
  premier octet différent fuit la signature octet par octet. `timingSafeEqual` compare en temps
  constant ; la garde de longueur égale est sa condition d'appel.
- **Lire le secret à l'import du module** — rejeté : le module deviendrait impossible à éprouver
  sans variables d'environnement globales, et une rotation exigerait un redéploiement. La lecture
  à l'appel est le contrat des tests.
- **Rendre `404` ou `400` pour un identifiant inconnu** — rejeté : Meta rejoue les demandes, et une
  demande déjà satisfaite doit rester un succès. Un `404` transformerait une suppression réussie
  en échec apparent.
- **Construire l'URL d'état sur l'en-tête `Host` de la requête** — rejeté : cet en-tête est fourni
  par l'appelant et peut désigner un hôte arbitraire. `BETTER_AUTH_URL` est la seule origine que
  le déploiement connaît ; l'origine de la requête n'est qu'un repli de développement.
- **Une page d'état qui valide le code en base** — rejeté : elle exigerait de conserver le code,
  donc une donnée de plus à protéger, pour une preuve que Meta n'exige pas. La page confirme et
  affiche.

## Invariants

- Le point d'entrée est public, sans session ni cookie, et le proxy ne le garde pas.
- Une signature fausse, absente ou malformée rend `403` et ne supprime rien ; un
  `FACEBOOK_CLIENT_SECRET` absent rend `500` et ne supprime rien.
- La comparaison de signature est un `HMAC-SHA256` sur le segment de charge encodé, comparé en
  temps constant après une garde de longueur égale.
- Une demande valide supprime le Compte client, ses Commandes, leurs `OrderItem`, les lignes
  `verification` de ses adresses et tout ce que la cascade du Compte client emporte, dans une seule
  transaction ; les pages de Commande invalidées ne servent plus la Commande supprimée.
- Un identifiant applicatif inconnu rend `200` avec `{ url, confirmation_code }` et ne supprime
  rien.
- La réponse porte exactement `url` et `confirmation_code` ; le code est 16 octets aléatoires en
  hexadécimal, et l'URL pointe vers `/suppression-donnees?code=<code>`. Toutes les réponses,
  succès comme refus, portent `cache-control: no-store`.
- La page d'état confirme la suppression et affiche le code, sans lire la base ni la session.
- Ni le `signed_request` brut ni l'identifiant applicatif n'apparaissent dans un journal.
- Le seul geste manuel est l'enregistrement du chemin `/api/facebook/suppression-donnees` comme
  URL de suppression dans le tableau de bord de l'application Meta, servi en HTTPS public.
- Aucun changement de schéma Prisma n'est nécessaire.
