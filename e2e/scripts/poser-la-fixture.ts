import "dotenv/config"

import { resoudreBaseDeSonde } from "../harnais/base-de-sonde"
import { poserLaFixture } from "../harnais/preparation"

/**
 * L'image de fixture seule, pour la CI : le job a déjà semé sa base, il attache
 * l'Image produit au Produit en Mise en avant et reconstruit l'index avant le
 * build, afin que le catalogue prérendu la porte vraiment.
 */
const baseDeDonnees = resoudreBaseDeSonde()
await poserLaFixture(baseDeDonnees)
