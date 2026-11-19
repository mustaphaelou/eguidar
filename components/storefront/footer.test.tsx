import { renderToReadableStream } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { StorefrontFooter } from "./footer"

async function rendreLePied(): Promise<string> {
  const flux = await renderToReadableStream(<StorefrontFooter />)
  await flux.allReady
  return new Response(flux).text()
}

describe("StorefrontFooter — les pages de la boutique", () => {
  it("rend les cinq entrées que le Bandeau ne porte plus", async () => {
    const html = await rendreLePied()

    for (const page of [
      "/a-propos",
      "/contact",
      "/faq",
      "/blog",
      "/conditions",
    ]) {
      expect(html).toContain(`href="${page}"`)
    }
    expect(html).toContain("À propos")
    expect(html).toContain("Conditions &amp; livraison")
  })

  it("rend quatre sections ouvertes, chacune avec un seul titre", async () => {
    const html = await rendreLePied()
    const sections = html.split('data-slot="section-pied-de-page"').slice(1)

    expect(sections).toHaveLength(4)
    expect(html.match(/<details open/g)).toHaveLength(4)
    for (const section of sections) {
      expect(section.match(/<h3[ >]/g)).toHaveLength(1)
    }
    for (const titre of ["La boutique", "Mon compte", "Aide", "La maison"]) {
      expect(html).toContain(`<h3 class="inline">${titre}</h3>`)
    }
  })

  it("nomme le contentinfo et la navigation de ses colonnes", async () => {
    const html = await rendreLePied()

    expect(html).toContain('<footer aria-labelledby="pied-de-page-titre"')
    expect(html).toContain(
      '<h2 id="pied-de-page-titre" class="sr-only">Pied de page</h2>'
    )
    expect(html).toContain('<nav aria-label="Liens du pied de page"')
  })

  it("ne rend aucune destination deux fois", async () => {
    const html = await rendreLePied()
    const destinations = [...html.matchAll(/href="([^"]+)"/g)].map(
      (correspondance) => correspondance[1]!
    )

    expect(new Set(destinations).size).toBe(destinations.length)
  })
})
