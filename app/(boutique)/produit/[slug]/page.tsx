import { notFound } from "next/navigation"
import { Suspense } from "react"

import { AppleBreadcrumb } from "@/components/storefront/apple-breadcrumb"
import { CarteProduit } from "@/components/storefront/carte-produit"
import { ProductBuyBox } from "@/components/storefront/product-buy-box"
import { ProductGallery } from "@/components/storefront/product-gallery"
import { urlProduit } from "@/lib/carte-produit"
import {
  buildBreadcrumbListDonneesStructurees,
  buildProductDonneesStructurees,
  serializeJsonLd,
} from "@/lib/donnees-structurees"
import { pageMetadata } from "@/lib/metadata"
import { formatPrice } from "@/lib/money"
import {
  getProductPageData,
  parametresDesProduits,
} from "@/lib/use-cases/storefront"

export async function generateStaticParams() {
  return parametresDesProduits()
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const data = await getProductPageData(slug)
  if (!data) return { title: "Produit introuvable" }
  return pageMetadata({
    title: data.name,
    description: `${data.brand} ${data.name}. Prix ${formatPrice(data.minPrice)} (TVA 20% incluse), paiement à la livraison.`,
    path: urlProduit(data.slug),
    images: data.images[0] ? [data.images[0]] : undefined,
  })
}

export default function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <div className="flex flex-col pb-24 lg:pb-0">
      <Suspense fallback={<ProductSkeleton />}>
        <ProductContent paramsPromise={params} />
      </Suspense>
    </div>
  )
}

async function ProductContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ slug: string }>
}) {
  const { slug } = await paramsPromise
  const data = await getProductPageData(slug)
  if (!data) notFound()

  const specEntries = Object.entries(data.specs)
  const crumbs = [
    { name: "Accueil", href: "/" },
    { name: "Tous nos produits", href: "/produits" },
    ...data.categoryChain.map((category) => ({
      name: category.name,
      href: `/categorie/${category.slug}`,
    })),
    { name: data.name },
  ]

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(buildProductDonneesStructurees(data)),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            buildBreadcrumbListDonneesStructurees(crumbs)
          ),
        }}
      />
      <AppleBreadcrumb crumbs={crumbs} />

      <div className="mx-auto w-full max-w-[980px] px-4 pt-8 pb-4 sm:px-6">
        <div className="max-w-[520px]">
          <p className="text-sm leading-[1.2858] tracking-[-0.016em] text-muted-foreground">
            {data.brand}
          </p>
          <h1 className="mt-1 text-[28px] leading-[1.1] font-semibold tracking-[-0.005em] sm:text-[32px] lg:text-[40px]">
            {data.name}
          </h1>
        </div>

        <div className="mt-8 grid gap-10 lg:grid-cols-2 lg:gap-14">
          <ProductGallery images={data.images} name={data.name} />
          <div className="lg:pt-3">
            <ProductBuyBox
              minPrice={data.minPrice}
              variants={data.variants}
              freeShipping={data.freeShipping}
            />
          </div>
        </div>
      </div>

      {data.description ? (
        <section className="mx-auto w-full max-w-[980px] px-4 py-6 sm:px-6">
          <h2 className="text-[24px] leading-[1.125] font-semibold tracking-[0.002em] sm:text-[28px] lg:text-[32px]">
            Description
          </h2>
          <p className="mt-4 max-w-[70ch] text-body leading-body tracking-[-0.022em] whitespace-pre-line text-muted-foreground">
            {data.description}
          </p>
        </section>
      ) : null}

      {specEntries.length > 0 ? (
        <section className="mx-auto w-full max-w-[980px] px-4 py-6 sm:px-6">
          <h2 className="text-[24px] leading-[1.125] font-semibold tracking-[0.002em] sm:text-[28px] lg:text-[32px]">
            Caractéristiques
          </h2>
          <dl className="mt-4 max-w-[70ch] divide-y divide-foreground/10">
            {specEntries.map(([label, value]) => (
              <div
                key={label}
                className="flex items-baseline justify-between gap-8 py-3"
              >
                <dt className="text-[14px] leading-[1.4286] font-medium tracking-[-0.016em]">
                  {label}
                </dt>
                <dd className="text-right text-[14px] leading-[1.4286] tracking-[-0.016em] text-muted-foreground">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {data.related.length > 0 ? (
        <section className="mt-10 bg-muted">
          <div className="mx-auto max-w-[980px] px-4 py-12 sm:px-6">
            <h2 className="text-center text-[24px] leading-[1.125] font-semibold tracking-[0.002em] sm:text-[28px] lg:text-[32px]">
              Vous aimerez aussi
            </h2>
            <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-4">
              {data.related.map((product) => (
                <CarteProduit key={product.id} product={product} />
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </>
  )
}

function ProductSkeleton() {
  return (
    <>
      <div className="h-11 animate-pulse bg-muted" />
      <div className="mx-auto flex w-full max-w-[980px] flex-col gap-10 px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-2">
          <div className="h-4 w-24 animate-pulse rounded-full bg-muted" />
          <div className="h-10 w-3/4 animate-pulse rounded-full bg-muted" />
        </div>
        <div className="grid gap-10 lg:grid-cols-2">
          <div className="aspect-square animate-pulse rounded-2xl bg-muted" />
          <div className="flex flex-col gap-4">
            <div className="h-9 w-full max-w-64 animate-pulse rounded-full bg-muted" />
            <div className="h-8 w-40 animate-pulse rounded-full bg-muted" />
            <div className="h-4 w-64 animate-pulse rounded-full bg-muted" />
            <div className="h-9 w-full max-w-64 animate-pulse rounded-full bg-muted" />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="h-8 w-48 animate-pulse rounded-full bg-muted" />
          <div className="h-4 w-full animate-pulse rounded-full bg-muted" />
          <div className="h-4 w-2/3 animate-pulse rounded-full bg-muted" />
        </div>
      </div>
    </>
  )
}
