# Le contenu d'un Article de blog reste une chaîne à grammaire fermée

`ArticleBlog.contenu` est une chaîne, et `decoupeContenuArticle` (`lib/blog-contenu.ts`) n'en connaît
aujourd'hui que deux formes : le paragraphe et l'**Intertitre** `##`. La page d'un Article de blog
doit rejoindre la structure d'un article d'Apple Newsroom, dont la pièce centrale est une figure plus
large que la colonne de texte, avec sa légende revenue à la mesure. Une chaîne qui ne sait décrire
qu'un paragraphe ne peut pas porter cette figure. Il fallait donc choisir comment le contenu
exprime autre chose qu'un paragraphe : des blocs typés dans une colonne `Json`, du MDX, du HTML
stocké, ou une grammaire de texte étendue.

La décision penche vers la grammaire pour une raison qui n'est pas esthétique : **aucun éditeur
d'Article n'existe**. Le contenu est écrit par la même personne qui écrit le code, et il l'écrit en
base ou dans un fichier de départ. Une colonne `Json` aurait exigé une migration du contenu
existant et un formulaire pour la remplir ; le MDX aurait fait du contenu du code, avec un
compilateur et une surface d'exécution pour cinq formes ; le HTML stocké aurait rendu le rendu
solidaire de la confiance qu'on accorde à l'auteur. La grammaire, elle, tient dans un module
existant, se lit comme ce qui est déjà écrit, et s'échappe sans réfléchir.

C'est une décision difficile à défaire, et c'est pourquoi elle est consignée : la grammaire devient
le contrat d'écriture du Blog. Un éditeur futur devra la parler, et changer de support voudra dire
convertir du contenu déjà publié. Les termes *Chapô*, *Intertitre* et *Fragment d'article* entrent au
glossaire avec elle.

## Décision

- **La colonne reste une chaîne.** `contenu` garde son type et son contenu ; aucune colonne `Json`,
  aucun `blocs`, aucun champ par forme. Le contenu existant — paragraphes et `##` — se lit comme
  avant, sans conversion.

- **La grammaire a cinq formes fermées**, et elles seules : le paragraphe (du texte séparé par une
  ligne vide), l'**Intertitre** (`## ` en début de ligne), la figure (`![alt](url "légende")`), la
  liste (`- ` en début de ligne) et la citation (`> ` en début de ligne). La légende de la figure est
  le titre Markdown de l'image, `alt` reste le texte accessible. Rien d'autre n'est une forme : ni
  tableau, ni galerie, ni HTML, ni attribut.

- **Le renvoi de note est une marque dans le texte**, `^1`, et les notes elles-mêmes ne sont pas dans
  la grammaire. `contenu` se lit ligne à ligne ; une note de bas de page est une unité de page, pas
  un **Fragment d'article** : elle vit dans sa propre colonne, hors du flux, et se rend en bloc de
  fin de page. Le renvoi `^n` désigne la n-ième ligne de cette colonne.

- **Le parseur est total.** `decoupeContenuArticle` ne lève jamais : une ligne qui n'est aucune des
  cinq formes est du texte, un contenu vide rend zéro fragment, et un renvoi qui ne désigne aucune
  note reste du texte. Un Article de blog mal écrit reste lisible ; il ne casse pas sa page.

- **Le rendu n'interprète jamais de HTML.** Le texte d'un **Fragment d'article** est rendu comme du
  texte, jamais par `dangerouslySetInnerHTML`. La grammaire est petite précisément pour que cette
  règle n'ait pas d'exception.

- **Le Chapô est une colonne, l'Extrait reste une méta-donnée.** `chapo` porte la phrase affichée
  sous le titre ; `extrait` reste la description passée aux moteurs de recherche. Sans `chapo`, la
  page affiche l'`extrait` à cette place. Les deux ne sont pas la même phrase et n'ont pas la même
  longueur utile.

- **Pas de galerie.** Une figure est une image ; plusieurs figures s'empilent. Un carrousel demande
  plusieurs images par forme et un second modèle de données — c'est une fonctionnalité, pas une
  forme de la grammaire.

## Options envisagées

- **Une colonne `Json` de fragments typés, plus un éditeur** — rejetée pour maintenant : elle exige
  une migration du contenu existant et un formulaire qui n'existe pas, alors que la forme typée est
  déjà celle que le parseur rend. C'est la direction que prendra un éditeur ; elle rouvrira cet ADR
  quand il existera.
- **MDX** — rejeté : un compilateur et une surface d'exécution pour cinq formes, et le contenu cesse
  d'être une donnée pour devenir du code.
- **HTML stocké** — rejeté : rendu solidaire de la confiance faite à l'auteur, ou assorti d'un
  assainisseur ; la grammaire rend l'échappement trivial.
- **Garder le paragraphe et l'Intertitre seuls, et faire porter l'image par la couverture** —
  rejeté : c'est exactement ce que la page fait aujourd'hui, et c'est ce qui la fait lire comme un
  document plutôt que comme un article.

## Invariants

- `decoupeContenuArticle` est une fonction totale : elle ne lève pas, et le corpus réel (paragraphes
  et `##`) rend les mêmes fragments qu'avant.
- Les cinq formes sont la liste fermée ; en ajouter une rouvre cet ADR.
- Aucun **Fragment d'article** n'est rendu par `dangerouslySetInnerHTML`.
- Les notes de bas de page ne sont pas dans `contenu` et ne sont pas des **Fragments d'article**.
- `chapo` et `extrait` restent deux colonnes distinctes ; `extrait` reste la description de la page.
- Une figure est une image ; une galerie n'est pas une forme de la grammaire.
