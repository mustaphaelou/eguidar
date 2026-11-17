# La Vérification de l'e-mail ouvre la Session, et le Client ne se connecte plus deux fois

## Contexte

L'Inscription crée un Compte client sans Session : `requireEmailVerification` éteint l'auto-connexion,
et le Compte client reste inutilisable jusqu'à la Vérification de l'e-mail. Cette Vérification
prouvait l'adresse, puis rendait la main au Client — « Votre e-mail est vérifié. Connectez-vous. » —
qui devait présenter son mot de passe une seconde fois, au même endroit, dans la même intention.

Dans une boutique, la création de compte est l'entrée de l'achat. Le parcours coûtait donc quatre
écrans, un mot de passe saisi deux fois et trois Tests de sécurité pour une commande payée à la
livraison. La Vérification elle-même venait de prouver l'adresse : rien, dans ce second passage,
n'ajoutait une preuve que la bibliothèque n'avait pas déjà.

## Décision

- **La Vérification de l'e-mail ouvre la Session.** `emailVerification.autoSignInAfterVerification`
  est activé : l'échange du code rend le Compte client vérifié et pose le cookie de Session dans la
  même réponse. Le Client quitte l'étape du code connecté.
- **L'Inscription ne crée toujours pas de Session.** La règle qui empêche un Compte client non
  vérifié de se connecter ne bouge pas ; c'est le second facteur de connaissance du Compte client —
  la possession de la boîte — qui l'ouvre maintenant.
- **Le mot de passe reste le secret de la Connexion suivante.** Le Client l'a choisi à l'Inscription,
  il l'utilise à la Connexion par mot de passe et à la Réinitialisation du mot de passe. Aucun
  parcours ne disparaît.
- **La modale ferme sur la Destination post-connexion**, ou se ferme. L'avis « Votre compte est créé
  et votre adresse e-mail est vérifiée. Connectez-vous. » n'a plus de producteur et quitte la
  copie ; l'option `avis` du contexte reste, elle nomme un fait que d'autres surfaces peuvent encore
  vouloir dire.
- **Le même échange, sur la Connexion,** quand le mot de passe est bon mais l'adresse non vérifiée :
  il finit connecté, pas devant un formulaire.

## Options envisagées

- **Laisser le Client se reconnecter.** Rejetée : c'est exactement le coût que la décision supprime,
  et la seconde saisie n'ajoute aucune preuve.
- **Créer la Session à l'Inscription** (`autoSignIn: true`, sans vérification). Rejetée : elle
  publierait des Comptes clients non prouvés, et rendrait la Vérification de l'e-mail facultative
  dans les faits.
- **Signer par code sans mot de passe.** Rejetée ici : le mot de passe reste le secret de la
  Connexion, et un changement de cette taille passe par sa propre décision.

## Invariants

- Un Compte client non vérifié ne peut pas se connecter.
- L'échange du code est la seule preuve de l'adresse, et il ouvre la Session une fois.
- Le mot de passe choisi à l'Inscription authentifie la Connexion suivante.
- Aucune Session n'existe avant la Vérification de l'e-mail.

## Ce que cet ADR coûte

- **Le second facteur devient la boîte mail, une fois.** Un Client qui perd l'accès à sa boîte avant
  la Vérification ne peut plus ouvrir son Compte client ; la Réinitialisation du mot de passe passe
  elle aussi par cette boîte. C'était déjà la règle, mais elle devient un point de passage et non
  plus une formalité avant un formulaire.
- **La déclaration est réécrite** : `docs/auth-pathways.md` porte la Session ouverte à la
  Vérification, et le glossaire dit que l'échange de la Connexion finit connecté.
- **Un test de parcours tient l'invariant** : la réponse de la Vérification porte le jeton de
  Session, et le parcours serveur le prouve à chaque exécution.
