# Prototype — la mosaïque de l'accueil

**Jetable : ce n'est pas du code à garder.** La route `/` sert trois lectures de la mosaïque,
commutées par la barre de bas d'écran (`?variant=A|B|C`), contre les données réelles
(`getHomeData()` : six catégories, six produits « Mise en avant » dans `featuredOrder`).

## Verdict — 14 octobre 2026 (#641)

**A — « La pile » gagne.** L'art est **pleine largeur, recadré par le bas** ; la **bande de
service est refusée** (le pied de page dit déjà le paiement à la livraison et la livraison
partout au Maroc). B et C sont refusées, mais leurs morceaux restent lisibles ici : le cadre
centré de B, l'index et le rail de C.

Ce qui a décidé :

- **A est la seule qui hiérarchise.** Deux panneaux pleine largeur ouvrent la page, les quatre
  autres histoires suivent en 2-up, et la bande des catégories ferme. C'est la pile d'apple.com
  avec ce que le catalogue porte.
- **B (six tuiles de même poids) ne dit rien.** Rien ne mène ; la page est un mur de 3 600 px.
- **C (l'index) est le plancher**, pas la cible : deux fois plus courte, elle troque la mosaïque
  contre une liste. Elle reste la réponse si le catalogue ne porte plus ses six histoires.

Deux constats qui pèsent sur tout ce qui suit :

- **Le catalogue n'a aucune photo.** `Product.images` est vide partout, `Category.image` aussi,
  et le bucket R2 est vide. Les zones d'art montrent donc leur règle de recadrage au lieu d'une
  image. Ce qui se jugeait ici : la composition, les champs, la copie, le mouvement.
- **Six histoires pour six produits mis en avant** : le catalogue ne porte pas neuf panneaux.
  La pile est deux héros et quatre tuiles, pas trois et six.

## La mosaïque retenue, panneau par panneau

`getHomeData()` → `featured` (ordre `featuredOrder`) → six histoires ; `categories.racine` → six
catégories. Le code possède le dessin de chaque panneau ; la copie est écrite à la main dans
`panneaux.ts`, indexée par slug, avec repli (nom / marque / prix).

| # | Panneau | Champ | Échelle | Copie |
|---|---|---|---|---|
| 1 | iPhone 15 Pro | gris | hero (56/48/32) | « Le titane, la puce A17 Pro, et un zoom ×5. » · Dès 12 499,00 MAD · **Acheter** (pilule) + **Tout le catalogue ›** |
| 2 | Samsung Galaxy S24 Ultra | **noir** | hero | « Le S Pen, et un zoom qui va jusqu'à 100×. » · Dès 11 999,00 MAD · **Acheter** |
| 3 | MacBook Air 13 M3 | gris | promo (40/32) | « Une journée d'autonomie, dans 1,24 kg. » · Dès 13 999,00 MAD · Livraison offerte · **Acheter** |
| 4 | Casque Sony WH-1000XM5 | gris | promo | « Le bruit s'efface. Il ne reste que la musique. » · Dès 3 499,00 MAD · **Acheter** |
| 5 | TV LG OLED 65" C4 | gris | promo | « Le noir absolu, à la maison. » · Dès 18 999,00 MAD · Livraison offerte · **Acheter** |
| 6 | PlayStation 5 Slim | **noir** | promo | **repli** : titre = nom, surtitre = marque, callout = prix · Dès 4 899,00 MAD · **Acheter** |
| 7 | Bande des catégories | gris | bande | « Toutes nos catégories » / « Du smartphone à l'accessoire, tout est là. » · six entrées : nom, « N produits », **Découvrir ›** |

Le rang 6 n'a pas de copie **exprès** : c'est le repli, en vrai. Le panneau noir est le 2ᵉ, et
la 2ᵉ rangée finit sur la tuile noire — les deux noirs d'apple.com, espacés.

## Le mouvement

Vocabulaire `StaggeredFadeIn` de la page produit (`apple-product-page-ui.md` §9.2), appliqué aux
panneaux :

- **Ce qui entre** : titre (0), surtitre (0,15 s), callout (0,30 s), action (0,45 s) ; l'art
  entre en fondu seul, sans montée. Dans les bandes, 0,15 s par entrée (plafonné à 0,75 s).
- **Comment** : opacité 0 → 1 en **0,9 s**, montée de **30 px** en **0,7 s**, même courbe
  (`cubic-bezier(0.455, 0.03, 0.515, 0.955)`, l'`easeInOutQuad` d'Apple), `translate` et non
  `transform` (Tailwind v4 anime `translate`).
- **Quand** : un `IntersectionObserver` qui coupe les 15 % du bas — l'équivalent de `t - 85vh`.
  Le premier panneau est déjà à l'écran : il entre en CSS seul (`@starting-style`), donc sans
  clignotement et sans JS.
- **Rien n'est caché tant que le JS n'a pas parlé** : un client sans scripts voit la page
  entière. C'est un écart voulu avec `blog-reveal.tsx`, qui rend `opacity-0` au serveur.
- **`prefers-reduced-motion`** : aucun état d'attente n'est posé, tout est là d'emblée ; les
  transitions sont coupées.
- **Survol / appui** : la pilule change de couleur instantanément (sans transition), l'art ne
  bouge pas (l'échelle au survol est un idiome de la page produit, pas de l'accueil), le lien à
  chevron souligne son texte et jamais son chevron.

## Le responsive

- Gouttière de **12 px** partout (`gap-3`), les panneaux sur le fond de page — aucune bordure.
- Rangées 2-up dès `sm:` (640 px, la marche du dépôt ; apple.com bascule à 735 px), une colonne
  en dessous.
- Hauteurs de panneau constantes : hero 500 / 570 / 580, promo 500 / 490 / 580.
- La bande des catégories : 2 colonnes, 3, puis 6. Le rail de C (refusé) reste dans
  `variante-c.tsx`.
- La copie des tuiles 2-up porte un plancher de hauteur (`min-h-[200px] sm:min-h-[225px]`) pour
  que les zones d'art d'une rangée s'alignent — les noms et les surtitres tiennent sur une ligne
  sous 660 px de large.

## Ce que le prototype ne pouvait pas juger

- **L'art.** Aucune photo au catalogue : la règle retenue (pleine largeur, `object-cover
  object-bottom`) est écrite et visible en câblage, mais elle n'a jamais rencontré une image. La
  qualité de l'accueil est plafonnée par la photographie du catalogue, qui est aujourd'hui vide.
- **Les prix.** `formatPrice` rend « 12 499,00 MAD » (la devise du dépôt) ; apple.com écrit
  « From $999 ». Trancher demanderait de toucher au format de toute la boutique.
- **La marche de 640 px contre celle de 735 px** d'apple.com, et le « hero haut » (692 px quand
  la fenêtre est haute), qui n'est pas transcrit.

## Langage

Proposé pour `GLOSSARY.md` quand la mosaïque sera construite (ce n'est pas encore du domaine) :

- **Panneau** — un bloc de l'accueil : un champ (blanc, gris ou noir), une copie (titre,
  surtitre, callout éventuel, une action) et une zone d'art ancrée en bas. Un panneau pleine
  largeur porte l'échelle « hero », une tuile 2-up l'échelle « promo ». _Éviter_ : bloc, tuile
  (réservée aux catégories ?), card.
- **Bande** — le panneau sans art qui range un ensemble : la bande des catégories. Déjà pris :
  le Bandeau de navigation, la Barre d'achat.
- **Histoire** — le nom de travail d'un panneau produit (le produit mis en avant + sa copie).
  Peut-être à ne pas garder.

Pas d'ADR : rien ici n'est coûteux à défaire. La structure de la page se refait en une séance.
