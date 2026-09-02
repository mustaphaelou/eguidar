import { describe, expect, it } from "vitest"

import {
  buildBreadcrumbListDonneesStructurees,
  buildFaqPageDonneesStructurees,
  buildOrganizationDonneesStructurees,
  buildProductDonneesStructurees,
  serializeJsonLd,
} from "@/lib/donnees-structurees"
import { faqs } from "@/lib/faq"
import { site } from "@/lib/site"

describe("serializeJsonLd", () => {
  it("serializes an object to JSON", () => {
    const data = { hello: "world", count: 42 }
    expect(serializeJsonLd(data)).toBe('{"hello":"world","count":42}')
  })

  it("escapes < as \\u003c to prevent script injection (XSS)", () => {
    const data = {
      name: "<script>alert('xss')</script>",
      description: "5 < 10 & 10 > 5",
    }
    const serialized = serializeJsonLd(data)
    expect(serialized).not.toContain("<")
    expect(serialized).toContain("\\u003cscript>alert('xss')\\u003c/script>")
    expect(serialized).toContain("5 \\u003c 10 & 10 > 5")
    expect(JSON.parse(serialized)).toEqual(data)
  })
})

describe("buildProductDonneesStructurees", () => {
  it("builds a SchemaProduct with multiple variant offers", () => {
    const product = {
      name: "iPhone 15 Pro",
      brand: "Apple",
      slug: "iphone-15-pro",
      description: "Le dernier iPhone d'Apple.",
      images: [
        "https://cdn.eguidar.com/products/iphone-1.webp",
        "https://cdn.eguidar.com/products/iphone-2.webp",
      ],
      minPrice: 1299900, // 12,999.00 MAD in cents
      variants: [
        {
          sku: "IPH15P-128-TI",
          prix: 1299900,
          stock: 5,
        },
        {
          sku: "IPH15P-256-TI",
          prix: 1449900, // 14,499.00 MAD
          stock: 0,
        },
      ],
    }

    const result = buildProductDonneesStructurees(product)

    expect(result).toEqual({
      "@context": "https://schema.org",
      "@type": "Product",
      name: "iPhone 15 Pro",
      description: "Le dernier iPhone d'Apple.",
      image: [
        "https://cdn.eguidar.com/products/iphone-1.webp",
        "https://cdn.eguidar.com/products/iphone-2.webp",
      ],
      brand: {
        "@type": "Brand",
        name: "Apple",
      },
      url: `${site.url}/produit/iphone-15-pro`,
      offers: [
        {
          "@type": "Offer",
          sku: "IPH15P-128-TI",
          price: 12999,
          priceCurrency: "MAD",
          availability: "https://schema.org/InStock",
          itemCondition: "https://schema.org/NewCondition",
        },
        {
          "@type": "Offer",
          sku: "IPH15P-256-TI",
          price: 14499,
          priceCurrency: "MAD",
          availability: "https://schema.org/OutOfStock",
          itemCondition: "https://schema.org/NewCondition",
        },
      ],
    })
  })

  it("builds a single Offer when product has no variants", () => {
    const product = {
      name: "Câble USB-C",
      brand: "Belkin",
      slug: "cable-usb-c",
      description: "Câble USB-C résistant.",
      images: ["https://cdn.eguidar.com/products/cable.webp"],
      minPrice: 19900, // 199.00 MAD in cents
      variants: [],
    }

    const result = buildProductDonneesStructurees(product)

    expect(result.offers).toEqual([
      {
        "@type": "Offer",
        price: 199,
        priceCurrency: "MAD",
        availability: "https://schema.org/InStock",
        itemCondition: "https://schema.org/NewCondition",
      },
    ])
    expect(result.offers[0].sku).toBeUndefined()
  })

  it("builds a single Offer when variants is undefined", () => {
    const product = {
      name: "Coque Silicone",
      brand: "Apple",
      slug: "coque-silicone",
      images: [],
      minPrice: 4900,
    }

    const result = buildProductDonneesStructurees(product)
    expect(result.offers).toHaveLength(1)
    expect(result.offers[0]).toEqual({
      "@type": "Offer",
      price: 49,
      priceCurrency: "MAD",
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
    })
  })

  it("omits description when empty or not provided", () => {
    const product = {
      name: "Accessoire",
      brand: "Generic",
      slug: "accessoire",
      description: "",
      images: [],
      minPrice: 1000,
    }

    const result = buildProductDonneesStructurees(product)
    expect(result.description).toBeUndefined()
    expect("description" in result).toBe(false)
  })

  it("verifies deliberate exclusions are absent from SchemaProduct and SchemaOffer", () => {
    const product = {
      name: "Écran 4K",
      brand: "Dell",
      slug: "ecran-4k",
      images: [],
      minPrice: 450000,
      variants: [{ sku: "DELL-4K", prix: 450000, stock: 2 }],
    }

    const result = buildProductDonneesStructurees(product) as unknown as Record<
      string,
      unknown
    >
    const offer = (result.offers as unknown as Record<string, unknown>[])[0]

    const excludedProductFields = [
      "aggregateRating",
      "gtin",
      "gtin8",
      "gtin13",
      "gtin14",
      "mpn",
      "shippingDetails",
      "hasMerchantReturnPolicy",
      "priceValidUntil",
      "category",
      "reviews",
      "review",
    ]

    for (const field of excludedProductFields) {
      expect(result[field]).toBeUndefined()
      expect(offer[field]).toBeUndefined()
    }
  })
})

