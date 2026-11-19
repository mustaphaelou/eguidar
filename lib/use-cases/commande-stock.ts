import { declarerApresEcriture, type PlanCatalogue } from "@/lib/apres-ecriture"
import { enregistrerFaits } from "@/lib/automations/evenements"
import { sendOrderPlacedEmail, sendOrderStatusEmail } from "@/lib/emails"
import type { OrderEmailSnapshot } from "@/lib/emails"
import type { Prisma } from "@/lib/generated/prisma/client"
import {
  toIndexableProduct,
  type IndexableProduct,
} from "@/lib/index-projection"
import { indexProductDocuments } from "@/lib/meili"
import {
  chaineDeLaStructure,
  demandeDePurgeCatalogue,
  purgerEdgeDurable,
  revaliderCatalogue,
  type CatalogueEventProduct,
} from "@/lib/use-cases/cache-invalidation"
import {
  executer as executerCatalogue,
  type DocumentCatalogue,
  type EffetsCatalogue,
} from "@/lib/use-cases/apres-ecriture/catalogue"
import type { EffetsCommande } from "@/lib/use-cases/apres-ecriture/commande"
import { lireStructure } from "@/lib/use-cases/lecture-structure"
import type { JournalEffetsPostCommit } from "@/lib/use-cases/mutation-squelette"
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
  constructor(fromStatus: string, nextStatus: string) {
    super(`Transition invalide : ${fromStatus} → ${nextStatus}`)
    this.name = "InvalidOrderTransitionError"
  }
}

export interface OrderWithItems {
  id: string
  cityName: string
  address: string
  phone: string
  total: number
  shippingFee: number
  totalPayable: number
  items: {
    productName: string
    variantName: string
    price: number
    quantity: number
  }[]
}

