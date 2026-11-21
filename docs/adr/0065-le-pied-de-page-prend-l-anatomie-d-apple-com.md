# Le Pied de page prend l'anatomie d'apple.com

L'annuaire d'apple.com n'est pas une carte de visite : des colonnes égales sur 980 px, un seul corps
de texte de 12 px, des filets qui s'arrêtent aux bords du contenu, une ligne de précisions dont les
liens sont bleus et soulignés, puis une rangée légale où le copyright reste gris et où les documents
s'éclairent. La recherche [`apple-footer-ui.md`](../research/apple-footer-ui.md) a mesuré cette
anatomie le 4 novembre 2026, [ADR-0064](0064-le-pied-de-page-porte-le-catalogue.md) en a retenu le
Catalogue comme première colonne, et le Pied de page en portait déjà la recette de petit texte et
l'encre d'annuaire. Il gardait pourtant trois accents de l'ancienne surface : un chevron devant
chaque titre à toute largeur, trois lignes d'icônes dans la bande d'assurance, et trois colonnes
dont la dernière empile deux sections. À 1203 px, les trois colonnes laissent le tiers droit du conteneur presque vide, l'annuaire ne lit
pas comme celui d'apple.com, et la première chose qu'on y voit est une rangée de triangles.
Cet ADR ne revient ni sur le Catalogue d'ADR-0064, ni sur le retrait du Logo, ni sur la règle de la
destination unique.

## Décision

- **Quatre colonnes égales, une section par colonne.** À partir du point de rupture `md`, la grille
  rend les quatre sections côte à côte sans gouttière, chacune à la largeur du quart du conteneur de
  la Boutique — la proportion d'apple.com, adaptée à quatre sections là où Cupertino en aligne cinq.
  Sous `md`, les sections s'empilent et chaque rangée porte son filet, comme l'accordéon mobile
  d'apple.com ; la dernière n'en porte pas.

- **Le chevron redevient une affordance de mobile.** Il est rendu à toutes les largeurs pour pouvoir
  être annoncé aux technologies d'assistance, mais `md:hidden` le retire du bureau : les titres y
  lisent comme des titres, pas comme des menus. Le sommaire garde sur bureau une cible de 24 px de
  haut, pour que la disclosure reste atteignable au pointeur.

- **La bande d'assurance devient une phrase, sans icône.** La tagline, le paiement à la livraison et
  la TVA, les frais de livraison et le téléphone se suivent dans un seul paragraphe de petit texte
  gris, et le numéro est un lien `tel:` bleu souligné — la forme de la ligne « More ways to shop »
  d'apple.com, que le pied n'avait pas encore prise. Aucune icône ne l'accompagne : le
  pied d'apple.com n'en porte aucune, et trois puces à icônes faisaient de la bande une liste de
  services plutôt qu'un texte de précisions. La bande ne gagne aucun autre lien.

- **La rangée légale sépare deux encres.** Le copyright et la licence MIT restent dans l'encre
  adoucie ; *Conditions & livraison* et *Suppression des données* prennent l'encre d'annuaire, comme
  les documents légaux d'apple.com. Les filets qui séparent les deux documents restent des traits de
  la hauteur du texte, jamais des caractères `|`.

- **Les filets s'arrêtent aux bords du contenu.** Le filet d'ouverture du pied quitte la surface
  pleine largeur pour le conteneur : il commence et finit à l'aplomb du premier titre et du dernier
  lien, comme celui d'apple.com. La surface grise, elle, reste pleine largeur.

- **Le rythme est mesuré, pas approché.** Le titre et le premier lien sont à 27 px l'un de l'autre,
  un lien tous les 25,5 px, la bande à 42 px sous le dernier lien, son filet à 22 px et la rangée
  légale à 21 px. Le rendu du Pied de page a été mesuré aux mêmes repères qu'apple.com à 1203 px :
  titre à 28 px du premier lien, liens tous les 25,5 px, bande à 41 px, filet à 23 px, rangée légale
  à 23 px. Les couleurs sont aux valeurs de la recherche — encre d'annuaire `#424242` pour les
  liens, encre adoucie pour le copyright et la prose, `#0266cc` pour le téléphone.

## Options envisagées

- **Garder les chevrons à toute largeur** — rejeté : c'est la marque la plus visiblement étrangère au
  pied d'apple.com, et un titre qui porte un chevron promet un menu que le pied ne contient pas.
  `md:hidden` garde l'affordance là où la section se replie réellement en rangée.
- **Garder les icônes de la bande** — rejeté : elles imposaient une icône par promesse, un retrait
  de 10 px à la prose qui ne partage plus le bord du titre, et un dessin qui ne dit rien du propos.
- **Garder trois colonnes et empiler *Aide* et *La maison*** — rejeté : à 1203 px la moitié droite
  de la grille reste vide, et la dernière colonne fait deux fois la hauteur des autres. Apple
  équilibre par les sections qu'elle empile, pas par des colonnes de contenus égaux.
- **Reprendre les cinq colonnes d'apple.com** — rejeté : la boutique a quatre sections, une seule
  porte sur le Catalogue et trois courtes ; une cinquième colonne serait vide, ou remplie pour
  remplir.
- **Rendre le sélecteur de pays et de langue de la rangée légale** — rejeté : la boutique n'a qu'une
  langue et qu'un pays, et un contrôle qui ne peut rien changer est un mensonge d'interface. Le côté
  droit de la rangée reste donc vide, ce qui est la seule différence voulue avec apple.com.
- **Passer le pied en accordéon sur mobile, replié par défaut** — rejeté comme dans la spec #1086 :
  la décision est côté serveur et se prend au premier rendu, un `<details>` ouvert par défaut ne se
  referme pas en CSS sans mentir sur son `aria-expanded`.

## Invariants

- Le Pied de page rend quatre sections, une destination par section, et aucun logo.
- Les sections restent des disclosures natives, ouvertes dans le HTML serveur, sans composant client.
- La rangée légale ne porte que le copyright, la licence MIT, *Conditions & livraison* et
  *Suppression des données*, dans cet ordre, et la bande d'assurance ne porte aucun autre lien.
- La recette du petit texte reste 12 px / 1,3334 / −0,01 em pour tout le pied, et le seul contraste de
  graisse est 600 sur les titres de section.
- Les liens d'annuaire gardent l'encre mesurée à 9:1 et une cible plus haute que leur texte : 29,75 px
  sur mobile, 25,5 px sur bureau — le rythme mesuré d'apple.com, au-dessus du plancher de 24 px que
  l'accessibilité exige. Sur bureau, le sommaire d'une section garde 24 px de haut.
- Les filets d'ouverture du pied et de la rangée légale s'arrêtent à la largeur du contenu.
- Cette décision ne crée ni route, ni schéma, ni requête, ni composant client.
