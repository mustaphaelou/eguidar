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
