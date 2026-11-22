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
const PRIX_DE_BASE_AFFICHE = "17.999,90\u00a0MAD"

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

describe("la fiche Produit", () => {
  beforeEach(() => {
    getProductPageDataMock.mockReset()
  })

  it("rend la Description et les Caractéristiques d'un Produit sans texte ni spécifications", async () => {
    const html = await rendre()

    expect(html).toMatch(/>Description</)
    expect(html).toMatch(/>Caractéristiques</)
    expect(html).toContain(
      "iPhone 18 Pro Max (Apple) est un produit de notre rayon Smartphones."
    )
    expect(html).toContain(
      "Il est disponible en 2 déclinaisons : 256 Go et 512 Go."
    )
    expect(html).toContain("Son prix commence à 36.887,90")
    expect(html).toContain("Il est disponible dès maintenant.")
    expect(html).toContain("La livraison est offerte, paiement à la livraison.")
  })

  it("remplit les Caractéristiques avec les faits de base du Produit", async () => {
    const html = await rendre()

    expect(ligneDeSpecification(html, "Marque")).toBe("Apple")
    expect(ligneDeSpecification(html, "Catégorie")).toBe("Smartphones")
    expect(ligneDeSpecification(html, "Déclinaisons")).toBe("256 Go · 512 Go")
    expect(ligneDeSpecification(html, "Disponibilité")).toBe("En stock")
    expect(ligneDeSpecification(html, "Livraison")).toBe("Offerte")
  })

  it("garde le texte et les spécifications écrits devant les faits de repli", async () => {
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
    expect(html).toContain("Rupture de stock")
    expect(html).toContain("Il est actuellement en rupture de stock.")
  })

  it("annonce le prix des Variantes dans la métadonnée de partage", async () => {
    getProductPageDataMock.mockResolvedValue(ficheDuProduit())

    const metadonnee = await generateMetadata({
      params: Promise.resolve({ slug: "iphone-18-pro-max" }),
    })

    expect(metadonnee.title).toBe("iPhone 18 Pro Max")
    expect(String(metadonnee.description)).toContain(PRIX_DES_VARIANTES_AFFICHE)
    expect(String(metadonnee.description)).not.toContain(PRIX_DE_BASE_AFFICHE)
    expect(metadonnee.alternates?.canonical).toBe("/produit/iphone-18-pro-max")
  })

  it("sert les Données structurées avec la description de repli et le prix des Variantes", async () => {
    const html = await rendre()

    expect(html).toContain(
      '"description":"iPhone 18 Pro Max (Apple) est un produit de notre rayon Smartphones.'
    )
    expect(html).toContain('"price":36887.9')
    expect(html).not.toContain('"price":17999.9')
  })
})
