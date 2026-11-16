import "dotenv/config"

import { resoudreBaseDeSonde } from "../harnais/base-de-sonde"
import { poserLaFixture } from "../harnais/preparation"

const baseDeDonnees = resoudreBaseDeSonde()
await poserLaFixture(baseDeDonnees)
