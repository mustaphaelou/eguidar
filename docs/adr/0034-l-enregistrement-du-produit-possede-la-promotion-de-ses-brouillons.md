# L'enregistrement du Produit possède la promotion de ses Brouillons d'Image produit, en trois phases

Le cycle de vie des Images produit décidait de l'ordre de l'enregistrement. Son interface exposait
« Revendiquer et enregistrer », prenait la fonction d'enregistrement du **Catalogue** et l'exécutait
entre la revendication et la confirmation — c'est ce que disaient ADR-0004, « La forme du module » et
« Amendement : la couture transactionnelle ». La classe `RevendicationImagesProduit` portait la
galerie, les URL promues et un rappel `lier`, et c'est le cycle de vie qui appelait le **Catalogue**.
Le propriétaire du **Produit** recevait donc son ordre d'un module qui possède les Brouillons, et les
opérations de stockage — promotion des copies, suppression des sources — vivaient dans ce rappel,
autour de la transaction que le **Catalogue** ouvrait.

Le coût était double. L'unité de l'opération logique tenait à un rappel plutôt qu'à un ordre écrit :
deux modules croyaient tenir la séquence, l'un ouvrant sa transaction, l'autre décidant quand y
entrer. Et les suites éprouvaient ce rappel — `lib/cycle-vie-image-produit.test.ts` en a perdu six
cent cinquante-neuf lignes au seul ticket #690 —, c'est-à-dire un détail d'implémentation plutôt que
le comportement observable d'un enregistrement de **Produit**.

Six travaux ont renversé la couture. #685 a mis la promotion dans la couture d'effets du **Catalogue**
(`CatalogEffects`, ADR-0014) ; #686 a fait accepter à l'entrée du **Produit** les Entrées de Galerie
comme les URL nues, sous une règle d'appartenance unique ; #687 puis #688 ont fait absorber la
promotion par la création puis par la mise à jour ; #689 a réduit les Server Actions
d'Administration à des adaptateurs minces ; #690 a retiré `revendiquerEtEnregistrer`,
`RevendicationImagesProduit`, `LierBrouillonsImageProduit` et `EnregistrerCatalogue` du cycle de vie
et de ses suites. Le présent ADR consigne la décision que ces six travaux ont posée, et la frontière
d'imports la verrouille pour qu'elle ne pourrisse pas en silence.

## Décision

- **Une couture séquentielle, en ordre direct.** L'interface du cycle de vie
  (`lib/cycle-vie-image-produit.ts:191-215`) n'expose plus aucune opération qui prend une fonction :
  elle se lit dans l'ordre où l'enregistrement l'exécute — préparer la promotion, confirmer,
  supprimer les sources — par `preparerPromotionBrouillons` (`lib/cycle-vie-image-produit.ts:840-925`),
  `confirmerBrouillons` (`:927-946`), `compenserPromotionBrouillons` (`:966-984`) et
  `supprimerSources` (`:986-999`), qui rendent la main à chaque geste et laissent l'appelant les
  enchaîner. Le **Catalogue** est cet appelant : `createProduct`
  (`lib/use-cases/admin-catalog.ts:447-525`) et `updateProduct` (`:527-674`) possèdent l'ordre, et ils
  le tiennent par leur couture d'effets (`CatalogEffects`, `lib/use-cases/admin-catalog.ts:69-80`),
  dont les valeurs par défaut sont branchées sur l'instance de production du cycle de vie
  (`:93-125`). La couture porte aussi `horloge`, l'heure système par défaut : #685 l'exige comme
  couture prévue, qu'aucun consommateur de l'enregistrement ne lit encore. Le rappel inversé n'a plus
  de maison : ni `revendiquerEtEnregistrer`, ni `RevendicationImagesProduit` n'existent dans `app/`,
  `lib/` ou `components/`.

