import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  creerCycleVieImageProduit,
  registreBrouillonImageProduitPrisma,
} from "@/lib/cycle-vie-image-produit"
import { prisma } from "@/lib/db"
import { creerStockageImageProduitMemoire } from "@/test/cycle-vie-image-produit-memoire"

const ownerId = randomUUID()
const now = new Date("2026-02-01T12:00:00.000Z")

describe("registre durable des Brouillons d'Image produit", () => {
  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: ownerId,
        name: "Éditeur Brouillon",
        email: `brouillon-${ownerId}@example.test`,
        role: "admin",
      },
    })
  })

  beforeEach(async () => {
    await prisma.brouillonImageProduit.deleteMany({ where: { ownerId } })
  })

  afterAll(async () => {
    await prisma.brouillonImageProduit.deleteMany({ where: { ownerId } })
    await prisma.user.deleteMany({ where: { id: ownerId } })
    await prisma.$disconnect()
  })

  it("conserve l'identité, le propriétaire, la retention et l'état vivant", async () => {
    const cycleVie = creerCycleVieImageProduit({
      stockage: creerStockageImageProduitMemoire(),
      registre: registreBrouillonImageProduitPrisma,
      horloge: { maintenant: () => new Date(now) },
    })

    const resultat = await cycleVie.demanderBrouillon({
      ownerId,
      contentType: "image/webp",
      size: 1234,
    })
    if (!resultat.ok) throw new Error("La demande devait réussir")

    const row = await prisma.brouillonImageProduit.findUniqueOrThrow({
      where: { id: resultat.draftId },
    })

    expect(row).toMatchObject({
      id: resultat.draftId,
      storageKey: `products/brouillons/${resultat.draftId}.webp`,
      mimeType: "image/webp",
      byteSize: 1234,
      ownerId,
      tentativeId: null,
      state: "vivant",
      promotedPublicUrl: null,
      productId: null,
    })
    expect(row.createdAt).toBeInstanceOf(Date)
    expect(row.expiresAt).toEqual(new Date(now.getTime() + 24 * 60 * 60 * 1000))
    expect(resultat.expiresAt).toEqual(row.expiresAt)
  })
})
