# Eguidar

A French-language Moroccan e-commerce storefront (eguidar.com): catalog with categories and product variants, cart, cash-on-delivery checkout, order lifecycle, and the Administration space. Single context.

L'habillage reprend celui d'apple.com : la palette, la typographie et le Voile dépoli viennent de là, et le site n'a qu'un seul thème, le clair. Une couleur qui change d'apparence selon la surface qui la porte est une couleur qui n'existe pas.

## Language

**Bandeau de navigation**:
La barre fixe en tête de la boutique portant le Logo, l'entrée de Recherche et le déclencheur de l'**Aperçu du Panier**, présente sur toute page de la boutique. Distincte de la **Barre d'achat**, fixée en bas sur mobile, et du bandeau de l'Administration. Il ne porte aucune entrée vers les pages de la boutique — À propos, Contact, FAQ, Blog, Conditions & livraison — que seul le pied de page porte. Il ne porte pas de déclencheur de Connexion : l'entrée du Compte appartient à l'Aperçu du Panier.
_Avoid_: header, navbar, barre de navigation, barre du haut

**Voile dépoli**:
Le matériau translucide posé par-dessus un contenu qui défile, pour qu'une surface fixe reste lisible : le **Bandeau de navigation** et les modales de Connexion et d'Inscription. Un seul matériau et une seule recette : son épaisseur varie d'une surface à l'autre — opacité, flou et saturation. Il ne porte aucun contenu, et le porter n'est jamais un choix de la surface — le **Bandeau de navigation** ne le porte qu'une fois la page défilée, les modales en permanence. Une feuille plein cadre qui recouvre la page, comme le panneau de Filtres sur mobile, ne le porte pas : elle a son propre fond. L'**Aperçu du Panier** fait exception : sa feuille porte le matériau, plus épais, parce qu'elle fournit le fond du **Bandeau de navigation**.
_Avoid_: glass, glassmorphism, verre dépoli, frosted glass, backdrop blur

**Voile sombre**:
La couche qui ferme l'accès au contenu situé derrière une modale, un tiroir, un menu ou l'**Aperçu du Panier**. Elle n'assombrit rien elle-même : elle rend le voile dépoli d'une surface lisible par-dessus ce qu'elle recouvre. Une seule recette, seule son opacité varie.
_Avoid_: overlay, backdrop, scrim, voile, fond noir

**Livraison**:
The delivery service for orders: delivery cities, their fees, and the free-shipping rule.
_Avoid_: shipping, frais de port

**Ville de livraison**:
A city to which orders can be delivered, each with a fixed delivery fee. Its public identity in a URL is its slug — the normalized form of its name; the internal identifier never appears in a URL and survives there only as a read-only alias (ADR-0017).
_Avoid_: ville desservie, identifiant de ville dans l'URL

**Langage d'URL de la Ville**:
La règle bidirectionnelle d'écriture et de lecture de la Ville de livraison dans l'URL : à
l'écriture, le slug seul, percent-encodé, sous la forme `?ville=<slug>` ; à la lecture, le slug
d'abord, puis l'identifiant interne en alias en lecture seule (ADR-0017). Un seul module en est
propriétaire, partagé par les pages serveur et les composants clients.
_Avoid_: format d'URL de ville, ville query param

**Frais de livraison**:
The fee charged per order for delivery to a given city. Free when the cart subtotal reaches the free-shipping threshold, or when the cart contains a free-shipping item.
_Avoid_: coût de livraison

**Seuil de livraison offerte**:
The cart subtotal above which delivery is free regardless of city or items.
_Avoid_: seuil de gratuité

**Devis**:
Le calcul du prix d'un panier selon la ville de livraison : les frais de chaque ville de livraison,
le seuil de livraison offerte appliqué au sous-total, et le total à payer à la livraison pour la ville demandée.
_Avoid_: quote, estimation de livraison

**Devis chargé**:
Les faits du Devis d'un Panier chargés côté serveur : les Villes de livraison avec leurs frais,
le seuil de livraison offerte, le devis de chaque ville, le sous-total et sa Ville initiale
(« aucune » comprise) — des données pures qui traversent la couture serveur vers le client.
Le Devis projeté se dérive ensuite de ces faits.
_Avoid_: quote payload, devis data, devis sérialisé

**Devis projeté**:
Les faits d'un Devis chargé rapportés à une Ville de livraison : les Villes de livraison, la
Sélection du Devis, les lignes du Récapitulatif de paiement et l'identifiant de la Ville de
livraison sélectionnée. Se calcule à partir des seuls faits du Devis chargé, sans accès base.
_Avoid_: vue, view model, devis résolu

**Sélection du Devis**:
La sélection validée d'une Ville de livraison et de son devis, ou « aucune » tant qu'aucune ville
n'est choisie ; jamais à moitié. Une sélection validée porte exactement deux faits : la Ville de
livraison et son devis.
_Avoid_: selected city, city selection, sélection de ville

**Devis périmé**:
L'état du Devis affiché quand les faits du Panier ou de la Livraison ont changé avant la
confirmation : le Total à payer que le Client a lu ne vaut plus. La Commande refuse de naître sur
un Devis périmé ; la page se repose sur les faits courants.
_Avoid_: prix changé, montant obsolète, quote périmé

