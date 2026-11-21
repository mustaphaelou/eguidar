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
  structuresDuCatalogue?: readonly { name: string; slug: string }[]
): Promise<string> {
  const flux = await renderToReadableStream(
    structuresDuCatalogue === undefined ? (
      <StorefrontFooter />
    ) : (
      <StorefrontFooter structures={structuresDuCatalogue} />
    )
  )
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

function sectionDuPiedDePage(html: string, id: string): string {
  return (
    html
      .split('data-slot="section-pied-de-page"')
      .slice(1)
      .find((segment) => segment.includes(`data-section="${id}"`)) ?? ""
  )
}

function attendLePiedDePageSansCatalogue(html: string): void {
  expect(html).not.toContain('data-section="la-boutique"')
  expect(html).not.toContain("La boutique")
  expect(html).not.toContain("Tous les produits")
  expect(html).not.toContain('href="/produits"')
  expect(html).not.toContain('href="/categorie/')
  expect(html.split('data-slot="section-pied-de-page"').slice(1)).toHaveLength(
    3
  )
  expect(html).toContain("Mon compte")
  expect(html).toContain("Aide")
  expect(html).toContain("La maison")
}

describe("StorefrontFooter — les pages de la boutique", () => {
  it("rend les cinq entrées que le Bandeau ne porte plus", async () => {
    const html = await rendreLePied(structures)

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

    const compte = sectionDuPiedDePage(html, "mon-compte")
    for (const [href, libelle] of [
      ["/commandes", "Mes commandes"],
      ["/panier", "Mon panier"],
      ["/profil", "Mon profil"],
    ]) {
      expect(compte).toContain(`href="${href}"`)
      expect(compte).toContain(libelle)
    }

    const maison = sectionDuPiedDePage(html, "la-maison")
    for (const [href, libelle] of [
      ["/a-propos", "À propos"],
      ["/blog", "Blog"],
    ]) {
      expect(maison).toContain(`href="${href}"`)
      expect(maison).toContain(libelle)
    }
    const aide = sectionDuPiedDePage(html, "aide")
    expect(aide).not.toContain('href="/a-propos"')
    expect(aide).not.toContain('href="/blog"')

    const avantLaRangeeLegale = html.split('data-slot="rangée-légale"')[0]!
    for (const href of ["/conditions", "/suppression-donnees"]) {
      expect(avantLaRangeeLegale).not.toContain(`href="${href}"`)
    }
    expect(avantLaRangeeLegale).not.toContain(site.licenseUrl)

    const mentions = rangeeLegale(html)
    expect(mentions).toContain(`href="${site.licenseUrl}"`)
    expect(mentions).toContain("licence MIT")
    expect(mentions).toContain('href="/suppression-donnees"')
    expect(mentions).toContain("Suppression des données")
    expect(mentions).toContain('href="/conditions"')
    expect(mentions).toContain("Conditions &amp; livraison")
  })

  it("rend quatre sections ouvertes, chacune avec un seul titre", async () => {
    const html = await rendreLePied(structures)
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
    const html = await rendreLePied(structures)

    const sommaires = html.match(/<summary[\s\S]*?<\/summary>/g) ?? []
    expect(sommaires).toHaveLength(4)
    for (const sommaire of sommaires) {
      expect(sommaire).toMatch(/<h3[^>]*>[^<]+<\/h3>/)
      expect(sommaire).toMatch(/<svg[^>]*aria-hidden="true"[^>]*>/)
    }
  })

  it("nomme le contentinfo et la navigation de ses colonnes", async () => {
    const html = await rendreLePied(structures)

    expect(html).toContain('<footer aria-labelledby="pied-de-page-titre"')
    expect(html).toMatch(
      /<h2[^>]*id="pied-de-page-titre"[^>]*>Pied de page<\/h2>/
    )
    expect(html).toContain('<nav aria-label="Liens du pied de page"')
  })

  it("ne rend aucune destination deux fois", async () => {
    const html = await rendreLePied(structures)
    const destinations = [...html.matchAll(/href="([^"]+)"/g)].map(
      (correspondance) => correspondance[1]!
    )

    expect(new Set(destinations).size).toBe(destinations.length)
  })

  it("porte le tagline, les deux promesses et le téléphone dans la bande", async () => {
    const bande = bandeAssurance(await rendreLePied(structures))

    attendLeTexte(bande, site.tagline)
    expect(bande).toContain(assurancePiedDePage.paiement)
    expect(bande).toContain(assurancePiedDePage.livraison)
    expect(bande).toContain(assurancePiedDePage.telephone)
    expect(bande).toContain(site.contactPhone)
    expect(bande).toContain(`href="tel:+${site.contactPhoneDigits}"`)
  })

  it("ne rend aucune icône dans la bande d'assurance", async () => {
    const bande = bandeAssurance(await rendreLePied(structures))

    expect(bande).not.toContain("<svg")
  })

  it("ne promet pas la livraison offerte et laisse les conditions à la rangée légale", async () => {
    const html = await rendreLePied(structures)

    expect(html).not.toContain("offerte dès un certain montant")
    expect(bandeAssurance(html)).not.toContain('href="/conditions"')
    expect(rangeeLegale(html)).toContain('href="/conditions"')
  })

  it("ne rend plus le Logo mais garde le tagline", async () => {
    const html = await rendreLePied(structures)

    expect(html).not.toContain("/brand/eguidar-logo.svg")
    attendLeTexte(html, site.tagline)
  })

  it("ouvre le Catalogue par Tous les produits puis par chaque Structure", async () => {
    const html = await rendreLePied(structures)

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
    attendLePiedDePageSansCatalogue(await rendreLePied([]))
  })

  it("se rend sans prop et ne montre alors aucun catalogue", async () => {
    attendLePiedDePageSansCatalogue(await rendreLePied())
  })
})
