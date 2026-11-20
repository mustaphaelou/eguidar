import { renderToReadableStream } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { assurancePiedDePage, site } from "@/lib/site"

import { StorefrontFooter } from "./footer"

const structures = [
  { name: "Smartphones", slug: "smartphones" },
  { name: "Ordinateurs & Tablettes", slug: "ordinateurs-tablettes" },
  { name: "Audio & Hi-Fi", slug: "audio-hifi" },
  { name: "TV & Home Cinema", slug: "tv-home-cinema" },
  { name: "Gaming", slug: "gaming" },
  { name: "Accessoires", slug: "accessoires" },
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

async function rendreLePiedSansProp(): Promise<string> {
  const flux = await renderToReadableStream(<StorefrontFooter />)
  await flux.allReady
  return new Response(flux).text()
}

function bandeAssurance(html: string): string {
  return (
    html
      .split('data-slot="bande-assurance"')[1]
      ?.split('data-slot="rangée-légale"')[0] ?? ""
  )
}

function rangeeLegale(html: string): string {
  return html.split('data-slot="rangée-légale"')[1] ?? ""
}

function attendLeTexte(html: string, texte: string): void {
  for (const segment of texte.split("'")) {
    expect(html).toContain(segment)
  }
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
      expect(html).toMatch(new RegExp(`<h3[^>]*>${titre}</h3>`))
    }
  })

  it("donne à chaque section un vrai titre et un chevron signalé", async () => {
    const html = await rendreLePied()

    const chevrons =
      html.match(/<[a-z]+[^>]*data-slot="chevron-pied-de-page"[^>]*>/g) ?? []
    expect(chevrons).toHaveLength(4)
    for (const chevron of chevrons) {
      expect(chevron).toContain('aria-hidden="true"')
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

  it("porte le tagline, les deux promesses et le téléphone dans la bande", async () => {
    const bande = bandeAssurance(await rendreLePied())

    attendLeTexte(bande, site.tagline)
    expect(bande).toContain(assurancePiedDePage.paiement)
    expect(bande).toContain(assurancePiedDePage.livraison)
    expect(bande).toContain(assurancePiedDePage.telephone)
    expect(bande).toContain(site.contactPhone)
    expect(bande).toContain(`href="tel:+${site.contactPhoneDigits}"`)
  })

  it("ne promet pas la livraison offerte et laisse les conditions à la rangée légale", async () => {
    const html = await rendreLePied()

    expect(html).not.toContain("offerte dès un certain montant")
    expect(bandeAssurance(html)).not.toContain('href="/conditions"')
    expect(rangeeLegale(html)).toContain('href="/conditions"')
  })

  it("ne rend plus le Logo mais garde le tagline", async () => {
    const html = await rendreLePied()

    expect(html).not.toContain("/brand/eguidar-logo.svg")
    attendLeTexte(html, site.tagline)
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
      expect(html).toContain(structure.name.replace(/&/g, "&amp;"))
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

  it("se rend sans prop et ne montre alors aucun catalogue", async () => {
    const html = await rendreLePiedSansProp()

    expect(html).not.toContain('data-section="la-boutique"')
    expect(html).not.toContain("La boutique")
    expect(html).not.toContain("Tous les produits")
    expect(html).not.toContain('href="/produits"')
    expect(html).not.toContain('href="/categorie/')
    expect(
      html.split('data-slot="section-pied-de-page"').slice(1)
    ).toHaveLength(3)
    expect(html).toContain("Mon compte")
    expect(html).toContain("Aide")
    expect(html).toContain("La maison")
  })
})
