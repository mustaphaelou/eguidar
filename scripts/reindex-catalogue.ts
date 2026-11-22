import "dotenv/config"

import { prisma } from "../lib/db"
import { toIndexableProduct } from "../lib/index-projection"
import {
  ensureProductsIndex,
  getMeiliSearch,
  PRODUCTS_INDEX,
} from "../lib/meili"

async function principal(): Promise<void> {
  const meili = getMeiliSearch()
  if (meili === null) {
    throw new Error(
      "MEILI_URL absent : l'index de recherche ne peut pas être reconstruit"
    )
  }

  const produits = await prisma.product.findMany({
    include: { variants: true, category: true },
  })
  const documents = produits.map(toIndexableProduct)

  await ensureProductsIndex(meili)
  if (documents.length > 0) {
    const tache = await meili
      .index(PRODUCTS_INDEX)
      .addDocuments(documents, { primaryKey: "id" })
    await meili.tasks.waitForTask(tache.taskUid)
  }

  console.log(
    `Index de recherche reconstruit : ${documents.length} Produit(s).`
  )
}

principal()
  .catch((erreur: unknown) => {
    console.error(
      `[index] ${erreur instanceof Error ? erreur.message : erreur}`
    )
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
