import { randomUUID } from "node:crypto"

import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"
import { enregistrerEvenement } from "@/lib/automations/evenements"
import {
  compterEvenementsMorts,
  executerLesEvenements,
  reclamerLesIdentifiants,
  redriveEvenementsMorts,
  type OptionsExecution,
} from "@/lib/automations/executeur"
import { listerExecutions } from "@/lib/automations/historique"
import { semerLesRegles } from "@/lib/automations/regles"
import {
  creerPortCatalogueMemoire,
  creerPortEmailsMemoire,
  dependancesDeTest,
} from "@/test/automations-memoire"

const runId = randomUUID().slice(0, 8)
const MAINTENANT = new Date("2026-10-28T07:00:00.000Z")

const SNAPSHOT = {
  userEmail: `client-${runId}@example.test`,
  orderId: "",
  items: [
    {
      productName: "Produit",
      variantName: "Standard",
      quantity: 1,
      price: 1000,
    },
  ],
  total: 1000,
  shippingFee: 0,
  totalPayable: 1000,
  cityName: "Casablanca",
  address: "1 rue du Test",
  phone: "0600000000",
}

function options(surcharges: Partial<OptionsExecution> = {}): OptionsExecution {
  return {
    maintenant: MAINTENANT,
    delaiDeReprise: () => 0,
    ...surcharges,
  }
}

async function ecrire(
  entree: Parameters<typeof enregistrerEvenement>[1]
): Promise<void> {
  await prisma.$transaction((tx) => enregistrerEvenement(tx, entree))
}

async function statutCommande(
  entityId: string,
  statut: "confirmed" | "shipped" | "cancelled"
): Promise<void> {
  await ecrire({
    type: "commande.statut.changee",
    entityType: "commande",
    entityId,
    occurredAt: MAINTENANT,
    payload: { snapshot: { ...SNAPSHOT, orderId: entityId }, statut },
  })
}

beforeEach(async () => {
  await prisma.automationRun.deleteMany()
  await prisma.automationEvent.deleteMany()
  await semerLesRegles()
})

afterAll(async () => {
  await prisma.automationRun.deleteMany()
  await prisma.automationEvent.deleteMany()
  await prisma.automationRuleRevision.deleteMany()
  await prisma.automationRule.deleteMany()
  await prisma.$disconnect()
})