export function toOrderEmailSnapshot(
  order: OrderWithItems,
  userEmail: string
): OrderEmailSnapshot {
  return {
    userEmail,
    orderId: order.id,
    items: order.items.map((item) => ({
      productName: item.productName,
      variantName: item.variantName,
      price: item.price,
      quantity: item.quantity,
    })),
    total: order.total,
    shippingFee: order.shippingFee,
    totalPayable: order.totalPayable,
    cityName: order.cityName,
    address: order.address,
    phone: order.phone,
  }
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

export type MouvementDeStock =
  | {
      genre: "réservation"
      variantId: string
      quantité: number
      productName: string
      variantName: string
      stock: number
    }
  | { genre: "réapprovisionnement"; variantId: string; quantité: number }
  | { genre: "fixation"; variantId: string; stock: number }

export function reserver(
  variantId: string,
  quantité: number,
  productName: string,
  variantName: string,
  stock: number
): MouvementDeStock {
  return {
    genre: "réservation",
    variantId,
    quantité,
    productName,
    variantName,
    stock,
  }
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
  documents: readonly DocumentCatalogue[]
}

export interface EcritureStock {
  plans: readonly PlanStock[]
}

export interface EffetsStock {
  reindexProducts(produits: IndexableProduct[]): Promise<void>
  revalidateCatalog(produit: CatalogueEventProduct): Promise<void> | void
  purgeCatalogue(produit: CatalogueEventProduct): Promise<void> | void
}

export interface EffetsCommandeEcriture {
  email: EffetsCommande
  stock: EffetsStock
}

export interface SurchargesCommande {
  email?: Partial<EffetsCommande>
  stock?: Partial<EffetsStock>
}

export const effetsCommandeParDefaut: EffetsCommandeEcriture = {
  email: { sendOrderPlacedEmail, sendOrderStatusEmail },
  stock: {
    reindexProducts: indexProductDocuments,
    revalidateCatalog: revaliderCatalogue,
    purgeCatalogue: async (produit) =>
      purgerEdgeDurable(demandeDePurgeCatalogue(produit)),
  },
}

export function avecSurchargesCommande(
  surcharges?: SurchargesCommande
): EffetsCommandeEcriture {
  return {
    email: { ...effetsCommandeParDefaut.email, ...surcharges?.email },
    stock: { ...effetsCommandeParDefaut.stock, ...surcharges?.stock },
  }
}

async function appliquer(
  tx: Prisma.TransactionClient,
  mouvement: MouvementDeStock
): Promise<OutOfStockItem | null> {
  if (mouvement.genre === "réservation") {
    const updated = await tx.productVariant.updateMany({
      where: {
        id: mouvement.variantId,
        stock: { gte: mouvement.quantité },
      },
      data: { stock: { decrement: mouvement.quantité } },
    })
    if (updated.count === 0) {
      const current = await tx.productVariant.findUnique({
        where: { id: mouvement.variantId },
        select: { stock: true },
      })
      return {
        productName: mouvement.productName,
        variantName: mouvement.variantName,
        requested: mouvement.quantité,
        available: current?.stock ?? mouvement.stock,
      }
    }
    return null
  }

  if (mouvement.genre === "réapprovisionnement") {
    await tx.productVariant.updateMany({
      where: { id: mouvement.variantId },
      data: { stock: { increment: mouvement.quantité } },
    })
    return null
  }

  await tx.productVariant.updateMany({
    where: { id: mouvement.variantId },
    data: { stock: mouvement.stock },
  })
  return null
}

function stockApres(
  stock: number,
  mouvements: readonly MouvementDeStock[]
): number {
  return mouvements.reduce((valeur, mouvement) => {
    if (mouvement.genre === "réservation") return valeur - mouvement.quantité
    if (mouvement.genre === "réapprovisionnement")
      return valeur + mouvement.quantité
    return mouvement.stock
  }, stock)
}

function lireProduitsTouches(
  tx: Prisma.TransactionClient,
  variantIds: string[]
) {
  return tx.product.findMany({
    where: { variants: { some: { id: { in: variantIds } } } },
    include: { variants: true, category: true },
    orderBy: { id: "asc" },
  })
}

export async function écrireLeStock(
  tx: Prisma.TransactionClient,
  mouvements: readonly MouvementDeStock[]
): Promise<EcritureStock> {
  if (mouvements.length === 0) return { plans: [] }

  const variantIds = [...new Set(mouvements.map((m) => m.variantId))]
  const produits = await lireProduitsTouches(tx, [...variantIds])

  const refus: OutOfStockItem[] = []
  for (const mouvement of mouvements) {
    const refusDuMouvement = await appliquer(tx, mouvement)
    if (refusDuMouvement) refus.push(refusDuMouvement)
  }
  if (refus.length > 0) throw new OutOfStockError(refus)

  const lecture = await lireStructure()
  const plans: PlanStock[] = produits.map((produit) => {
    const variantes = produit.variants.map((variante) => ({
      ...variante,
      stock: stockApres(
        variante.stock,
        mouvements.filter((m) => m.variantId === variante.id)
      ),
    }))
    const document: DocumentCatalogue = {
      indexable: toIndexableProduct({ ...produit, variants: variantes }),
      evenement: {
        id: produit.id,
        slug: produit.slug,
        categoryChain: chaineDeLaStructure(lecture, produit.categoryId),
      },
    }
    return {
      produitId: produit.id,
      plan: declarerApresEcriture("variante.stock.changee", {
        produitId: produit.id,
        slug: produit.slug,
        categoryId: produit.categoryId,
      }),
      documents: [document],
    }
  })

  await enregistrerFaits(
    tx,
    plans.flatMap(({ plan }) => plan.faits)
  )
  return { plans }
}

export async function exécuterStock(
  ecriture: EcritureStock,
  effets: EffetsStock,
  journal?: JournalEffetsPostCommit
): Promise<void> {
  for (const { plan, documents } of ecriture.plans) {
    await executerCatalogue(
      plan,
      effets as EffetsCatalogue,
      {
        documents: async () => documents,
        evenements: async () => documents.map(({ evenement }) => evenement),
      },
      journal
    )
  }
}