- **Trois phases, et la transaction base de données n'encadre que la deuxième.** *Avant* l'ouverture
  de la transaction, les opérations de stockage réseau : la revendication des Brouillons et la
  promotion des objets (`promouvoirBrouillons`, `lib/use-cases/admin-catalog.ts:422-437`). *Dans* la
  transaction : la rangée du **Produit**, ses Variantes, et la liaison des Brouillons au **Produit**
  — `effects.confirmerBrouillons(created.id, promotions, portTransactionRegistreBrouillonImageProduit(tx))`
  (`:497-501`, `:631-635`), le port passé ne sachant que confirmer une promotion
  (`lib/cycle-vie-image-produit.ts:132-136`, `:461-468`). *Après* l'engagement : la suppression des
  sources, en best-effort (`effects.supprimerSources`, ADR-0014), puis la suppression des Images
  produit retirées, la réindexation et l'invalidation du cache. Aucune opération de stockage ne
  s'exécute pendant que la transaction est ouverte, et aucune écriture de base ne s'exécute après
  elle. Les refus bon marché — validations, unicité, appartenance des Images produit et des
  Variantes — précèdent la promotion, pour qu'un refus ne paie jamais une promotion suivie d'une
  compensation.

- **La compensation est inconditionnelle, et elle épargne ce qui est engagé.** Tout échec de la
  transaction — validation, unicité, panne — passe par `compenserPromotions`
  (`lib/use-cases/admin-catalog.ts:439-445`) puis `compenserPromotionBrouillons`
  (`lib/cycle-vie-image-produit.ts:966-984`) : les copies promues qui ne sont liées à aucun
  **Produit** sont supprimées, et les revendications de la tentative sont rendues, Brouillon par
  Brouillon. L'appelant ne décide pas de compenser, et il ne peut pas l'oublier : la compensation
  appartient à la couture. Deux preuves sont épargnées par construction : une promotion déjà liée à
  une rangée engagée n'est jamais détruite (`estPromotionAEpargner`, `:958-964`), et un registre muet
  fait conserver plutôt que détruire — la compensation ne supprime que ce qu'elle peut vérifier.

- **La reprise par identifiant de tentative rend le Produit existant, sans réinsérer.**
  `produitDeLaTentative` (`lib/use-cases/admin-catalog.ts:388-420`) lit les Brouillons de la
  tentative au registre ; si tous ceux de la galerie soumise sont liés à un même **Produit**, elle le
  rend tel quel, et la création comme la mise à jour s'arrêtent là, sans réindexer ni promouvoir à
  nouveau. Une galerie partiellement liée, ou liée à plusieurs **Produits**, est refusée ; une mise à
  jour dont la reprise désigne un autre **Produit** que celui de l'URL l'est aussi. C'est la
  resoumission d'un formulaire qui a déjà abouti, et elle ne doit rien produire de neuf.

- **Un seul propriétaire de l'appartenance des Images produit.** `assertAucuneImageDAutreProduit`
  (`lib/use-cases/admin-catalog.ts:314-337`) refuse toute URL de la galerie soumise qui appartient
  déjà à un autre **Produit** ; les URL admises sont celles du **Produit** édité, et la règle juge
  avant toute promotion — une entrée `brouillon` n'est pas une `persistee`, et l'URL promue d'un
  Brouillon ne figure jamais dans la galerie soumise, donc le refus ne paie ni promotion ni
  compensation. Une entrée de Galerie ne nomme donc jamais l'Image produit d'un autre
  **Produit**, tandis qu'une URL orpheline reste acceptée : elle n'appartient à personne. La règle
  vit à l'entrée du **Catalogue**, pas dans un formulaire — l'entrée accepte les deux formes,
  `{ kind: "brouillon" }` et `{ kind: "persistee" }` comme la chaîne nue
  (`galerieSoumiseSchema`, `lib/use-cases/admin-catalog.ts:213-219`), et c'est la même règle qui les
  juge.