describe("le travailleur des automatisations", () => {
  it("traite les événements d'une entité dans l'ordre de leur séquence", async () => {
    const entite = `commande-${runId}-sequence`
    await statutCommande(entite, "confirmed")
    await statutCommande(entite, "shipped")
    const emails = creerPortEmailsMemoire()

    const bilan = await executerLesEvenements(
      options(),
      dependancesDeTest(MAINTENANT, { emails: emails.port })
    )

    expect(bilan.reussis).toBe(2)
    expect(emails.appels.map((appel) => appel.statut)).toEqual([
      "confirmed",
      "shipped",
    ])
    const evenements = await prisma.automationEvent.findMany({
      where: { entityId: entite },
      orderBy: { seq: "asc" },
    })
    expect(evenements.map((evenement) => evenement.status)).toEqual([
      "reussi",
      "reussi",
    ])
  })

  it("ne réclame jamais deux fois le même événement sous verrou concurrent", async () => {
    const entite = `commande-${runId}-verrou`
    await statutCommande(entite, "confirmed")

    let liberer!: () => void
    const verrou = new Promise<void>((resoudre) => {
      liberer = resoudre
    })

    const premier = prisma.$transaction(async (tx) => {
      const ids = await reclamerLesIdentifiants(tx, options())
      await verrou
      return ids
    })

    await new Promise((resoudre) => setTimeout(resoudre, 50))
    const second = await prisma.$transaction((tx) =>
      reclamerLesIdentifiants(tx, options())
    )
    expect(second).toEqual([])

    liberer()
    await expect(premier).resolves.toHaveLength(1)
  })

  it("réessaie avec un backoff, puis laisse l'événement mort avec sa dernière erreur", async () => {
    const entite = `categorie-${runId}-panne`
    await ecrire({
      type: "structure.modifiee",
      entityType: "categorie",
      entityId: entite,
      occurredAt: MAINTENANT,
      payload: { categorieId: entite },
    })
    const catalogue = creerPortCatalogueMemoire({
      panneStructure: new Error("cache indisponible"),
    })

    const bilan = await executerLesEvenements(
      options({ maxTentatives: 2 }),
      dependancesDeTest(MAINTENANT, { catalogue: catalogue.port })
    )

    expect(bilan.echoues).toBe(2)
    expect(catalogue.structures).toBe(2)
    const evenement = await prisma.automationEvent.findFirstOrThrow({
      where: { entityId: entite },
    })
    expect(evenement.status).toBe("mort")
    expect(evenement.attempts).toBe(2)
    expect(evenement.lastError).toBe("cache indisponible")
    await expect(compterEvenementsMorts()).resolves.toBe(1)

    const runs = await prisma.automationRun.findMany({
      where: { eventId: evenement.id },
      orderBy: { attempt: "asc" },
    })
    expect(runs.map((run) => [run.attempt, run.status, run.lastError])).toEqual(
      [
        [1, "echoue", "cache indisponible"],
        [2, "echoue", "cache indisponible"],
      ]
    )

    const historique = await listerExecutions()
    const echec = historique.find((execution) => execution.id === runs[1]!.id)
    expect(echec).toMatchObject({
      regle: "Invalidation de la Structure modifiée",
      action: "invalidation.structure",
      statut: "echoue",
      tentative: 2,
      erreur: "cache indisponible",
      declencheur: "evenement",
    })
    expect(echec!.debut).toBeInstanceOf(Date)
    expect(echec!.fin).toBeInstanceOf(Date)

    await expect(redriveEvenementsMorts()).resolves.toBe(1)
    const reanime = await prisma.automationEvent.findFirstOrThrow({
      where: { entityId: entite },
    })
    expect(reanime.status).toBe("en_attente")
    expect(reanime.attempts).toBe(0)
    expect(reanime.lastError).toBeNull()
  })

  it("reprend un événement laissé en cours par un conteneur tué", async () => {
    const entite = `categorie-${runId}-redemarrage`
    await ecrire({
      type: "structure.modifiee",
      entityType: "categorie",
      entityId: entite,
      occurredAt: MAINTENANT,
      payload: { categorieId: entite },
    })
    await prisma.automationEvent.updateMany({
      where: { entityId: entite },
      data: {
        status: "en_cours",
        attempts: 1,
        lockedUntil: new Date(MAINTENANT.getTime() - 60_000),
      },
    })
    const catalogue = creerPortCatalogueMemoire()

    const bilan = await executerLesEvenements(
      options(),
      dependancesDeTest(MAINTENANT, { catalogue: catalogue.port })
    )

    expect(bilan.reussis).toBe(1)
    expect(catalogue.structures).toBe(1)
    const evenement = await prisma.automationEvent.findFirstOrThrow({
      where: { entityId: entite },
    })
    expect(evenement.status).toBe("reussi")
  })

  it("n'exécute jamais un événement expiré, et le note ignoré", async () => {
    const entite = `categorie-${runId}-expire`
    await ecrire({
      type: "structure.modifiee",
      entityType: "categorie",
      entityId: entite,
      occurredAt: new Date(MAINTENANT.getTime() - 2 * 3_600_000),
      expiresAt: new Date(MAINTENANT.getTime() - 3_600_000),
      payload: { categorieId: entite },
    })
    const catalogue = creerPortCatalogueMemoire()

    const bilan = await executerLesEvenements(
      options(),
      dependancesDeTest(MAINTENANT, { catalogue: catalogue.port })
    )

    expect(bilan.ignores).toBe(1)
    expect(catalogue.structures).toBe(0)
    const evenement = await prisma.automationEvent.findFirstOrThrow({
      where: { entityId: entite },
    })
    expect(evenement.status).toBe("ignore")
    const runs = await prisma.automationRun.findMany({
      where: { eventId: evenement.id },
    })
    expect(runs).toHaveLength(1)
    expect(runs[0]!.status).toBe("ignore")
    expect(runs[0]!.lastError).toContain("expiré")
  })

  it("une seconde livraison du même événement n'envoie pas un second e-mail", async () => {
    const entite = `commande-${runId}-doublon`
    const snapshot = { ...SNAPSHOT, orderId: entite }
    await ecrire({
      type: "commande.creee",
      entityType: "commande",
      entityId: entite,
      occurredAt: MAINTENANT,
      payload: { snapshot },
    })
    const emails = creerPortEmailsMemoire()
    const dependances = dependancesDeTest(MAINTENANT, { emails: emails.port })

    await executerLesEvenements(options(), dependances)
    await prisma.automationEvent.updateMany({
      where: { entityId: entite },
      data: { status: "en_attente", attempts: 0, lockedUntil: null },
    })
    await executerLesEvenements(options(), dependances)

    expect(emails.appels).toHaveLength(2)
    expect(emails.appels[0]!.cleIdempotence).toBe(`commande.creee/${entite}/1`)
    expect(emails.appels[1]!.cleIdempotence).toBe(
      emails.appels[0]!.cleIdempotence
    )
    expect(emails.envoyes).toHaveLength(1)
  })

  it("n'exécute pas une règle dont la condition ne correspond pas", async () => {
    await prisma.automationRule.update({
      where: { id: "statut-commande" },
      data: {
        condition: { type: "statut-commande", statuts: ["shipped"] },
      },
    })
    const entite = `commande-${runId}-condition`
    await statutCommande(entite, "confirmed")
    const emails = creerPortEmailsMemoire()

    await executerLesEvenements(
      options(),
      dependancesDeTest(MAINTENANT, { emails: emails.port })
    )

    expect(emails.appels).toHaveLength(0)
    const evenement = await prisma.automationEvent.findFirstOrThrow({
      where: { entityId: entite },
    })
    expect(evenement.status).toBe("reussi")
    const runs = await prisma.automationRun.findMany({
      where: { eventId: evenement.id },
    })
    expect(runs[0]!.status).toBe("ignore")
    expect(runs[0]!.lastError).toBe("condition non remplie")
  })

  it("n'exécute aucune règle désactivée", async () => {
    await prisma.automationRule.update({
      where: { id: "statut-commande" },
      data: { enabled: false },
    })
    const entite = `commande-${runId}-desactivee`
    await statutCommande(entite, "confirmed")
    const emails = creerPortEmailsMemoire()

    await executerLesEvenements(
      options(),
      dependancesDeTest(MAINTENANT, { emails: emails.port })
    )

    expect(emails.appels).toHaveLength(0)
    const evenement = await prisma.automationEvent.findFirstOrThrow({
      where: { entityId: entite },
    })
    expect(evenement.status).toBe("reussi")
  })
})
