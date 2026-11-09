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

import { CarteSurveillance } from "./carte-surveillance"
import type { LowStockVariant } from "@/lib/use-cases/admin-dashboard"

const VARIANTE: LowStockVariant = {
  id: "variante-1",
  name: "Noir — 128 Go",
  sku: "MBA13-M3-NOIR",
  stock: 2,
  productId: "produit-1",
  productName: "MacBook Air 13",
}

async function rendre(
  compteurs: React.ComponentProps<typeof CarteSurveillance>["compteurs"],
  stock: LowStockVariant[]
): Promise<string> {
  const stream = await renderToReadableStream(
    <CarteSurveillance compteurs={compteurs} stock={stock} />
  )
  return new Response(stream).text()
}

describe("la carte À surveiller", () => {
  it("dit le calme une seule fois quand tout est à zéro", async () => {
    const html = await rendre({ enRupture: 0, sansAlt: 0, echecs: 0 }, [])

    expect(html).toContain("Rien à signaler.")
    expect(html).not.toContain("Aucune variante sous")
    expect(html).not.toContain("En rupture")
    expect(html).not.toContain("Images produit sans texte alternatif")
    expect(html).not.toContain("Automatisations en échec")
    expect(html).not.toContain("Aucune variante en stock faible.")
  })

  it("ne rend pas de cartouche vide quand le stock est vide mais qu'une alerte existe", async () => {
    const html = await rendre({ enRupture: 2, sansAlt: 0, echecs: 0 }, [])

    expect(html).toContain("En rupture")
    expect(html).not.toContain("Aucune variante en stock faible.")
  })

  it("ne rend que les alertes non nulles, et jamais la ligne Stock faible", async () => {
    const html = await rendre({ enRupture: 2, sansAlt: 1, echecs: 0 }, [
      VARIANTE,
    ])

    expect(html).toContain("En rupture")
    expect(html).toContain("Images produit sans texte alternatif")
    expect(html).not.toContain("Automatisations en échec")
    expect(html).not.toContain("Rien à signaler.")
    expect(html).not.toContain('href="#stock-faible"')
    expect(html).toContain('id="stock-faible"')
  })

  it("garde l'ancre et la liste du stock, avec le Produit et sa pastille", async () => {
    const html = await rendre({ enRupture: 0, sansAlt: 0, echecs: 0 }, [
      VARIANTE,
    ])

    expect(html).toContain('id="stock-faible"')
    expect(html).toContain('href="/admin/produits/produit-1"')
    expect(html).toContain("MacBook Air 13")
    expect(html).toContain("2 restants")
    expect(html).not.toContain("Aucune variante en stock faible.")
  })

  it("cache l'action de l'en-tête sous sm pour ne pas comprimer la description", async () => {
    const html = await rendre({ enRupture: 0, sansAlt: 0, echecs: 0 }, [
      VARIANTE,
    ])

    expect(html).toContain("Voir les produits")
    expect(html).toContain("hidden sm:block")
    expect(html).toContain("flex flex-col sm:grid")
  })
})
