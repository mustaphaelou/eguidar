# Prototype — la mosaïque de l'accueil

**Jetable. Ce n'est pas une décision.** Le but est de trancher, en regardant, ce que #641
laisse ouvert : la liste et l'ordre des panneaux, le premier panneau, la direction
artistique, la copie, le mouvement et le restack responsive.

Question : *à quoi ressemble la mosaïque de l'accueil, panneau par panneau — et quelle
variante gagne ?*

Trois variantes, servies **sur la route `/`** et commutées par `?variant=A|B|C` (barre flottante
en bas de l'écran). Données réelles : `getHomeData()` (les six catégories, les six produits
« Mise en avant » dans `featuredOrder`).

| | A — La pile | B — Le mur | C — L'index |
|---|---|---|---|
| Premier bloc | héros pleine largeur | rangée 2-up | héros pleine largeur, haut |
| Histoires produit | 2 héros + 4 tuiles | 6 tuiles, même poids | 1 héros + 5 lignes |
| Bande catégories | 6 colonnes de texte | 6 tuiles 2-up | rail horizontal |
| Bande service | oui (noir) | non | oui (noir) |
| Longueur | 6 blocs | 4 blocs | 4 blocs |

Deux constats qui pèsent sur tout :

- **Le catalogue n'a aucune photo** (le bucket R2 est vide, `Product.images` est vide partout).
  Les cases d'art sont donc des câblages annotés — « photo · recadrage bas » — pas de la
  photographie. Ce qui se juge ici : la composition, les champs, la copie, le mouvement.
- **Six histoires pour six produits mis en avant** : le catalogue actuel ne porte pas neuf
  panneaux à la apple.com. Les trois variantes sont trois réponses à cette contrainte.

Copie : française, écrite à la main, indexée par slug (`panneaux.ts`). Le PlayStation 5 Slim
n'a **pas** de copie, exprès, pour voir le repli (nom / marque / prix).

Mouvement : le vocabulaire `StaggeredFadeIn` de la page produit (opacité 0,9 s, montée 30 px
en 0,7 s, 0,15 s par index), déclenché par `IntersectionObserver` ; le premier panneau entre
en CSS seul (`starting:`), sans flash ni JS requis.
