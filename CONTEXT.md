# Eguidar

A French-language Moroccan e-commerce storefront (eguidar.ma): catalog with categories and product variants, cart, cash-on-delivery checkout, order lifecycle, and an admin back-office. Single context.

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

**Paiement à la livraison**:
The only payment method: the courier collects the total in cash at delivery. The total shown at checkout is what the courier collects.
_Avoid_: cash on delivery, paiement cash, payer à la livraison

**Catalogue**:
The complete set of products for sale, browsable via the "Tous nos produits" page.
_Avoid_: tous les produits (as the concept name)

**Compte client**:
The registered customer entity (Better Auth user) with credentials, email verification, and optional social logins (Google, Apple). Carries a `role` ("user" or "admin").
_Avoid_: account, user, membre

**Connexion**:
The act of authenticating an existing customer into their account — a modal over the current page, never a standalone page. The modal is a reusable component available on every storefront page.
_Avoid_: login page, se connecter (as the screen name)

**Inscription**:
Creating a new customer account, presented in its own modal (distinct from Connexion).
_Avoid_: sign-up page, register
