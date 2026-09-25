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

- **Un module neutre unique possède la langue du formulaire Produit.** C'est le seul module neuf de ce
  travail. Il possède le type de fait du formulaire — déclaré une fois, plus jamais par les props d'un
  module de rendu —, le langage des spécifications **dans les deux directions** (enregistrement vers
  texte pour la valeur par défaut du champ, texte vers enregistrement pour une soumission), la paire
  d'affichage et de lecture de l'écart de prix (dirhams à l'écran, centimes stockés, avec le repli sur
  zéro d'un écart illisible), et **tout le format de transport**, du `FormData` soumis jusqu'à l'entrée
  de la mutation : le JSON caché, les deux encodages monétaires, la convention de case à cocher, le
  champ d'ordre et le champ d'identification.

- **Le module neutre n'atteint ni base de données, ni module serveur, ni directive client.** Il est
  importé par un module de rendu client — `components/admin/product-form.tsx` — comme par le code
  serveur qui lui fait face, ce qui est la discipline que le module Carte produit suit déjà
  (ADR-0022). Un garde de frontière verrouille cette neutralité, y compris par transit.

- **Le type d'entrée de la mutation s'atteint par un import de type seul.** Le format du câble a ainsi
  un propriétaire, les règles d'exécution gardent le leur derrière l'interface de la mutation, et **il n'y
  a aucun adaptateur entre les deux**. Un import de type est effacé à la compilation : la neutralité du
  module est donc inconditionnelle, et non maintenue par convention.

- **L'identification du Produit édité reste au mécanisme partagé de mutation**, via son aide
  d'identifiant requis. Le module neutre n'apprend pas quelles actions ont besoin d'un identifiant.

- **Un Produit sans Variante est légal, et la règle est écrite.** Aucun contrôle d'un module de rendu —
  un bouton désactivé en particulier — n'en est le propriétaire. La règle est écrite au lieu où elle se
  décide : le schéma d'entrée du Catalogue accepte un tableau de Variantes vide, et le prix minimal
  retombe alors sur le prix de base (`minVariantPrice` est amorcé sur le prix de base). Aucune validation
  de Variante minimale n'apparaît par le transport.

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