**Précédence du Devis**:
L'ordre dans lequel la Ville de livraison initiale d'un Devis est choisie : la Ville nommée dans
l'URL (lien partagé) l'emporte ; à défaut la Ville sauvegardée dans le profil du Client ; sinon
« aucune ». Un lien explicitement fourni gagne même s'il nomme une Ville de livraison inconnue —
jamais de repli sur le profil. Le Devis chargé porte le résultat : sa Ville initiale, résolue une
seule fois lors du chargement du Devis, « aucune » comprise.
_Avoid_: priorité de ville, repli de ville, initial city

**Lecture du Devis**:
La lecture serveur du Devis pour une page : un seul module charge le Devis à partir de faits bruts
(le Panier, la Ville de l'URL, la Ville du profil) et répond à la fois du Devis chargé et du Devis
projeté. Les pages en font un seul appel ; aucune page ne dérive la Précédence du Devis ni ne
lance la projection elle-même. Le cœur pur n'est atteignable que par ce module côté serveur, ou
par le crochet de sélection côté client.
_Avoid_: chargerDevis (comme nom du concept), devis loader, lecture du quote

**Récapitulatif de paiement**:
Le bloc présentant le Sous-total (TVA incluse), la Livraison et le Total à payer à la livraison sur le Panier, la commande, la confirmation, l'Administration et l'e-mail de commande.
_Avoid_: order summary, résumé de commande, récapitulatif de commande, récap

**Paiement à la livraison**:
The only payment method: the courier collects the total in cash at delivery. The total shown at checkout is what the courier collects.
_Avoid_: cash on delivery, paiement cash, payer à la livraison

**Panier**:
The selection of articles a person assembles before ordering; both a Visiteur and a Client have one.
_Avoid_: cart, caddie

**Article du panier**:
One product variant with its chosen quantity inside a Panier.
Le contrat HTTP de #754 nomme `lignes` le tableau qui les porte : c'est le nom du fil, pas celui du
domaine, et il ne remplace pas ce terme.
_Avoid_: ligne de panier, line item

**Page du Panier**:
La page qui porte le Panier en entier : les Articles du panier, la Ville de livraison, le Devis et le Récapitulatif de paiement, puis le passage de commande. C'est le seul endroit où l'on commande.
_Avoid_: panier (seul), checkout, panier page, page panier

**Aperçu du Panier**:
La surface que le déclencheur du Panier ouvre par-dessus la page, sans la quitter : l'aperçu des
Articles du panier — ou l'état vide du Panier — puis les entrées du Compte (Commandes, Mon profil,
et Connexion ou Déconnexion). Il montre, il ne mute rien : la Page du Panier reste le seul endroit
où l'on modifie un Article du panier, et le seul où l'on commande. Une seule feuille, pleine largeur
sous le Bandeau de navigation et posée sur le Voile sombre ; sur mobile elle prend tout l'écran, et
c'est le déclencheur du Panier qui la referme. Tant qu'il est ouvert, il fournit le fond du Bandeau de
navigation, qui ne porte alors pas son Voile dépoli : la feuille porte elle-même le matériau, plus
épais que celui du Bandeau.
_Avoid_: flyout, mini-panier, panier volant, tiroir du panier, bag, dropdown du panier

**Propriétaire du panier**:
The Visiteur or the Client whose Panier it is; resolved once per request from the session.
_Avoid_: owner, cart owner, panier owner

**Panier courant**:
The Panier of the request's Propriétaire du panier, resolved once per request from the session.
_Avoid_: current cart, session cart

**Refus du panier**:
Le refus par le serveur d'une opération sur le Panier : panier plein, quantité invalide,
article indisponible ou article absent.
_Avoid_: erreur panier, échec d'ajout, rejection

**Catalogue**:
The complete set of products for sale, browsable via the "Tous nos produits" page.
_Avoid_: tous les produits (as the concept name)

**Structure**:
L'arborescence de catégories du Catalogue telle que l'Administration la gère : la table `Category`
en base, la **Lecture de la Structure** qui la lit pour une page, et le module
`lib/use-cases/admin-structure.ts` qui la mute. Une Structure est une catégorie de cet arbre, à
laquelle les Produits se rattachent — sauf ceux dont elle a été supprimée, qui deviennent des
**Produits sans Structure**. Chaque Structure porte une **position** parmi ses sœurs, et le
déplacement est une commande unique, jamais un ordre calculé par le navigateur (ADR-0030).
_Avoid_: category tree, arborescence de catégories, catégorie d'administration

**Position dans la Structure**:
Le rang d'une Structure parmi celles qui partagent sa parente, un-based, dans l'ordre
`(position, nom en français, identifiant)`. La colonne `Category.position` le stocke, la commande
`deplacerStructure` seule le réécrit — par pas de 1024, sans contrainte d'unicité sur la fratrie —,
et la **Lecture de la Structure** rend le rang, le nombre de sœurs et le chemin de la ligne. Une
Structure laissée à zéro par la migration est départagée par son nom, comme avant l'ordre explicite.
_Avoid_: ordre des catégories, index de tri, rank

