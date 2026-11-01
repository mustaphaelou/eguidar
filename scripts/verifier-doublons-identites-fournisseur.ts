import "dotenv/config"

import { prisma } from "../lib/db"

// Vérifie, avant `prisma migrate deploy`, qu'aucune paire (providerId,
// accountId) n'est dupliquée dans la table `account`. La migration
// 20261101160000_compte_fournisseur_unique refuse de s'appliquer tant qu'il en
// reste une.
//
// Usage : npx tsx scripts/verifier-doublons-identites-fournisseur.ts
// La base visée est celle de DATABASE_URL ; en local, pointer la base de test :
//   DATABASE_URL="$TEST_DATABASE_URL" npx tsx scripts/verifier-doublons-comptes.ts
//
// Sortie : 0 quand aucune paire n'est dupliquée, 1 sinon — chaque paire est
// alors imprimée avec son nombre de lignes et les Comptes clients concernés.

interface Doublon {
  providerId: string
  accountId: string
  lignes: number
  lignesId: string[]
  comptesClients: string[]
}

async function principal(): Promise<void> {
  try {
    const doublons = await prisma.$queryRaw<Doublon[]>`
      SELECT "providerId",
             "accountId",
             COUNT(*)::int AS "lignes",
             array_agg("id" ORDER BY "createdAt", "id") AS "lignesId",
             array_agg(DISTINCT "userId") AS "comptesClients"
      FROM "account"
      GROUP BY "providerId", "accountId"
      HAVING COUNT(*) > 1
      ORDER BY "providerId", "accountId"
    `

    if (doublons.length === 0) {
      console.log(
        "Aucune paire (providerId, accountId) dupliquée dans la table account."
      )
      return
    }

    console.error(
      `${doublons.length} paire(s) (providerId, accountId) dupliquée(s) :`
    )
    for (const doublon of doublons) {
      console.error(
        `- ${doublon.providerId} / ${doublon.accountId} : ${doublon.lignes} ligne(s) [${doublon.lignesId.join(", ")}], Comptes clients ${doublon.comptesClients.join(", ")}`
      )
    }
    console.error(
      "Résolvez chaque doublon à la main (voir le commentaire de la migration 20261101160000_compte_fournisseur_unique), consignez la décision dans le ticket #836, puis relancez prisma migrate deploy."
    )
    process.exitCode = 1
  } catch (erreur) {
    const cause = erreur instanceof Error ? erreur.message : String(erreur)
    console.error(`ECHEC : lecture des doublons impossible — ${cause}`)
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}

await principal()
