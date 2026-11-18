# Le Moyen de connexion de la dernière Connexion reste dans le navigateur

## Contexte

La modale de Connexion offre jusqu'à quatre voies — Facebook, Google, e-mail et mot de passe — sans
dire laquelle le Client a utilisée la dernière fois. Sur un téléphone, il devine ; un faux départ
coûte un tour, et assez de faux départs ouvrent un verrou de quinze minutes.

Le Compte client ne peut pas porter la réponse. La modale s'ouvre avant que le Client soit
identifié, et répondre « cette adresse utilise Google » dès que l'adresse est tapée ferait de la
formule un oracle d'existence de compte — exactement ce que le refus uniforme et la réponse
d'Inscription synthétique empêchent. Le navigateur qui vient d'effectuer la Connexion détient en
revanche le fait, sans rien révéler sur le compte.

## Décision

- **Le navigateur garde le fait.** Un cookie de première partie, propre à l'hôte, porte le Moyen de
  connexion de la dernière Connexion réussie pendant trente jours. Il ne contient aucune identité,
  n'est pas un cookie de suivi et n'est lu par aucune route serveur.
- **Un seul module possède le vocabulaire.** `lib/moyen-de-connexion.ts` porte l'union
  `mot-de-passe | google | facebook`, le nom et la durée du cookie, les libellés français, la
  résolution d'un chemin vers un moyen, l'analyse de la valeur et la règle d'affichage. Serveur et
  client en importent les constantes ; aucun identifiant de la bibliothèque ne devient un contrat
  public.
- **Le serveur écrit par le greffon Better Auth.** `lastLoginMethod` est enregistré sans stockage en
  base, avec le nom et la durée partagés, juste avant `nextCookies()`. Son résolveur ne reconnaît
  que la Connexion par mot de passe et les deux retours sociaux, et rend **une chaîne vide** pour
  tout autre chemin : `null` rendrait la main au résolveur par défaut, qui écrirait `email`,
  `email-otp` ou `passkey`, valeurs que l'analyse rejette.
- **Le client lit après montage.** `lastLoginMethodClient` reçoit le même nom de cookie. Un hook
  le lit au travers du client réel avec `useSyncExternalStore` et un instantané serveur `null` :
  aucun rendu serveur ni hydratation ne montre la ligne, et aucun état d'effet ne provoque de
  second rendu.
- **Une ligne discrète, et rien de plus.** La phrase « Dernière connexion sur cet appareil : Google. »
  est un paragraphe gris d'une ligne, au-dessus du groupe de méthodes, dans l'étape formulaire
  seulement. Elle n'a ni icône, ni `aria-live`, ni mise en avant du moyen, ni réordonnancement,
  ni point de tabulation, ni animation ; le champ e-mail garde le focus initial. Elle n'apparaît
  que si le moyen nommé est offert et si la boutique offre au moins deux moyens.
- **L'écriture est un fait de Session.** Le cookie n'est posé que lorsqu'une vraie Session est créée,
  il est écrasé à chaque Connexion réussie, et il survit à la Déconnexion comme à la
  Réinitialisation du mot de passe. Il n'existe aucun moyen de l'oublier : effacer les données du
  navigateur suffit.
- **Le déploiement est inerte.** Aucun client existant ne voit la ligne avant sa prochaine
  Connexion. Il n'y a ni backfill, ni migration, ni nouvelle route, ni nouvelle dépendance.

## Options envisagées

- **Une colonne sur le Compte client.** Rejetée : la modale s'ouvre avant l'identification, et la
  valeur deviendrait un fait de compte alors qu'elle n'est qu'un fait d'appareil. Elle exigerait
  une migration et un backfill.
- **Une recherche par adresse e-mail.** Rejetée : c'est l'oracle d'existence de compte que le refus
  uniforme et la réponse d'Inscription synthétique existent précisément pour empêcher.
- **Les identifiants et le nom de cookie par défaut de la bibliothèque.** Rejetés : `email`,
  `email-otp` et `passkey` ne sont pas du vocabulaire de la boutique, et un nom de cookie tiers
  exposerait un contrat que la bibliothèque peut changer.
- **Une liste déroulante qui présélectionne le moyen.** Rejetée : la ligne est un indice, pas une
  décision ; elle ne doit ni déplacer les boutons ni voler le focus au champ e-mail.
- **Un appel serveur qui lit le cookie à l'ouverture de la modale.** Rejeté : le fait n'appartient
  qu'au navigateur, et aucune route ne doit pouvoir répondre « cette adresse utilise Google ».

## Invariants

- Le cookie ne porte aucune identité, aucun e-mail et aucun identifiant de compte.
- Aucune route serveur ne lit le cookie ; la ligne n'est qu'un indice visible par le navigateur.
- La ligne ne remplace ni mot de passe, ni code, ni Test de sécurité, ni second facteur.
- Le cookie n'est posé que lors de la création d'une Session, jamais sur un échec de Connexion.
- Une valeur que le module ne reconnaît pas, un moyen retiré ou une boutique à un seul moyen ne
  produisent aucune ligne.
- Aucun champ de base, aucune migration, aucune dépendance et aucun point d'entrée HTTP nouveau.
- Le cookie est propre à l'hôte : `www` répond `301` vers l'apex, si bien qu'il n'est pas divisé
  entre deux noms d'hôte.

## Coût

- Un cookie de plus dans le navigateur, lu par la seule modale de Connexion, et une ligne de copie
  de plus dans l'étape formulaire.
- Le résolveur est la pointe fragile : rendre `null` au lieu d'une chaîne vide réactiverait le
  résolveur par défaut. Le test de la résolution épingle les trois chemins reconnus et la chaîne
  vide pour tous les autres.
- La sonde ne configurait aucun fournisseur social : elle reçoit des identifiants de fixture pour
  que sa modale offre au moins deux moyens et que la ligne soit observable. Aucun de ces
  identifiants n'est un secret de production.
- Le glossaire gagne **Moyen de connexion** ; `méthode`, `mode` et `voie` restent évités, `voie`
  continuant à désigner les sept voies d'authentification. `docs/auth-pathways.md` et la page
  Conditions disent le fait et le cookie.
