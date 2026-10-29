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

import AdminExecutionsPage from "./page"
import { prisma } from "@/lib/db"

const runId = randomUUID().slice(0, 8)
const JOUR = new Date("2026-10-28T03:00:00.000Z")

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

function lignes(html: string): string[] {
  const corps = /<tbody[^>]*>([\s\S]*?)<\/tbody>/.exec(html)?.[1] ?? ""
  return [...corps.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((ligne) =>
    sansBalises(ligne[1]!)
  )
}

function boutons(html: string): { libelle: string; champs: string }[] {
  return [
    ...html.matchAll(/<span[^>]*data-testid="bouton-automatisation"[^>]*>/g),
  ].map((balise) => ({
    libelle: decoderEntites(
      /data-libelle="([^"]*)"/.exec(balise[0])?.[1] ?? ""
    ),
    champs: JSON.parse(
      decoderEntites(/data-champs="([^"]*)"/.exec(balise[0])?.[1] ?? "{}")
    ),
  }))
}

async function rendreLaPage(
  searchParams: Record<string, string> = {}
): Promise<string> {
  const stream = await renderToReadableStream(
    <AdminExecutionsPage searchParams={Promise.resolve(searchParams)} />
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

async function creerRegle(id: string, name: string) {
  return prisma.automationRule.create({
    data: {
      id,
      name,
      trigger: "commande.statut.changee",
      condition: { type: "toujours" },
      action: "email.commande-statut",
    },
  })
}

async function creerExecution(options: {
  regleId: string
  statut: "reussi" | "echoue" | "ignore" | "en_cours"
  tentative: number
  debut: Date
  erreur?: string
  declencheur?: "evenement" | "planification" | "manuel"
  evenement?: { type: string; entityId: string }
}) {
  const evenement = options.evenement
    ? await prisma.automationEvent.create({
        data: {
          type: options.evenement.type,
          entityType: "commande",
          entityId: options.evenement.entityId,
          seq: 1,
          attemptOf: 1,
          payload: {},
          occurredAt: options.debut,
          expiresAt: new Date(options.debut.getTime() + 3_600_000),
        },
      })
    : null

  return prisma.automationRun.create({
    data: {
      ...(evenement ? { eventId: evenement.id } : {}),
      ruleId: options.regleId,
      action: "email.commande-statut",
      status: options.statut,
      attempt: options.tentative,
      lastError: options.erreur ?? null,
      startedAt: options.debut,
      finishedAt: new Date(options.debut.getTime() + 750),
      trigger: options.declencheur ?? "evenement",
    },
  })
}

describe("la page de l'historique des exécutions", () => {
  it("liste statut, tentative, erreur, horodatages, et distingue le réessai manuel", async () => {
    const regle = await creerRegle(`statut-${runId}`, "E-mail de statut")
    const echec = await creerExecution({
      regleId: regle.id,
      statut: "echoue",
      tentative: 2,
      debut: JOUR,
      erreur: "cache indisponible",
      evenement: {
        type: "commande.statut.changee",
        entityId: `commande-${runId}`,
      },
    })
    await creerExecution({
      regleId: regle.id,
      statut: "reussi",
      tentative: 3,
      debut: new Date(JOUR.getTime() + 60_000),
      declencheur: "manuel",
    })

    const html = await rendreLaPage()
    const [premiere, seconde] = lignes(html)
    expect(premiere).toContain("Réussi")
    expect(premiere).toContain("Manuel")
    expect(seconde).toContain("Échoué")
    expect(seconde).toContain("E-mail de statut")
    expect(seconde).toContain("commande.statut.changee")
    expect(seconde).toContain(`commande-${runId}`)
    expect(seconde).toContain("2")
    expect(seconde).toContain("cache indisponible")
    expect(seconde).toMatch(/\d{2}\/\d{2}\/\d{4}/)

    const actions = boutons(html)
    expect(actions).toHaveLength(1)
    expect(actions[0]!.libelle).toBe("Réessayer")
    expect(actions[0]!.champs).toEqual({
      executionId: echec.id,
      statut: "",
      regle: "",
      depuis: "",
    })
  })

  it("filtre par statut et par Règle", async () => {
    const premiere = await creerRegle(`premiere-${runId}`, "Première règle")
    const seconde = await creerRegle(`seconde-${runId}`, "Seconde règle")
    await creerExecution({
      regleId: premiere.id,
      statut: "echoue",
      tentative: 1,
      debut: JOUR,
      erreur: "boum",
    })
    await creerExecution({
      regleId: seconde.id,
      statut: "reussi",
      tentative: 1,
      debut: new Date(JOUR.getTime() + 60_000),
    })

    const parStatut = await rendreLaPage({ statut: "echoue" })
    expect(lignes(parStatut)).toHaveLength(1)
    expect(lignes(parStatut).join(" ")).toContain("Première règle")
    expect(lignes(parStatut).join(" ")).not.toContain("Seconde règle")

    const parRegle = await rendreLaPage({ regle: seconde.id })
    expect(lignes(parRegle)).toHaveLength(1)
    expect(lignes(parRegle).join(" ")).toContain("Seconde règle")

    const vides = await rendreLaPage({ statut: "ignore" })
    expect(lignes(vides)).toHaveLength(0)
    expect(sansBalises(vides)).toContain("Aucune exécution")
  })

  it("garde les filtres dans le retour du réessai", async () => {
    const regle = await creerRegle(`filtree-${runId}`, "Règle filtrée")
    const echec = await creerExecution({
      regleId: regle.id,
      statut: "echoue",
      tentative: 2,
      debut: JOUR,
      erreur: "boum",
    })

    const html = await rendreLaPage({
      statut: "echoue",
      regle: regle.id,
      depuis: "2026-10-21",
    })

    expect(boutons(html)[0]!.champs).toEqual({
      executionId: echec.id,
      statut: "echoue",
      regle: regle.id,
      depuis: "2026-10-21",
    })
  })
})
