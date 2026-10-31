import { randomUUID } from "node:crypto"

import { renderToReadableStream } from "react-dom/server"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string
    children: React.ReactNode
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock("@/components/admin/regle-automation-form", () => ({
  RegleAutomationForm: ({
    regle,
    statuts,
  }: {
    regle?: { id: string; nom: string; declencheur: string }
    statuts: { valeur: string; libelle: string }[]
  }) => (
    <form
      data-testid="formulaire-regle"
      data-regle={JSON.stringify(regle)}
      data-statuts={JSON.stringify(statuts)}
    />
  ),
}))

vi.mock("@/components/admin/bouton-automatisation", () => ({
  BoutonAutomatisation: ({
    libelle,
    champs,
  }: {
    libelle: string
    champs: Record<string, string>
  }) => (
    <span
      data-testid="bouton-automatisation"
      data-libelle={libelle}
      data-champs={JSON.stringify(champs)}
    />
  ),
}))

import AdminReglePage from "./page"
import { prisma } from "@/lib/db"

const runId = randomUUID().slice(0, 8)
const MAINTENANT = new Date()

function decoderEntites(texte: string): string {
  return texte
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
}

function sansBalises(html: string): string {
  return decoderEntites(
    html
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  )
}

function attribut(html: string, nom: string): string {
  return decoderEntites(
    new RegExp(`data-${nom}="([^"]*)"`).exec(html)?.[1] ?? ""
  )
}

async function rendreLaPage(
  id: string,
  searchParams: Record<string, string> = {}
): Promise<string> {
  const stream = await renderToReadableStream(
    <AdminReglePage
      params={Promise.resolve({ id })}
      searchParams={Promise.resolve(searchParams)}
    />
  )
  return new Response(stream).text()
}

async function balayer() {
  await prisma.automationRun.deleteMany()
  await prisma.automationEvent.deleteMany()
  await prisma.automationRuleRevision.deleteMany()
  await prisma.automationRule.deleteMany()
}

beforeEach(balayer)

afterAll(async () => {
  await balayer()
  await prisma.$disconnect()
})

async function creerRegle(options: {
  id: string
  actif?: boolean
  declencheur?: string
  action?: string
  condition?: unknown
  actionConfig?: unknown
}) {
  const regle = await prisma.automationRule.create({
    data: {
      id: options.id,
      name: "E-mail de statut",
      enabled: options.actif ?? true,
      trigger: options.declencheur ?? "commande.statut.changee",
      condition: (options.condition ?? {
        type: "statut-commande",
        statuts: ["shipped"],
      }) as never,
      action: options.action ?? "email.commande-statut",
      actionConfig: (options.actionConfig ?? null) as never,
    },
  })
  await prisma.automationRuleRevision.create({
    data: {
      ruleId: regle.id,
      author: `auteur-${runId}@example.test`,
      snapshot: {
        id: regle.id,
        nom: regle.name,
        declencheur: regle.trigger,
        condition: regle.condition,
        action: regle.action,
        actif: regle.enabled,
      },
      createdAt: MAINTENANT,
    },
  })
  return regle
}

async function creerEvenement(options: {
  entityId: string
  statut: string
  expire?: boolean
}) {
  return prisma.automationEvent.create({
    data: {
      type: "commande.statut.changee",
      entityType: "commande",
      entityId: options.entityId,
      seq: 1,
      attemptOf: 1,
      payload: {
        statut: options.statut,
        snapshot: { orderId: options.entityId },
      },
      occurredAt: MAINTENANT,
      expiresAt: new Date(
        MAINTENANT.getTime() + (options.expire ? -1_000 : 3_600_000)
      ),
    },
  })
}

describe("la page d'une Règle d'automatisation", () => {
  it("rend l'éditeur avec le vocabulaire, l'état et la révision attribuée", async () => {
    const regle = await creerRegle({
      id: `statut-${runId}`,
      declencheur: "planification.digest-stock-bas",
      action: "digest.proprietaire",
      condition: { type: "toujours" },
      actionConfig: { destinataireVariable: "ADMIN_EMAIL" },
    })
    const secret = `digest-prive-${runId}@example.test`
    process.env.ADMIN_EMAIL = secret

    try {
      const html = await rendreLaPage(regle.id)
      const texte = sansBalises(html)

      expect(texte).toContain("Modifier — E-mail de statut")
      expect(texte).toContain(`auteur-${runId}@example.test`)
      expect(texte).toMatch(/\d{2}\/\d{2}\/\d{4}/)

      const formulaire = JSON.parse(attribut(html, "regle"))
      expect(formulaire).toMatchObject({
        id: regle.id,
        declencheur: "planification.digest-stock-bas",
        action: "digest.proprietaire",
        configuration: { destinataireVariable: "ADMIN_EMAIL" },
      })
      expect(JSON.parse(attribut(html, "statuts"))).toContainEqual({
        valeur: "shipped",
        libelle: "Expédiée",
      })

      expect(html).toContain("ADMIN_EMAIL")
      expect(html).not.toContain(secret)
    } finally {
      delete process.env.ADMIN_EMAIL
    }
  })

  it("simule sur le dernier Événement réel : décision et motif, sans écrire d'exécution", async () => {
    const regle = await creerRegle({ id: `simu-${runId}` })
    await creerEvenement({
      entityId: `commande-${runId}-expediee`,
      statut: "shipped",
    })

    const html = await rendreLaPage(regle.id)
    const texte = sansBalises(html)
    expect(texte).toContain("Simulation")
    expect(texte).toContain("Enverrait :")
    expect(texte).toContain(
      "La condition « Statut de Commande » retient le statut « shipped »"
    )
    await expect(prisma.automationRun.count()).resolves.toBe(0)
  })

  it("rend le motif d'un refus quand l'Événement choisi ne remplit pas la condition", async () => {
    const regle = await creerRegle({ id: `refus-${runId}` })
    const evenement = await creerEvenement({
      entityId: `commande-${runId}-attente`,
      statut: "pending",
    })

    const html = await rendreLaPage(regle.id, { simuler: evenement.id })
    const texte = sansBalises(html)
    expect(texte).toContain("Ignorerait :")
    expect(texte).toContain(
      "La condition « Statut de Commande » ne retient pas le statut « pending »"
    )
  })

  it("dit qu'aucun Événement réel n'attend quand la simulation n'a pas de sujet", async () => {
    const regle = await creerRegle({ id: `vide-${runId}` })

    const html = await rendreLaPage(regle.id)
    expect(sansBalises(html)).toContain("Aucun Événement réel")
  })
})
