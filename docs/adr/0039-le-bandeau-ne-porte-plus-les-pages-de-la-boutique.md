# Le Bandeau ne porte plus les pages de la boutique ; le pied de page les porte seul

Le Bandeau de navigation portait les cinq pages de la boutique — À propos, Contact, FAQ, Blog et
Conditions & livraison — deux fois : une rangée de liens au-dessus du point de rupture, et, en
dessous, le menu du déclencheur « Menu ». Le pied de page les portait déjà, et deux fois lui aussi :
la colonne « La boutique » et la rangée légale. Ces cinq entrées n'ont jamais eu qu'un domicile
utile, et ce n'était pas la barre : une page de service ne s'ouvre pas comme une catégorie.

La rangée venait de l'habillage, pas d'un besoin de la boutique. Le menu, lui, avait fini par servir
à refermer l'Aperçu du Panier (#748) : c'était sa seule raison qui tenait encore, et elle tenait
parce que le déclencheur du Panier disparaissait tant que la feuille était ouverte. #782 défait les
deux à la fois — les entrées quittent le Bandeau, et le déclencheur du Panier reprend le geste
d'ouvrir et de refermer, à toutes les tailles. Cet ADR n'ajoute aucun terme au glossaire ; les
entrées **Bandeau de navigation**, **Aperçu du Panier** et **Logo** y ont été amendées pour ce
travail.

## Décision

- **Le Bandeau de navigation ne porte plus les pages de la boutique.** À propos (`/a-propos`),
  Contact (`/contact`), FAQ (`/faq`), Blog (`/blog`) et Conditions & livraison (`/conditions`)
  quittent la rangée de bureau comme le menu mobile, à toutes les tailles d'écran. Le Bandeau ne
  garde que le Logo, l'entrée de Recherche et le déclencheur du Panier.

- **Le pied de page est leur seul domicile.** Il les porte déjà deux fois — la colonne « La
  boutique » et la rangée légale — sur chaque page de la boutique, sans dépendre de la taille
  d'écran ni de l'état du Panier.

- **Le déclencheur du Panier ouvre et referme l'Aperçu du Panier, à toutes les tailles.** Il n'est
  plus masqué sous le point de rupture, il ne prend plus le libellé « Fermer », et son
  `aria-expanded` dit l'état de la feuille au lieu d'un menu qui n'existe plus.

- **Aucune croix de fermeture n'est rendue.** #748 l'avait écartée pour que la fermeture ait un seul
  contrôle ; la décision la garde, et ce contrôle est maintenant le déclencheur du Panier — visible,
  à la même place avant et pendant l'ouverture.

- **Le focus revient au déclencheur, partout.** Escape, clic sur le Voile sombre et défilement de la
  page referment l'Aperçu et rendent le focus au déclencheur du Panier, sur mobile comme sur bureau.

- **Le Bandeau n'a plus de comportement propre à une taille d'écran.** `use-est-bureau`, son
  `useSyncExternalStore` sur `matchMedia("(min-width: 1024px)")` et l'instantané serveur qui le
  précédait disparaissent : la barre rend le même document à toute taille, et une seule recette
  gouverne la fermeture.

## Options envisagées

- **Retirer la seule rangée de bureau, garder le menu mobile** — rejeté : les cinq pages
  resteraient dans la barre à une taille d'écran, et le menu devrait continuer de se déguiser en
  « Fermer » pour justifier son existence, en masquant le déclencheur du Panier.
- **Garder le déclencheur « Menu » comme contrôle de fermeture seul** — rejeté : ce serait un
  contrôle qui n'existe que pendant qu'une feuille est ouverte, dans une barre qui n'a plus de menu ;
  son `aria-expanded` continuerait de désigner un menu absent, ce que #748 lui faisait déjà faire.
- **Rendre une croix dans la feuille** — rejeté : #748 l'avait explicitement écartée ; une croix
  ferait un second contrôle de fermeture à côté du déclencheur resté monté.
- **Mettre les six Structures dans le Bandeau à la place des pages** — rejeté : cela recrée la
  rangée sous un autre nom ; l'accueil porte déjà la Bande des catégories, et la Recherche et les
  Filtres sont les deux autres portes.
- **Retirer les pages du pied de page et les laisser dans le Bandeau** — rejeté : le pied de page
  est la seule surface qu'un Client atteint depuis toute page sans la quitter ; la barre, elle, ne
  les portait qu'au-dessus du point de rupture.

## Invariants

- Le Bandeau de navigation ne rend aucun lien vers `/a-propos`, `/contact`, `/faq`, `/blog` ni
  `/conditions`, à aucune taille d'écran ; aucun contrôle de page n'y revient sans rouvrir cette
  décision.
- Le pied de page rend les cinq entrées sur chaque page de la boutique.
- Un seul contrôle ouvre et referme l'Aperçu du Panier : le déclencheur du Panier, à toutes les
  tailles.
- Aucune croix de fermeture n'est rendue dans l'Aperçu.
- Le Bandeau n'interroge plus `matchMedia` : il ne change plus de géométrie selon la taille d'écran.
- Cette décision ne crée ni route, ni schéma, ni requête, ni terme de glossaire.

## Ce que cet ADR rend faux

L'option rejetée « Déplacer les trois contrôles dans le menu mobile » d'ADR-0037 s'appuyait sur
« et le menu mobile est déjà ce qui referme l'Aperçu sur mobile ». Il n'y a plus de menu mobile, et
c'est le déclencheur du Panier qui referme l'Aperçu à toutes les tailles. Le rejet tient toujours —
le Compte resterait inatteignable hors des écrans étroits — mais sa seconde moitié ne se lit plus ;
l'amendement correspondant est écrit dans
[0037](0037-le-bandeau-na-plus-quune-entree-vers-le-compte.md).
