import { notFound } from "next/navigation"
import { Suspense } from "react"

import { AppleBreadcrumb } from "@/components/storefront/apple-breadcrumb"
import { CarteProduit } from "@/components/storefront/carte-produit"
import { ProductBuyBox } from "@/components/storefront/product-buy-box"
import { ProductGallery } from "@/components/storefront/product-gallery"
import { urlProduit } from "@/lib/carte-produit"
import { CONTENEUR_BOUTIQUE } from "@/lib/conteneur-boutique"
import {
  buildBreadcrumbListDonneesStructurees,
  buildProductDonneesStructurees,
  serializeJsonLd,
} from "@/lib/donnees-structurees"
import {
  specificationsAffichees,
  type FaitsDeFicheProduit,
} from "@/lib/fiche-produit"
import { extraitDescription, pageMetadata } from "@/lib/metadata"
import {
  getProductPageData,
  parametresDesProduits,
} from "@/lib/use-cases/storefront"
import { cn } from "@/lib/utils"

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
    description: extraitDescription(data.description),
    path: urlProduit(data.slug),
    images: data.images[0] ? [data.images[0].url] : undefined,
  })
}

export default function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <div className="flex flex-col pbe-24 lg:pbe-0">
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

  const faits: FaitsDeFicheProduit = {
    ...data,
    categoryName: data.category?.name ?? null,
  }
  const description = data.description.trim()
  const specEntries = specificationsAffichees(faits)
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
          __html: serializeJsonLd(
            buildProductDonneesStructurees({
              name: data.name,
              description,
              images: data.images.map((image) => image.url),
              brand: data.brand,
              slug: data.slug,
              minPrice: data.minPrice,
              variants: data.variants,
            })
          ),
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

      <section
        className={cn(
          CONTENEUR_BOUTIQUE,
          "pbs-[clamp(2rem,1.5rem+2vw,2.75rem)] pbe-[clamp(2rem,1.5rem+2vw,3rem)]"
        )}
      >
        <div className="grid grid-cols-1 gap-y-9 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-12 lg:gap-y-6">
          <div className="flex flex-col gap-1.5 lg:col-start-2 lg:row-start-1">
            <p className="text-sm leading-[1.2858] font-medium tracking-[-0.016em] text-muted-foreground">
              {data.brand}
            </p>
            <h1 className="text-titre-produit font-semibold">{data.name}</h1>
          </div>

          <div className="lg:sticky lg:inset-bs-16 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:self-start">
            <ProductGallery images={data.images} name={data.name} />
          </div>

          <div className="lg:col-start-2 lg:row-start-2">
            <ProductBuyBox
              minPrice={data.minPrice}
              variants={data.variants}
              freeShipping={data.freeShipping}
            />
          </div>
        </div>
      </section>

      {description.length > 0 ? (
        <section
          className={cn(
            CONTENEUR_BOUTIQUE,
            "border-bs border-hairline py-[clamp(2rem,1.5rem+2vw,3rem)]"
          )}
        >
          <div className="flex flex-col gap-4">
            <h2 className="text-titre-section font-semibold">Description</h2>
            <p className="max-w-[68ch] text-body leading-body tracking-[-0.022em] whitespace-pre-line text-muted-foreground">
              {description}
            </p>
          </div>
        </section>
      ) : null}

      <section
        className={cn(
          CONTENEUR_BOUTIQUE,
          "border-bs border-hairline py-[clamp(2rem,1.5rem+2vw,3rem)]"
        )}
      >
        <div className="flex flex-col gap-4">
          <h2 className="text-titre-section font-semibold">Caractéristiques</h2>
          <dl className="max-w-[68ch] divide-y divide-hairline">
            {specEntries.map(([label, value]) => (
              <div
                key={label}
                className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1 py-3.5"
              >
                <dt className="text-sm leading-[1.4286] font-medium tracking-[-0.016em] text-foreground">
                  {label}
                </dt>
                <dd className="text-end text-sm leading-[1.4286] tracking-[-0.016em] text-muted-foreground tabular-nums">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {data.related.length > 0 ? (
        <section className="mbs-6 border-bs border-hairline bg-muted [--surface-image:var(--background)]">
          <div
            className={cn(
              CONTENEUR_BOUTIQUE,
              "flex flex-col gap-8 py-[clamp(2.5rem,2rem+2vw,3.5rem)]"
            )}
          >
            <h2 className="text-center text-titre-section font-semibold">
              Vous aimerez aussi
            </h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,10rem),1fr))] gap-x-[clamp(0.75rem,2vw,1.25rem)] gap-y-8">
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
      <div className="animate-pulse bg-muted block-11" />
      <div
        className={cn(
          CONTENEUR_BOUTIQUE,
          "flex flex-col gap-10 py-[clamp(1.5rem,1rem+2vw,2.5rem)]"
        )}
      >
        <div className="grid grid-cols-1 gap-y-7 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)] lg:grid-rows-[auto_1fr] lg:gap-x-12 lg:gap-y-6">
          <div className="flex flex-col gap-2 lg:col-start-2 lg:row-start-1">
            <div className="animate-pulse rounded-full bg-muted block-4 inline-24" />
            <div className="animate-pulse rounded-full bg-muted block-10 inline-3/4" />
          </div>
          <div className="aspect-square animate-pulse rounded-2xl bg-muted lg:col-start-1 lg:row-span-2 lg:row-start-1" />
          <div className="flex flex-col gap-4 lg:col-start-2 lg:row-start-2">
            <div className="animate-pulse rounded-full bg-muted block-11 inline-full max-inline-64" />
            <div className="animate-pulse rounded-full bg-muted block-8 inline-40" />
            <div className="animate-pulse rounded-full bg-muted block-4 inline-64" />
            <div className="animate-pulse rounded-full bg-muted block-12 inline-full" />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="animate-pulse rounded-full bg-muted block-8 inline-48" />
          <div className="animate-pulse rounded-full bg-muted block-4 inline-full" />
          <div className="animate-pulse rounded-full bg-muted block-4 inline-2/3" />
        </div>
      </div>
    </>
  )
}
