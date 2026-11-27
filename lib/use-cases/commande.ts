import {
  declarerApresEcriture,
  type PlanCatalogue,
  type PlanCommande,
} from "@/lib/apres-ecriture"
import type { OrderEmailSnapshot } from "@/lib/automations/charge"
import { enregistrerFaits } from "@/lib/automations/evenements"
import { sendOrderPlacedEmail, sendOrderStatusEmail } from "@/lib/emails"
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
  executer as executerCommande,
  type EffetsCommande,
} from "@/lib/use-cases/apres-ecriture/commande"
import {
  chaineDeLaStructure,
  demandeDePurgeCatalogue,
  purgerEdgeDurable,
  revaliderCatalogue,
  type CatalogueEventProduct,
} from "@/lib/use-cases/cache-invalidation"
import { lireStructure } from "@/lib/use-cases/lecture-structure"
import {
  avecSurcharges,
  journalEffetsConsole,
  type JournalEffetsPostCommit,
} from "@/lib/use-cases/mutation-squelette"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"
import {
  peutTransitionner,
  type OrigineDeTransition,
} from "@/lib/statut-de-commande"

export type { EffetsCommande, OrigineDeTransition }

export interface SurchargesCommande {
  email?: Partial<EffetsCommande>
  stock?: Partial<EffetsStock>
}

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

const defaultOrderEffects: EffetsCommande = {
  sendOrderPlacedEmail,
  sendOrderStatusEmail,
}

const defaultStockEffects: EffetsStock = {
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
    include: { product: { include: { variants: true } } },
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

  const structure = await lireStructure()
  const plans = ordonnes.map((produit) => {
    const fiche = produit.categoryId
      ? structure.structure(produit.categoryId)
      : null
    return {
      produitId: produit.id,
      plan: declarerApresEcriture("variante.stock.changee", {
        produitId: produit.id,
        slug: produit.slug,
        categoryId: produit.categoryId,
      }),
      document: {
        indexable: toIndexableProduct({
          ...produit,
          category: fiche
            ? { id: fiche.id, slug: fiche.slug, name: fiche.name }
            : null,
        }),
        evenement: {
          id: produit.id,
          slug: produit.slug,
          categoryChain: chaineDeLaStructure(structure, produit.categoryId),
        },
      },
    }
  })
  await enregistrerFaits(
    tx,
    plans.flatMap(({ plan }) => plan.faits)
  )
  return { plans }
}

export interface ArticleDeCommande {
  variantId: string | null
  productName: string
  variantName: string
  price: number
  quantity: number
}

export interface CommandeEmailisable {
  id: string
  total: number
  shippingFee: number
  totalPayable: number
  cityName: string
  address: string
  phone: string
  items: readonly ArticleDeCommande[]
}

export interface CommandeTransitionnable extends CommandeEmailisable {
  status: OrderStatus
  user: { email: string }
}

export interface DemandeDeTransition {
  commande: CommandeTransitionnable
  cible: OrderStatus
  acteurId: string
  origine: OrigineDeTransition
  changedAt?: Date
}

export interface TransitionEffectuee {
  commande: CommandeTransitionnable
  plan: PlanCommande
  ecriture: EcritureStock
}

export function toOrderEmailSnapshot(
  commande: CommandeEmailisable,
  userEmail: string
): OrderEmailSnapshot {
  return {
    userEmail,
    orderId: commande.id,
    items: commande.items.map((item) => ({
      productName: item.productName,
      variantName: item.variantName,
      price: item.price,
      quantity: item.quantity,
    })),
    total: commande.total,
    shippingFee: commande.shippingFee,
    totalPayable: commande.totalPayable,
    cityName: commande.cityName,
    address: commande.address,
    phone: commande.phone,
  }
}

export async function effectuerLaTransition(
  tx: Prisma.TransactionClient,
  demande: DemandeDeTransition
): Promise<TransitionEffectuee> {
  const { commande, cible, acteurId, origine } = demande
  if (!peutTransitionner(commande.status, cible, origine)) {
    throw new InvalidOrderTransitionError(commande.status, cible)
  }

  const changedAt = demande.changedAt ?? new Date()
  const revendiquee = await tx.order.updateMany({
    where: { id: commande.id, status: commande.status },
    data:
      cible === "delivered"
        ? { status: cible, deliveredAt: changedAt }
        : { status: cible },
  })
  if (revendiquee.count === 0) {
    throw new InvalidOrderTransitionError(commande.status, cible)
  }

  if (cible === "delivered") {
    await tx.payment.create({
      data: {
        orderId: commande.id,
        amount: commande.totalPayable,
        mode: "cash_on_delivery",
        collectedAt: changedAt,
        recordedById: acteurId,
      },
    })
  }

  await tx.orderStatusChange.create({
    data: {
      orderId: commande.id,
      fromStatus: commande.status,
      toStatus: cible,
      changedAt,
      actorId: acteurId,
    },
  })

  const mouvements =
    cible === "cancelled"
      ? commande.items.flatMap((item) =>
          item.variantId
            ? [reapprovisionner(item.variantId, item.quantity)]
            : []
        )
      : []
  const ecriture = await écrireLeStock(tx, mouvements)

  const miseAJour = await tx.order.findUniqueOrThrow({
    where: { id: commande.id },
    include: { items: true, user: { select: { email: true } } },
  })

  const plan = declarerApresEcriture("commande.statut.changee", {
    commandeId: commande.id,
    snapshot: toOrderEmailSnapshot(miseAJour, miseAJour.user.email),
    statut: cible,
  })
  await enregistrerFaits(tx, plan.faits)

  return { commande: miseAJour, plan, ecriture }
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

export async function exécuterEffetsCommande(
  effets: {
    plan?: PlanCommande | null
    ecriture: EcritureStock
  },
  surcharges?: SurchargesCommande,
  journal: JournalEffetsPostCommit = journalEffetsConsole
): Promise<void> {
  await exécuterStock(effets.ecriture, surcharges?.stock ?? {}, journal)
  if (effets.plan) {
    const portsEmail = avecSurcharges(defaultOrderEffects, surcharges?.email)
    await executerCommande(effets.plan, portsEmail, journal)
  }
}
