import "dotenv/config"

import {
  lireLesFaitsDuCatalogue,
  messageDesFaitsCatalogue,
} from "../lib/acces-catalogue-build"

async function principal(): Promise<void> {
  try {
    const faits = await lireLesFaitsDuCatalogue({
      url: process.env.DATABASE_URL,
    })
    console.log(messageDesFaitsCatalogue(faits))
  } catch (erreur) {
    const cause = erreur instanceof Error ? erreur.message : String(erreur)
    console.error(`ECHEC : catalogue — ${cause}`)
    console.error(
      "Le build s'arrête avant de prérendre : il ne peut pas lire le catalogue qu'il doit servir."
    )
    process.exitCode = 1
  }
}

await principal()
