# Le Pied de page prend l'anatomie d'apple.com

L'annuaire d'apple.com n'est pas une carte de visite : des colonnes égales sur 980 px, un seul corps
de texte de 12 px, des filets qui s'arrêtent aux bords du contenu, une ligne de précisions dont les
liens sont bleus et soulignés, puis une rangée légale où le copyright reste gris et où les documents
s'éclairent. La recherche [`apple-footer-ui.md`](../research/apple-footer-ui.md) a mesuré cette
anatomie le 4 novembre 2026, [ADR-0064](0064-le-pied-de-page-porte-le-catalogue.md) en a retenu le
Catalogue comme première colonne, et le Pied de page en portait déjà la recette de petit texte et
l'encre d'annuaire. Il gardait pourtant trois accents de l'ancienne surface : un chevron devant
chaque titre à toute largeur, trois lignes d'icônes dans la bande d'assurance, et trois colonnes
dont la dernière empile deux sections. À 1203 px, les trois colonnes laissent le tiers droit du
conteneur presque vide, l'annuaire ne lit pas comme celui d'apple.com, et la première chose qu'on y
voit est une rangée de triangles.

Cette décision **remplace** trois points tenus pour acquis par la spec #1086, par la recherche et
par #1090 : la taxonomie à trois colonnes du §9.2, avec *Aide* et *La maison* empilées dans la
troisième ; la règle du §9.6 qui voulait le chevron visible à toute largeur ; et la phrase de #1090
qui gardait la rangée légale dans l'encre adoucie. Elle ne revient ni sur le Catalogue d'ADR-0064,
ni sur le retrait du Logo, ni sur la règle de la destination unique.

## Décision

- **Quatre colonnes égales, une section par colonne, et le nombre de pistes suit les sections
  rendues.** À partir du point de rupture `md`, les quatre sections se suivent dans quatre pistes
  sans gouttière, chacune au quart du conteneur de la Boutique — la proportion d'apple.com, adaptée à
  quatre sections là où Cupertino en aligne cinq. Sans Catalogue, il n'en reste que trois et la
  grille rend trois pistes : un magasin neuf ne voit jamais une piste vide. Sous `md`, les sections
  s'empilent et chaque rangée porte son filet, comme l'accordéon mobile d'apple.com ; la dernière
  n'en porte pas. Les sections sont des cellules de la grille, pas des colonnes de données : une
  colonne ne peut plus en empiler deux, et la forme `colonnes` du §9.4 cède la place à une liste
  plate.

- **Le chevron est visible au doigt, révélé au survol et au focus sur bureau.** Il est rendu à
  toutes les largeurs dans le sommaire, `aria-hidden` — il n'annonce rien, il pointe — et son
  ouverture tourne de 180°. Sous `md` il est toujours visible, parce que la rangée se replie
  réellement. À partir de `md`, et seulement sur un appareil qui connaît le survol, il s'efface au
  repos et revient au survol du sommaire comme au focus dans le sommaire : les titres lisent comme
  des titres, et le contrôle n'est jamais sans indice pour qui s'apprête à cliquer ou à tabuler. Sur
  une tablette sans survol, il reste visible, sans quoi le pli n'aurait aucun indice. Sur bureau, le chevron suit son titre au lieu de filer au bord de la
  colonne — le bord touche déjà le titre suivant —, et le sommaire garde une cible de 25,5 px de haut
  pour que la disclosure reste atteignable au pointeur.

- **La bande d'assurance devient une phrase, sans icône.** La tagline, le paiement à la livraison et
  la TVA, les frais de livraison et le téléphone se suivent dans un seul paragraphe de petit texte
  gris, et le numéro est un lien `tel:` bleu souligné, qui s'assombrit au survol, s'allège à
  l'appui — la forme de la ligne « More ways to shop » d'apple.com, que le pied n'avait pas encore
  prise. Aucune icône ne l'accompagne : le pied d'apple.com n'en porte aucune, et trois puces à
  icônes faisaient de la bande une liste de services plutôt qu'un texte de précisions. La bande ne
  gagne aucun autre lien.

- **La rangée légale sépare deux encres.** Le copyright reste dans l'encre adoucie ; la licence MIT,
  *Conditions & livraison* et *Suppression des données* prennent l'encre d'annuaire, comme les
  documents légaux d'apple.com. La licence est un lien comme les deux autres, et c'est sa couleur
  qui le dit. Les séparateurs restent des traits de la hauteur du texte, jamais des caractères `|`.

- **Les filets s'arrêtent aux bords du contenu.** Le filet d'ouverture du pied quitte la surface
  pleine largeur pour le conteneur : il commence et finit à l'aplomb du premier titre et du dernier
  lien, comme celui d'apple.com. La surface grise, elle, reste pleine largeur.

- **Le rythme est mesuré, pas approché.** D'un texte au suivant : le titre et le premier lien sont à
  27 px l'un de l'autre, un lien tous les 25,5 px, la bande à 42 px sous le dernier lien, son filet à
  22 px et la rangée légale à 21 px. Le rendu du Pied de page a été mesuré aux mêmes repères
  qu'apple.com à 1203 px — les repères d'apple.com viennent de la capture de référence fournie, et non
  des clichés de la recherche, dont le §5.4 relève ses propres distances : titre à 28 px du premier lien, liens tous les 25,5 px, bande à 41 px,
  filet à 23 px, rangée légale à 23 px. Les couleurs sont aux valeurs de la recherche — encre
  d'annuaire `#424242` pour les liens, encre adoucie pour le copyright et la prose, `#0266cc` pour le
  téléphone.

