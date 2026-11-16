# Le modèle de menace de l'authentification nomme ses adversaires, et l'Administration sans second facteur est un non-goal

Les ADR d'authentification citent ASVS et NIST clause par clause, mais aucun ne nomme l'adversaire.
Un contrôle sans adversaire nommé ne se juge pas : « pas de MFA » est soit un manque, soit une
décision, et rien dans le dossier ne dit lequel. La conséquence est lisible dans
`docs/auth-pathways.md`, qui écrit que le mot de passe reste un facteur unique et que c'est pourquoi
le plancher vaut quinze caractères, sans que le dossier porte l'adversaire qui rend ce choix
défendable. Deux décisions d'implémentation n'ont en outre jamais eu d'ADR et vivaient dans des
commentaires que la règle `eguidar/sans-commentaires` supprime : le coût de rotation de
`BETTER_AUTH_SECRET` sur les jetons fournisseur, et la déclaration complète des scopes de Google.
Une raison qui ne vit que dans un commentaire meurt avec lui.

## Décision

- **Deux adversaires sont en portée.** D'abord le bourrage d'identifiants : un tiers qui rejoue
  contre les Comptes clients des couples adresse et mot de passe volés ailleurs, parce que le même
  mot de passe sert à plusieurs sites et que le coût d'une Commande frauduleuse est payé par le
  vendeur. Ensuite le vol de Session courante sur un appareil partagé — cybercafé, téléphone
  familial — parce que le jeton de session y survit à celui qui l'a ouvert.

- **Quatre adversaires sont hors portée, et le dossier les nomme** : la prise de contrôle de
  l'Administration, la compromission d'un fournisseur social, l'initié qui lit la base, et le déni de
  service. Les nommer vaut mieux que les taire : un manque nommé est une décision, un manque tu est
  un oubli.

- **Le mot de passe reste un facteur unique par décision.** NIST SP 800-63B-4 §3.1.1.2 demande
  quinze caractères à un mot de passe seul ; c'est la raison du plancher, et elle est désormais
  écrite là où un lecteur la cherche.

- **L'Administration sans second facteur est un non-goal écrit.** Son rayon d'action est le Catalogue
  et les Commandes, pas les données de paiement. Le contrôle qui en tient lieu est la Session hors
  durée absolue de vingt-quatre heures. Rouvrir la question est une décision à part entière, et elle
  doit nommer son adversaire avant de nommer son mécanisme.

- **Les jetons fournisseur sont chiffrés au repos avec une clé dérivée de `BETTER_AUTH_SECRET`.**
  Faire tourner ce secret rend les jetons existants illisibles, et rien dans la boutique ne les lit :
  la conséquence est acceptée. Une rotation sans perte demanderait le magasin de secrets de la
  bibliothèque ; c'est une option à rouvrir le jour où un fournisseur sera appelé.

- **Les scopes de Google et de Facebook sont déclarés en entier, avec `disableDefaultScope`.** La
  bibliothèque n'ajoute donc aucun scope par défaut, et une montée de version ne peut pas élargir la
  permission demandée en silence. Ce qui n'est pas déclaré n'est pas demandé.

## Options envisagées

- **Ajouter MFA, passkey ou TOTP dans cette phase** — rejeté : aucun adversaire en portée ne l'exige,
  et l'Administration, seul espace où le gain serait net, est hors des quatre voies Client.

- **Traiter la Session de l'Administration comme celle d'un Client** — rejeté : trente jours pour un
  accès qui modifie le Catalogue et les Commandes n'est pas la même exposition qu'un Panier.

- **Laisser les raisons dans le code** — impossible : `eguidar/sans-commentaires` refuse la prose de
  première partie, et le standard dit où la raison va — un nom, une forme, un test qui vire, un ADR,
  ou le glossaire. Ici, un ADR.

## Invariants

- Chaque contrôle de `docs/auth-pathways.md` répond à un adversaire nommé ici, ou à une clause nommée
  dans l'ADR qui l'a pris.
- L'absence de second facteur sur l'Administration reste un non-goal, pas un oubli.
- Faire tourner `BETTER_AUTH_SECRET` rend les jetons fournisseur existants illisibles ; personne ne
  les lit, et c'est accepté.
- Aucun scope n'est demandé à un fournisseur s'il n'est pas déclaré en entier.

## Ce que cet ADR coûte

- **Les quatre adversaires hors portée ne sont pas couverts par une garde.** C'est une décision
  écrite, pas un contrôle : rien n'échoue si une évolution les rapproche du périmètre, et la
  prochaine revue de menace devra les relire.
- **La rotation du secret est une opération à conséquence.** Elle déconnecte les fournisseurs
  sociaux de leurs jetons existants ; rien ne le signale avant l'exécution, et c'est le prix assumé
  de ne pas payer le magasin de secrets de la bibliothèque.
