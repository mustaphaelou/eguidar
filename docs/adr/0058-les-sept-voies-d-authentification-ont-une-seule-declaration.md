# Les sept voies d'authentification ont une seule déclaration, et chaque voie porte son statut

ASVS 6.1.3 et 6.3.4 demandent une déclaration écrite de chaque voie d'authentification montée par
le magasin, des contrôles que chacune tient et de ceux qu'elle ne tient pas. `docs/auth-pathways.md`
est cette déclaration. Aucun index ne la nommait : ni `docs/adr/README.md`, ni
`docs/ARCHITECTURE.md`, ni `AGENTS.md`. Elle a donc dérivé sans que personne ne le voie — cinq
contrôles qu'elle déclarait absents au titre de « Phase 3 » sont tenus par le code : le chiffrement
des jetons fournisseur au repos, `trustedOrigins` explicite, le rejeu du Panier sur la Connexion par
code et sur la Vérification de l'e-mail, la Connexion sociale échouée qui revient dans la modale, et
le Test de sécurité borné par son action et son hôte. Une déclaration qu'aucun index ne possède est
une déclaration que personne ne maintient.

Les décisions que ce dossier recense ont déjà été exécutées (#1042 à #1047). Ce qui manquait, c'est
la déclaration qui les nomme et les ADR qui les fondent.

## Décision

- **`docs/auth-pathways.md` est la déclaration normative des sept voies.** Elle nomme, pour chacune,
  les contrôles qu'elle tient, ceux qu'elle ne tient pas et l'ADR qui a pris la décision. Les ADR
  gardent le _pourquoi_ ; le document garde l'_état_.

- **Chaque voie porte un statut** : **Held** quand le magasin monte la voie et applique les contrôles,
  **Mounted without a surface** quand la bibliothèque sert la voie sans que la boutique la présente.
  Un contrôle délibérément absent se lit sous la voie qui le porte, dans sa section « Deliberately
  absent », pas dans un troisième statut. Un lecteur ne doit pas connaître l'histoire du chantier
  pour savoir ce qui est tenu aujourd'hui.

- **Le document est lié par cet ADR, par l'index `docs/adr/README.md` et par
  [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md)**, dans la couture de l'entrée et dans celle de la
  Session. Une déclaration normative que la carte du dépôt ne cite pas n'est pas atteignable depuis
  l'ordre de lecture que `docs/ARCHITECTURE.md` impose.

- **Les sept voies sont nommées ici une fois, pour que l'index et le document ne puissent pas
  diverger** : Inscription, Vérification de l'e-mail, Connexion par mot de passe, Connexion par code,
  Connexion sociale, Réinitialisation du mot de passe, Suppression des données Facebook.

- **`verification.identifier` n'est pas unique, à dessein.** Un envoi de code insère une ligne, une
  lecture retient la plus récente par `createdAt`, et une consommation supprime toutes les lignes de
  l'identifiant. La bibliothèque documente elle-même que la colonne est non unique et que l'unicité
  vient de la clé primaire. Une contrainte d'unicité casserait le second envoi — la stratégie de
  renvoi par défaut, `"rotate"`, écrit une seconde ligne — et la migration échouerait sur toute base
  qui a déjà connu un renvoi. La garde de `lib/verification-email-frontiere.test.ts` échoue si le
  schéma déclare la colonne unique.

- **La durée de vie du code a une seule valeur.** `DUREE_VIE_CODE_SECONDS` est lue par la
  configuration de `emailOTP` et par la lettre qui annonce cette durée : la copie et le comportement
  ne peuvent pas dériver l'un de l'autre. Un test épingle les deux lectures.

- **Le rejeu du Panier couvre les quatre points d'entrée que `lib/points-entree-connexion.ts` nomme** :
  Connexion par mot de passe, Connexion sociale, Connexion par code et Vérification de l'e-mail. Le
  Visiteur qui se prouve par un code ne perd pas le Panier qu'il a construit, ce qui est la perte que
  l'ADR-0007 et l'ADR-0024 existent pour empêcher.

- **Les cinq affirmations fausses du document sont corrigées** : chiffrement des jetons fournisseur,
  `trustedOrigins`, rejeu du Panier sur les voies par code, Connexion sociale échouée, portée du
  Test de sécurité.

- **La suppression emporte les lignes de `verification` par deux formes qui portent l'adresse** :
  `<type>-otp-<adresse>` en suffixe, et `-otp-<adresse>-` en sous-chaîne. La seconde ne sert que si
  `changeEmail` est monté, et il ne l'est pas : aucune ligne de ce genre n'existe aujourd'hui.

- **Deux ADR tiennent les décisions adjacentes** : ADR-0059 (le Refus d'authentification a un
  propriétaire unique) et ADR-0060 (le modèle de menace nomme ses adversaires).

## Options envisagées

- **Déclarer les voies dans `GLOSSARY.md`** — rejeté : le glossaire définit des mots, et la règle du
  dépôt lui interdit les détails d'implémentation. Une liste de contrôles y serait un corps étranger.

- **Garder le document et seulement le corriger** — rejeté : il a déjà dérivé une première fois
  faute de propriétaire, et rien ne l'empêcherait de dériver une seconde fois.

- **Ajouter `@@unique([identifier])` sur `verification`** — rejeté : la bibliothèque insère à chaque
  envoi, laisse coexister les lignes et supprime toutes celles de l'identifiant à la consommation.
  La contrainte casse le renvoi et refuse de s'appliquer sur une base qui a déjà un doublon.

- **Numéroter les phases à la place des statuts** — rejeté : un numéro de phase dit d'où l'on vient,
  pas ce qui est tenu. Le statut le dit.

## Ce qui reste à tenir

Le schéma est non unique et la garde le tient ; la durée de vie du code est épinglée ; les quatre
points d'entrée sont nommés par un seul module. Un seul invariant de cet ADR repose encore sur la
relecture : aucun test ne refuse le mot « phase » dans le document.

## Invariants

- Toute voie que la boutique monte figure dans la déclaration, avec son statut et l'ADR qui la
  gouverne.
- Le document ne nomme aucune phase.
- `verification.identifier` reste non unique ; une garde échoue si le schéma la déclare unique.
- La durée de vie du code a une seule valeur, lue par la configuration et par la copie.
- Les quatre points d'entrée du rejeu du Panier sont nommés par un seul module.

## Ce que cet ADR coûte

- **La déclaration est un document à maintenir.** Un chemin d'authentification ajouté sans sa ligne,
  ou un contrôle retiré sans son statut, ne casse rien : l'index vérifie que chaque ADR est lié, pas
  que la déclaration dit vrai.
- **Un second propriétaire pour la durée du code.** La lettre et la configuration lisent la même
  constante, donc changer la durée change aussi la promesse envoyée au Client — c'est voulu, et il
  faut s'en souvenir avant de la raccourcir.