**Refus de la Structure**:
Le refus par le serveur d'une opération sur la Structure : données invalides, slug déjà pris,
Structure introuvable, Structure contenant des sous-catégories, Produits qui lui sont rattachés,
réaffectation invalide, Structure déjà en cours de modification par une autre opération, ou
transaction dont le délai est dépassé. A
mutation may also be refused because the stored Structure is **corrupt** — it already carries a cycle
somewhere in an ancestor chain (ADR-0027). That is a different fault from a bad request, and it is
refused in its own voice rather than as invalid input, since retrying repairs nothing. Un délai de
transaction dépassé a lui aussi sa propre voix : ce n'est pas la contention, que « réessayez »
répare, et `CategoryBusyError` ne dit donc pas ce fait (ADR-0027). Un cycle déjà présent nomme
l'arête qui le ferme, pour que « Rattacher… » rende une action et non une panne (ADR-0030). Une
mutation de Structure ne produit jamais d'autre **refus** : tout défaut qu'elle sait nommer devient
un Refus de la Structure, et un défaut qu'elle ne sait pas nommer est rendu tel quel, sans refus
composé — la même partition
qu'ADR-0004 tient pour une rangée illisible. Le refus d'une Structure qui a des Produits **est le
défaut** : l'éditeur peut le lever en choisissant de les réaffecter ou de les laisser sans
Structure, jamais par inadvertance (ADR-0029).
_Avoid_: erreur catégorie, échec de suppression, category error

**Marche de la Structure**:
Le parcours de l'ascendance ou de la descendance d'une Structure, suivi par `parentId` et arrêté
sur toute revisite — seule marche du dépôt à ne rien lire en base, donc à ne dépendre d'aucun
verrou. Une Structure corrompue s'arrête où son cycle commence et rend des faits dégradés : le
refus d'une Structure cyclique appartient à ses mutations, seul terrain où un Client a une faute à
qui la rendre (ADR-0030).
_Avoid_: walk, traverse categories, parent chain, parcours de catégories

**Structure hors arbre**:
Une Structure corrompue que le cycle soustrait à toute autre : elle existe en base et n'appartient
à aucune branche, donc ni à aucune page de l'Administration ni à l'arbre de la boutique. L'Administration
la nomme ; la boutique se contente de journaliser (ADR-0030).
_Avoid_: catégorie orpheline, catégorie cyclique, structure orpheline

**Lecture de la Structure**:
La lecture serveur de la Structure pour une page : un seul module
(`lib/use-cases/lecture-structure.ts`) lit la table `Category` une fois par exécution, en tire une
Marche de la Structure, et rend une **valeur** bâtie de ces faits. Une surface lui demande ce
qu'elle rend — l'arbre d'accueil, les lignes de l'Administration, les cibles de suppression d'une
ligne, les options d'un sélecteur, une Structure par son identifiant ou par son slug, le fil
d'Ariane, ses enfants, sa branche — et rien de plus : elle peut en demander une seule ou quatre
d'un coup, et la lecture reste la même. Les questions portent le nom de ces faits, jamais celui d'un
écran : une page de plus n'ajoute aucun nom ici. Elle rend des faits, jamais des verdicts : ce qu'un
cycle signifie reste à celui qui l'appelle — l'Administration le nomme, la boutique dégrade
(ADR-0030). L'ordre qu'elle promet — la position, puis le nom en français, départagé par
l'identifiant — est écrit une fois, dans le cœur de la Marche, et toutes ses surfaces le rendent sans
le refaire (ADR-0030). Ses lignes d'Administration portent aussi la position parmi les sœurs, le
nombre de sœurs, le cumul des Produits de la branche et le fil d'Ariane de la ligne ; la boutique
suit le même ordre.
Elle ne lit jamais dans une transaction : les lectures qu'une mutation doit juger sur des faits
engagés restent avec elle, sous le verrou grossier (ADR-0027).
_Avoid_: lecture de catégorie, category read, listAdminCategoriesWithCounts (comme nom du concept)

**Recherche**:
The act of finding products across the Catalogue by free-text query, in which every term of the
query must be found in the Document d'index, typo tolerance permitting, filtrable par une ou
plusieurs marques, une catégorie et une tranche de prix, triable (pertinence, prix, nouveautés) et
paginée. Une faute de frappe reste permise — un terme mal orthographié trouve encore son Document
d'index — et ni la casse ni les accents ne changent le résultat. Le dernier terme peut s'arrêter
avant la fin : c'est le seul que le moteur tronque, les autres doivent se trouver entiers.
Le Bandeau de navigation propose des suggestions instantanées de produits et de catégories ; il
s'ouvre sur les catégories que la requête concerne le plus, classées par nombre de Documents
d'index décroissant puis par slug croissant. Ce classement est un choix de la Recherche, pris
au-dessus de la couture : il ne vient pas de l'ordre dans lequel un moteur rend ses valeurs de
facette.
_Avoid_: search, recherche produit, recherche fuzz

**Suggestion de produit**:
La ligne compacte qu'une Recherche propose dans le Bandeau de navigation : la première image, le nom, la marque et le
Prix courant d'un Produit, vers sa page Produit. Ce n'est pas une Carte produit : elle ne porte ni le
stock total ni la Livraison offerte.
_Avoid_: suggestion de recherche, autocomplete, item de suggestion

