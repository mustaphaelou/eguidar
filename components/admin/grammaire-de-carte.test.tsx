import { readFileSync } from "node:fs"
import path from "node:path"

import { renderToReadableStream } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    scroll: _scroll,
    ...props
  }: {
    href: string
    children: React.ReactNode
    scroll?: boolean
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock("@/components/admin/graphique-chiffre-affaires", () => ({
  GraphiqueDuChiffreAffaires: ({ data }: { data: unknown[] }) => (
    <span data-testid="graphique-chiffre-affaires" data-points={data.length} />
  ),
}))

import { CarteChiffreAffaires } from "./chiffre-affaires"
import { CommandesRecentes } from "./commandes-recentes"
import type { PointDeChiffreAffaires } from "@/lib/tableau-de-bord-periode"
import type { RecentOrder } from "@/lib/use-cases/admin-dashboard"
import { liensVers } from "@/test/liens-vers"

const POINTS: PointDeChiffreAffaires[] = [{ label: "01/11", montant: 120000 }]
const COMMANDES: RecentOrder[] = [
  {
    id: "cmabcdefgh1111111111111111",
    status: "delivered",
    total: 240000,
    totalPayable: 246000,
    createdAt: new Date(2026, 10, 1, 12),
    itemCount: 2,
  },
]

async function rendre(element: React.ReactNode): Promise<string> {
  const stream = await renderToReadableStream(element)
  return new Response(stream).text()
}

describe("la grammaire de carte de la bande du milieu", () => {
  it("retitule l'Évolution et resserre son sélecteur sans toucher aux liens serveur", async () => {
    const html = await rendre(
      <CarteChiffreAffaires data={POINTS} periode="30j" />
    )

    expect(html).toMatch(/Évolution du chiffre d(?:&#x27;|')affaires/)
    expect(html).toContain(
      "Encaissements moins Remboursements, frais de livraison inclus."
    )
    expect(html).toContain("min-h-[260px]")

    const groupe = html.match(
      /<div role="group"[^>]*aria-label="Période"[^>]*>/
    )?.[0]
    expect(groupe).toContain("bg-muted")
    expect(groupe).toContain("rounded-lg")
    expect(groupe).toContain("p-1")

    const trente = liensVers(html, "/admin")[0]!
    expect(trente.texte).toBe("30 j")
    expect(trente.balise).toContain('aria-current="page"')
    expect(trente.balise).toContain('aria-label="30 derniers jours"')
    expect(liensVers(html, "/admin?periode=90j")[0]!.balise).toContain(
      'aria-label="90 derniers jours"'
    )
    expect(liensVers(html, "/admin?periode=12mois")[0]!.balise).toContain(
      'aria-label="12 derniers mois"'
    )
  })

  it("garde la grille du graphique en filets, sans pointillés ni mouvement", () => {
    const source = readFileSync(
      path.join(import.meta.dirname, "graphique-chiffre-affaires.tsx"),
      "utf8"
    )

    expect(source).toContain('stroke="var(--border)"')
    expect(source).not.toContain("strokeDasharray")
    expect(source).toContain("opacity={0.5}")
    expect(source).toContain('interval="preserveStartEnd"')
    expect(source).toContain("minTickGap={8}")
    expect(source).toContain("fontSize: 11")
    expect(source).toContain("radius={[3, 3, 0, 0]}")
    expect(source).toContain('className="fill-primary"')
    expect(source).toContain("isAnimationActive={false}")
    expect(source).toContain(
      "Aucun chiffre d&apos;affaires net sur cette période."
    )
  })

  it("allège les filets de l'Activité récente sans déplacer son pied", async () => {
    const html = await rendre(
      <CommandesRecentes commandes={COMMANDES} total={3} />
    )

    expect(html).toContain('data-slot="table"')
    expect(html).toContain("border-hairline/60")
    expect(liensVers(html, "/admin/commandes")).toHaveLength(1)
    expect(html).toContain("Voir les 3 commandes")
    expect(
      liensVers(html, `/admin/commandes/${COMMANDES[0]!.id}`)
    ).toHaveLength(1)
  })
})
