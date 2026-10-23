import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { AppleBreadcrumb } from "@/components/storefront/apple-breadcrumb"
import { CarteProduit } from "@/components/storefront/carte-produit"
import { Button } from "@/components/ui/button"
import {
  buildBreadcrumbListDonneesStructurees,
  serializeJsonLd,
} from "@/lib/donnees-structurees"
import { pageMetadata } from "@/lib/metadata"
import {
  getCategoryPageData,
  parametresDesCategories,
} from "@/lib/use-cases/storefront"

export async function generateStaticParams() {
  return parametresDesCategories()
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const data = await getCategoryPageData(slug)
  if (!data) return { title: "Catégorie introuvable" }
  return pageMetadata({
    title: data.category.name,
    description: `Achetez ${data.category.name.toLowerCase()} au meilleur prix au Maroc. TVA 20% incluse, paiement à la livraison.`,
    path: `/categorie/${slug}`,
  })
}

export default function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <div className="flex flex-col">
      <Suspense fallback={<CategorySkeleton />}>
        <CategoryContent paramsPromise={params} />
      </Suspense>
    </div>
  )
}

async function CategoryContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ slug: string }>
}) {
  const { slug } = await paramsPromise
  const data = await getCategoryPageData(slug)
  if (!data) notFound()

  const chain = data.categoryChain
  const crumbs = [
    { name: "Accueil", href: "/" },
    { name: "Tous nos produits", href: "/produits" },
    ...chain.map((category, index) =>
      index === chain.length - 1
        ? { name: category.name }
        : { name: category.name, href: `/categorie/${category.slug}` }
    ),
  ]

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            buildBreadcrumbListDonneesStructurees(crumbs)
          ),
        }}
      />
      <AppleBreadcrumb crumbs={crumbs} />

      <section className="bg-muted">
        <div className="mx-auto max-w-[980px] px-4 py-12 text-center sm:px-6 sm:py-16">
          <p className="text-sm leading-[1.2858] tracking-[-0.016em] text-muted-foreground">
            Catalogue
          </p>
          <h1 className="mt-2 text-[28px] leading-[1.1] font-semibold tracking-[-0.005em] sm:text-[32px] lg:text-[40px]">
            {data.category.name}
          </h1>
          <p className="mt-2 text-body leading-body tracking-[-0.022em] text-foreground/70">
            {data.products.length} produit{data.products.length > 1 ? "s" : ""}
          </p>
        </div>
      </section>

      {data.children.length > 0 ? (
        <div className="mx-auto flex max-w-[980px] flex-wrap items-center justify-center gap-2 px-4 pt-8 sm:px-6">
          {data.children.map((child) => (
            <Link
              key={child.id}
              href={`/categorie/${child.slug}`}
              className="rounded-full border border-foreground/15 px-4 py-1.5 text-[12px] leading-[1.3334] tracking-[-0.01em] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
            >
              {child.name}
            </Link>
          ))}
        </div>
      ) : null}

      {data.products.length > 0 ? (
        <div className="mx-auto grid w-full max-w-7xl grid-cols-2 gap-x-4 gap-y-8 px-4 py-10 sm:grid-cols-3 sm:px-6 lg:grid-cols-4">
          {data.products.map((product) => (
            <CarteProduit key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <section className="bg-muted">
          <div className="mx-auto max-w-[980px] px-4 py-16 text-center sm:px-6">
            <p className="text-body leading-body tracking-[-0.022em] text-foreground/70">
              Aucun produit dans cette catégorie pour le moment.
            </p>
            <Button
              render={<Link href="/produits" />}
              className="mt-5 h-9 rounded-full px-4 text-[14px]"
            >
              Tous nos produits
            </Button>
          </div>
        </section>
      )}
    </>
  )
}

function CategorySkeleton() {
  return (
    <>
      <div className="h-11 animate-pulse bg-muted" />
      <div className="flex flex-col gap-6 py-10">
        <div className="mx-auto h-64 w-full max-w-[980px] animate-pulse rounded-2xl bg-muted" />
        <div className="mx-auto flex w-full max-w-[980px] flex-wrap justify-center gap-2 px-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-8 w-24 animate-pulse rounded-full bg-muted"
            />
          ))}
        </div>
        <div className="mx-auto grid w-full max-w-7xl grid-cols-2 gap-4 px-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      </div>
    </>
  )
}