**Moteur de recherche**:
Le moteur derrière la surface d'interrogation de la Recherche, atteint à travers la couture neutre
`lib/moteur-recherche.ts` : Meilisearch en production, un moteur en mémoire dans les tests. Le
moteur en mémoire n'est pas un second moteur mais un double de test : rapide et sans moteur à
démarrer, il éprouve l'orchestration — le retrait de la clause d'une facette, le bornage d'une page
hors bornes — et non la qualité d'une Recherche. Il n'atteste ni le classement par pertinence, ni la
tolérance aux fautes de frappe, ni l'ordre ni le plafond des valeurs de facette. Il ne rend jamais
l'indisponibilité, lui qui est toujours disponible : elle s'éprouve par un moteur de recette, figé
sur une réponse.
À ne pas confondre avec le Catalogue, qu'il interroge, ni avec l'écriture de l'index, qui reste hors
de la couture.
_Avoid_: search engine, backend de recherche, Meilisearch (comme nom du concept)

**Tranche de prix**:
L'une des cinq fourchettes de prix fixes (par exemple « Moins de 1 000 MAD ») par lesquelles la Recherche peut être filtrée.
_Avoid_: bucket de prix, intervalle de prix

**Filtre de recherche**:
Une contrainte choisie sur la Recherche : une ou plusieurs marques, une catégorie ou une tranche de prix.
_Avoid_: facette, critère

**Option de filtre**:
Une entrée du panneau de la Recherche — une marque, une catégorie ou une Tranche de prix — avec son
libellé d'affichage, le nombre de résultats qu'elle donnerait et si elle est retenue par les Filtres
actifs. La Recherche les assemble une fois et la barre latérale ne fait que les rendre : une option
retenue reste visible même à zéro.
_Avoid_: facette d'option, choix de filtre, filter option

**Filtres actifs**:
L'ensemble des Filtres de recherche en vigueur pour la Recherche courante, présentés au-dessus des résultats et retirables individuellement.
_Avoid_: chips, tags

**Document d'index**:
La forme indexable d'un produit pour la recherche : identifiants, libellés, marque, catégorie,
texte des spécifications (clés et valeurs), noms de variantes et SKU (recherchables), prix
minimal et son bucket de prix, stock total, images et date de mise à jour. Sa clé de facette
`categorySlug` est **toujours** une chaîne : un **Produit sans Structure** y porte la valeur
réservée `_sans-structure`, jamais une chaîne vide, qu'aucun filtre ne retiendrait (ADR-0029).
_Avoid_: produit indexé, indexable product

**Produit**:
L'entité vendue du Catalogue, présentée à `/produit/[slug]` avec sa marque, sa description,
ses spécifications, ses Images produit et ses Variantes.
_Avoid_: article (seul), item

**Produit sans Structure**:
Un Produit dont la Structure a été supprimée, et qu'elle a emporté sans lui. Il est vendu
normalement et reste lisible, mais il n'appartient à aucune page de catégorie et à aucun
décompte du Catalogue. La Recherche le range sous la valeur de facette réservée
`_sans-structure`, hors de la grammaire de slug d'une Structure : cette valeur ne peut donc
jamais désigner une catégorie réelle. La seule façon d'en produire un est de supprimer une
Structure ; la seule façon de ne plus l'être est de lui en choisir une (ADR-0029).
_Avoid_: produit orphelin, catégorie supprimée, produit sans catégorie

**Image produit**:
A visual asset belonging to a product in the catalogue, displayed in the product gallery. The first image of a product's gallery is its thumbnail in lists and the cart, and its illustration in share previews (Open Graph) when the product is shared on WhatsApp, Facebook or X. Une Image produit persistée est décrite par une ligne de son **Registre des Images produit**, qui porte son **Texte alternatif**.
_Avoid_: photo, visuel, media

**Registre des Images produit**:
La table des faits durables d'une Image produit persistée, une ligne par URL publique : type MIME, taille, dimensions, **Texte alternatif**, créateur et date. Elle est écrite après l'engagement de l'enregistrement d'un **Produit**, jamais dans sa transaction, par un upsert idempotent sur l'URL. Une ligne manquante est un trou réparable par la réconciliation, jamais une image perdue ; le bucket n'est jamais l'autorité des usages.
_Avoid_: table des médias, registre R2, média

**Texte alternatif**:
Le texte qu'une Image produit donne à sa place quand elle est rendue à une personne qui ne la voit pas : il décrit le visuel et ne répète pas le nom du **Produit**. Il appartient à l'Image produit (le **Registre des Images produit**), s'édite dans la **Bibliothèque des médias** et dans la **Galerie produit**, et un nouvel envoi ne peut pas être publié sans lui ; une Image produit ancienne sans Texte alternatif rend le nom du Produit.
_Avoid_: texte de remplacement, description d'image

Le champ s'appelle `alt` dans le code et dans la colonne Prisma : c'est le nom du champ, pas un synonyme du Texte alternatif. « Texte alternatif » reste le libellé montré à l'utilisateur, et le renommer n'apporterait rien qu'un diff de cinquante-quatre sites.

