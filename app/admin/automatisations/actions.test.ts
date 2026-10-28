import { randomUUID } from "node:crypto"

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import type { Client } from "@/lib/use-cases/session-courante"
import { RedirectSentinel, sessionCouranteMock } from "@/test/navigation-mocks"
import {
  creerPortCatalogueMemoire,
  dependancesDeTest,
} from "@/test/automations-memoire"

const { dependancesMock } = vi.hoisted(() => ({ dependancesMock: vi.fn() }))

vi.mock("next/navigation", async () => {
  const mocks = await import("@/test/navigation-mocks")
  return { redirect: mocks.redirectMock }
})
vi.mock("@/lib/use-cases/session-courante", async (importOriginal) => {
  const mocks = await import("@/test/navigation-mocks")
  return {
    ...(await importOriginal<
      typeof import("@/lib/use-cases/session-courante")
    >()),
    lireSession: mocks.sessionCouranteMock,
  }
})
vi.mock("@/lib/automations/dependances", () => ({
  dependancesAutomations: dependancesMock,
}))

import {
  basculerRegleAction,
  enregistrerRegleAction,
  reessayerExecutionAction,
} from "@/app/admin/automatisations/actions"
import { prisma } from "@/lib/db"

const runId = randomUUID().slice(0, 8)
const MAINTENANT = new Date("2026-10-28T10:00:00.000Z")

const PROPRIETAIRE: Client = {
  id: `proprietaire-${runId}`,
  name: "Propriétaire",
  email: `proprietaire-${runId}@example.test`,
  role: "admin",
}

const VISITEUR: Client = {
  id: `visiteur-${runId}`,
  name: "Visiteur",
  email: `visiteur-${runId}@example.test`,
  role: "user",
}

async function balayer() {
  await prisma.automationRun.deleteMany()
  await prisma.automationEvent.deleteMany()
  await prisma.automationRuleRevision.deleteMany()
  await prisma.automationRule.deleteMany()
}

beforeEach(async () => {
  sessionCouranteMock.mockReset()
  sessionCouranteMock.mockResolvedValue(PROPRIETAIRE)
  dependancesMock.mockReset()
  dependancesMock.mockImplementation(() =>
    dependancesDeTest(MAINTENANT, {
      catalogue: creerPortCatalogueMemoire().port,
    })
  )
  await balayer()
})

afterAll(async () => {
  await balayer()
  await prisma.$disconnect()
})

function regleFormData(
  champs: Record<string, string | string[]> = {}
): FormData {
  const data = new FormData()
  data.set("nom", `Règle action ${runId}`)
  data.set("declencheur", "produit.enregistre")
  data.set("conditionType", "toujours")
  data.set("action", "index.produit")
  data.set("actif", "on")
  for (const [cle, valeur] of Object.entries(champs)) {
    if (Array.isArray(valeur)) {
      for (const element of valeur) data.append(cle, element)
      continue
    }
    data.set(cle, valeur)
  }
  return data
}

async function creerRegleEnBase(): Promise<string> {
  const id = `regle-action-${runId}`
  await prisma.automationRule.create({
    data: {
      id,
      name: "Invalidation du bord",
      trigger: "structure.modifiee",
      condition: { type: "toujours" },
      action: "invalidation.structure",
    },
  })
  return id
}

