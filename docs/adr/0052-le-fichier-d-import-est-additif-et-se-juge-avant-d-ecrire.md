# Le fichier d'import est additif et se juge avant d'écrire

Le Catalogue n'avait qu'une porte : le formulaire d'un seul Produit, une Variante à la fois.
Charger une centaine de Produits avec leurs prix et leur stock demandait des heures de saisie, et
la moindre correction une seconde tournée — alors que le fichier existait déjà, dans un tableur ou
chez un fournisseur. #979 ouvre une seconde porte, `/admin/produits/importer`, en trois gestes :
**Téléverser** un CSV, **Vérifier** ce qu'il ferait sans écrire au Catalogue, **Appliquer** ce qui
a été vérifié. Un fichier téléversé est un **Lot d'import** ; chaque ligne du fichier est une
**Ligne d'import**, une Variante candidate regroupée par `slug` en Produit.

Le problème n'est pas « lire un CSV ». C'est qu'un fichier rejoué ne doit rien casser. Sans clé
d'identité, une seconde exécution duplique le Catalogue ; sans règle sur les cellules vides, elle
efface des descriptions ; sans jugement préalable, elle écrit des refus au milieu du Catalogue, et
personne ne sait lesquels. La décision est donc double : **le contrat est additif**, et **le Lot se
juge avant d'écrire**. Les deux se tiennent — un contrat qui ne peut que poser des valeurs rend le
jugement possible, et le jugement rend l'additivité vérifiable avant qu'elle ne touche un Produit.

## Decision

- **Le fichier a neuf colonnes, et une cellule ne peut que poser une valeur.** `slug`, `name`,
  `brand`, `category`, `description`, `variant_sku`, `variant_name`, `variant_price`,
  `variant_stock` ; ordre libre, en-tête obligatoire, virgule, UTF-8 (BOM toléré), 5 Mo au plus ;
  les noms de colonnes sont sensibles à la casse et à l'accentuation, et une colonne inconnue est
  signalée sans refuser le fichier. À la création, les cellules requises ne peuvent pas être vides
  et les optionnelles prennent leur défaut — stock 0, pas de Structure, pas de description ; à la
  mise à jour, une cellule vide ou une colonne absente laisse la valeur en place.

- **Cellule vide ou colonne absente = inchangé.** Le fichier ne fait que poser des valeurs ; il ne
  peut rien vider. Une description absente ne s'efface pas, un prix absent ne se remet pas à zéro,
  une Variante dont le fichier ne parle pas garde son nom et son stock. C'est la règle qui rend un
  extrait utilisable : un fichier de prix et de stock n'a pas à répéter les noms et les
  descriptions.

- **Ligne absente = rien.** Un Produit absent du fichier reste intact ; une Variante absente des
  Lignes d'un Produit qu'il nomme est renvoyée telle quelle par le merge. Aucun Produit et aucune
  Variante ne sont jamais supprimés par un import : la suppression, l'archivage et le miroir
  restent des gestes explicites, hors du fichier.

- **`slug` identifie le Produit, `sku` identifie la Variante.** Un `slug` renommé crée un second
  Produit, et l'avertissement de ressemblance de nom le signale avant l'écriture. Un `sku` déjà
  pris par une autre Variante, ou une paire `slug` + `sku` répétée dans le fichier, est un doublon
  — **refusé sur toutes ses occurrences**, jamais « la dernière gagne ».

- **`category` est un slug exact de Structure, et un import ne crée aucune Structure.** Inconnu =
  Ligne refusée ; vide = Produit sans Structure, compté en avertissement. La résolution lit la
  Structure, elle ne l'écrit pas : l'arborescence reste une décision humaine (ADR-0027,
  ADR-0029).

- **Le prix est absolu dans le fichier, et le prix de base est le minimum des prix absolus des
  Variantes.** `Product.price` vaut `min(prix des Variantes de l'union)` et
  `ProductVariant.priceDelta` l'écart à ce minimum. Sur une mise à jour, les Variantes existantes
  sont ramenées à leur prix absolu puis réécartées : une Variante que le fichier ne nomme pas
  garde son prix affiché, et seul le prix de base se déplace, quand une Ligne le justifie.

- **Le Lot se juge avant d'écrire.** `verifierLeLot(fichier)` résout `slug` → Produit, `category`
  → Structure et `sku` → Variante, calcule le diff, persiste le Lot et ses Lignes, et passe le Lot
  à `vérifié` — il n'écrit aucun Produit. `appliquerLeLot(lotId, curseur)` rejoue le même code de
  plan, jamais une seconde implémentation. Le bouton **Appliquer** reste indisponible tant qu'une
  seule Ligne est refusée : aucun import partiel ne part sans avoir été vu. Un échec d'exécution
  est un autre fait : il isole le Produit en échec, laisse le Lot `partiel` et reprenable, et
  n'empêche pas les autres.

