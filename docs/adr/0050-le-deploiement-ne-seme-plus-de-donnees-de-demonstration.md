# Le déploiement ne sème plus de Données de démonstration

La cible `migrate` de l'image exécute `npx prisma db seed` à chaque déploiement (ADR-0020), et ce
seed écrivait aussi un Catalogue de dix Produits et un Blog de trois Articles de blog. Un
déploiement les réécrivait donc par-dessus les données réelles : le stock consommé par une Commande
revenait à sa valeur de démonstration, un prix corrigé dans l'Administration reprenait son ancienne
valeur, et le seuil de livraison offerte était ramené à 1 000 MAD.

Le seed se partage en deux. `prisma/seed.ts` ne sème que le socle — les réglages de livraison, le
réseau de Villes de livraison, le compte administrateur et les règles d'automatisation.
`prisma/seed-demo.ts` sème le Catalogue, le Blog et l'index de recherche, et n'est appelé que par
`npm run seed:demo`. Le déploiement ne l'appelle jamais ; la CI l'appelle sur sa base éphémère pour
continuer à prérendre un vrai Catalogue.

## Conséquences

- Une installation neuve démarre avec une boutique vide : le Catalogue est ce que l'Administration y
  écrit, et rien d'autre. Les Produits, Structures et Articles de démonstration déjà présents dans
  une base ne sont pas supprimés par ce partage — leur retrait se fait dans l'Administration.
- La sonde de déploiement épingle désormais les faits du socle — un administrateur, les dix Villes
  de livraison, le seuil de livraison offerte — et non les six slugs de Structure.
- Les captures du README se prennent après `npm run seed:demo`.

## Option écartée

Un drapeau `SEED_DEMO=1` dans le même fichier : la charge de démonstration resterait dans l'image
de déploiement, et une variable mal renseignée la rejouerait en production. Deux points d'entrée
distincts ne peuvent pas se confondre par accident.
