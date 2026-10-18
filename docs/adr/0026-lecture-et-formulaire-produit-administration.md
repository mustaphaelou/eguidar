# La lecture du Produit et la langue de son formulaire ont chacune leur propriétaire

L'Administration sait lister des Produits, en ouvrir un et l'enregistrer. Le chemin d'écriture était
déjà un module profond : validation, unicité du slug et du SKU, prix finaux positifs ou nuls,
appartenance des variantes, transaction engagée, comparaison des images, réindexation et invalidation
du cache se lisaient en un seul endroit, derrière l'interface du module Catalogue. Le chemin de lecture
n'avait rien de tel. Les trois lectures de `lib/use-cases/admin-catalog.ts` — `listAdminProducts`,
`getAdminProduct`, `listAdminCategories` — rendaient des rangées de base de données brutes, et la
traduction des faits stockés vers ce que voit un éditeur était répartie sur quatre modules qui ne
s'accordaient que par convention : une colonne `images` devenait une galerie en sept endroits, une
colonne `specs` devenait un enregistrement en quatre — deux d'un simple `as` non vérifié —, la page de
liste additionnait le stock des variantes en ligne alors qu'un fait canonique existe déjà, la page
d'édition projetait la rangée brute vers une forme de formulaire dont les deux champs JSON sont forcés
**et** typait cette projection par l'interface du module de rendu qu'elle allait nourrir. Le formulaire
déclarait la même forme une seconde fois, écrivait les spécifications dans une zone de texte en lignes
« Clé : valeur » qu'un analyseur non partagé relisait — les deux moitiés d'une petite langue dans deux
modules, ni exportées, ni nommées, ni testées —, et faisait voyager l'écart de prix d'une Variante en
nombre JSON de centimes pendant que le prix de base voyageait en chaîne décimale : deux encodages, deux
lecteurs, dans un seul formulaire, et les conversions d'affichage d'une part et de lecture de l'autre
logées dans un `.tsx`. Rien de tout cela n'est cassé : les `as` sont latents, et l'aller-retour des spécifications est fermé puisque le seul lecteur de
la colonne en est aussi le seul écrivain. Ce qui manque au chemin est la localité et une surface de
test. Le chemin de lecture de la Boutique, lui, cuit déjà ses faits en un seul endroit : c'est le
module Carte produit, et c'est lui que ce travail étend.

## Décision

- **Le module Catalogue reste le propriétaire des lectures Produit de l'Administration, et il les
  approfondit sur place.** `lib/use-cases/admin-catalog.ts` garde ses trois lectures et n'en gagne pas
  d'autre. Aucun module de lecture parallèle, aucun repository, aucune couche de passage : un second
  propriétaire ne ferait que déplacer la couture d'un module à l'autre, et le module Catalogue est
  déjà celui que l'Administration appelle.

- **L'interface de lecture répond en faits, jamais en rangées.** Un module de rendu d'Administration
  ne calcule rien, ne projette rien, et ne sait pas que ces colonnes sont du JSON. Après ce travail,
  `listAdminProducts` répond un fait de liste, `getAdminProduct` les faits complets du formulaire ou
  `null`, et `listAdminCategories` exactement les deux faits qu'affiche son sélecteur.

- **La lecture de liste répond par un petit fait de liste.** Identité, marque, nom de catégorie,
  prix, mis en avant, livraison offerte, une seule vignette, et le **stock total** cuit par
  `@/lib/product-metrics` puis composé par la lecture, comme le fait déjà le chemin de lecture de la
  Boutique. Ni la galerie, ni les Variantes : la liste ne les rend pas.

- **La lecture d'édition répond par les faits complets du formulaire, ou par `null`.** Elle normalise la
  galerie et les spécifications stockées et projette chaque Variante. `null` reste la réponse du Produit
  introuvable, pour que l'appelant garde sa décision.