**Bibliothèque des médias**:
La surface d'Administration qui liste le **Registre des Images produit** avec sa recherche, ses filtres « inutilisées » et « sans texte alternatif », sa sélection multiple et son tiroir de détail. Elle rend lisibles les usages d'une Image produit et refuse de supprimer celle qu'un **Produit** nomme encore ; elle ne remplace pas le stockage.
_Avoid_: médiathèque, médias, file manager

**Brouillon d'Image produit**:
Une Image produit téléchargée pendant l'édition d'un Produit, mais pas encore enregistrée comme fait de ce Produit. Son propriétaire est l'éditeur d'Administration qui l'a téléchargée, jamais le Produit : elle porte un identifiant opaque plutôt qu'une URL, expire seule au bout de la rétention configurée, et disparaît si l'édition est abandonnée. Il se distingue d'une Image produit persistée, qui appartient à son Produit et dont la suppression n'intervient qu'après un enregistrement réussi.
_Avoid_: upload temporaire, image en attente, brouillon d'upload

**Galerie produit**:
L'ensemble ordonné des Images produit d'un Produit. L'ordre est celui que l'Administration a donné, et il est
significatif : un Brouillon d'Image produit intercalé entre deux Images produit déjà enregistrées s'insère entre
elles à l'enregistrement. Une galerie peut mêler des Images produit déjà enregistrées et des Brouillons d'Image
produit côte à côte — c'est le registre des Brouillons qui distingue les deux, pas la place qu'ils occupent. Un
Produit sans Image produit reste légal, et rend alors le nom du Produit à la place de l'image absente.
_Avoid_: gallery, collection d'images, liste d'images, galerie d'images produit

**Suppression en attente**:
Le fait, pour une Image produit déjà enregistrée, d'être marquée pour une suppression qui n'a pas
encore eu lieu : elle reste dans la Galerie produit, y est signalée comme en attente, et n'en
quitte la Galerie produit qu'au prochain enregistrement réussi. Tant que cet enregistrement n'a
pas réussi, l'Image produit reste dans le Catalogue et dans le stockage ; elle libère sa place
dans la Galerie produit dès l'édition, pour une autre image, et la suppression reste annulable.
_Avoid_: pending removal, pending deletion, marked for deletion, image en attente

**Variante**:
Une déclinaison achetable d'un Produit, identifiée par son SKU, avec son propre écart de prix et son propre stock.
_Avoid_: product variant, version, option

**Barre d'achat**:
La barre fixée en bas de l'écran sur mobile, sur la page produit, qui répète le prix courant
et l'action « Ajouter au panier » pendant que l'utilisateur fait défiler la page.
_Avoid_: sticky bar, buy bar, barre collante

**Prix courant**:
Le prix affiché pour une Variante (prix de base plus écart de prix) et pour un Produit (son prix minimal).
_Avoid_: current price, prix effectif, prix calculé

**Carte produit**:
Un Produit présenté dans une liste — page de catégorie, Produits liés, résultats de Recherche —
sous la forme d'un bloc portant sa première image, son Prix courant, son stock total et son lien vers sa
page Produit. C'est la seule forme sous laquelle ces faits s'affichent en liste.
_Avoid_: product card, vignette produit, tuile

**Mise en avant**:
Le fait, pour l'Administration, de désigner les Produits que l'accueil met en avant, et dans quel ordre
(`Product.isFeatured`, `Product.featuredOrder`). C'est la seule curation de l'accueil : ses Panneaux sont
ces Produits, dans cet ordre. La copie d'un panneau, elle, est écrite dans le code
(`lib/accueil-panneaux.ts`) ; un Produit mis en avant sans copie se replie sur son nom, sa marque et son
Prix courant.
_Avoid_: produit vedette, produit phare, featured

**Panneau**:
Le bloc de l'accueil : un champ (le blanc de la page, le gris du Catalogue, ou le presque noir de l'**Icône
de site** comme accent), une copie — titre, surtitre, callout, une action — et une zone d'art ancrée sous
la copie. Deux formats, deux échelles de type : le **Panneau pleine largeur**, un par rangée, et le
**Panneau en duo**, deux par rangée. Un Produit sans Image produit n'a pas d'art : le panneau garde sa
hauteur et sa copie tient le champ seule. Les Panneaux sont les Produits en **Mise en avant**, dans leur
ordre ; six panneaux et une Bande font l'accueil d'aujourd'hui.
_Avoid_: bloc, section, tuile, card, vignette

**Bande**:
Le Panneau sans art qui range un ensemble sur l'accueil : aujourd'hui la **Bande des catégories**, la seule
porte de l'accueil vers les six Structures. Une Bande porte un titre, un surtitre et ses entrées.
_Avoid_: bandeau (réservé au Bandeau de navigation), rubrique, strip

**Compte client**:
The registered customer entity (Better Auth user) with credentials, email verification, and optional Connexion sociale (Facebook, Google). Carries a `role` ("user" or "admin").
_Avoid_: account, user, membre

**Visiteur**:
A person browsing without an active session; becomes a Client upon Connexion or Inscription.
_Avoid_: invité, guest, utilisateur anonyme

**Client**:
The person acting through a Compte client; a Visiteur becomes one by authenticating.
_Avoid_: shopper, customer, utilisateur

