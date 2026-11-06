import "dotenv/config"

import { resoudreBaseDeSonde } from "../harnais/base-de-sonde"
import { poserLaFixture } from "../harnais/preparation"

/**
 * Les fixtures de la sonde, pour la CI : le job a déjà semé sa base, cette
 * étape attache l'Image produit au Produit en Mise en avant, reconstruit
 * l'index de recherche et sème les deux Commandes **avant** le build, afin que
 * le Catalogue prérendu porte vraiment l'image et que la sonde trouve ses
 * Commandes au démarrage. C'est la même étape de fixture que la préparation
 * locale (`poserLaFixture`).
 */
const baseDeDonnees = resoudreBaseDeSonde()
await poserLaFixture(baseDeDonnees)
