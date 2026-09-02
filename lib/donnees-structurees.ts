import type { FaqEntry } from "@/lib/faq"
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

export interface VarianteDonneesStructureesInput {
  sku: string
  prix: number
  stock: number
}

export interface ProductDonneesStructureesInput {
  name: string
  description?: string | null
  images: string[]
  brand: string
  slug: string
  minPrice: number
  variants?: VarianteDonneesStructureesInput[]
}

export interface BreadcrumbDonneesStructureesInput {
  name: string
  href?: string
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
          price: v.prix / 100,
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
            price: product.minPrice / 100,
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

export function buildBreadcrumbListDonneesStructurees(
  crumbs: readonly BreadcrumbDonneesStructureesInput[]
): SchemaBreadcrumbList {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => {
      const item: SchemaBreadcrumbListItem = {
        "@type": "ListItem",
        position: index + 1,
        name: crumb.name,
      }
      if (crumb.href) {
        item.item = crumb.href.startsWith("http")
          ? crumb.href
          : `${site.url}${crumb.href}`
      }
      return item
    }),
  }
}

export function buildFaqPageDonneesStructurees(
  faqEntries: readonly FaqEntry[]
): SchemaFaqPage {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqEntries.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  }
}

export function buildOrganizationDonneesStructurees(): SchemaOrganization {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.name,
    legalName: site.legalName,
    url: site.url,
    contactPoint: {
      "@type": "ContactPoint",
      telephone: site.contactPhone,
      email: site.contactEmail,
      contactType: "customer service",
    },
  }
}
