# Prototype — notes de conception

Notes de conception du prototype jetable Apple-style. **Ceci n'est pas une décision** : ce sont des
hypothèses à éprouver. Aucune n'est encore entrée dans le domaine d'eguidar, ni dans `docs/adr/`.

Écrit le 2026-10-03 à la suite d'une séance `/grilling`.

## La question que le prototype doit trancher

> Une boutique Apple-style tient-elle debout quand un Produit se décline sur deux axes à la fois,
> et quand le Panier se consulte sans quitter la page ?

Deux sous-questions, parce qu'elles partagent le même état :

1. **Comment se présente une déclinaison à deux axes** — modale, lignes de pastilles, liste
   déroulante, tiroir — et que montre-t-on tant que la sélection est incomplète ?
2. **Comment se présente le Panier** — panneau sous la navigation, tiroir latéral, page — et
   survit-il sans JavaScript ?

## Hypothèse 1 — des Axes génériques, et non Finition / Capacité

**Hypothèse à éprouver.** Un Produit porte des **Axes** (Couleur, Stockage, Taille, Technologie…) ;
chaque Axe porte des **Options de Variante** ; une Variante en prend une par Axe. Finition et
Capacité ne sont pas des concepts du domaine : ce sont des Axes comme d'autres, portés par le
Catalogue, pas par le schéma.

**Pourquoi générique.** Un Axe nommé « Couleur » n'aide pas une télévision. Un schéma qui connaît la
couleur et la capacité devient un formulaire qui connaît la couleur et la capacité, et le deuxième
Produit vendu ne rentre dedans qu'après coup.

**Ce qui reste vrai dans l'existant, et ne bouge pas.** La Variante reste la seule unité achetable et
la seule porteuse de prix et de stock ; `priceDelta` reste la forme stockée et le Prix courant reste
dérivé (ADR-0013). Rien ne devient achetable ailleurs que sur une Variante — c'est ce qui rend
l'hypothèse réversible : si l'Axe se révèle être la mauvaise abstraction, il se retire sans qu'une
commande, un stock ou un prix ait bougé.

**Le point dur, et il est ouvert.** L'axe de disponibilité. Une Variante indisponible peut toujours
être exprimée en n'existant pas ; une *combinaison* indisponible (« 128 Go n'existe pas en rose ») ne
s'exprime pas dans le modèle actuel. Deux réponses possibles :

- **Absence** — une combinaison absente l'est parce qu'aucune Variante ne la porte, et son Option
  s'affiche indisponible. Coût : rien. Limite : l'indisponibilité se découvre en cherchant.
- **Matrice** — une table de disponibilité par combinaison d'Options. Coût : une table, une
  combinatoire par affichage, une validation à l'écriture.

La recherche de sources primaires sur la manière dont apple.com fait **n'a pas abouti** — c'est
précisément la question qu'elle devait trancher. L'hypothèse est donc retenue pour ses mérites
propres et pour sa réversibilité, **pas** parce qu'Apple la partage.

## Hypothèse 2 — l'Aperçu du Panier enhances la Page du Panier

**Hypothèse à éprouver.** Le déclencheur du Panier reste un lien vers la Page du Panier. Avec
scripts, il ouvre un panneau ; sans scripts, il navigue. Il n'y a pas de troisième état.

**Ce que dit Apple, et qui a été vérifié le 2026-10-03.** Le déclencheur rendu est un
`<a href="…/shop/goto/bag" role="button" aria-expanded="false" aria-controls="…" data-topnav-flyout-trigger-*"true">`.
Sans JavaScript il navigue ; avec JavaScript la navigation intercepte le clic et ouvre le panneau.
Les deux comportements sont dans le même élément.

Il n'y a donc pas à choisir entre « un paramètre d'URL » et « un état client » : la page est la base,
le panneau est l'ajout.

**Ce que le prototype doit vérifier sur eguidar.** Le dépôt n'a aucun état client de Panier : ni
contexte, ni magasin, ni paramètre. La fraîcheur vient de `refresh()` dans les actions serveur, et
le badge est un composant serveur qui ne rend rien à zéro. Le panneau prototype doit rendre son
état visible pour qu'on voie ce que l'on perd en n'ayant pas de store.

**Ce qu'on ne copie pas.** Apple remplit son panneau par un appel à `/shop/bag/status` déclaré en
`data-store-api`, dans un conteneur vide au rendu serveur. Ce mécanisme introduit une seconde
projection du Panier détenue par le client, à côté des faits serveur. Le prototype teste si c'est
nécessaire — et l'hypothèse est que non.

## Ce qui est déjà réglé, et ne se réessaie pas dans le prototype

Ces points ont été vérifiés contre apple.com le 2026-10-03 et n'ont pas besoin d'être redécouverts :

- **Le Voile dépoli est déjà en place et toujours d'actualité.** `--globalnav-backdrop-filter:
  saturate(180%) blur(20px)` sur `rgba(250, 250, 252, .8)`, `rgba(22, 22, 23, .8)` en sombre. Le
  matériau est toujours le voile classique : **aucun Liquid Glass** sur apple.com — pas de
  `feDisplacementMap`, pas de `feImage`, pas de `filter:url(#…)` dans aucune feuille de style.
- **Il n'y a pas de tiroir latéral chez Apple.** Le dispositif s'appelle `ac-bag-flyout` et se
  déploie sous la navigation.
- **La Page du Panier reste l'endroit où l'on commande.** Devis, Ville de livraison, Récapitulatif de
  paiement et passage de commande n'entrent pas dans un panneau.

## Questions ouvertes, à trancher en construisant

- Le seuil au-delà duquel une ligne d'Axes passe de pastilles à une liste déroulante. Le `MAX_CHIPS
  = 6` actuel est un artefact du modèle plat, pas une règle à conserver.
- La forme du refus quand une sélection complète ne résout à aucune Variante.
- Si une combinaison indisponible mérite la matrice, ou si l'absence suffit pour ce Catalogue.
- Où se place l'état de la sélection : dans la modale, ou au-dessus d'elle pour survivre à une
  fermeture.
