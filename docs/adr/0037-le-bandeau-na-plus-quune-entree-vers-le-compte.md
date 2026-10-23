# Le Bandeau n'a plus qu'une entrée vers le Compte, et c'est l'Aperçu du Panier

Le Bandeau de navigation portait trois contrôles du Compte : l'icône de Connexion pour un Visiteur ;
l'icône du profil et un bouton « Déconnexion » en toutes lettres pour un Client. Il les portait
parce qu'aucune autre surface de la boutique ne les offrait depuis la page en cours. Le déclencheur
du Panier était un lien : la Page du Panier ne s'atteignait qu'en quittant la page parcourue, donc
regarder le Panier coûtait cette page. Le Compte et le Panier se partageaient la barre, au prix
de trois contrôles de plus à côté du Logo, de l'entrée de Recherche et du déclencheur — et d'une
barre qui ne montrait pas les mêmes contrôles à un Visiteur et à un Client.

#743 a renversé cette contrainte. Le déclencheur du Panier ouvre désormais l'Aperçu du Panier
par-dessus la page, sans la quitter ; sous l'état du Panier, le groupe « Mon compte » porte
« Commandes », « Mon profil », puis « Connexion » ou « Déconnexion ». Le Compte n'a plus besoin
d'une place dans la barre pour être atteint depuis n'importe quelle page. #745 a mémoïsé les
lectures, #746 a ouvert l'Aperçu et #747 a déplacé le Compte ; #750 consigne la décision ici. Cet
ADR n'ajoute aucun terme au glossaire ; les entrées **Bandeau de navigation**, **Voile sombre** et
**Déconnexion** y ont été amendées pour ce travail.

## Décision

- **Le Bandeau de navigation ne porte plus de contrôle du Compte.** L'icône de Connexion, l'icône du
  profil et le bouton « Déconnexion » quittent la barre. Elle garde le Logo, l'entrée de Recherche
  et le déclencheur de l'Aperçu du Panier ; elle ne montre plus de contrôle qui dépende du rôle, et
  un Visiteur comme un Client y voient la même barre.

- **L'Aperçu du Panier est la seule entrée du Bandeau vers le Compte.** Son groupe « Mon compte »
  s'ouvre sous l'état du Panier — vide pour un Visiteur, vide pour un Client, ou garni — et range
  toujours « Commandes » (`/commandes`), « Mon profil » (`/profil`), puis « Connexion » pour un
  Visiteur ou « Déconnexion » pour un Client. C'est le seul chemin que le Bandeau offre vers le
  Compte, et il est le même depuis toute page de la boutique.

- **Une seule entrée vaut le déplacement.** Le Compte a une surface, la même depuis n'importe quelle
  page ; la barre cesse de s'allonger à mesure que le Compte gagne des entrées ; « Déconnexion » n'a
  plus qu'un endroit où être cherchée ; et l'Aperçu s'ouvre sans quitter la page, ce que la Page du
  Panier ne permettait pas. La barre redevient une barre de navigation, pas un sommaire du Compte.

- **Connexion et Déconnexion gardent leurs effets.** « Connexion » ouvre la modale de Connexion sur
  la page courante ; « Déconnexion » garde la séquence existante — `signOut()`, puis
  `router.push("/")` et `router.refresh()`. Les entrées empruntent les composants existants : rien
  n'est réimplémenté dans l'Aperçu.

- **La feuille se referme avant que l'une ou l'autre n'agisse.** Chaque entrée referme l'Aperçu avant
  d'ouvrir la modale ou de lancer la Déconnexion : le Voile sombre de l'Aperçu s'est retiré avant
  que la modale de Connexion ne paraisse, et la Déconnexion ne laisse pas la feuille ouverte derrière
  une session qui s'achève. Deux voiles ne se superposent jamais.

- **Le retour en arrière coûte trois contrôles et trois entrées de glossaire.** Défaire cette
  décision rendrait au Bandeau de navigation l'icône de Connexion, l'icône du profil et le bouton
  « Déconnexion », et rouvrirait les trois entrées de glossaire amendées pour ce travail —
  **Bandeau de navigation**, **Voile sombre** et **Déconnexion**. C'est la décision de #743 la plus
  coûteuse à défaire.

## Options envisagées

- **Garder les trois contrôles et ajouter le groupe « Mon compte »** — rejeté : deux entrées pour le
  même Compte, et le Bandeau reste chargé de ce qu'on voulait lui retirer. Le doublon rendrait la
  décision inutile.
- **Ne garder que l'icône du profil dans le Bandeau** — rejeté : le Bandeau garderait une entrée
  vers le Compte, et un Visiteur n'en aurait toujours aucune ; une entrée qui n'existe que pour un
  rôle est précisément ce que la décision retire.
- **Déplacer les trois contrôles dans le menu mobile** — rejeté : le Compte ne serait atteignable
  que sur les écrans étroits, alors que le Bandeau est commun aux deux tailles ; et le menu mobile
  est déjà ce qui referme l'Aperçu sur mobile.
- **Ouvrir une page dédiée au Compte depuis le Bandeau** — rejeté : une route de plus, et le Compte
  coûterait la page parcourue ; le glossaire définit la **Connexion** comme une modale sur la page
  courante, jamais une page autonome.
- **Laisser la page du profil porter le groupe, et le Bandeau un seul lien vers elle** — rejeté :
  la page du profil demande un Client, donc un Visiteur serait refusé avant de voir « Connexion » ;
  et le Compte coûterait une navigation de plus depuis chaque page.
- **Garder le bouton « Déconnexion » dans le Bandeau parce qu'on le cherche vite** — rejeté : c'est
  le contrôle qui prenait le plus de place, et le garder aurait maintenu une seconde entrée ;
  l'Aperçu est à un geste de toute page.
- **Ouvrir la modale de Connexion par-dessus l'Aperçu sans refermer la feuille** — rejeté : le Voile
  sombre de l'Aperçu resterait sous le Voile dépoli de la modale, deux surfaces se disputeraient le
  focus, et la modale hériterait d'un fond qu'elle ne demande pas. Refermer d'abord est le prix d'un
  seul voile à la fois.

## Invariants

- Le Bandeau de navigation ne porte aucun contrôle de Connexion, de profil ou de Déconnexion ; aucun
  contrôle du Compte n'y revient sans rouvrir cette décision.
- L'unique entrée du Bandeau vers le Compte est le groupe « Mon compte » de l'Aperçu du Panier, dans
  l'ordre « Commandes », « Mon profil », puis « Connexion » ou « Déconnexion ».
- Le groupe est le même dans les trois états de l'Aperçu : l'état du Panier ne change pas les
  entrées du Compte.
- « Connexion » ouvre la modale de Connexion de la page courante ; « Déconnexion » garde
  `signOut()`, puis `router.push("/")` et `router.refresh()`.
- L'Aperçu se referme avant que « Connexion » ou « Déconnexion » n'agisse : deux voiles ne se
  superposent jamais.
- L'Aperçu du Panier ne mute rien ; la Page du Panier reste le seul endroit où le Panier change et
  où l'on commande.
- Cette décision ne crée ni route, ni schéma, ni requête, ni terme de glossaire.