describe("buildBreadcrumbListDonneesStructurees", () => {
  it("builds a BreadcrumbList matching product page crumbs exactly", () => {
    const productCrumbs = [
      { name: "Accueil", href: "/" },
      { name: "Tous nos produits", href: "/produits" },
      { name: "Smartphones", href: "/categorie/smartphones" },
      { name: "iPhone 15 Pro" },
    ]

    const result = buildBreadcrumbListDonneesStructurees(productCrumbs)

    expect(result).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Accueil",
          item: `${site.url}/`,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Tous nos produits",
          item: `${site.url}/produits`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: "Smartphones",
          item: `${site.url}/categorie/smartphones`,
        },
        {
          "@type": "ListItem",
          position: 4,
          name: "iPhone 15 Pro",
        },
      ],
    })
  })

  it("builds a BreadcrumbList matching category page crumbs exactly", () => {
    const categoryCrumbs = [
      { name: "Accueil", href: "/" },
      { name: "Tous nos produits", href: "/produits" },
      { name: "Informatique", href: "/categorie/informatique" },
      { name: "Ordinateurs portables" },
    ]

    const result = buildBreadcrumbListDonneesStructurees(categoryCrumbs)

    expect(result).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Accueil",
          item: `${site.url}/`,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Tous nos produits",
          item: `${site.url}/produits`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: "Informatique",
          item: `${site.url}/categorie/informatique`,
        },
        {
          "@type": "ListItem",
          position: 4,
          name: "Ordinateurs portables",
        },
      ],
    })
  })
})

describe("buildFaqPageDonneesStructurees", () => {
  it("builds a FAQPage matching the shared FAQ entries", () => {
    const result = buildFaqPageDonneesStructurees(faqs)

    expect(result["@context"]).toBe("https://schema.org")
    expect(result["@type"]).toBe("FAQPage")
    expect(result.mainEntity).toHaveLength(10)

    expect(result.mainEntity[0]).toEqual({
      "@type": "Question",
      name: "Comment passer commande ?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Parcourez le catalogue, ajoutez vos produits au panier puis choisissez votre ville de livraison. À l'étape de commande, vérifiez votre adresse et votre numéro de téléphone, puis confirmez. Vous recevrez une confirmation par e-mail avec le détail de votre commande.",
      },
    })
  })
})

describe("buildOrganizationDonneesStructurees", () => {
  it("builds a minimal Organization node with the exact field set", () => {
    const result = buildOrganizationDonneesStructurees()

    expect(result).toEqual({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "eguidar.com",
      legalName: "Eguidar",
      url: "https://eguidar.com",
      contactPoint: {
        "@type": "ContactPoint",
        telephone: "+212 661 234 567",
        email: "contact@eguidar.com",
        contactType: "customer service",
      },
    })
  })

  it("verifies deliberate absence of logo and sameAs", () => {
    const result = buildOrganizationDonneesStructurees() as unknown as Record<
      string,
      unknown
    >
    expect(result.logo).toBeUndefined()
    expect(result.sameAs).toBeUndefined()
    expect("logo" in result).toBe(false)
    expect("sameAs" in result).toBe(false)
  })
})
