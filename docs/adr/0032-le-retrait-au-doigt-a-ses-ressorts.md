# Le retrait au doigt a ses ressorts, sa décision se prend au point projeté

La Page du Panier n'avait aucun vocabulaire du mouvement, et l'Article du panier était la seule
surface où chaque geste demandait la patience du serveur ou la précision d'un clic. La quantité ne
bougeait qu'au retour du `refresh()` ; le retrait tenait à une icône de 32 px, partait d'un coup,
sans chemin ; et une erreur de visée était définitive. Le travail est porté par #623.

## Décision

- **Les ressorts sont maison, et purs.** `lib/spring.ts` ne connaît ni DOM, ni état, ni horloge :
  une réponse en secondes et un ratio d'amortissement — la paramétrisation d'Apple —, une
  intégration semi-implicite à sous-pas fixe, la projection de l'élan
  (`(v/1000)·t/(1−t)`, 0.998), l'élasticité de la borne et la vitesse lue sur une fenêtre
  d'échantillons. Aucune bibliothèque de mouvement n'entre dans le dépôt : le sous-ensemble dont
  le Panier a besoin est petit, il s'éprouve sans navigateur, et la dépendance aurait été le seul
  endroit du geste que les tests ne traversent pas.
- **L'image écrit la valeur, jamais React.** `components/storefront/entraineur-ressort.ts` conduit
  le ressort sur la cadence de l'affichage et rend chaque position par un rappel : le `transform`
  s'écrit sur l'élément, aucun rendu ne se produit par image. Interrompre est le cas normal — une
  pose repart de la valeur de **présentation**, pas de la cible, donc reprendre une ligne en vol
  ne saute pas.
- **La décision se prend au point projeté du relâchement.** Un flick rapide qui finit près de
  l'origine part quand même, parce que le point où le geste **allait** se poser est projeté à
  partir de la vitesse, et comparé à 40 % de la largeur de la ligne. La position seule ne décide
  pas ; la vitesse seule non plus.
- **La vitesse du relâchement entre dans le ressort, et la sortie emprunte le chemin du geste.**
  Un retrait qui portait un élan part avec `RESSORT_SORTIE` (léger rebond) ; un retour se pose
  avec `RESSORT_RETOUR` (critique). Le geste suit le doigt 1:1 dès que l'axe horizontal est
  décidé (~10 px), et l'axe vertical garde le défilement pour le navigateur (`touch-action:
  pan-y`). Un appui sur un contrôle interne ne démarre pas de geste.
- **La quantité avance à l'appui, et les écritures absolues se coalescent.** Le numéro change au
  `pointerdown` — l'appui annulé par un doigt qui sort du contrôle revient en arrière — et
  l'écriture part à l'activation. Comme `modifier` prend une quantité absolue, plusieurs appuis
  rapides produisent **une seule écriture en vol, toujours la dernière voulue** ; l'ordre n'est
  jamais celui du réseau. Ce n'est pas `useOptimistic` : la valeur optimiste doit survivre à une
  file qui s'étend sur plusieurs transitions, or la valeur d'un `useOptimistic` revient avec sa
  transition.
- **Le seam rend la fin de l'opération, il ne la cache pas.** `useMutationsDuPanier` gagne un
  rappel `surFin` optionnel, par lequel le consommateur apprend refus ou succès **dans la
  continuation de l'opération** — c'est de là que la file envoie la suivante, que le refus rend
  le numéro au serveur, et qu'un retrait refusé ramène la ligne. Rien ne franchit le seam :
  toutes les écritures y passent toujours, `refresh()` reste succès-seul dans l'action, et le
  texte des refus est relayé verbatim (ADR-0018). C'est ce rappel qui remplace les effets à
  `setState` que `react-hooks/set-state-in-effect` refuse, et non l'inverse.
- **L'annulation vit dans la liste, pas dans la ligne.** `ListeArticlesDuPanier` possède
  l'annonce « Retiré du panier » parce qu'elle doit survivre à la ligne qu'elle annonce. Un seul
  emplacement — le dernier retrait —, effacée après 5 s, jamais pendant que l'annulation est en
  vol, et retirée si le retrait est refusé. Son fond est opaque (`foreground`/`background`) :
  le **Voile dépoli** reste aux surfaces que le glossaire lui réserve.
- **La géométrie et l'horloge sont des coutures.** happy-dom rend une largeur de zéro et sa
  cadence d'images est un `setImmediate` : la largeur du geste, l'horloge du conducteur et
  l'instant des échantillons sont injectables, et le seuil comme la décision s'éprouvent sans
  navigateur. La question « où est le bord » ne se découvre pas dans un test d'intégration.
- **Le mouvement réduit garde le doigt, retire le ressort.** `prefers-reduced-motion: reduce`
  laisse le suivi 1:1 et remplace la pose par un pas instantané et un estompage d'opacité.

## Options envisagées

- **Installer `motion`/`framer-motion`** — rejeté : le geste demandé s'écrit en physique pure,
  sans DOM, et le dépôt avait déjà choisi de ne pas en dépendre ; une bibliothèque aurait aussi
  caché l'entrée de la vitesse et la projection derrière ses options.
- **Décider le commit à la position du relâchement** — rejeté : c'est exactement ce qu'*Designing
  Fluid Interfaces* corrige ; un flick court et rapide doit partir.
- **Désactiver les pas pendant qu'une écriture est en vol** — rejeté : c'était le comportement
  d'avant, et il transforme chaque appui rapide en attente. La coalescence garde le tap et borne
  le réseau.
- **Porter la file d'écriture dans le seam** — rejeté : le seam possède l'état de mutation
  (attente, refus, accusé), pas l'ordre des interactions d'un compteur. La file est une
  conséquence du geste, elle vit dans la ligne.
- **Faire servir le Voile dépoli à l'annonce** — rejeté : le matériau du Bandeau de navigation et
  des modales ne se prête pas ; l'annonce a son fond opaque.
- **Animer la hauteur de la ligne après sa sortie** — hors périmètre : la ligne s'en va par son
  `transform` et s'efface quand le `refresh()` la retire des faits. Aucune fenêtre de mise en
  page ne se referme à la main.

## Invariants

- Aucune écriture du Panier ne contourne `useMutationsDuPanier` — le retrait au geste comme
  l'annulation y passent.
- `modifier` reste absolu ; c'est le consommateur qui ordonne, par une file à une seule écriture
  en vol.
- Seuls `transform` et `opacity` s'animent, et le conducteur n'appelle jamais `setState`.
- Le numéro affiché revient exactement au fait du serveur dès qu'un refus le nomme.
- La ligne sort par le chemin où le doigt l'a poussée.
- Le balisage que les tests de page tiennent — `>N</span>`, les trois `aria-label` — reste.
