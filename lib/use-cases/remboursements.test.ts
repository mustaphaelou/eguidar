import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"
import {
  CleIdempotenceReutiliseeError,
  EncaissementIntrouvableError,
  enregistrerRemboursement,
  PlafondDuRemboursementDepasseError,
  RemboursementValidationError,
  RetourDUnAutreEncaissementError,
  RetourDuRemboursementIntrouvableError,
  type DemandeDeRemboursement,
} from "@/lib/use-cases/remboursements"
import { declarerRetour, refuserRetour } from "@/lib/use-cases/retours"

const runId = randomUUID().slice(0, 8)
const email = `remboursements-${runId}@test.ma`
const DATE_REMBOURSEMENT = new Date("2026-11-12T10:00:00.000Z")

let userId: string

interface CommandeFixture {
  id: string
  totalPayable: number
  items: { id: string; price: number; quantity: number }[]
}

async function creerEncaissement({
  articles = [{ price: 10000, quantity: 2 }],
  shippingFee = 2000,
}: {
  articles?: { price: number; quantity: number }[]
  shippingFee?: number
} = {}): Promise<{ commande: CommandeFixture; encaissementId: string }> {
  const total = articles.reduce(
    (somme, article) => somme + article.price * article.quantity,
    0
  )
  const commande = await prisma.order.create({
    data: {
      userId,
      cityName: "Ville Remboursement",
      address: "12 Avenue Hassan II",
      phone: "+212 600 123 456",
      total,
      shippingFee,
      totalPayable: total + shippingFee,
      status: "delivered",
      deliveredAt: new Date("2026-11-10T10:00:00.000Z"),
      items: {
        create: articles.map((article, index) => ({
          productName: "Article Remboursement",
          variantName: `Variante ${index + 1}`,
          price: article.price,
          quantity: article.quantity,
        })),
      },
    },
    include: { items: true },
  })
  const encaissement = await prisma.payment.create({
    data: {
      orderId: commande.id,
      amount: commande.totalPayable,
      mode: "cash_on_delivery",
      collectedAt: new Date("2026-11-10T10:00:00.000Z"),
      recordedById: userId,
    },
  })
  return {
    commande: {
      id: commande.id,
      totalPayable: commande.totalPayable,
      items: commande.items.map((article) => ({
        id: article.id,
        price: article.price,
        quantity: article.quantity,
      })),
    },
    encaissementId: encaissement.id,
  }
}

function demande(
  encaissementId: string,
  surcharges: Partial<DemandeDeRemboursement> = {}
): DemandeDeRemboursement {
  return {
    paymentId: encaissementId,
    amount: 1000,
    mode: "cash",
    refundedAt: DATE_REMBOURSEMENT,
    recordedById: userId,
    idempotencyKey: `cle-${randomUUID()}`,
    ...surcharges,
  }
}

beforeAll(async () => {
  const utilisateur = await prisma.user.create({
    data: {
      id: randomUUID(),
      email,
      name: "Client Remboursements",
    },
  })
  userId = utilisateur.id
})

beforeEach(async () => {
  await prisma.refund.deleteMany({
    where: { payment: { order: { user: { email } } } },
  })
  await prisma.returnLine.deleteMany({
    where: { return: { order: { user: { email } } } },
  })
  await prisma.return.deleteMany({
    where: { order: { user: { email } } },
  })
  await prisma.payment.deleteMany({
    where: { order: { user: { email } } },
  })
  await prisma.orderItem.deleteMany({
    where: { order: { user: { email } } },
  })
  await prisma.order.deleteMany({
    where: { user: { email } },
  })
})

afterAll(async () => {
  await prisma.refund.deleteMany({
    where: { payment: { order: { user: { email } } } },
  })
  await prisma.returnLine.deleteMany({
    where: { return: { order: { user: { email } } } },
  })
  await prisma.return.deleteMany({
    where: { order: { user: { email } } },
  })
  await prisma.payment.deleteMany({
    where: { order: { user: { email } } },
  })
  await prisma.orderItem.deleteMany({
    where: { order: { user: { email } } },
  })
  await prisma.order.deleteMany({
    where: { user: { email } },
  })
  await prisma.user.delete({ where: { id: userId } })
  await prisma.$disconnect()
})