- **La promotion du stockage n'a qu'un propriétaire, et le Catalogue garde son effet après
  engagement.** `promouvoirBrouillon`, `supprimerBrouillon` et `supprimerImagePromue` ne sont nommés
  que par le port qui les implémente (`lib/r2.ts`) et par le module de cycle de vie qui les appelle
  (`lib/cycle-vie-image-produit.ts`) ; le **Catalogue** n'en nomme aucun, et son seul geste de
  stockage reste `stockageImageProduitR2.supprimerImagePersistee(url)`
  (`lib/use-cases/admin-catalog.ts:102-114`), effet après engagement de sa propre mutation. La
  frontière d'imports l'épingle : `lib/cycle-vie-image-produit-frontiere.test.ts`.

- **Ce qui ne change pas.** Les routes de téléversement (`app/api/admin/uploads/presign/route.ts`,
  `app/api/admin/uploads/delete/route.ts`) et le port client de téléversement restent tels qu'ADR-0033
  les a laissés, et le composant client de Galerie, `components/admin/image-gallery-upload.tsx`, ne
  bouge pas non plus. La disposition du compartiment public ne bouge pas : les Brouillons vivent sous
  `products/brouillons/`, les Images produit sous `products/`, la règle de cycle de vie R2 ne cible
  que le préfixe réservé, et la promotion reste une copie idempotente dont la clé persistante est une
  fonction pure de l'identifiant du Brouillon (ADR-0004). Le hachage des URL ne bouge pas : la base
  stocke l'URL publique complète, jamais la clé, et la dérivation de la clé depuis l'URL reste
  centralisée dans un seul adaptateur R2. La rétention, le registre durable, les deux états de
  propriété, la revendication « premier qui gagne », les cinq échecs et leurs cinq traitements, la
  limite de huit images par **Produit** et le vocabulaire de refus du cycle de vie restent ceux
  d'ADR-0004. La couture d'effets reste celle d'ADR-0014, et le mécanisme de mutation partagé reste
  celui d'ADR-0025 : la promotion est un effet interne à la mutation, jamais injecté par un
  appelant.

- **Le numéro de cet ADR est 0034, pas 0033.** La spec #638 citait `0033`, mais ce numéro est déjà
  pris par le port client de téléversement,
  [0033](0033-televersement-des-brouillons-un-port-client.md), qui est l'ADR du ticket frère ; et
  #638 est un numéro d'issue GitHub, pas d'ADR. Le prochain numéro libre était 0034. Ce n'est pas un
  doublon, et il ne faut pas le lire comme tel : les deux décisions partagent la même frontière, pas
  le même sujet — l'une a sorti le protocole de téléversement du composant, celle-ci donne la
  promotion à l'enregistrement du **Produit**.

## Options envisagées

- **Garder le rappel inversé** — rejeté : c'est l'état antérieur, avec ses deux modules qui croient
  tenir l'ordre, ses opérations de stockage dans la fenêtre de transaction et ses suites qui
  éprouvent un rappel au lieu d'un comportement.
- **Ouvrir la transaction avant les opérations réseau, et faire tout tenir dedans** — rejeté : la
  promotion et la pré-signature sont des allers-retours réseau ; les tenir sous une transaction
  allonge le verrou sans rien rendre atomique, le stockage et la base n'ayant pas de commit commun.
  C'est précisément ce que les trois phases remplacent, la compensation inconditionnelle tenant lieu
  d'atomicité.
- **Promouvoir après l'engagement** — rejeté : la rangée du **Produit** porte les URL publiques
  permanentes, donc la promotion doit précéder l'écriture qui les nomme ; promouvoir après coup
  demanderait une seconde écriture et laisserait, en cas d'échec, un **Produit** enregistré sans ses
  images.
- **Laisser la compensation à l'appelant** — rejeté : un appelant qui l'oublie laisse des copies
  promues orphelines et des revendications qui bloquent la tentative suivante ; la compensation est
  un effet de la couture, comme la promotion qu'elle défait.
- **Un second propriétaire pour la promotion, dans un module dédié du Catalogue** — rejeté : le
  registre, le port de stockage et le vocabulaire de refus ont un seul propriétaire (ADR-0004) ; un
  module de plus n'aurait déplacé la couture que d'un cran, et aurait donné deux maisons aux gestes
  du stockage.
