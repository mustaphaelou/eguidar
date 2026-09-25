import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  creerCycleVieImageProduit,
  creerRegistreBrouillonImageProduitPrisma,
} from "@/lib/cycle-vie-image-produit"
import { prisma } from "@/lib/db"
import {
  creerHorlogeControllable,
  creerStockageImageProduitMemoire,
} from "@/test/cycle-vie-image-produit-memoire"

const ownerId = randomUUID()
const DATE_INITIALE = new Date("2026-02-01T12:00:00.000Z")

function creerExpirationDurable() {
  const horloge = creerHorlogeControllable(DATE_INITIALE)
  const stockage = creerStockageImageProduitMemoire()
  const registre = creerRegistreBrouillonImageProduitPrisma(horloge.horloge)
  const cycleVie = creerCycleVieImageProduit({
    stockage,
    registre,
    horloge: horloge.horloge,
  })
  return { cycleVie, horloge, stockage, registre }
}

type ExpirationDurable = ReturnType<typeof creerExpirationDurable>

async function demanderBrouillon(cycleVie: ExpirationDurable["cycleVie"]) {
  const resultat = await cycleVie.demanderBrouillon({
    ownerId,
    contentType: "image/webp",
    size: 2048,
  })
  if (!resultat.ok) throw new Error("La demande devait réussir")
  return resultat
}

function lireEtatPersiste(draftId: string) {
  return prisma.brouillonImageProduit
    .findUniqueOrThrow({ where: { id: draftId }, select: { state: true } })
    .then((row) => row.state)
}

describe("expiration des Brouillons d'Image produit dans le registre durable", () => {
  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: ownerId,
        name: "Éditeur Expiration",
        email: `expiration-${ownerId}@example.test`,
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

  it("revendique une milliseconde avant la frontière et refuse à l'instant exact", async () => {
    const { cycleVie, horloge, registre } = creerExpirationDurable()
    const vivant = await demanderBrouillon(cycleVie)
    const aLaFrontiere = await demanderBrouillon(cycleVie)
    const apresFrontiere = await demanderBrouillon(cycleVie)
    expect(aLaFrontiere.expiresAt).toEqual(vivant.expiresAt)

    horloge.fixer(new Date(vivant.expiresAt.getTime() - 1))
    const avant = await registre.revendiquer({
      id: vivant.draftId,
      ownerId,
      tentativeId: "tentative-1",
      now: horloge.horloge.maintenant(),
    })
    expect(avant).toMatchObject({ ok: true })
    expect((await cycleVie.lireBrouillon(vivant.draftId))?.state).toBe(
      "revendiqué"
    )

    horloge.fixer(vivant.expiresAt)
    for (const brouillon of [aLaFrontiere, apresFrontiere]) {
      expect(
        await registre.revendiquer({
          id: brouillon.draftId,
          ownerId,
          tentativeId: "tentative-2",
          now: horloge.horloge.maintenant(),
        })
      ).toMatchObject({ ok: false, code: "expire" })
    }

    horloge.avancer(1)
    expect(
      await registre.revendiquer({
        id: apresFrontiere.draftId,
        ownerId,
        tentativeId: "tentative-3",
        now: horloge.horloge.maintenant(),
      })
    ).toMatchObject({ ok: false, code: "expire" })
  })

  it("résout l'expiration à la lecture et la persiste pour le support", async () => {
    const { cycleVie, horloge } = creerExpirationDurable()
    const vivant = await demanderBrouillon(cycleVie)
    const demande = await demanderBrouillon(cycleVie)

    horloge.fixer(new Date(demande.expiresAt.getTime() - 1))
    expect((await cycleVie.lireBrouillon(vivant.draftId))?.state).toBe("vivant")
    expect((await cycleVie.lireBrouillon(demande.draftId))?.state).toBe(
      "vivant"
    )
    expect(await lireEtatPersiste(demande.draftId)).toBe("vivant")

    horloge.avancer(1)
    expect((await cycleVie.lireBrouillon(demande.draftId))?.state).toBe(
      "expiré"
    )
    expect(await lireEtatPersiste(demande.draftId)).toBe("expiré")
    expect((await cycleVie.lireBrouillon(demande.draftId))?.state).toBe(
      "expiré"
    )
    expect(await lireEtatPersiste(demande.draftId)).toBe("expiré")
  })

  it("enregistre l'état expiré sans rien promotionner ni supprimer", async () => {
    const { cycleVie, horloge, stockage } = creerExpirationDurable()
    const demande = await demanderBrouillon(cycleVie)
    horloge.fixer(demande.expiresAt)

    const resultat = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: randomUUID(),
      ownerId,
      draftIds: [demande.draftId],
      enregistrer: async () => ({
        productId: "produit-inexistant",
        result: null,
      }),
    })

    expect(resultat).toMatchObject({ ok: false, code: "brouillon-expire" })
    expect(resultat).toMatchObject({
      message: expect.stringContaining("Téléversez à nouveau"),
    })
    expect(stockage.promotions).toEqual([])
    expect(stockage.deletedDrafts).toEqual([])
    expect(await lireEtatPersiste(demande.draftId)).toBe("expiré")
    expect(
      await prisma.brouillonImageProduit.findUniqueOrThrow({
        where: { id: demande.draftId },
        select: { promotedPublicUrl: true, productId: true },
      })
    ).toEqual({ promotedPublicUrl: null, productId: null })
  })

  it("refuse de libérer un Brouillon expiré et laisse l'objet à la règle R2", async () => {
    const { cycleVie, horloge, stockage } = creerExpirationDurable()
    const demande = await demanderBrouillon(cycleVie)
    horloge.fixer(new Date(demande.expiresAt.getTime() + 1))

    const resultat = await cycleVie.relacherBrouillon({
      draftId: demande.draftId,
      ownerId,
    })

    expect(resultat).toMatchObject({ ok: false, code: "brouillon-expire" })
    expect(stockage.deletedDrafts).toEqual([])
    expect(stockage.deletedPromoted).toEqual([])
    expect(await lireEtatPersiste(demande.draftId)).toBe("expiré")
  })
})
