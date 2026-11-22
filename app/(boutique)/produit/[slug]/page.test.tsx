import { renderToReadableStream } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { getProductPageDataMock } = vi.hoisted(() => ({
  getProductPageDataMock: vi.fn(),
}))

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

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span data-image-src={src} aria-label={alt} />
  ),
}))

vi.mock("@/lib/use-cases/storefront", () => ({
  getProductPageData: getProductPageDataMock,
  parametresDesProduits: vi.fn(async () => []),
}))

vi.mock("@/app/(boutique)/actions", () => ({
  ajouterArticleAuPanierAction: vi.fn(),
  modifierQuantiteArticlePanierAction: vi.fn(),
  retirerArticleDuPanierAction: vi.fn(),
}))

import type { ProductDetailData } from "@/lib/use-cases/storefront"

import ProduitPage, { generateMetadata } from "./page"

const PRIX_DES_VARIANTES = 3_688_790
const PRIX_DES_VARIANTES_AFFICHE = "36.887,90\u00a0MAD"
const DESCRIPTION_ECRITE =
  "Une description écrite par la maison.\nUn second paragraphe conservé."

function ficheDuProduit(
  surcharges: Partial<ProductDetailData> = {}
): ProductDetailData {
  return {
    id: "produit-18-pro-max",
    name: "iPhone 18 Pro Max",
    slug: "iphone-18-pro-max",
    brand: "Apple",
    description: "",
    specs: {},
    images: [],
    minPrice: PRIX_DES_VARIANTES,
    freeShipping: true,
    category: {
      id: "categorie-smartphones",
      name: "Smartphones",
      slug: "smartphones",
    },
    categoryChain: [{ name: "Smartphones", slug: "smartphones" }],
    variants: [
      {
        id: "variante-256",
        name: "256 Go",
        sku: "SKU-256",
        prix: PRIX_DES_VARIANTES,
        stock: 0,
      },
      {
        id: "variante-512",
        name: "512 Go",
        sku: "SKU-512",
        prix: PRIX_DES_VARIANTES,
        stock: 1,
      },
    ],
    related: [],
    ...surcharges,
  }
}

async function rendre(
  fiche: ProductDetailData = ficheDuProduit()
): Promise<string> {
  getProductPageDataMock.mockResolvedValue(fiche)
  const flux = await renderToReadableStream(
    <ProduitPage params={Promise.resolve({ slug: fiche.slug })} />
  )
  return new Response(flux).text()
}

function ligneDeSpecification(html: string, etiquette: string): string {
  const motif = new RegExp(`<dt[^>]*>${etiquette}</dt>\\s*<dd[^>]*>(.*?)</dd>`)
  return html.match(motif)?.[1] ?? ""
}

function donneesStructureesDuProduit(html: string): string {
  return (
    html.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
    )?.[1] ?? ""
  )
}

