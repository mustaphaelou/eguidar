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

import AdminAutomatisationsPage from "./page"
import { prisma } from "@/lib/db"

const runId = randomUUID().slice(0, 8)

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

async function rendreLaPage(): Promise<string> {
  const stream = await renderToReadableStream(<AdminAutomatisationsPage />)
  return new Response(stream).text()
}

function boutons(html: string): { libelle: string; champs: string }[] {
  return [
    ...html.matchAll(/<span[^>]*data-testid="bouton-automatisation"[^>]*>/g),
  ].map((balise) => ({
    libelle: /data-libelle="([^"]*)"/.exec(balise[0])?.[1] ?? "",
    champs: decoderEntites(/data-champs="([^"]*)"/.exec(balise[0])?.[1] ?? ""),
  }))
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
  action?: string
  declencheur?: string
  nom?: string
}) {
  return prisma.automationRule.create({
    data: {
      id: options.id,
      name: options.nom ?? `Règle ${options.id}`,
      enabled: options.actif ?? true,
      trigger: options.declencheur ?? "produit.enregistre",
      condition: { type: "toujours" },
      action: options.action ?? "index.produit",
    },
  })
}

describe("la page des automatisations", () => {
  it("explique ce qu'est une Règle quand il n'y en a aucune", async () => {
    const html = await rendreLaPage()
    const texte = sansBalises(html)
    expect(texte).toContain("Automatisations")
    expect(texte).toContain("Aucune Règle d'automatisation")
    expect(texte).toContain("déclencheur → condition → action")
  })

  it("montre chaque Règle comme déclencheur, condition et action, avec son état", async () => {
    await creerRegle({ id: `indexation-${runId}` })
    const desactivee = await creerRegle({
      id: `digest-${runId}`,
      nom: "Digest du propriétaire",
      actif: false,
      declencheur: "planification.digest-stock-bas",
      action: "digest.proprietaire",
    })

    const html = await rendreLaPage()
    const texte = sansBalises(html)
    expect(texte).toContain("Produit enregistré")
    expect(texte).toContain("Toujours")
    expect(texte).toContain("Indexer le Produit")
    expect(texte).toContain("Planification du digest du stock bas")
    expect(texte).toContain("Digest du propriétaire")
    expect(texte).toContain("Actif")
    expect(texte).toContain("Inactif")
    expect(texte).toContain("Jamais")

    const actions = boutons(html)
    expect(actions.map((bouton) => bouton.libelle).sort()).toEqual([
      "Activer",
      "Désactiver",
    ])
    const activation = actions.find((bouton) => bouton.libelle === "Activer")
    expect(JSON.parse(activation!.champs)).toMatchObject({
      regleId: desactivee.id,
      actif: "actif",
    })
  })

  it("affiche la dernière exécution et le bandeau des échecs", async () => {
    const regle = await creerRegle({ id: `invalidation-${runId}` })
    const evenement = await prisma.automationEvent.create({
      data: {
        type: "produit.enregistre",
        entityType: "produit",
        entityId: `produit-${runId}`,
        seq: 1,
        attemptOf: 1,
        payload: { produitId: `produit-${runId}` },
        occurredAt: new Date("2026-10-28T03:00:00.000Z"),
        expiresAt: new Date("2026-10-29T03:00:00.000Z"),
        status: "mort",
        attempts: 3,
        lastError: "cache indisponible",
      },
    })
    await prisma.automationRun.create({
      data: {
        eventId: evenement.id,
        ruleId: regle.id,
        action: "index.produit",
        status: "echoue",
        attempt: 3,
        lastError: "cache indisponible",
        startedAt: new Date("2026-10-28T03:00:00.000Z"),
        finishedAt: new Date("2026-10-28T03:00:01.000Z"),
      },
    })

    const html = await rendreLaPage()
    const texte = sansBalises(html)
    expect(texte).toContain("1 exécution(s) en échec ou en file morte")
    expect(texte).toContain("Échoué")
    expect(texte).toContain("Événement")
    expect(texte).toMatch(/\d{2}\/\d{2}\/\d{4}/)
  })
})