describe("l'attente d'un Remboursement", () => {
  it("attend le montant total payé, livraison comprise, quand toutes les unités sont déclarées", async () => {
    const { commande, encaissementId } = await creerEncaissement()
    const retour = await declarerRetour({
      orderId: commande.id,
      reason: "withdrawal",
      requestedAt: new Date("2026-11-11T10:00:00.000Z"),
      lines: [{ orderItemId: commande.items[0].id, declaredQuantity: 2 }],
    })

    const remboursement = await enregistrerRemboursement(
      demande(encaissementId, { returnId: retour.id, amount: 22000 })
    )

    expect(remboursement.montantAttendu).toBe(22000)
    expect(retour.status).toBe("requested")
  })

  it("attend les marchandises seulement quand le retrait est partiel, et enregistre le montant accordé", async () => {
    const { commande, encaissementId } = await creerEncaissement()
    const retour = await declarerRetour({
      orderId: commande.id,
      reason: "withdrawal",
      requestedAt: new Date("2026-11-11T10:00:00.000Z"),
      lines: [{ orderItemId: commande.items[0].id, declaredQuantity: 1 }],
    })

    const remboursement = await enregistrerRemboursement(
      demande(encaissementId, {
        returnId: retour.id,
        amount: 9000,
        mode: "transfer",
        reason: "Geste commercial",
      })
    )

    expect(remboursement.montantAttendu).toBe(10000)
    expect(remboursement.amount).toBe(9000)

    const enregistre = await prisma.refund.findUniqueOrThrow({
      where: { id: remboursement.id },
    })
    expect(enregistre).toMatchObject({
      amount: 9000,
      mode: "transfer",
      reason: "Geste commercial",
      returnId: retour.id,
    })
  })

  it("calcule l'attente par Article du panier sur plusieurs lignes déclarées", async () => {
    const { commande, encaissementId } = await creerEncaissement({
      articles: [
        { price: 10000, quantity: 2 },
        { price: 5000, quantity: 1 },
      ],
      shippingFee: 500,
    })
    const retour = await declarerRetour({
      orderId: commande.id,
      reason: "withdrawal",
      requestedAt: new Date("2026-11-11T10:00:00.000Z"),
      lines: [
        { orderItemId: commande.items[0].id, declaredQuantity: 1 },
        { orderItemId: commande.items[1].id, declaredQuantity: 1 },
      ],
    })

    const remboursement = await enregistrerRemboursement(
      demande(encaissementId, { returnId: retour.id, amount: 15000 })
    )

    expect(remboursement.montantAttendu).toBe(15000)
  })

  it("n'a pas d'attente sans Retour et laisse le lien facultatif", async () => {
    const { encaissementId } = await creerEncaissement()

    const remboursement = await enregistrerRemboursement(
      demande(encaissementId, { amount: 5000 })
    )

    expect(remboursement.returnId).toBeNull()
    expect(remboursement.montantAttendu).toBeNull()
  })
})