- **La lecture de catégories répond par exactement deux faits** — l'identifiant et le nom — et reste
  dans le module Catalogue. Ses deux appelants sont deux écrans Produit déjà situés dans ce module ; un
  saut vers le module Structure n'aurait acheté que de la propreté, contre une dépendance neuve pour
  deux faits. Elle n'est pas confondue avec la lecture à compteurs du module Structure, qui sert les
  écrans de catégories.

- **Un module neutre unique possède la langue du formulaire Produit**, `lib/formulaire-produit.ts`. C'est
  le seul module neuf de ce travail. Il possède le type de fait du formulaire — déclaré une fois, plus
  jamais par les props d'un module de rendu —, le langage des spécifications **dans les deux
  directions** (enregistrement vers texte pour la valeur par défaut du champ, texte vers enregistrement
  pour une soumission), la paire d'affichage et de lecture de l'écart de prix (dirhams à l'écran,
  centimes stockés, avec le repli sur zéro d'un écart illisible), et **tout le format de transport**, du
  `FormData` soumis jusqu'à l'entrée de la mutation : le JSON caché, les deux encodages monétaires, la
  convention de case à cocher, le champ d'ordre, et le nom du champ d'identification que le formulaire
  rend. Le **câblage** du champ d'identification appartient donc au transport ; sa **résolution** non :
  le champ caché `productId` est nommé ici, mais le transport ne le lit ni ne le juge — quelle action a
  besoin d'un identifiant, et le refus d'un identifiant absent, restent au mécanisme partagé de
  mutation (voir « L'identification du Produit édité » plus bas).

- **Le module neutre n'atteint ni base de données, ni module serveur, ni directive client.** Il est
  importé par un module de rendu client — `components/admin/product-form.tsx` — comme par le code
  serveur qui lui fait face, ce qui est la discipline que le module Carte produit suit déjà
  (ADR-0022). Un garde de frontière verrouille cette neutralité, y compris par transit.

- **Le type d'entrée de la mutation s'atteint par un import de type seul.** Le format du câble a ainsi
  un propriétaire, les règles d'exécution gardent le leur derrière l'interface de la mutation, et **il n'y
  a aucun adaptateur entre les deux**. Un import de type est effacé à la compilation : la neutralité du
  module est donc inconditionnelle, et non maintenue par convention.

- **L'identification du Produit édité reste au mécanisme partagé de mutation**, via son aide
  d'identifiant requis. Le module neutre n'apprend pas quelles actions ont besoin d'un identifiant —
  et le transport ne fait que nommer le champ, jamais le lire.

- **Un Produit sans Variante est légal, et la règle est écrite.** Aucun contrôle d'un module de rendu —
  un bouton désactivé en particulier — n'en est le propriétaire. La règle est écrite au lieu où elle se
  décide : le schéma d'entrée du Catalogue accepte un tableau de Variantes vide, et le prix minimal
  retombe alors sur le prix de base (`minVariantPrice` est amorcé sur le prix de base). Aucune validation
  de Variante minimale n'apparaît par le transport.

- **Une spécification stockée à moitié lisible répond l'enregistrement vide, en entier.** La colonne
  `specs` est un `Json` sans forme garantie : seule une série d'entrées dont **toutes** les valeurs
  sont des chaînes en est une, la forme que le Catalogue écrit et valide
  (`z.record(z.string(), z.string())`). Une seule valeur illisible disqualifie le tout, et la règle est
  **délibérément asymétrique** avec la galerie, dont les membres lisibles survivent. C'est le seul
  verdict qui serve ses deux consommateurs d'un même geste : le champ Spécifications de l'Administration
  doit s'ouvrir **vide** — un champ à moitié rempli inviterait l'éditeur à enregistrer une fiche
  amputée — donc un filtre par entrée y produirait exactement ce qu'on veut éviter ; et la fiche produit
  de la Boutique rend `Object.entries(specs)`, donc un lot à moitié crédible y afficherait des lignes que
  le Catalogue n'a jamais certifiées.
  **La conséquence est assumée et c'est le seul point de ce travail où normaliser une valeur malformée
  latente change ce qui s'affiche :** un enregistrement stocké à moitié lisible ne rend **aucune** ligne
  de spécification côté Boutique, là où le code d'avant en affichait les entrées lisibles. Aucune
  rangée de ce genre n'existe en production — le Catalogue est le seul écrivain de la colonne et il la
  valide — et la suite des deux côtés épingle le verdict.

- **Une copie de moins : `entreesPersisteesDepuisUrls` est supprimée.** Cette aide de
  `lib/galerie-image-produit.ts` — « une colonne `images` devient une galerie » — n'avait plus qu'un
  appelant, la page d'édition, que ce travail remplace par la normalisation partagée ; elle est donc
  supprimée avec la page qui la forçait. Elle n'appartient pas au cycle de vie des Images produit, qui
  est hors de portée ici et garde son propre propriétaire (ADR-0004) : ce n'est pas un oubli, c'est
  l'une des copies que cette décision unifie.

- **Le Document d'index et le module Carte produit gardent leur propre normalisation.** ADR-0013 et
  ADR-0022 les ont sanctionnés : leurs invariants ne sont pas rouverts ici — y compris l'invariant
  d'import du module Carte produit, qui n'importe rien et le reste. Ces copies délibérées ne sont pas
  des doublons à confondre.

- **La mutation ne bouge pas.** L'implémentation, les validations, les classes d'erreur, la transaction
  engagée, la comparaison d'images, la réindexation et l'invalidation du cache restent derrière
  l'interface de la mutation ; l'interface de lecture grandit, le côté écriture ne se déplace pas. La
  couture d'effets reste celle d'ADR-0014 et le mécanisme partagé reste celui d'ADR-0025 : il n'apprend
  aucun concept de produit, de base ni de transport.

- **Aucun terme de glossaire nouveau.** Le vocabulaire existant couvre le domaine ; le travail de
  glossaire du **Brouillon d'Image produit** appartient au cycle de vie des images et n'est pas repris
  ici.

- **Cet ADR n'amende rien.** ADR-0022 est la forme que l'Administration étend, pas une décision
  rouverte ; ADR-0014, ADR-0025 et le mécanisme de mutation partagé sont confirmés inchangés.

## Décisions prises sur recommandation

Deux décisions de ce travail ont été prises **sur recommandation** et restent ouvertes à la
contestation. Elles sont consignées ici pour être retournées, pas pour être tenues pour acquises.

- **La normalisation partagée des deux colonnes JSON habite `lib/product-metrics.ts`, malgré le nom de
  ce module.** Le module qui possède déjà les faits canoniques du Produit (`prixVariante`,
  `minVariantPrice`, `totalVariantStock`) et qui n'importe rien devient le domicile des deux coercitions.
  Le défaut est le nom : il dira « metrics », il dira aussi « coercions ». Écarté à la place : un module
  neuf pour trois fonctions. Un renommage du module est un suivi **mécanique**, si le nom est jugé
  faux — il ne justifie pas de repousser la normalisation.

- **La lecture de liste répond par une seule vignette, pas par la galerie entière.** Le fait qui voyage
  est le fait rendu ; l'édition, seule, a besoin de la galerie complète. Écarté à la place : répondre
  par la galerie entière pour ne pas trancher, au prix d'un fait mort dans chaque ligne de la liste.

## Options écartées

- **Un module de lecture parallèle, un repository, ou une couche de passage** — écarté : le module
  Catalogue est déjà le propriétaire du Domaine côté Administration ; un second propriétaire déplace la
  couture sans la supprimer, et les quatre modules qui ne s'accordaient que par convention en
  deviennent cinq.

- **Un adaptateur entre la forme du formulaire et l'entrée de la mutation** — écarté : le câble aurait
  deux propriétaires et les règles d'exécution une troisième place où les chercher. L'import de type
  suffit à relier les deux langages.

- **Déclarer la forme du formulaire dans le module de rendu client** — écarté : la page serveur
  typerait sa projection par les props d'un composant client, et la forme du formulaire serait
  déclarée deux fois.

- **Déclarer la forme du formulaire dans le module de mutation** — écarté : la mutation reçoit des faits
  déjà valides, pas un état d'édition ; elle garde son entrée et ses règles, le formulaire garde son
  état et son transport.

- **Réunir la lecture de l'édition et celle du cycle de vie des images** — écarté : le cycle de vie a
  son propre propriétaire (ADR-0004) et son propre vocabulaire de refus ; la lecture d'un Produit n'a
  pas sa place dans ce module.

- **Exiger au moins une Variante par Produit** — écarté : le repli du prix minimal sur le prix de base
  le veut, et une telle exigence n'a pas d'intérêt de domaine derrière elle.

- **Échapper les sauts de ligne dans la valeur d'une spécification** — écarté pour cette fois : aucune
  valeur stockée n'en contient aujourd'hui et l'aller-retour est fermé ; la limite est consignée, pas
  corrigée (voir « Invariants »).

## Invariants

- Une colonne `images` ou `specs` mal formée répond des faits vides, jamais un écran cassé — et, pour
  les spécifications, le rejet est **total** : une seule valeur illisible vide tout l'enregistrement,
  des deux côtés de la couture.
- L'interface de lecture du Catalogue répond en faits. Aucun module de rendu d'Administration ne
  calcule, ne projette, ni ne force une colonne JSON stockée.
- Le stock total est cuit par les faits canoniques du Produit et composé par la lecture ; aucun module
  d'affichage ne le redérive.
- Le module neutre du formulaire Produit n'atteint jamais une base de données, un module serveur, ni une
  directive client — en direct comme en transit.
- Le format du formulaire a un propriétaire ; les règles d'exécution de la mutation gardent le leur ;
  aucun adaptateur ne se tient entre les deux.
- Un Produit sans Variante reste légal, et la règle est écrite dans le schéma d'entrée du Catalogue et
  dans le repli du prix minimal, pas dans un contrôle d'affichage.
- L'aller-retour des spécifications est garanti pour les enregistrements dont les clés et les valeurs ne
  contiennent aucun saut de ligne. Le format **ne sait pas** représenter une valeur qui en contient un
  — elle se découperait en deux lignes à l'enregistrement — ; la limite est consignée, pas corrigée.
- L'écart de prix reste un fait de stockage et d'Administration, jamais une entrée d'affichage de la
  Boutique (ADR-0013).
- Le Document d'index reste le seul lieu qui calcule les faits de recherche (ADR-0013), et le module
  Carte produit reste sans import (ADR-0022). Leurs normalisations ne sont pas rouvertes.
- La couture d'effets du Catalogue reste celle d'ADR-0014, et le mécanisme partagé reste celui d'ADR-0025,
  inchangés. L'interface de lecture grandit ; le côté écriture ne se déplace pas.
- Aucun terme de glossaire n'est ajouté, et le travail de glossaire du **Brouillon d'Image produit**
  reste celui du cycle de vie des images.

## Amendement — La lecture étroite des formulaires Produit rejoint la Lecture de la Structure (#564)

La décision tient : le module Catalogue reste le propriétaire des lectures **Produit** de l'Administration,
l'interface de lecture répond en faits et jamais en rangées, et le module neutre du formulaire Produit ne
bouge pas. Une de ses trois lectures en sort : celle de la liste des Structures.

### Ce que cet amendement rend faux, et où le lire

Aucune ligne de la décision n'est changée ; deux passages la décrivent désormais à rebours. C'est le
présent amendement qu'il faut y lire à côté :

- la première puce — « [`lib/use-cases/admin-catalog.ts`](../../lib/use-cases/admin-catalog.ts) garde
  ses **trois lectures** et n'en gagne pas d'autre » : il en garde deux, et la troisième est devenue la
  même lecture que celle des écrans de catégories, projetée autrement ;
- la puce de la lecture de catégories — « **La lecture de catégories répond par exactement deux faits**
  […] et **reste dans le module Catalogue**. Ses deux appelants sont deux écrans Produit déjà situés
  dans ce module ; **un saut vers le module Structure n'aurait acheté que de la propreté, contre une
  dépendance neuve pour deux faits.** Elle n'est pas confondue avec la lecture à compteurs du module
  Structure, qui sert les écrans de catégories. » Les trois phrases sont fausses, et pour la même
  raison : la dépendance vers le module Structure n'est plus neuve, elle existe pour cinq autres
  lectures, et les deux lectures ne sont plus distinguables puisque c'en est une seule.

### La lecture étroite cesse d'être une lecture

`listAdminCategories` rendait `{ id, name }` et ne le savait pas : rien dans son nom, rien dans son
appelant, ne disait qu'elle lisait une Structure. Elle disparaît. Les sélecteurs de Structure des deux
formulaires Produit sont alimentés par la Lecture de la Structure, projetés à l'identifiant et au nom
seulement — **le formulaire ne reçoit pas davantage de faits qu'il n'en demandait**, ce qui est la
seule exigence que la présente décision posait sur cette lecture.

La phrase « un module de lecture parallèle » de la première puce vise les lectures **Produit** : le
module qui prend la Structure n'en est pas un, et le module Catalogue ne perd aucun de ses faits.

### Le prix, et pourquoi il est accepté

Les formulaires Produit lisent désormais deux agrégats et une jointure qu'ils ne regardent pas : leur
sélecteur n'a besoin que d'un nom. Le prix est assumé et non subi, parce que l'autre issue était pire —
une seconde lecture de la Structure aurait créé un second propriétaire de cette lecture, ce qui est
exactement ce que le travail qui précède vient de supprimer. Une lecture de plus pour deux faits
n'était pas un coût ; une lecture de plus pour la table entière en était un.

### Ce que cet amendement ne change pas

- **Le module Catalogue garde les deux lectures Produit** et garde son approfondissement sur place ;
  `listAdminProducts` et `getAdminProduct` ne sont pas touchées.
- **L'invariant « Aucun terme de glossaire n'est ajouté »** reste vrai pour le travail qu'il décrit :
  c'est [#564](https://github.com/eloaurdi/eguidar/issues/564) qui ajoute un terme, et il le nomme —
  la **Lecture de la Structure**.
- **« Cet ADR n'amende rien »** reste vrai des autres ADR : ADR-0022, ADR-0014 et ADR-0025 sont
  confirmés inchangés. Ce qu'il faut y lire à côté, c'est le présent amendement.
- **Le module neutre du formulaire Produit** garde son contrat de neutralité et sa garde ; les
  formulaires ne gagnent aucun fait et ne perdent aucun.

## Amendement — Les compteurs de la liste d'Administration sont dérivés, pas lus (#567)

Le module Catalogue garde ses lectures **Produit**, et la lecture de Structure qu'il rendait à compteurs
n'existe plus depuis que la Lecture de la Structure possède la table. Ce que cet amendement consigne n'est
pas ce qui a disparu — le présent amendement le dit déjà — mais **ce qui le remplace**, parce que la
substitution n'est pas de même nature et qu'aucune des deux ne se comprend sans l'autre.

### Ce que cet amendement rend faux, et où le lire

Aucune ligne de la décision n'est changée ; un passage la décrit désormais à rebours. C'est le présent
amendement qu'il faut y lire à côté :

- la puce de la lecture de catégories — « **Elle n'est pas confondue avec la lecture à compteurs du
  module Structure, qui sert les écrans de catégories** ». Il n'y a plus de lecture à compteurs : la
  Lecture lit la table **une fois**, sans `parent: { select }` ni `_count.children`, et les écrans de
  catégories reçoivent un nom de parente et un nombre de sous-catégories **dérivés en mémoire**. La
  distinction que la décision énonçait — deux lectures distinctes, dans deux modules — n'a plus
  d'objet, et la phrase reste vraie seulement de l'historique.

### La divergence, et ce qu'elle coûte

Le critère d'acceptation de [#567](https://github.com/eloaurdi/eguidar/issues/567) disait que la lecture
**sélectionne** le nom de la parente et le nombre de ses enfants. L'implémentation les **dérive** de deux
faits déjà lus — `parentId` et le nom — au lieu de les sélectionner.

Le motif est le même que celui qui a fait disparaître la rangée que la page de catégorie lisait pour se
reconnaître, et il est énoncé dans l'en-tête de
[`lecture-structure.ts`](../../lib/use-cases/lecture-structure.ts) : la lecture prend la table entière,
sans `where` ; `_count.children` et « les Structures dont le lien est cette rangée » sont donc **le même
nombre**, et `parent.name` et la carte des noms **le même texte**. Les sélectionner ferait payer la
jointure et l'agrégat à *toute* surface — l'accueil, la catégorie, la fiche Produit — pour une preuve
que la boutique n'a pas demandée, et la boutique verrait son coût monter sur la requête qu'elle fait
déjà (US 32 : une surface ne reçoit pas plus qu'elle n'a demandé).

La valeur rendue est donc **exactement** celle que la base aurait rendue, et l'écart n'est pas une
approximation tolérée : c'est un fait équivalent. Les deux compteurs sont ici l'exemple le plus net de la
règle que le présent ADR énonce pour les lectures Produit — *répondre en faits, jamais en rangées* —
appliquée cette fois à l'intérieur de la lecture.

### Ce que cet amendement ne change pas

- **La décision entière** : les lectures Produit du module Catalogue, l'approfondissement sur place, la
  frontière d'ADR-0028 et la forme étroite du sélecteur de Structure.
- **Le module de la lecture de Structure** n'est pas celui d'ADR-0026 : c'est
  [`lecture-structure.ts`](../../lib/use-cases/lecture-structure.ts), et la limite de son périmètre — il ne
  lit jamais sous une transaction — est consignée dans l'amendement d'ADR-0027.
- **Le vocabulaire de refus** et **la couture des effets** restent intacts (ADR-0025, ADR-0014).

## Amendement — L'enregistrement du Produit possède la promotion de ses Brouillons d'Image produit (#638, 2026-10-18)

La décision tient : le module Catalogue reste le propriétaire des lectures **Produit** de
l'Administration, l'interface de lecture répond en faits et jamais en rangées, et le module neutre du
formulaire Produit ne bouge pas. Ce que cet amendement consigne est de l'autre côté du module : le
côté écriture, que la décision déclarait immobile, a absorbé le cycle de vie des images.

### Ce que cet amendement rend faux, et où le lire

Aucune ligne de la décision n'est changée ; une puce la décrit désormais à rebours, et un invariant la
reprend. C'est le présent amendement qu'il faut y lire à côté :

- la puce « **La mutation ne bouge pas.** L'implémentation, les validations, les classes d'erreur, la
  transaction engagée, la comparaison d'images, la réindexation et l'invalidation du cache restent
  derrière l'interface de la mutation ; l'interface de lecture grandit, le côté écriture ne se déplace
  pas. » La première moitié est vraie — mêmes validations, mêmes classes d'erreur, même transaction,
  même comparaison d'images, même réindexation, même invalidation — et l'interface d'écriture ne se
  déplace pas pour ses appelants : `createProduct` et `updateProduct` gardent leurs paramètres et leur
  surcharge d'effets facultative, l'entrée du **Produit** s'étant seulement élargie aux Entrées de
  Galerie et aux identifiants de tentative (#686). La dernière phrase, elle, est fausse dès qu'on
  l'entend de l'implémentation : le côté écriture s'est déplacé, et il possède désormais l'ordre du
  cycle de vie des images — revendication et promotion avant la transaction, liaison des Brouillons
  dedans, compensation inconditionnelle, suppression des sources après l'engagement (#685 à #690). Ce
  n'est pas la lecture qui a hérité du cycle de vie : c'est l'enregistrement du **Produit** qui le
  pilote, et la décision est écrite dans
  [0034](0034-l-enregistrement-du-produit-possede-la-promotion-de-ses-brouillons.md).
- l'invariant qui la reprend — « La couture d'effets du Catalogue reste celle d'ADR-0014, et le
  mécanisme partagé reste celui d'ADR-0025, inchangés. L'interface de lecture grandit ; le côté
  écriture ne se déplace pas. » — pour la même raison : les deux premières phrases restent vraies et
  sont confirmées, la dernière ne l'est plus.

### Ce que cet amendement décide

- **L'enregistrement du Produit possède la promotion de ses Brouillons d'Image produit**, en trois
  phases, avec une compensation inconditionnelle et une reprise par identifiant de tentative
  (ADR-0034). La promotion est un effet **interne** à la mutation : `CatalogEffects`
  (`lib/use-cases/admin-catalog.ts:69-80`) porte les gestes du cycle de vie et
  `defaultCatalogEffects` (`:93-125`) les branche sur l'instance de production ; aucun appelant
  n'injecte d'adaptateur, et la surcharge reste la couture de test d'ADR-0014.
- **Les Server Actions d'Administration restent des adaptateurs minces** (#689) : elles passent
  l'entrée du formulaire et n'injectent aucun effet, pas plus qu'elles ne connaissent une clé R2 ou un
  état du registre.
- **Le vocabulaire de refus des images a un seul propriétaire pour les gestes du cycle de vie**, et le
  module Catalogue le traduit en refus typés pour le formulaire ; il ne le réécrit pas. Deux refus de
  la reprise, eux, appartiennent désormais au **Catalogue**, qui les compose sans les traduire :
  « Les Brouillons ne sont pas tous liés à la même tentative », un texte que le cycle de vie rendait
  avant #690, et « L'enregistrement du Catalogue a échoué », qui nomme le **Produit** disparu sous
  une reprise. Le cycle de vie n'a plus de maison pour ces deux textes, la reprise lisant le registre
  depuis l'entrée du **Catalogue**
  ([0034](0034-l-enregistrement-du-produit-possede-la-promotion-de-ses-brouillons.md)).

### Ce que cet amendement ne change pas

- **La décision entière** : les deux lectures Produit du module Catalogue, l'approfondissement sur
  place, la règle « répondre en faits, jamais en rangées », la frontière d'ADR-0028, le module neutre
  du formulaire Produit et sa garde, et la forme étroite du sélecteur de Structure.
- **L'option écartée « Réunir la lecture de l'édition et celle du cycle de vie des images »** reste
  écartée, et pour la raison qu'elle donnait : le cycle de vie a son propre propriétaire — registre
  durable, port de stockage, vocabulaire de refus — et la lecture d'un **Produit** n'y a pas sa place.
  C'est l'enregistrement du **Produit** qui pilote les gestes du cycle de vie, pas la lecture qui
  hérite du cycle de vie.
- **« Cet ADR n'amende rien »** reste vrai du travail qu'il décrit : ADR-0022 est toujours la forme
  que l'Administration étend, et ADR-0014 comme ADR-0025 sont toujours confirmés. Ce qu'il faut y lire
  à côté, c'est le présent amendement.
- **Aucun terme de glossaire nouveau** : le travail de vocabulaire reste celui du **Brouillon d'Image
  produit**, dans le cycle de vie des images.