- **Réintroduire le protocole inversé par un port injecté**, la classe `RevendicationImagesProduit`
  revenue par la petite porte — rejeté : la frontière d'imports refuse les deux noms dans `app/`,
  `lib/` et `components/`, et elle nomme l'infraction quand on la replante.
- **Juger l'appartenance des Images produit dans le formulaire client** — rejeté : le client rend la
  Galerie, il ne décide pas de ce qu'un **Produit** peut nommer ; l'autorité est au serveur, et
  l'entrée du **Catalogue** juge les deux formes d'un même geste.

## Invariants

- L'interface du cycle de vie est séquentielle et en ordre direct ; `revendiquerEtEnregistrer` et
  `RevendicationImagesProduit` n'ont aucun propriétaire et aucune mention dans `app/`, `lib/` ou
  `components/` — épinglé par `lib/cycle-vie-image-produit-frontiere.test.ts`.
- Les trois gestes de promotion du stockage — `promouvoirBrouillon`, `supprimerBrouillon`,
  `supprimerImagePromue` — n'ont que deux maisons, le port qui les implémente (`lib/r2.ts`) et le
  module de cycle de vie qui les appelle — épinglé par la même suite.
- Le **Catalogue** n'atteint le stockage que par le cycle de vie et par son propre effet après
  engagement : il ne nomme aucun des trois gestes de promotion, et
  `stockageImageProduitR2.supprimerImagePersistee(url)` reste son seul appel de stockage — épinglé
  par la même suite.
- La transaction base de données ne contient aucune opération de stockage : la revendication et la
  promotion la précèdent, la liaison des Brouillons s'y fait par le port de transaction, la
  suppression des sources et de la réindexation la suivent — éprouvé par
  `lib/use-cases/admin-catalog-creation-brouillons.test.ts` et
  `lib/use-cases/admin-catalog-update-brouillons.test.ts`, qui consignent l'ordre des jalons autour
  de la transaction.
- Tout échec de la transaction supprime les copies promues non liées et rend les revendications de
  la tentative ; une promotion déjà liée à une rangée engagée n'est jamais détruite, et un registre
  muet fait conserver — éprouvé par `lib/cycle-vie-image-produit-compensation.test.ts`.
- Les refus bon marché — validations, unicité, appartenance des Images produit et des Variantes —
  précèdent la promotion : un refus ne paie ni promotion réseau ni compensation — éprouvé par les
  mêmes suites d'enregistrement avec Brouillons.
- La resoumission d'un identifiant de tentative rend le **Produit** existant sans réinsérer, quand
  tous les Brouillons soumis sont liés à un même **Produit** ; sinon elle refuse en conflit typé.
- Une entrée de Galerie ne nomme jamais l'Image produit d'un autre **Produit** ; les URL admises sont
  celles du **Produit** édité, jugées avant toute promotion — éprouvé par
  `lib/use-cases/admin-catalog.test.ts`.
- Les routes de téléversement, le composant client de Galerie, la disposition du compartiment public
  et le hachage des URL restent ce qu'ADR-0004 et ADR-0033 ont décidé ; ADR-0014 et ADR-0025 restent
  intacts.

## Amendements

Cet ADR amende ADR-0004 et ADR-0026, aux endroits que la présente décision rend faux. Aucune phrase
de leurs décisions n'est réécrite : les amendements sont ajoutés à leur fin, datés et signés du
numéro d'issue #638.

## Amendement — La couture d'effets du Catalogue porte le cycle de vie à cinq membres (#716, 2026-10-20)

Aucune phrase de la décision n'est réécrite. La puce « Une couture séquentielle, en ordre direct »
dit que la couture porte aussi `horloge`, « l'heure système par défaut : #685 l'exige comme couture
prévue, qu'aucun consommateur de l'enregistrement ne lit encore ». Ce n'est plus le cas : la couture
n'a plus d'horloge, et les gestes du cycle de vie s'y lisent d'un seul tenant. C'est le présent
amendement qu'il faut lire à côté.

