# Eguidar

A French-language Moroccan e-commerce storefront (eguidar.com): catalog with categories and product variants, cart, cash-on-delivery checkout, order lifecycle, and the Administration space. Single context.

## Language

**Livraison**:
The delivery service for orders: delivery cities, their fees, and the free-shipping rule.
_Avoid_: shipping, frais de port

**Ville de livraison**:
A city to which orders can be delivered, each with a fixed delivery fee. Its public identity in a URL is its slug — the normalized form of its name; the internal identifier never appears in a URL and survives there only as a read-only alias (ADR-0017).
_Avoid_: ville desservie, identifiant de ville dans l'URL

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
le seuil de livraison offerte, le devis de chaque ville et le sous-total — des données pures qui
traversent la couture serveur vers le client. Le Devis projeté se dérive ensuite de ces faits.
_Avoid_: quote payload, devis data, devis sérialisé

**Devis projeté**:
Les faits d'un Devis chargé rapportés à une Ville de livraison : les Villes de livraison, la
Sélection du Devis et les lignes du Récapitulatif de paiement. Se calcule à partir des seuls
faits du Devis chargé, sans accès base.
_Avoid_: vue, view model, devis résolu

**Sélection du Devis**:
La sélection validée d'une Ville de livraison et de son devis, ou « aucune » tant qu'aucune ville
n'est choisie ; jamais à moitié. Une sélection validée porte exactement deux faits : la Ville
de livraison et son devis.
_Avoid_: selected city, city selection, sélection de ville

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
_Avoid_: ligne de panier, line item

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

**Recherche**:
The act of finding products across the Catalogue by free-text query (with typo tolerance),
filtrable par une ou plusieurs marques, une catégorie et une tranche de prix, triable (pertinence, prix, nouveautés) et paginée.
Le header propose des suggestions instantanées de produits et de catégories.
_Avoid_: search, recherche produit, recherche fuzz

**Tranche de prix**:
L'une des cinq fourchettes de prix fixes (par exemple « Moins de 1 000 MAD ») par lesquelles la Recherche peut être filtrée.
_Avoid_: bucket de prix, intervalle de prix

**Filtre de recherche**:
Une contrainte choisie sur la Recherche : une ou plusieurs marques, une catégorie ou une tranche de prix.
_Avoid_: facette, critère

**Filtres actifs**:
L'ensemble des Filtres de recherche en vigueur pour la Recherche courante, présentés au-dessus des résultats et retirables individuellement.
_Avoid_: chips, tags

**Document d'index**:
La forme indexable d'un produit pour la recherche : identifiants, libellés, marque, catégorie,
texte des spécifications (clés et valeurs), noms de variantes et SKU (recherchables), prix
minimal et son bucket de prix, stock total, images et date de mise à jour.
_Avoid_: produit indexé, indexable product

**Image produit**:
A visual asset belonging to a product in the catalogue, displayed in the product gallery. The first image of a product's gallery is its thumbnail in lists and the cart, and its illustration in share previews (Open Graph) when the product is shared on WhatsApp, Facebook or X.
_Avoid_: photo, visuel, media

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
_Avoid_: captcha, widget, Turnstile (comme nom du concept), vérification humaine

**Déconnexion**:
The act by which a Client ends their own session via the « Déconnexion » button in the header, returning them to the state of Visiteur. Distinct from Session inactive, which ends the session without the Client's action. The Administration user menu also offers it.
_Avoid_: logout, se déconnecter (as the screen name), déconnexion automatique (reserved for Session inactive)

**Session inactive**:
A Client session ended automatically after 30 minutes without any activity on their part (click, scroll, keypress or navigation). The Client is shown a brief notice, then the Connexion modal with the Destination post-connexion set to the page they were on; their Panier survives and is reattached on reconnection. Distinct from Déconnexion, which is voluntary.
_Avoid_: logout automatique, timeout, session expirée, expiration de session

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
Le montant collecté auprès du Client lors de la livraison d'une Commande : le sous-total des
Articles du panier plus les Frais de livraison.
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
Le lockup complet de la boutique — « eguidar. » au-dessus du « COM » serif et de son filet — affiché dans l'en-tête et le pied de page.
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

**Thème**:
Le regroupement éditorial d'un Article de blog (Guides, Annonces pour le MVP) ;
liste fermée sans hiérarchie. Catégorie reste Catalogue-only.
_Avoid_: catégorie, tag

**Statut de publication**:
Le cycle de vie d'un Article de blog : Brouillon, Publié, Archivé.
_Avoid_: état, status

**Produit lié**:
Un Produit du Catalogue attaché à un Article de blog, affiché en carte avec Prix courant
vers la page Produit.
_Avoid_: produit associé, related product
