import { renderToReadableStream } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { StorefrontFooter } from "./footer"

const structures = [
  { name: "Smartphones", slug: "smartphones" },
  { name: "Gaming", slug: "gaming" },
]

async function rendreLePied(
  structuresDuCatalogue: readonly { name: string; slug: string }[] = structures
): Promise<string> {
  const flux = await renderToReadableStream(
    <StorefrontFooter structures={structuresDuCatalogue} />
  )
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

  it("ouvre le Catalogue par Tous les produits puis par chaque Structure", async () => {
    const html = await rendreLePied()

    expect(html).toContain('data-section="la-boutique"')
    expect(html).toContain('href="/produits"')
    expect(html).toContain("Tous les produits")

    const positions = [
      html.indexOf('href="/produits"'),
      ...structures.map((structure) =>
        html.indexOf(`href="/categorie/${structure.slug}"`)
      ),
    ]
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))

    for (const structure of structures) {
      expect(html).toContain(structure.name)
    }
  })

  it("ne rend ni la section ni la colonne sans Structure", async () => {
    const html = await rendreLePied([])

    expect(html).not.toContain('data-section="la-boutique"')
    expect(html).not.toContain("La boutique")
    expect(html).not.toContain("Tous les produits")
    expect(html).not.toContain('href="/produits"')
    expect(html).not.toContain('href="/categorie/')
    expect(
      html.split('data-slot="section-pied-de-page"').slice(1)
    ).toHaveLength(3)
  })
})
