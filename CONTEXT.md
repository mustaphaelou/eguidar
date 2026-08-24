# Eguidar

A French-language Moroccan e-commerce storefront (eguidar.com): catalog with categories and product variants, cart, cash-on-delivery checkout, order lifecycle, and an admin back-office. Single context.

## Language

**Livraison**:
The delivery service for orders: delivery cities, their fees, and the free-shipping rule.
_Avoid_: shipping, frais de port

**Ville de livraison**:
A city to which orders can be delivered, each with a fixed delivery fee.
_Avoid_: ville desservie

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

**Paiement à la livraison**:
The only payment method: the courier collects the total in cash at delivery. The total shown at checkout is what the courier collects.
_Avoid_: cash on delivery, paiement cash, payer à la livraison

**Catalogue**:
The complete set of products for sale, browsable via the "Tous nos produits" page.
_Avoid_: tous les produits (as the concept name)

**Recherche**:
The act of finding products across the Catalogue by free-text query (with typo tolerance),
filtrable par marque, catégorie et prix, triable (pertinence, prix, nouveautés) et paginée.
Le header propose des suggestions instantanées de produits et de catégories.
_Avoid_: search, recherche produit, recherche fuzz

**Document d'index**:
La forme indexable d'un produit pour la recherche : identifiants, libellés, marque, catégorie,
texte des spécifications (clés et valeurs), noms de variantes et SKU (recherchables), prix
minimal et son bucket de prix, stock total, images et date de mise à jour.
_Avoid_: produit indexé, indexable product

**Image produit**:
A visual asset belonging to a product in the catalogue, displayed in the product gallery. The first image of a product's gallery is its thumbnail in lists and the cart.
_Avoid_: photo, visuel, media

**Compte client**:
The registered customer entity (Better Auth user) with credentials, email verification, and optional social logins (Google, Apple). Carries a `role` ("user" or "admin").
_Avoid_: account, user, membre

**Connexion**:
The act of authenticating an existing customer into their account — a modal over the current page, never a standalone page. The modal is a reusable component available on every storefront page.
_Avoid_: login page, se connecter (as the screen name)

**Inscription**:
Creating a new customer account, presented in its own modal (distinct from Connexion).
_Avoid_: sign-up page, register

**Destination post-connexion**:
Le chemin interne de la boutique où le client reprend son parcours après une authentification réussie ; il est demandé en même temps que la Connexion ou l'Inscription et toujours validé comme chemin relatif.
_Avoid_: redirect, callback, retour

**Lien de connexion**:
Un lien ou une redirection qui ouvre la modale de Connexion ou d'Inscription sur la page courante
via les paramètres d'URL `?open=login|signup` et `?next`.
_Avoid_: login link, login URL, route de connexion