describe("les actions de l'Administration des automatisations", () => {
  it("refuse de basculer une Règle à une session qui n'est pas propriétaire", async () => {
    sessionCouranteMock.mockResolvedValue(VISITEUR)
    const regleId = await creerRegleEnBase()

    const bascule = new FormData()
    bascule.set("regleId", regleId)
    bascule.set("retour", "liste")

    await expect(basculerRegleAction({}, bascule)).rejects.toThrow(
      RedirectSentinel
    )
    await expect(
      prisma.automationRule.findUniqueOrThrow({ where: { id: regleId } })
    ).resolves.toMatchObject({ enabled: true })
    await expect(
      prisma.automationRuleRevision.count({ where: { ruleId: regleId } })
    ).resolves.toBe(0)
  })

  it("bascule une Règle pour le propriétaire et attribue la révision", async () => {
    const regleId = await creerRegleEnBase()

    const bascule = new FormData()
    bascule.set("regleId", regleId)
    bascule.set("retour", "regle")

    await expect(basculerRegleAction({}, bascule)).rejects.toThrow(
      RedirectSentinel
    )

    await expect(
      prisma.automationRule.findUniqueOrThrow({ where: { id: regleId } })
    ).resolves.toMatchObject({ enabled: false })
    const revision = await prisma.automationRuleRevision.findFirstOrThrow({
      where: { ruleId: regleId },
    })
    expect(revision.author).toBe(PROPRIETAIRE.email)
    expect(revision.snapshot).toMatchObject({ actif: false })
  })

  it("refuse une combinaison non prise en charge en la nommant, sans rien créer", async () => {
    const resultat = await enregistrerRegleAction(
      {},
      regleFormData({ action: "email.commande-statut" })
    )

    expect(resultat).toEqual({
      error:
        "Combinaison non prise en charge : « Produit enregistré » (produit.enregistre) ne déclenche pas « E-mail de statut de Commande » (email.commande-statut).",
    })
    await expect(prisma.automationRule.count()).resolves.toBe(0)
  })

  it("crée une Règle et renvoie vers son éditeur", async () => {
    await expect(
      enregistrerRegleAction({}, regleFormData({ nom: "Indexation différée" }))
    ).rejects.toMatchObject({
      url: "/admin/automatisations/indexation-differee",
    })

    const regle = await prisma.automationRule.findUniqueOrThrow({
      where: { id: "indexation-differee" },
    })
    expect(regle).toMatchObject({
      name: "Indexation différée",
      action: "index.produit",
    })
    await expect(
      prisma.automationRuleRevision.count({
        where: { ruleId: "indexation-differee" },
      })
    ).resolves.toBe(1)
  })

  it("réessaie une exécution en échec, la marque manuelle et garde les filtres", async () => {
    const regleId = `regle-reessai-${runId}`
    await prisma.automationRule.create({
      data: {
        id: regleId,
        name: "Invalidation à réessayer",
        trigger: "structure.modifiee",
        condition: { type: "toujours" },
        action: "invalidation.structure",
      },
    })
    const entite = `categorie-${runId}-action`
    const evenement = await prisma.automationEvent.create({
      data: {
        type: "structure.modifiee",
        entityType: "categorie",
        entityId: entite,
        seq: 1,
        attemptOf: 1,
        payload: { categorieId: entite },
        occurredAt: MAINTENANT,
        expiresAt: new Date(MAINTENANT.getTime() + 3_600_000),
        status: "mort",
        attempts: 3,
        lastError: "cache indisponible",
      },
    })
    const echec = await prisma.automationRun.create({
      data: {
        eventId: evenement.id,
        ruleId: regleId,
        action: "invalidation.structure",
        status: "echoue",
        attempt: 3,
        lastError: "cache indisponible",
        startedAt: MAINTENANT,
        finishedAt: new Date(MAINTENANT.getTime() + 500),
      },
    })

    const reessai = new FormData()
    reessai.set("executionId", echec.id)
    reessai.set("statut", "echoue")
    reessai.set("regle", regleId)
    reessai.set("depuis", "2026-10-21")

    await expect(reessayerExecutionAction({}, reessai)).rejects.toMatchObject({
      url: `/admin/automatisations/executions?statut=echoue&regle=${regleId}&depuis=2026-10-21`,
    })

    const manuelle = await prisma.automationRun.findFirstOrThrow({
      where: { eventId: evenement.id, trigger: "manuel" },
    })
    expect(manuelle).toMatchObject({ status: "reussi", attempt: 4 })
    await expect(
      prisma.automationEvent.findUniqueOrThrow({ where: { id: evenement.id } })
    ).resolves.toMatchObject({ status: "reussi" })
  })
})
