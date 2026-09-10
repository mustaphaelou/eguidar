# Facet counts ignore their own filter

La Recherche se filtre par une ou plusieurs marques, une catégorie et une Tranche de prix. Meilisearch applique le `filter` d'une requête à sa distribution de facettes : dès qu'une marque est sélectionnée, `facetDistribution.brand` ne contient plus que la marque sélectionnée. Avec des marques multi-sélection, l'utilisateur ne pourrait jamais cocher une deuxième marque ; même en sélection unique, les options restantes disparaîtraient au lieu de pouvoir être échangées.

`searchProducts` exécute donc, en parallèle de la requête de résultats, une requête « facette seule » (`limit: 0`) par facette, chacune avec la même recherche et les mêmes filtres **moins la clause de sa propre facette** : les marques sont comptées sous q + catégorie + tranche de prix, les catégories sous q + marques + tranche de prix, les tranches sous q + marques + catégorie. Les décomptes restent contextuels (choisir une marque resserre les décomptes de prix) tout en gardant chaque option visible avec son décompte ; les options à zéro sont masquées par l'interface, sauf la sélection active.

## Considered Options

- **Une seule requête supplémentaire omettant toutes les clauses de facettes** — deux appels Meilisearch au lieu de quatre, mais les décomptes ignorent la sélection courante (les prix ne bougent pas quand on filtre une marque) ; rejeté.
- **Décomptes conjoints (statu quo)** — incompatible avec la marque multi-sélection et fait disparaître les options non sélectionnées ; rejeté.