- **La copie de la bande est resserrée.** « Livraison rapide partout au Maroc » quitte la promesse de
  livraison, puisque la tagline dit déjà « livrée partout au Maroc » ; il reste « Frais de livraison
  selon la ville. », qui parle au Client là où le domaine dit *Ville de livraison*. La TVA s'écrit
  « 20 % », comme le veut la typographie française. Le seuil de livraison offerte reste absent.

## Ce que la décision coûte

- **Les cibles de bureau passent sous celles de #1090.** Un lien d'annuaire fait 29,75 px de haut sur
  mobile mais 25,5 px sur bureau : le rythme mesuré d'apple.com, au-dessus du plancher de 24 px que
  l'accessibilité exige, en dessous des 28 px que la spec demandait. La rangée légale garde ses
  29,75 px, et le sommaire 25,5 px.
- **Le pied mobile grandit.** À 390 px, toutes sections ouvertes, il occupe environ 868 px — la bande
  se replie sur quatre lignes et les rangées respirent. Les sections se replient, mais elles restent
  ouvertes à l'arrivée : le glossaire interdit de cacher un lien derrière un contrôle à découvrir.
- **La taxonomie du §9.2 est remplacée, pas amendée.** La recherche réservait la quatrième colonne à
  une seconde surface d'aide ou à une troisième colonne de plus de quatorze liens, seuil que la
  boutique ne franchit pas ; la décision ajoute pourtant une colonne, parce que les quatre sections
  sont des paires et qu'empiler deux titres dans une colonne faisait lire le tiers droit comme un
  bloc. Une personne doit accepter cet écart.
- **Deux écarts de plus avec apple.com sont voulus** : quatre colonnes au lieu de cinq, et le
  conteneur partagé de 929 px de contenu (980 px moins deux fois `px-6`) au lieu des 980 px d'apple.com, que
  [`conteneur-boutique.ts`](../../lib/conteneur-boutique.ts) fixe pour toute la boutique. Le côté droit
  de la rangée légale reste vide : la boutique n'a qu'une langue, et un sélecteur qui ne peut rien
  changer serait un mensonge d'interface.

## Options envisagées

- **Garder les chevrons à toute largeur** — rejeté : c'est la marque la plus visiblement étrangère au
  pied d'apple.com, et un titre qui porte un chevron promet un menu que le pied ne contient pas. Le
  révéler au survol et au focus garde l'affordance là où elle sert.
- **Rendre le sommaire inerte sur bureau** — rejeté : sans JavaScript, un `<details>` ne se désarme
  pas par feuille de style ; `pointer-events: none` retirerait le clic mais laisserait le clavier
  ouvrir un contrôle devenu invisible.
- **Garder les icônes de la bande** — rejeté : elles imposaient une icône par promesse, un retrait de
  10 px à la prose qui ne partage plus le bord du titre, et un dessin qui ne dit rien du propos.
- **Garder trois colonnes et empiler *Aide* et *La maison*** — rejeté : deux titres de pairs dans une
  colonne font lire le tiers droit comme un bloc, et la grille ne rend plus la forme d'apple.com.
- **Reprendre les cinq colonnes d'apple.com** — rejeté : la boutique a quatre sections, une seule
  porte sur le Catalogue et trois courtes ; une cinquième colonne serait vide, ou remplie pour
  remplir.
- **Rendre le sélecteur de pays et de langue de la rangée légale** — rejeté : la boutique n'a qu'une
  langue et qu'un pays, et un contrôle qui ne peut rien changer est un mensonge d'interface.
- **Passer le pied en accordéon sur mobile, replié par défaut** — rejeté comme dans la spec #1086 :
  la décision est côté serveur et se prend au premier rendu, un `<details>` ouvert par défaut ne se
  referme pas en CSS sans mentir sur son `aria-expanded`.

## Invariants

- Le Pied de page rend quatre sections, une destination par section, et aucun logo.
- Les sections restent des disclosures natives, ouvertes dans le HTML serveur, sans composant client.
- Le sommaire porte le chevron à toutes les largeurs, `aria-hidden` ; il est visible sous `md` et
  révélé au survol comme au focus à partir de `md`.
- Le nombre de pistes de la grille suit le nombre de sections rendues : trois sans Catalogue.
- La rangée légale ne porte que le copyright, la licence MIT, *Conditions & livraison* et
  *Suppression des données*, dans cet ordre et tous liens dans la même encre ; la bande d'assurance
  ne porte que le lien `tel:`.
- La recette du petit texte reste 12 px / 1,3334 / −0,01 em pour tout le pied, et le seul contraste de
  graisse est 600 sur les titres de section.
- Les liens d'annuaire gardent l'encre mesurée à 9:1 et une cible plus haute que leur texte : 29,75 px
  sur mobile, 25,5 px sur bureau — au-dessus du plancher de 24 px que l'accessibilité exige. Sur
  bureau, le sommaire d'une section garde 25,5 px de haut et son chevron suit le titre.
- Tous les liens du pied s'assombrissent et se soulignent au survol, s'allègent à l'appui, et
  héritent de l'anneau de focus global.
- Les filets d'ouverture du pied et de la rangée légale s'arrêtent à la largeur du contenu.
- Cette décision ne crée ni route, ni schéma, ni requête, ni composant client, ni terme de glossaire.
