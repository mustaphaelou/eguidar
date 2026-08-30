import { site } from "@/lib/site"

export interface SchemaBrand {
  "@type": "Brand"
  name: string
}

export interface SchemaOffer {
  "@type": "Offer"
  sku?: string
  price: number
  priceCurrency: "MAD"
  availability: "https://schema.org/InStock" | "https://schema.org/OutOfStock"
  itemCondition: "https://schema.org/NewCondition"
}

export interface SchemaProduct {
  "@context": "https://schema.org"
  "@type": "Product"
  name: string
  description?: string
  image: string[]
  brand: SchemaBrand
  url: string
  offers: SchemaOffer[]
}

export interface SchemaBreadcrumbListItem {
  "@type": "ListItem"
  position: number
  name: string
  item?: string
}

export interface SchemaBreadcrumbList {
  "@context": "https://schema.org"
  "@type": "BreadcrumbList"
  itemListElement: SchemaBreadcrumbListItem[]
}

export interface SchemaQuestion {
  "@type": "Question"
  name: string
  acceptedAnswer: {
    "@type": "Answer"
    text: string
  }
}

export interface SchemaFaqPage {
  "@context": "https://schema.org"
  "@type": "FAQPage"
  mainEntity: SchemaQuestion[]
}

export interface SchemaContactPoint {
  "@type": "ContactPoint"
  telephone: string
  email: string
  contactType: "customer service"
}

export interface SchemaOrganization {
  "@context": "https://schema.org"
  "@type": "Organization"
  name: string
  legalName: string
  url: string
  contactPoint: SchemaContactPoint
}

export interface ProductVariantStructureesInput {
  sku: string
  priceDelta: number
  stock: number
}

export interface ProductDonneesStructureesInput {
  name: string
  description?: string | null
  images: string[]
  brand: string
  slug: string
  price: number
  variants?: ProductVariantStructureesInput[]
}

export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c")
}

export function buildProductDonneesStructurees(
  product: ProductDonneesStructureesInput
): SchemaProduct {
  const url = `${site.url}/produit/${product.slug}`
  const offers: SchemaOffer[] =
    product.variants && product.variants.length > 0
      ? product.variants.map((v) => ({
          "@type": "Offer",
          sku: v.sku,
          price: (product.price + v.priceDelta) / 100,
          priceCurrency: "MAD",
          availability:
            v.stock > 0
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock",
          itemCondition: "https://schema.org/NewCondition",
        }))
      : [
          {
            "@type": "Offer",
            price: product.price / 100,
            priceCurrency: "MAD",
            availability: "https://schema.org/InStock",
            itemCondition: "https://schema.org/NewCondition",
          },
        ]

  const schemaProduct: SchemaProduct = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    image: product.images,
    brand: {
      "@type": "Brand",
      name: product.brand,
    },
    url,
    offers,
  }

  if (product.description && product.description.trim().length > 0) {
    schemaProduct.description = product.description
  }

  return schemaProduct
}