**Connexion**:
The act of authenticating an existing customer into their account — a modal over the current page, never a standalone page. The modal is a reusable component available on every storefront page.
_Avoid_: login page, se connecter (as the screen name)

**Connexion sociale**:
L'authentification d'un Client via un fournisseur externe (Facebook, Google) plutôt qu'un mot de passe.
_Avoid_: social login, login social, OAuth
**Connexion par mot de passe**:
La Connexion d'un Client par l'adresse et le mot de passe de son Compte client, sur la route `/sign-in/email`.
_Avoid_: login, password login

**Connexion par code**:
L'authentification d'un Client par un code à usage unique envoyé à son adresse, servie par la route `/sign-in/email-otp`. Elle n'a pas de surface dans la boutique et se distingue de la Connexion par mot de passe comme de la Vérification de l'e-mail, qui prouve l'adresse sans remplacer le mot de passe.
_Avoid_: OTP login, magic link, passwordless login, connexion sans mot de passe

**Inscription**:
Creating a new customer account, presented in its own modal (distinct from Connexion).
_Avoid_: sign-up page, register

**Destination post-connexion**:
Le chemin interne de la boutique où le client reprend son parcours après une authentification réussie ; il est demandé en même temps que la Connexion ou l'Inscription et toujours validé comme chemin relatif.
_Avoid_: redirect, callback, retour

**Vérification de l'e-mail**:
L'échange d'un code à usage unique envoyé à l'adresse e-mail contre la validation de cette adresse. Le Compte client est créé dès l'Inscription mais n'est un Client de plein droit qu'une fois son e-mail vérifié ; à la Connexion, un Compte client non vérifié reprend ce même échange avant de pouvoir se connecter. Une adresse fournie par Facebook ou Google lors d'une connexion sociale vaut vérification ; elle ne passe pas par cet échange.
_Avoid_: OTP, code de vérification, vérification OTP

**Test de sécurité**:
La vérification anti-robot (implémentée avec Turnstile) exigée avant les envois protégés : l'envoi du code de la Vérification de l'e-mail, la création de compte à l'Inscription, la Connexion par mot de passe et la demande de réinitialisation du mot de passe. Elle produit un jeton à usage unique, transmis avec l'envoi protégé et consommé par le serveur ; l'envoi n'est possible qu'une fois le jeton obtenu.
Le défi appartient à l'Envoi protégé qui le réclame, pas à la surface qui l'affiche : c'est l'envoi qui le porte. La Connexion et l'Inscription en ont donc deux chacune — l'envoi de leurs identifiants, puis l'envoi du code de la Vérification de l'e-mail, qui est le même Envoi protégé sur deux surfaces — parce qu'un jeton est à usage unique et qu'un second envoi en réclame un second. La demande de réinitialisation du mot de passe en porte un, sur sa page. Réduire ce nombre à un par surface serait une autre décision.
_Avoid_: captcha, widget, Turnstile (comme nom du concept), vérification humaine

**Envoi protégé**:
Un envoi qu'un Test de sécurité gate, et qui n'aboutit pas sans son jeton. Sa règle tient en trois temps : joindre le jeton, remettre le Test de sécurité à zéro lorsque le serveur refuse ce jeton, traduire le refus pour le Client. Un jeton refusé ne doit pas piéger le Client sur une page à recharger.
_Avoid_: protected send, envoi sécurisé, appel protégé, requête protégée

**Déconnexion**:
The act by which a Client ends their own session via the « Déconnexion » entry of the **Aperçu du Panier**, returning them to the state of Visiteur. Distinct from Session inactive, which ends the session without the Client's action. The Administration user menu also offers it.
_Avoid_: logout, se déconnecter (as the screen name), déconnexion automatique (reserved for Session inactive)

**Session inactive**:
A Client session ended automatically after 30 minutes without any activity on their part (click, scroll, keypress or navigation). The Client is shown a brief notice, then the Connexion modal with the Destination post-connexion set to the page they were on; their Panier survives and is reattached on reconnection. Distinct from Déconnexion, which is voluntary, and from Session hors durée absolue, which ends a session however active it is.
_Avoid_: logout automatique, timeout, session expirée, expiration de session

**Session hors durée absolue**:
A Session courante ended because it reached the absolute maximum lifetime measured from its creation — 30 days for a Client, 24 hours for the Administration — even if the Client kept browsing. The session row is deleted at the first read or authentication call, so the cookie stops authenticating everywhere; no notice is shown, the Client is treated as a Visiteur and can reconnect. Distinct from Session inactive, whose 30-minute window is about inactivity.
_Avoid_: session expirée, timeout, expiration de session

**Session courante**:
La lecture de la session de la requête en cours : elle répond le Client — ses faits d'identité et son
rôle — ou rien. Un seul module en est propriétaire, pour les rendus comme pour les actions serveur ; la
lecture ne refuse jamais, le refus reste composé par la surface qui l'exige (le contrôle de cookie du
proxy, lui, n'est pas une Session courante).
_Avoid_: session, utilisateur courant, getSession

**Lien de connexion**:
Un lien ou une redirection qui ouvre la modale de Connexion ou d'Inscription sur la page courante
via les paramètres d'URL `?open=login|signup` et `?next`.
_Avoid_: login link, login URL, route de connexion

