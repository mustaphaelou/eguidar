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

import { CommandesRecentes } from "./commandes-recentes"
import type { RecentOrder } from "@/lib/use-cases/admin-dashboard"

const COMMANDES: RecentOrder[] = [
  {
    id: "cmabcdefgh1111111111111111",
    status: "delivered",
    total: 240000,
    totalPayable: 246000,
    createdAt: new Date(2026, 10, 1, 12),
    itemCount: 2,
  },
  {
    id: "cmabcdefgh2222222222222222",
    status: "pending",
    total: 90000,
    totalPayable: 90300,
    createdAt: new Date(2026, 9, 31, 12),
    itemCount: 1,
  },
]

function liensVers(html: string, href: string): string[] {
  const motif = new RegExp(
    `<a[^>]*href="${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>([\\s\\S]*?)</a>`,
    "g"
  )
  return [...html.matchAll(motif)].map((correspondance) =>
    correspondance[1]!.replace(/<[^>]*>/g, "").trim()
  )
}

async function rendre(element: React.ReactNode): Promise<string> {
  const stream = await renderToReadableStream(element)
  return new Response(stream).text()
}

describe("les Commandes récentes", () => {
  it("nomme le total des Commandes dans le pied, pas un Tout voir passif", async () => {
    const html = await rendre(
      <CommandesRecentes commandes={COMMANDES} total={7} />
    )
    const pied = liensVers(html, "/admin/commandes")

    expect(pied).toHaveLength(1)
    expect(pied[0]).toBe("Voir les 7 commandes")
    expect(html).not.toContain("Tout voir")
  })

  it("écrit au singulier quand la boutique n'a qu'une Commande", async () => {
    const html = await rendre(
      <CommandesRecentes commandes={COMMANDES.slice(0, 1)} total={1} />
    )

    expect(liensVers(html, "/admin/commandes")[0]).toBe("Voir la commande")
  })

  it("garde le rythme de la ligne : la référence, la date et l'article, le montant, le statut", async () => {
    const html = await rendre(
      <CommandesRecentes commandes={COMMANDES} total={7} />
    )

    expect(
      liensVers(html, `/admin/commandes/${COMMANDES[0]!.id}`)
    ).toHaveLength(1)
    expect(html).toContain("#CMABCDEF")
    expect(html).toContain("2 articles")
    expect(html).toContain("Livrée")
    expect(html).toContain("En attente")
    expect(html).toContain("1 article")
  })

  it("garde son état vide sans pied quand aucune Commande n'existe", async () => {
    const html = await rendre(<CommandesRecentes commandes={[]} total={0} />)

    expect(html).toContain("Aucune commande récente.")
    expect(liensVers(html, "/admin/commandes")).toHaveLength(0)
  })
})
