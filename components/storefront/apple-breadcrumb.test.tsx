import { renderToReadableStream } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { AppleBreadcrumb } from "./apple-breadcrumb"

async function rendre(
  crumbs: { name: string; href?: string }[]
): Promise<string> {
  const flux = await renderToReadableStream(<AppleBreadcrumb crumbs={crumbs} />)
  await flux.allReady
  return new Response(flux).text()
}

describe("AppleBreadcrumb", () => {
  it("aligne le fil d'Ariane sur la mesure de la boutique et marque la page courante", async () => {
    const html = await rendre([
      { name: "Accueil", href: "/" },
      { name: "Smartphones", href: "/categorie/smartphones" },
      { name: "iPhone 15 Pro" },
    ])

    expect(html).toContain("max-w-[980px]")
    expect(html).not.toContain("max-w-7xl")
    expect(html).toContain('aria-current="page"')
    expect(html).toContain("border-be")
    expect(html).toContain("rail-defilant")
  })
})