**Administration**:
L'espace privé réservé aux Comptes clients de rôle « admin » (/admin) : gestion du Catalogue,
des Commandes, des Villes de livraison et de la Livraison.
_Avoid_: back-office, dashboard, espace admin

**Tableau de bord**:
La page d'accueil de l'Administration : chiffre d'affaires encaissé, indicateurs clés et activité récente.
_Avoid_: dashboard

**Liste des Commandes**:
La liste des Commandes dans l'Administration (/admin/commandes) : un langage d'URL
(`page`, `pageSize`, `q`, `statut`, `tri`, `sens`) et sa projection en vue côté client —
recherche, filtres de Statut de commande, tri et pagination.
_Avoid_: table des commandes, orders table, tableau des commandes

**Commande**:
Ce qu'un Client passe : ses Articles du panier réunis pour une livraison vers une Ville de livraison,
réglée en Paiement à la livraison.
_Avoid_: order, achat

**Statut de commande**:
Le cycle de vie d'une Commande : En attente, Confirmée, Expédiée, Livrée ; ou Annulée, Retournée.
_Avoid_: état, order status

**Transition de statut**:
Le passage autorisé d'une Commande d'un Statut de commande à un autre ; Annulée et Retournée sont terminales et n'autorisent aucune transition.
_Avoid_: changement de statut, mouvement d'état

**Réapprovisionnement**:
Le retour au stock des Variantes d'une Commande lorsque celle-ci passe à Annulée ou Retournée.
_Avoid_: restock, remise en stock, réintégration de stock

**Total à payer**:
Le montant collecté auprès du Client lors de la livraison d'une Commande : le total chiffré par
le Devis — le sous-total des Articles du panier plus les Frais de livraison — copié tel quel par
la Commande à sa création. C'est un fait de la Commande, pas une vue dérivée : écrit une seule
fois à sa création, lu partout ensuite.
_Avoid_: montant total, grand total

**Chiffre d'affaires encaissé**:
La somme des Totaux à payer des Commandes au statut Livrée : l'argent réellement collecté.
Une Commande En attente, Confirmée ou Expédiée n'est pas encore encaissée.
_Avoid_: revenu, revenue, ventes, CA brut

**FAQ**:
Les questions et réponses publiées sur /faq, couvrant la commande, le Paiement à la livraison, la Livraison et les retours.
_Avoid_: questions fréquentes, centre d'aide, help center

**Données structurées**:
La description lisible par les machines du contenu d'une page (JSON-LD), émise pour les moteurs de recherche et les IA.
_Avoid_: JSON-LD (comme nom du concept), schema markup, rich snippets, données enrichies

**Hôte canonique**:
Le seul hôte servi depuis l'origine : l'apex `eguidar.com`. `www` n'existe que pour y rediriger à
l'edge (301) ; `cdn.`, `ssh.` et `send.` sont traités à la couche Cloudflare, et tout autre
sous-domaine s'arrête sur l'erreur 503 de l'origine.
_Avoid_: domaine principal, canonical domain

**Logo**:
Le lockup complet de la boutique — « eguidar. » au-dessus du « COM » serif et de son filet — affiché dans le Bandeau de navigation et le pied de page.
_Avoid_: logotype, symbole, marque (réservée aux marques de produits)

**Icône de site**:
La tuile carrée « e » sur fond presque noir, utilisée comme favicon, icône Apple touch et dans l'Administration.
_Avoid_: favicon (comme nom du concept), app icon, icône d'application

**Blog**:
Le journal éditorial d'eguidar.com (`/blog`) : guides et annonces en style Apple Newsroom,
distinct du Catalogue et de la FAQ.
_Avoid_: news, actualités (comme nom du concept)