### Ce que cet amendement décide

- **La couture a cinq membres.** `CatalogEffects` déclare `cycleVie`, du type
  `CycleVieImageProduit`, et les quatre effets après engagement que le **Catalogue** possède :
  `reindexProducts`, `removeProductFromIndex`, `revalidateCatalog` et `deleteImages`. Aucun
  alias par geste ne survit ; `defaultCatalogEffects` branche l'instance de production du cycle de
  vie comme `cycleVie`, et les quatre effets restent indépendamment remplaçables par la surcharge
  superficielle existante.

- **L'accès passe par la dépendance.** `createProduct` et `updateProduct` tiennent la leur de
  `defaultCatalogEffects` et ne nomment plus les gestes un par un : `produitDeLaTentative` lit les
  Brouillons de la tentative par elle, `promouvoirBrouillons` prépare la promotion par elle,
  `compenserPromotions` compense par elle, et la confirmation comme la suppression des sources se
  lisent sur la même dépendance. L'ordre ne bouge pas — lire, valider, préparer, confirmer dans la
  transaction avec son port, compenser inconditionnellement, supprimer les sources, puis réindexer
  et révalider —, et les quatre effets après engagement restent en best-effort, dans le même ordre
  et avec la même journalisation.

- **L'horloge a quitté la couture, et elle est restée là où elle était déjà chez elle.** La fabrique
  du cycle de vie la porte : le cycle de vie de production est bâti avec `horlogeSysteme`, et le
  registre durable des Brouillons, `registreBrouillonImageProduitPrisma`, l'est aussi. Aucun test
  d'heure ne change de couture : ceux du cycle de vie restent les seuls.

- **Pourquoi la forme a changé.** La couture avait recopié l'interface du cycle de vie cinq fois —
  cinq alias mot pour mot des cinq gestes qu'elle nommait — et son membre `horloge` n'avait aucun
  lecteur : déclaré, pourvu d'un défaut, jamais lu. Elle était donc aussi large que les deux
  interfaces qu'elle joint ; elle ne cachait pas le cycle de vie, elle le répétait. L'interface
  et la fabrique du cycle de vie, elles, ne bougent pas : aucun geste n'y est ajouté, retiré ni
  renommé.

- **Deux surfaces de test le tiennent, et il n'y en a pas de troisième.** Les suites de mutation du
  **Catalogue**, `lib/use-cases/admin-catalog-creation-brouillons.test.ts` et
  `lib/use-cases/admin-catalog-update-brouillons.test.ts`, éprouvent l'ordre, la confirmation dans
  la transaction, la compensation et les effets après engagement à travers la dépendance ; la
  fabrique par défaut, `lib/use-cases/admin-catalog-couture-effets.test.ts`, éprouve que la
  production est la dépendance, que les quatre effets sont les défauts, et qu'une surcharge de la
  dépendance entière laisse les quatre en place. La recette partagée et l'observateur de jalons sont
  migrés, pas testés.

- **Les deux environnements de la recette ne confirment pas de la même façon.**
  `creerEnvironnementDurable` passe la dépendance entière : sa confirmation reçoit le port de
  transaction, donc la liaison des Brouillons s'exécute dans la transaction.
  `creerEnvironnementMemoire` garde, lui, une confirmation liée à son propre registre : le port
  Prisma n'atteint jamais un cycle de vie adossé à la mémoire.

### Ce que cet amendement ne change pas

- **La décision entière sur la promotion** : l'enregistrement du **Produit** possède toujours la
  promotion de ses Brouillons d'Image produit, en trois phases, avec la confirmation
  transactionnelle, la compensation inconditionnelle et la reprise par identifiant de tentative. La
  couture nomme la dépendance, elle ne redistribue pas l'ordre.
- **Aucun autre ADR** : cet amendement porte sur ADR-0034 seul ; il n'en amende aucun autre.
