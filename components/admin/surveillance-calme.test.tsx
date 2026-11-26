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

import { LigneCalme } from "./ligne-calme"
import { LignesDAlerte } from "./ligne-d-alerte"
import { ListeDeStockFaible } from "./stock-faible"
import type { LowStockVariant } from "@/lib/use-cases/admin-dashboard"

const VARIANTES: LowStockVariant[] = [
  {
    id: "variante-rupture",
    name: "Noir",
    sku: "SKU-RUPTURE",
    stock: 0,
    productId: "produit-rupture",
    productName: "Produit en rupture",
  },
  {
    id: "variante-restants",
    name: "Bleu",
    sku: "SKU-RESTANTS",
    stock: 2,
    productId: "produit-restants",
    productName: "Produit en stock faible",
  },
]

async function rendre(element: React.ReactNode): Promise<string> {
  const stream = await renderToReadableStream(element)
  return new Response(stream).text()
}

function icôneDeLaLigne(html: string, label: string): string {
  const lignes = html.split('<li class="relative">').slice(1)
  const ligne = lignes.find((morceau) => morceau.includes(label))
  expect(ligne, `aucune ligne d'alerte pour « ${label} »`).toBeDefined()
  return ligne!.match(/<span class="([^"]+)"/)?.[1] ?? ""
}

describe("la calme de la surveillance", () => {
  it("réserve le cartouche plein aux lignes qui appellent une action", async () => {
    const html = await rendre(
      <LignesDAlerte compteurs={{ enRupture: 1, sansAlt: 1, echecs: 1 }} />
    )

    expect(html).toContain("En rupture")
    expect(html).toContain("Images produit sans texte alternatif")
    expect(html).toContain("Automatisations en échec")

    expect(icôneDeLaLigne(html, "En rupture")).toContain("rounded-lg border")
    expect(icôneDeLaLigne(html, "Automatisations en échec")).toContain(
      "rounded-lg border"
    )

    const neutre = icôneDeLaLigne(html, "Images produit sans texte alternatif")
    expect(neutre).not.toContain("rounded-lg border")
    expect(neutre).toContain("text-muted-foreground")
  })

  it("allège les filets et aère les lignes d'alerte", async () => {
    const html = await rendre(
      <LignesDAlerte compteurs={{ enRupture: 1, sansAlt: 0, echecs: 0 }} />
    )

    expect(html).toContain("divide-hairline/60")
    expect(html).toContain("border-hairline/60")
    expect(html).toContain("py-4")
  })

  it("neutralise la pastille de stock et garde le rouge pour Rupture", async () => {
    const html = await rendre(<ListeDeStockFaible stock={VARIANTES} />)

    const restants = html.match(
      /<span[^>]*class="([^"]*tabular-nums[^"]*)"[^>]*>2 restants<\/span>/
    )?.[1]
    expect(restants).toContain("bg-muted/50")
    expect(restants).not.toContain("amber")

    const rupture = html.match(
      /<span[^>]*class="([^"]*tabular-nums[^"]*)"[^>]*>Rupture<\/span>/
    )?.[1]
    expect(rupture).toContain("bg-destructive/10")

    expect(html).toContain('data-slot="table"')
    expect(html).toContain("border-hairline/60")
  })

  it("dit le calme une seule fois, avec un filet léger et de l'air", async () => {
    const html = await rendre(<LigneCalme />)

    expect(html.match(/Rien à signaler\./g)).toHaveLength(1)
    expect(html).toContain("border-hairline/60")
    expect(html).toContain("py-5")
  })
})