**Article de blog**:
Une page éditoriale du Blog (`/blog/[slug]`) avec titre, slug, extrait, couverture, contenu,
un Thème et un Statut de publication.
_Avoid_: Article (seul, réservé à l'Article du panier), post, billet

**Chapô**:
La phrase d'accroche d'un Article de blog, affichée sous son titre pour donner envie de lire.
L'Extrait reste la description destinée aux moteurs de recherche : un Article de blog sans Chapô
affiche son Extrait à cette place.
_Avoid_: deck, sous-titre, accroche, standfirst

**Intertitre**:
Le titre d'une section à l'intérieur du contenu d'un Article de blog, distinct du titre de la page.
_Avoid_: titre de section, sous-titre, heading

**Fragment d'article**:
Une unité typée du contenu d'un Article de blog — paragraphe, intertitre, figure, liste ou citation —
telle que le contenu la décrit.
_Avoid_: bloc, section, élément, module

**Thème**:
Le regroupement éditorial d'un Article de blog (Guides, Annonces pour le MVP) ;
liste fermée sans hiérarchie. Catégorie reste Catalogue-only.
_Avoid_: catégorie, tag

**Statut de publication**:
Le cycle de vie d'un Article de blog : Brouillon, Publié, Archivé.
_Avoid_: état, status

**Produit lié**:
Un Produit du Catalogue attaché à un Article de blog, affiché en Carte produit avec son Prix courant
vers sa page Produit. Un Produit lié indisponible (stock total nul) est masqué à la lecture : l'Article
de blog reste publié, sa Carte produit disparaît.
_Avoid_: produit associé, related product

**Article lié**:
Un Article de blog proposé à la fin d'un autre Article de blog, choisi dans le même Thème d'abord.
_Avoid_: article associé, article suggéré, related article

**Automatisation**:
Un effet post-commit exécuté durablement par le travailleur, à partir d'un Événement
d'automatisation et de la Règle d'automatisation qui le déclenche : e-mail de Commande,
indexation ou retrait d'index, purge du bord, invalidation du cache, digest ou réconciliation.
Le commit de la mutation reste autoritatif ; l'Automatisation est la reprise, pas la transaction.
_Avoid_: workflow, job, tâche de fond, automatisme

**Événement d'automatisation**:
Le fait immuable écrit dans la transaction d'une mutation — type, entité, charge, séquence par
entité, expiration — puis consommé par le travailleur. Un retour arrière de la mutation ne laisse
aucun Événement d'automatisation.
_Avoid_: message, job, tâche

**Exécution d'automatisation**:
La trace durable d'une Règle d'automatisation appliquée à un Événement d'automatisation : statut,
tentative, erreur, début et fin. C'est elle que l'Administration affiche dans l'historique.
_Avoid_: run, log, journal (réservé au journal console de la phase 0)

**Règle d'automatisation**:
Le couple fermé déclencheur → condition → action qui décide ce qu'un Événement d'automatisation
exécute. Semée dans le code, révisée à chaque changement, éditable par le propriétaire depuis
l'Administration.
_Avoid_: workflow, scénario, trigger

**Décision d'automatisation**:
Le jugement pur de « cette Règle d'automatisation, cet Événement d'automatisation » : une fonction
sans état, sans base, sans port et sans transaction, qui reçoit le déclencheur, l'état activé et la
condition de la Règle, le type, la charge et l'expiration de l'Événement, et l'heure courante. Deux
issues seulement : `executer`, l'action de la Règle s'applique, ou `ignorer`, avec une raison fermée
— `declencheur-different` (le déclencheur attendu et le reçu), `regle-desactivee`,
`evenement-expire` (la date d'expiration) ou `condition-non-remplie` (la condition et le statut brut
de la charge). L'ordre est canonique : déclencheur → état activé → expiration → condition ; le
premier motif gagne, et l'expiration est inclusive.

Trois consommateurs, trois rendus : le travailleur l'exécute — sa requête garde les Règles actives
et du même déclencheur, donc une Règle désactivée ou un déclencheur différent ne reçoit aucune
Exécution d'automatisation, tandis qu'une paire exécutable et une condition non remplie en reçoivent
une —, la Simulation d'automatisation l'affiche, et le Réessai manuel la consulte avant d'écrire.
La Décision ne porte aucune phrase : chaque consommateur écrit la sienne. L'admissibilité de
l'Événement — `reussi`, `ignore`, `mort` — reste à l'appelant : la Décision répond seulement à « si
cet Événement était livré à cette Règle maintenant, s'exécuterait-il ? ».
_Avoid_: verdict, verdict d'automatisation, décision de règle

**Simulation d'automatisation**:
L'évaluation d'une Règle d'automatisation contre un Événement d'automatisation réel, qui rend
« enverrait » ou « ignorerait » avec son motif, sans écrire d'Exécution d'automatisation et sans
rien envoyer.
_Avoid_: test, dry run, prévisualisation

**Réessai manuel**:
L'Exécution d'une Règle d'automatisation rejouée à la demande sur l'Événement d'une Exécution en
échec. Elle porte le déclencheur « manuel » et se distingue ainsi d'un balayage du travailleur.
_Avoid_: retry, relance automatique, redrive (réservé au renvoi des Événements morts)

**File morte**:
L'état d'un Événement d'automatisation dont les tentatives sont épuisées, avec sa dernière
erreur ; un renvoi le remet en attente. À distinguer de la file morte de travaux pg-boss, qui
porte les balayages du travailleur.
_Avoid_: dead letter queue (comme nom du concept), DLQ

**Porte de fusion**:
L'ensemble des faits qui rendent une fusion sur `main` acceptable : une pull request, les cinq
contextes requis — `build`, `format`, `lint`, `test`, `typecheck` —, une branche à jour avec `main`,
aucune revue exigée et aucun contournement. Un contrat versionné les enregistre et fait foi, même
quand GitHub ne peut pas l'appliquer. Une porte non lisible n'est pas une porte absente : quand le
plan, la visibilité ou le jeton ne permet pas de lire le ruleset, le blocage est nommé.
_Avoid_: branch protection, merge gate, règles de fusion

**Docteur de la Porte de fusion**:
La commande locale `npm run porte:verifier`, qui lit le ruleset vivant du dépôt et le compare aux
faits du contrat `infra/porte-de-fusion.json` sans jamais l'appliquer. Elle sort `0` quand le
ruleset est conforme, `1` quand il dérive — chaque fait divergent est imprimé —, et `2` quand le
ruleset ne peut pas être lu : un `2` n'est pas une porte absente et ne se traite pas comme un `0`.
_Avoid_: live check, ruleset checker, vérification en direct
