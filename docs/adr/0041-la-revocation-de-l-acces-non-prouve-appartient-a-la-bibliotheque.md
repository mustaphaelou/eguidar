# La révocation de l'accès non prouvé appartient à la bibliothèque

Un Compte client dont l'e-mail n'est pas vérifié ne prouve pas que le mot de passe posé dessus
appartient au propriétaire de la boîte. La couture `emailVerification.beforeEmailVerification`
révoquait cet accès avant toute promotion — y compris la promotion que l'Inscription déclenche
elle-même, quelques secondes après que le Client a choisi son mot de passe. À l'Inscription, la
bibliothèque crée le Compte client avec `emailVerified: false`, puis lie un compte `credential` qui
porte le mot de passe. La Vérification de l'e-mail appelait la couture avant d'écrire
`emailVerified: true` ; la couture, elle, supprimait tous les comptes `credential` et toutes les
sessions du Compte client, puis la modale invitait à se connecter avec un mot de passe qui n'existait
plus. Chaque Inscription par e-mail et mot de passe finissait donc sans mot de passe, et la seule
entrée qui restait était « Mot de passe oublié » — une récupération de compte, pas une Inscription.

Le geste protecteur existait déjà en amont, au bon endroit. Better Auth 1.6.26 porte
`revokeUnprovenAccountAccess` : « When a sign-in OTP confirms a pre-existing account whose email was
never verified, any existing password on that account is removed and its sessions are revoked. » Il
ne s'exécute que sur `/sign-in/email-otp`, la seule route où la preuve d'adresse arrive d'ailleurs
que de la session d'inscription. La Vérification de l'e-mail n'est pas cette route : la personne qui
prouve l'adresse est celle qui vient de choisir le mot de passe.

## Décision

- **La révocation est celle de la bibliothèque.** `/sign-in/email-otp` supprime déjà les comptes
  `credential` et les sessions d'un Compte client non vérifié **avant** de le promouvoir et
  d'ouvrir sa session. C'est le seul point où la preuve d'adresse arrive d'ailleurs que de la
  session d'inscription, donc le seul où « non prouvé » veut dire quelque chose. Le contrôle reste
  donc entier, et il est tenu par la bibliothèque plutôt que par une copie maison.

- **La couture maison disparaît.** `lib/auth.ts` ne configure plus
  `emailVerification.beforeEmailVerification` ; `lib/revocation-acces-non-prouve.ts` et son test sont
  supprimés. Aucune couture de remplacement n'est branchée : il n'y a rien à révoquer là où la
  preuve vient de la personne qui a posé le mot de passe.

- **Le verrou de frontière est réécrit, pas supprimé.** `lib/verification-email-frontiere.test.ts`
  figeait l'ordre fautif ; il défend maintenant l'invariant utile — que `/sign-in/email-otp` appelle
  la révocation avant de promouvoir — et garde la règle de liaison de la Connexion sociale
  (`requireLocalEmailVerified` vaut vrai par défaut dans `link-account.mjs`). Les assertions sur
  l'ordre local du hook et sur la suppression locale des comptes `credential` disparaissent, parce
  qu'elles épinglaient le défaut.

- **Le parcours est épinglé de bout en bout.** `lib/auth-inscription-verification-connexion.test.ts`
  traverse `signUpEmail`, `sendVerificationOTP`, `verifyEmailOTP` puis `signInEmail` avec le même mot
  de passe, sur une base réelle ; il échouait avant ce changement (`INVALID_EMAIL_OR_PASSWORD`, après
  que la couture a supprimé le compte `credential`) et passe après. C'est la régression que ce
  dispositif ne peut plus rouvrir sans le voir.

- **La promotion par jeton reste hors du dispositif, et le restera tant que l'application n'émet
  aucun lien de vérification.** `emailVerification.sendVerificationEmail` n'est pas configuré, donc
  `/verify-email?token=…` n'est jamais atteint. **La réinitialisation par code reste dehors elle
  aussi** : elle remplace le secret dans le même geste, il n'y a rien à révoquer.

## Options envisagées

- **Garder la couture en excluant les inscriptions légitimes** — rejetée : la ligne ne porte aucun
  signal permettant de distinguer « le mot de passe que je viens de choisir » de « le mot de passe
  qu'un tiers a posé ». L'Inscription n'ouvre pas de session (`{ token: null }`), donc il n'existe
  même pas de session à comparer.
- **Révoquer à la place dans `databaseHooks.user.update`** — rejetée : le hook ne reçoit pas
  l'identifiant de la ligne visée.
- **Ne rien faire et réparer le message de la modale** — rejetée : le mot de passe resterait détruit
  et le Client serait renvoyé vers « Mot de passe oublié » à chaque Inscription. Un message juste sur
  un compte inutilisable n'est pas un progrès.
- **Introduire une seconde couture qui distingue l'Inscription de la Vérification** — rejetée : la
  bibliothèque fait déjà cette distinction, et une seconde copie de la règle rouvrirait exactement
  l'écart que ce changement ferme.

## Invariants

- Aucune promotion d'e-mail ne supprime le mot de passe de la personne qui vient de le choisir : une
  Inscription par e-mail et mot de passe suivie de sa Vérification de l'e-mail se connecte ensuite
  avec le même mot de passe, du premier coup.
- Un mot de passe posé sur une adresse non prouvée ne survit pas à la preuve de cette adresse par un
  canal externe (code de connexion) : `/sign-in/email-otp` appelle `revokeUnprovenAccountAccess` avant
  de promouvoir et d'ouvrir la session.
- `emailVerified` continue de vouloir dire « l'adresse est attestée » — par l'échange du code, ou par
  Facebook ou Google.
- L'application ne réimplémente pas la révocation : aucun module du dépôt ne supprime les comptes
  `credential` ni les sessions d'un Compte client lors d'une promotion d'adresse.
- Cette décision ne change ni le schéma Prisma, ni la migration, ni l'interface, ni le stockage des
  codes, ni le résolveur d'adresse client.
