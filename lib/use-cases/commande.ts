import { declarerApresEcriture, type PlanCatalogue } from "@/lib/apres-ecriture"
import { enregistrerFaits } from "@/lib/automations/evenements"
import type { OrderStatus, Prisma } from "@/lib/generated/prisma/client"
import {
  toIndexableProduct,
  type IndexableProduct,
} from "@/lib/index-projection"
import { indexProductDocuments } from "@/lib/meili"
import {
  executer as executerCatalogue,
  type DocumentCatalogue,
} from "@/lib/use-cases/apres-ecriture/catalogue"
import {
  chaineDeLaStructure,
  demandeDePurgeCatalogue,
  purgerEdgeDurable,
  revaliderCatalogue,
  type CatalogueEventProduct,
} from "@/lib/use-cases/cache-invalidation"
import {
  lectureDesStructures,
  type FaitStructure,
} from "@/lib/use-cases/lecture-structure"
import {
  avecSurcharges,
  journalEffetsConsole,
  type JournalEffetsPostCommit,
} from "@/lib/use-cases/mutation-squelette"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

export interface OutOfStockItem {
  productName: string
  variantName: string
  requested: number
  available: number
}

export class OutOfStockError extends UserFacingError {
  items: OutOfStockItem[]

  constructor(items: OutOfStockItem[]) {
    const details = items
      .map(
        (item) =>
          `« ${item.productName} ${item.variantName} » : ${item.requested} demandé(s), ${item.available} disponible(s)`
      )
      .join(" ; ")
    super(`Stock insuffisant : ${details}`)
    this.name = "OutOfStockError"
    this.items = items
  }
}

export class InvalidOrderTransitionError extends UserFacingError {
  constructor(fromStatus: OrderStatus, nextStatus: OrderStatus) {
    super(`Transition invalide : ${fromStatus} → ${nextStatus}`)
    this.name = "InvalidOrderTransitionError"
  }
}

export type MouvementDeStock =
  | { genre: "réservation"; variantId: string; quantité: number }
  | { genre: "réapprovisionnement"; variantId: string; quantité: number }
  | { genre: "fixation"; variantId: string; stock: number }

export function reserver(
  variantId: string,
  quantité: number
): MouvementDeStock {
  return { genre: "réservation", variantId, quantité }
}

export function reapprovisionner(
  variantId: string,
  quantité: number
): MouvementDeStock {
  return { genre: "réapprovisionnement", variantId, quantité }
}

export function fixer(variantId: string, stock: number): MouvementDeStock {
  return { genre: "fixation", variantId, stock }
}

export interface PlanStock {
  produitId: string
  plan: PlanCatalogue
  document: DocumentCatalogue
}

export interface EcritureStock {
  plans: readonly PlanStock[]
}

export interface EffetsStock {
  reindexProducts(produits: IndexableProduct[]): Promise<void>
  revalidateCatalog(produit: CatalogueEventProduct): Promise<void> | void
  purgeCatalogue(produit: CatalogueEventProduct): Promise<void> | void
}

export const defaultStockEffects: EffetsStock = {
  reindexProducts: indexProductDocuments,
  revalidateCatalog: revaliderCatalogue,
  async purgeCatalogue(produit) {
    await purgerEdgeDurable(demandeDePurgeCatalogue(produit))
  },
}

export async function verrouillerCommande(
  tx: Prisma.TransactionClient,
  commandeId: string
): Promise<boolean> {
  const verrou = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Order" WHERE id = ${commandeId} FOR UPDATE
  `
  return verrou.length > 0
}

export async function écrireLeStock(
  tx: Prisma.TransactionClient,
  mouvements: readonly MouvementDeStock[]
): Promise<EcritureStock> {
  if (mouvements.length === 0) return { plans: [] }

  const variantIds = [
    ...new Set(mouvements.map((mouvement) => mouvement.variantId)),
  ]
  const variantes = await tx.productVariant.findMany({
    where: { id: { in: variantIds } },
    include: { product: { include: { variants: true, category: true } } },
  })
  const parId = new Map(variantes.map((variante) => [variante.id, variante]))
  const produits = new Map<string, (typeof variantes)[number]["product"]>()
  for (const variante of variantes) {
    if (!produits.has(variante.product.id)) {
      produits.set(variante.product.id, variante.product)
    }
  }
  const echecs: OutOfStockItem[] = []

  for (const mouvement of mouvements) {
    const variante = parId.get(mouvement.variantId)
    if (!variante) continue

    if (mouvement.genre === "réservation") {
      const misAJour = await tx.productVariant.updateMany({
        where: { id: variante.id, stock: { gte: mouvement.quantité } },
        data: { stock: { decrement: mouvement.quantité } },
      })
      if (misAJour.count === 0) {
        const actuelle = await tx.productVariant.findUnique({
          where: { id: variante.id },
          select: { stock: true },
        })
        echecs.push({
          productName: variante.product.name,
          variantName: variante.name,
          requested: mouvement.quantité,
          available: actuelle?.stock ?? variante.stock,
        })
        continue
      }
      variante.stock -= mouvement.quantité
    } else if (mouvement.genre === "réapprovisionnement") {
      await tx.productVariant.updateMany({
        where: { id: variante.id },
        data: { stock: { increment: mouvement.quantité } },
      })
      variante.stock += mouvement.quantité
    } else {
      await tx.productVariant.updateMany({
        where: { id: variante.id },
        data: { stock: mouvement.stock },
      })
      variante.stock = mouvement.stock
    }

    const soeur = produits
      .get(variante.productId)!
      .variants.find((candidate) => candidate.id === variante.id)
    if (soeur) soeur.stock = variante.stock
  }

  if (echecs.length > 0) throw new OutOfStockError(echecs)

  const ordonnes = [...produits.values()].sort((a, b) =>
    a.id.localeCompare(b.id)
  )
  if (ordonnes.length === 0) return { plans: [] }

  const rangees = await tx.category.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      image: true,
      parentId: true,
      position: true,
      _count: { select: { products: true } },
    },
  })
  const faitsStructure: FaitStructure[] = rangees.map((rangee) => ({
    id: rangee.id,
    name: rangee.name,
    slug: rangee.slug,
    image: rangee.image,
    parentId: rangee.parentId,
    position: rangee.position,
    produitsDirects: rangee._count.products,
  }))
  const structure = lectureDesStructures(faitsStructure)
  const plans = ordonnes.map((produit) => ({
    produitId: produit.id,
    plan: declarerApresEcriture("variante.stock.changee", {
      produitId: produit.id,
      slug: produit.slug,
      categoryId: produit.categoryId,
    }),
    document: {
      indexable: toIndexableProduct(produit),
      evenement: {
        id: produit.id,
        slug: produit.slug,
        categoryChain: chaineDeLaStructure(structure, produit.categoryId),
      },
    },
  }))
  await enregistrerFaits(
    tx,
    plans.flatMap(({ plan }) => plan.faits)
  )
  return { plans }
}

export async function exécuterStock(
  ecriture: EcritureStock,
  surcharges: Partial<EffetsStock> = {},
  journal: JournalEffetsPostCommit = journalEffetsConsole
): Promise<void> {
  const effets = avecSurcharges(defaultStockEffects, surcharges)
  const plans = [...ecriture.plans].sort((a, b) =>
    a.produitId.localeCompare(b.produitId)
  )
  for (const { plan, document } of plans) {
    await executerCatalogue(
      plan,
      effets,
      {
        documents: async () => [document],
        evenements: async () => [document.evenement],
      },
      journal
    )
  }
}