describe("enregistrer un Remboursement", () => {
  it("accepte les modes espèces et virement, et enregistre l'instant et l'acteur", async () => {
    const { encaissementId } = await creerEncaissement()
    const especes = await enregistrerRemboursement(
      demande(encaissementId, { mode: "cash", amount: 1000 })
    )
    const virement = await enregistrerRemboursement(
      demande(encaissementId, { mode: "transfer", amount: 1000 })
    )

    expect(especes.mode).toBe("cash")
    expect(virement.mode).toBe("transfer")
    expect(virement.refundedAt.toISOString()).toBe("2026-11-12T10:00:00.000Z")
    expect(virement.recordedById).toBe(userId)
  })

  it("garde le motif facultatif et le vide quand il est blanc", async () => {
    const { encaissementId } = await creerEncaissement()
    const sansMotif = await enregistrerRemboursement(
      demande(encaissementId, { amount: 1000 })
    )
    const blanc = await enregistrerRemboursement(
      demande(encaissementId, { amount: 1000, reason: "  " })
    )

    expect(sansMotif.reason).toBeNull()
    expect(blanc.reason).toBeNull()
  })

  it("refuse un montant nul, négatif ou non entier, sans rien écrire", async () => {
    const { encaissementId } = await creerEncaissement()

    for (const amount of [0, -1, 1.5]) {
      await expect(
        enregistrerRemboursement(demande(encaissementId, { amount }))
      ).rejects.toBeInstanceOf(RemboursementValidationError)
    }

    await expect(
      prisma.refund.count({ where: { paymentId: encaissementId } })
    ).resolves.toBe(0)
  })

  it("refuse une clé d'idempotence vide, une date invalide et un mode inconnu", async () => {
    const { encaissementId } = await creerEncaissement()

    await expect(
      enregistrerRemboursement(demande(encaissementId, { idempotencyKey: " " }))
    ).rejects.toBeInstanceOf(RemboursementValidationError)
    await expect(
      enregistrerRemboursement(
        demande(encaissementId, { refundedAt: new Date("pas une date") })
      )
    ).rejects.toBeInstanceOf(RemboursementValidationError)
    await expect(
      enregistrerRemboursement(
        demande(encaissementId, { mode: "cheque" as never })
      )
    ).rejects.toBeInstanceOf(RemboursementValidationError)
    await expect(
      enregistrerRemboursement(demande(encaissementId, { recordedById: "" }))
    ).rejects.toBeInstanceOf(RemboursementValidationError)

    await expect(
      prisma.refund.count({ where: { paymentId: encaissementId } })
    ).resolves.toBe(0)
  })

  it("refuse un Encaissement et un Retour inconnus", async () => {
    const { commande, encaissementId } = await creerEncaissement()

    await expect(
      enregistrerRemboursement(demande("encaissement-inconnu"))
    ).rejects.toBeInstanceOf(EncaissementIntrouvableError)

    await expect(
      enregistrerRemboursement(
        demande(encaissementId, { returnId: "retour-inconnu" })
      )
    ).rejects.toBeInstanceOf(RetourDuRemboursementIntrouvableError)

    expect(commande.id).toBeTruthy()
  })

  it("refuse un Retour d'une autre Commande", async () => {
    const premier = await creerEncaissement()
    const second = await creerEncaissement()
    const retour = await declarerRetour({
      orderId: second.commande.id,
      reason: "withdrawal",
      requestedAt: new Date("2026-11-11T10:00:00.000Z"),
      lines: [
        { orderItemId: second.commande.items[0].id, declaredQuantity: 1 },
      ],
    })

    await expect(
      enregistrerRemboursement(
        demande(premier.encaissementId, { returnId: retour.id })
      )
    ).rejects.toBeInstanceOf(RetourDUnAutreEncaissementError)
  })

  it("plafonne la somme des Remboursements d'un Encaissement à son montant", async () => {
    const { encaissementId } = await creerEncaissement({
      articles: [{ price: 10000, quantity: 10 }],
      shippingFee: 0,
    })

    await enregistrerRemboursement(demande(encaissementId, { amount: 90000 }))
    await expect(
      enregistrerRemboursement(demande(encaissementId, { amount: 20000 }))
    ).rejects.toBeInstanceOf(PlafondDuRemboursementDepasseError)

    await expect(
      prisma.refund.count({ where: { paymentId: encaissementId } })
    ).resolves.toBe(1)

    const solde = await enregistrerRemboursement(
      demande(encaissementId, { amount: 10000 })
    )
    expect(solde.amount).toBe(10000)
    const total = await prisma.refund.aggregate({
      where: { paymentId: encaissementId },
      _sum: { amount: true },
    })
    expect(total._sum.amount).toBe(100000)
  })

  it("vérifie le plafond dans la transaction, sous le verrou de l'Encaissement", async () => {
    const { encaissementId } = await creerEncaissement({
      articles: [{ price: 10000, quantity: 10 }],
      shippingFee: 0,
    })

    const resultats = await Promise.allSettled([
      enregistrerRemboursement(demande(encaissementId, { amount: 60000 })),
      enregistrerRemboursement(demande(encaissementId, { amount: 60000 })),
    ])

    const reussites = resultats.filter(
      (resultat) => resultat.status === "fulfilled"
    )
    const echecs = resultats.filter(
      (resultat): resultat is PromiseRejectedResult =>
        resultat.status === "rejected"
    )
    expect(reussites).toHaveLength(1)
    expect(echecs).toHaveLength(1)
    expect(echecs[0].reason).toBeInstanceOf(PlafondDuRemboursementDepasseError)

    const total = await prisma.refund.aggregate({
      where: { paymentId: encaissementId },
      _sum: { amount: true },
    })
    expect(total._sum.amount).toBe(60000)
  })

  it("plafonne chaque Encaissement séparément, même sur la même Commande", async () => {
    const { commande, encaissementId } = await creerEncaissement({
      articles: [{ price: 10000, quantity: 1 }],
      shippingFee: 0,
    })
    const second = await prisma.payment.create({
      data: {
        orderId: commande.id,
        amount: 10000,
        mode: "cash_on_delivery",
        collectedAt: new Date("2026-11-10T11:00:00.000Z"),
        recordedById: userId,
      },
    })

    await enregistrerRemboursement(demande(encaissementId, { amount: 10000 }))
    const autre = await enregistrerRemboursement(
      demande(second.id, { amount: 10000 })
    )

    expect(autre.amount).toBe(10000)
  })

  it("n'écrit qu'un Remboursement pour une double soumission à la même clé", async () => {
    const { encaissementId } = await creerEncaissement()
    const cle = `cle-${randomUUID()}`
    const demandeUnique = demande(encaissementId, {
      amount: 3000,
      idempotencyKey: cle,
    })

    const premier = await enregistrerRemboursement(demandeUnique)
    const second = await enregistrerRemboursement(demandeUnique)

    expect(second.id).toBe(premier.id)
    await expect(
      prisma.refund.count({ where: { idempotencyKey: cle } })
    ).resolves.toBe(1)
  })

  it("rend le même Remboursement à deux soumissions concurrentes de la même clé", async () => {
    const { encaissementId } = await creerEncaissement()
    const cle = `cle-${randomUUID()}`
    const demandeUnique = demande(encaissementId, {
      amount: 3000,
      idempotencyKey: cle,
    })

    const resultats = await Promise.all([
      enregistrerRemboursement(demandeUnique),
      enregistrerRemboursement(demandeUnique),
    ])

    expect(resultats[0].id).toBe(resultats[1].id)
    await expect(
      prisma.refund.count({ where: { idempotencyKey: cle } })
    ).resolves.toBe(1)
  })

  it("refuse de réutiliser une clé d'idempotence pour un autre Remboursement", async () => {
    const premier = await creerEncaissement()
    const second = await creerEncaissement()
    const cle = `cle-${randomUUID()}`

    await enregistrerRemboursement(
      demande(premier.encaissementId, { amount: 3000, idempotencyKey: cle })
    )
    await expect(
      enregistrerRemboursement(
        demande(premier.encaissementId, { amount: 4000, idempotencyKey: cle })
      )
    ).rejects.toBeInstanceOf(CleIdempotenceReutiliseeError)
    await expect(
      enregistrerRemboursement(
        demande(second.encaissementId, { amount: 3000, idempotencyKey: cle })
      )
    ).rejects.toBeInstanceOf(CleIdempotenceReutiliseeError)

    await expect(
      prisma.refund.count({ where: { idempotencyKey: cle } })
    ).resolves.toBe(1)
  })

  it("laisse le Remboursement en place quand le Retour est refusé après coup", async () => {
    const { commande, encaissementId } = await creerEncaissement()
    const retour = await declarerRetour({
      orderId: commande.id,
      reason: "withdrawal",
      requestedAt: new Date("2026-11-11T10:00:00.000Z"),
      lines: [{ orderItemId: commande.items[0].id, declaredQuantity: 2 }],
    })
    const remboursement = await enregistrerRemboursement(
      demande(encaissementId, { returnId: retour.id, amount: 22000 })
    )

    await refuserRetour({
      returnId: retour.id,
      code: "condition_mismatch",
      note: "Article revenu endommagé",
    })

    const enregistre = await prisma.refund.findUniqueOrThrow({
      where: { id: remboursement.id },
    })
    expect(enregistre.returnId).toBe(retour.id)
    expect(enregistre.amount).toBe(22000)
  })
})