describe("la fiche Produit", () => {
  beforeEach(() => {
    getProductPageDataMock.mockReset()
  })

  it("rend la Description écrite et les Caractéristiques d'un Produit", async () => {
    const html = await rendre(
      ficheDuProduit({ description: DESCRIPTION_ECRITE })
    )

    expect(html).toMatch(/>Description</)
    expect(html).toMatch(/>Caractéristiques</)
    expect(html).toContain(DESCRIPTION_ECRITE)
    expect(html).not.toContain("est un produit de notre rayon")
    expect(html).not.toContain("Il est disponible en 2 déclinaisons")
    expect(html).not.toContain("Son prix commence à")
    expect(html).not.toContain("actuellement en rupture de stock")
    expect(html).not.toContain("La livraison est offerte")
  })

  it("ne rend pas la section Description d'un Produit sans texte, mais garde les Caractéristiques", async () => {
    const html = await rendre()

    expect(html).not.toMatch(/>Description</)
    expect(html).toMatch(/>Caractéristiques</)
    expect(ligneDeSpecification(html, "Marque")).toBe("Apple")
    expect(html).not.toContain("est un produit de notre rayon")
  })

  it("remplit les Caractéristiques avec les faits de base du Produit", async () => {
    const html = await rendre()

    expect(ligneDeSpecification(html, "Marque")).toBe("Apple")
    expect(ligneDeSpecification(html, "Catégorie")).toBe("Smartphones")
    expect(ligneDeSpecification(html, "Déclinaisons")).toBe("256 Go · 512 Go")
    expect(ligneDeSpecification(html, "Disponibilité")).toBe("En stock")
    expect(ligneDeSpecification(html, "Livraison")).toBe("Offerte")
  })

  it("garde la Description écrite et les spécifications du Catalogue", async () => {
    const html = await rendre(
      ficheDuProduit({
        description: "Une vraie description du Produit.",
        specs: { Écran: "6,9 pouces", Marque: "Maison" },
      })
    )

    expect(html).toContain("Une vraie description du Produit.")
    expect(html).not.toContain("de notre rayon")
    expect(html).not.toContain("Il est disponible en 2 déclinaisons")
    expect(html).toContain("Écran")
    expect(html).toContain("6,9 pouces")
    expect(ligneDeSpecification(html, "Marque")).toBe("Maison")
  })

  it("annonce la rupture quand toute la gamme est épuisée", async () => {
    const html = await rendre(
      ficheDuProduit({
        variants: [
          {
            id: "variante-256",
            name: "256 Go",
            sku: "SKU-256",
            prix: PRIX_DES_VARIANTES,
            stock: 0,
          },
          {
            id: "variante-512",
            name: "512 Go",
            sku: "SKU-512",
            prix: PRIX_DES_VARIANTES,
            stock: 0,
          },
        ],
      })
    )

    expect(html).toContain("Produit indisponible")
    expect(ligneDeSpecification(html, "Disponibilité")).toBe("Rupture de stock")
  })

  it("cite la Description du Produit dans la métadonnée et l'aperçu de partage", async () => {
    getProductPageDataMock.mockResolvedValue(
      ficheDuProduit({
        description: "  Une   description\n\nécrite par le marchand.  ",
      })
    )

    const metadonnee = await generateMetadata({
      params: Promise.resolve({ slug: "iphone-18-pro-max" }),
    })

    expect(metadonnee.title).toBe("iPhone 18 Pro Max")
    expect(metadonnee.description).toBe(
      "Une description écrite par le marchand."
    )
    expect(metadonnee.openGraph?.description).toBe(
      "Une description écrite par le marchand."
    )
    expect(metadonnee.alternates?.canonical).toBe("/produit/iphone-18-pro-max")
  })

  it("raccourcit la Description de la métadonnée sans la toucher sur la fiche", async () => {
    const description = Array.from(
      { length: 60 },
      (_, index) => `mot${index.toString().padStart(2, "0")}`
    ).join(" ")
    const fiche = ficheDuProduit({ description })

    getProductPageDataMock.mockResolvedValue(fiche)

    const metadonnee = await generateMetadata({
      params: Promise.resolve({ slug: "iphone-18-pro-max" }),
    })

    expect(String(metadonnee.description).endsWith("…")).toBe(true)
    expect(String(metadonnee.description).length).toBeLessThanOrEqual(156)
    expect(metadonnee.openGraph?.description).toBe(metadonnee.description)

    const html = await rendre(fiche)
    expect(html).toContain(description)
  })

  it("ne promet ni TVA, ni paiement, ni prix dans la métadonnée", async () => {
    getProductPageDataMock.mockResolvedValue(
      ficheDuProduit({ description: "Une description sans promesse." })
    )

    const metadonnee = await generateMetadata({
      params: Promise.resolve({ slug: "iphone-18-pro-max" }),
    })

    const texte = `${String(metadonnee.description)} ${String(metadonnee.openGraph?.description)}`
    expect(texte).not.toContain("TVA")
    expect(texte).not.toContain("paiement")
    expect(texte).not.toContain("Prix")
    expect(texte).not.toContain(PRIX_DES_VARIANTES_AFFICHE)
  })

  it("ne publie aucune Description quand le Produit n'en a pas", async () => {
    getProductPageDataMock.mockResolvedValue(
      ficheDuProduit({ description: "  \n  " })
    )

    const metadonnee = await generateMetadata({
      params: Promise.resolve({ slug: "iphone-18-pro-max" }),
    })

    expect(metadonnee.description).toBeUndefined()
    expect(metadonnee.openGraph?.description).toBeUndefined()
  })

  it("sert les Données structurées avec la Description écrite et le prix des Variantes", async () => {
    const html = await rendre(
      ficheDuProduit({ description: "Une description écrite pour la fiche." })
    )

    const jsonLd = donneesStructureesDuProduit(html)
    expect(jsonLd).toContain(
      '"description":"Une description écrite pour la fiche."'
    )
    expect(jsonLd).toContain('"price":36887.9')
    expect(jsonLd).not.toContain('"price":17999.9')
  })

  it("omet la description des Données structurées quand la Description est vide", async () => {
    const html = await rendre()

    expect(donneesStructureesDuProduit(html)).not.toContain('"description"')
  })
})