- **Un Lot se rejoue sans effet, et se reprend.** Re-téléverser le même fichier rend 0 créé, 0
  modifié, N inchangés. Un seul Lot est `en_cours` à la fois, garanti par un index partiel unique
  et non par une lecture préalable ; l'application avance 25 Produits par appel, une transaction
  par Produit, le curseur après chacun. Le rapport distingue ce qui est **écrit** de ce qui est
  **indexé** ; l'indexation reste un effet après commit, jamais bloquant, et dit « indexation en
  attente (reprise automatique) » plutôt que « terminé » pendant que le Catalogue ne montre rien.

- **Le contraste avec Shopify est délibéré.** L'import de produits de Shopify offre une option
  d'écrasement, et une cellule vide y écrase la valeur existante. C'est l'inverse exact de ce
  contrat : nous refusons qu'une absence vaille effacement, parce qu'un fichier d'import n'est pas
  un miroir du Catalogue — c'est souvent un extrait, et son omission n'est pas une intention. Le
  contrat additif rend l'extrait utile ; le contrat d'écrasement exigerait un export complet et
  relu à chaque import.

## Ce qui ne change pas

- **Le formulaire d'un seul Produit garde sa Structure obligatoire.** `categoryId` devient
  nullable dans l'entrée d'écriture et son schéma (#980), mais la validation du formulaire reste
  `z.string().min(1, "catégorie requise")`. La possibilité de créer un Produit sans Structure
  appartient à l'import, pas à la saisie : un Produit né sans Structure s'ouvre ensuite dans
  l'Administration et doit en choisir une pour s'enregistrer. ADR-0029 tient pour l'édition.

- **L'affichage du prix garde sa règle, et l'import l'adopte.** `Product.price` et
  `ProductVariant.priceDelta` restent la source des prix calculés exposés par le Catalogue
  (ADR-0013) ; le fichier ne fait qu'exprimer des prix absolus. Aucune seconde règle de prix
  n'entre par l'import.

- **Les Images produit, les spécifications et les drapeaux restent les gestes existants.**
  L'import ne les écrit pas, et le merge qui précède l'écriture les reprend tels quels : une
  galerie, des `specs`, `isFeatured`, `featuredOrder` ou `freeShipping` survivent à un fichier qui
  ne les mentionne pas. Les images et les caractéristiques restent hors périmètre.

- **Le `slug` reste l'identité du Produit, et `/produit/[slug]` son adresse.** Aucun identifiant
  externe n'entre : `externalRef` reste hors périmètre, et le slug n'est pas un libellé jetable.

- **La porte d'administration est inchangée.** La page et son action passent par
  `adminFormAction` (ADR-0039) et n'acceptent qu'un administrateur ; l'import n'ouvre pas de
  seconde porte.

- **La suppression, l'archivage, le miroir, le SEO, XLSX/TSV/point-virgule, la file de fond,
  plusieurs Structures par Produit et l'annulation d'un Lot restent hors périmètre.** Un import
  ne fait que créer ou mettre à jour des Produits et des Variantes.

- **Le parseur reste écrit à la main.** RFC 4180 minimal — guillemets, `""`, retours à la ligne
  cités, CRLF, BOM —, sans nouvelle dépendance ; `csv-parse` reste l'échappatoire si les cas de
  citation se compliquent.

- **L'indexation reste un effet après commit, jamais bloquant** (ADR-0014, ADR-0049) : l'import
  n'ouvre pas de transaction qui l'attendrait, et la mutation du Catalogue le déclare une fois.

## Considered Options

- **Écraser les cellules vides, à la manière de Shopify** — rejeté : tout fichier partiel
  écraserait des noms, des descriptions et des marques. Le cas courant — un fournisseur qui envoie
  prix et stock — deviendrait destructeur, et le seul fichier sûr serait l'export complet du
  Catalogue, relu puis réimporté à chaque fois. Une colonne oubliée serait une perte silencieuse,
  sans diff ni refus.
  C'est précisément le risque que le contrat additif existe pour rendre impossible.

- **Supprimer puis recréer le Catalogue** — rejeté : les identifiants changent, les lignes de
  Panier tombent en cascade avec les Variantes, les liens d'Article de blog tombent avec les
  Produits, l'index doit être reconstruit, et une erreur au milieu laisse un Catalogue vide. Le
  fichier n'a aucun besoin de cette destruction : il met à jour.

- **Importer sans jugement préalable** — rejeté : les refus seraient découverts pendant l'écriture,
  au milieu du Catalogue, mêlés aux Produits valides ; il n'y aurait ni compteurs, ni avant →
  après, ni moyen de savoir si le fichier est celui qu'on croit ; et le bouton Appliquer ne
  pourrait rien garantir. La Vérification est ce qui rend l'application décidable.

- **Créer les Structures manquantes à la volée** — rejeté : une faute de frappe dans `category`
  inventerait une Structure, et le fichier déciderait de l'arborescence avec un seul slug — sans
  nom, sans parent, sans position, sans passer par la sérialisation d'ADR-0027. L'arborescence
  cesserait d'être une décision humaine, et l'avertissement « Produit sans Structure » deviendrait
  une forêt de catégories fantômes.

- **Traiter une Ligne absente comme une suppression** — rejeté : un extrait de trois Produits
  effacerait les autres ; une suppression est irréversible, et l'absence d'une Ligne n'est pas une
  demande de suppression ; un `slug` renommé supprimerait l'ancien Produit en créant le nouveau ;
  et l'absence est ambiguë — absente du fichier n'est pas absente du Catalogue. C'est la variante
  la plus destructrice de l'écrasement.

- **« La dernière gagne » sur un doublon** — rejeté : le résultat dépendrait de l'ordre des lignes,
  le fichier déciderait seul lequel des deux gagne, et la Vérification ne pourrait pas montrer ce
  qui sera écrit. Un doublon ne produit aucune Ligne, pas une correction silencieuse.

- **Appliquer les Lignes valides malgré les refus** — rejeté : l'import ne serait ni complet ni
  refusé, et rien ne distinguerait un Produit écarté pour un refus d'un Produit échoué à
  l'exécution. Les refus bloquent l'application ; l'échec d'exécution, lui, isole le Produit et
  laisse un Lot `partiel` reprenable — deux faits différents, deux comportements différents.

- **Deux implémentations, l'une pour vérifier, l'autre pour appliquer** — rejeté : les deux plans
  divergeraient, un fichier pourrait passer la Vérification et écrire autre chose, et il faudrait
  deux vocabulaires de refus et deux jeux de preuves. L'application rejoue le code de plan de la
  Vérification.

- **Un identifiant externe (`externalRef`)** — rejeté : une seconde identité à côté du `slug`, qui
  deviendrait un libellé mutable ; l'adresse `/produit/[slug]` cesserait d'identifier ; et tout
  fichier devrait porter la référence du fournisseur. Le `slug` est l'identité, et le reste du
  Catalogue le sait déjà.

## Invariants

- **Une cellule vide ou une colonne absente ne vide rien ; une Ligne absente ne supprime rien.**
  Le contrat pur les tient, testé en tableaux de cas — le texte CSV entre, les Lignes et les refus
  sortent (couture 1 de #979, ticket #983). Une ligne qui n'existe pas n'a pas de Ligne, donc pas
  d'écriture.

- **Aucun Produit, aucune Variante n'est supprimé par un import, et aucune Structure n'est créée.**
  Le Lot les tient, testé contre la vraie base avec les effets du Catalogue remplacés (couture 2,
  tickets #984–#985) : la résolution ne fait que lire `slug`, `category` et `sku`, le merge renvoie
  une Variante absente du fichier telle quelle, et le plan n'appelle ni suppression ni création de
  Structure.

- **L'identité est `slug` pour le Produit et `sku` pour la Variante, et un doublon est refusé sur
  toutes ses occurrences.** Tenue par les tableaux de cas (doublons dans le fichier, `sku` déjà
  pris) et par la résolution du Lot (couture 2). Un doublon ne rend jamais une Ligne corrigée.

- **Le prix de base est le minimum des prix absolus, et une Ligne ne déplace que le prix qu'elle
  nomme.** Tenue par la lecture des montants dans les tableaux de cas, et par le Lot (couture 2) :
  une mise à jour ramène les Variantes existantes à leur prix absolu puis les réécarte.

- **Rien n'est écrit au Catalogue avant que le Lot soit `vérifié`, et l'application rejoue la
  Vérification.** Tenue par la machine à statuts (`brouillon` → `vérifié` → `en_cours` →
  `partiel` ou `terminé`, plus `échoué`), par l'action d'application qui refuse tout autre statut,
  et par le code de plan partagé (tickets #984–#985). La Vérification écrit le Lot et ses Lignes,
  jamais un Produit.

- **Un Lot se rejoue sans effet, et se reprend au curseur.** Tenue par la couture 2 : le même
  fichier rend 0 créé / 0 modifié / N inchangés, le curseur avance après chaque Produit, et un
  seul Lot est `en_cours` grâce à l'index partiel unique (ticket #986), non à une lecture
  préalable.

- **Un Produit en échec n'empêche pas les autres.** Tenue par la transaction par Produit et le
  curseur (ticket #985) : le Lot passe à `partiel`, garde le reste et reste reprenable (ticket
  #986).

- **La page et son action passent par la porte d'administration et ne lisent pas la base.** Tenue
  par la garde structurelle de la frontière (couture 3, ticket #982) : la page et l'action
  importent la porte, pas `@/lib/db` ni `prisma`.

- **Le rapport distingue écrit et indexé, et une indexation en retard ne se donne pas pour
  terminée.** Tenue par le rapport (ticket #987) : l'indexation reste un effet après commit
  (ADR-0014), et le rapport dit « indexation en attente (reprise automatique) » plutôt que
  « terminé » tant que le Catalogue ne montre rien.
