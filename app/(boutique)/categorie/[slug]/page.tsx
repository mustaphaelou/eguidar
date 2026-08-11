import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { ProductCardItem } from "@/components/storefront/product-card"
import { getCategoryPageData } from "@/lib/use-cases/storefront"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const data = await getCategoryPageData(slug)
  if (!data) return { title: "Catégorie introuvable" }
  return {
    title: data.category.name,
    description: `Achetez ${data.category.name.toLowerCase()} au meilleur prix au Maroc. TVA 20% incluse, paiement à la livraison.`,
  }
}

export default function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
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

  return (
    <>
      <nav aria-label="Fil d'Ariane" className="mb-4 text-sm text-muted-foreground">
        <ol className="flex items-center gap-1.5">
          <li>
            <Link href="/" className="transition-colors hover:text-foreground">
              Accueil
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li className="text-foreground">{data.category.name}</li>
        </ol>
      </nav>

      <div className="mb-6 flex items-center gap-4">
        {data.category.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.category.image}
            alt=""
            className="size-16 rounded-2xl border object-cover"
          />
        ) : null}
        <div>
          <h1 className="text-2xl font-bold">{data.category.name}</h1>
          <p className="text-sm text-muted-foreground">
            {data.products.length} produit{data.products.length > 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {data.children.length > 0 ? (
        <div className="mb-6 flex flex-wrap gap-2">
          {data.children.map((child) => (
            <Link
              key={child.id}
              href={`/categorie/${child.slug}`}
              className="rounded-full border bg-muted/40 px-3 py-1 text-sm transition-colors hover:border-ring"
            >
              {child.name}
            </Link>
          ))}
        </div>
      ) : null}

      {data.products.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {data.products.map((product) => (
            <ProductCardItem key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          Aucun produit dans cette catégorie pour le moment.
        </div>
      )}
    </>
  )
}

function CategorySkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-5 w-48 animate-pulse rounded-full bg-muted" />
      <div className="flex items-center gap-4">
        <div className="size-16 animate-pulse rounded-2xl bg-muted" />
        <div className="h-7 w-56 animate-pulse rounded-full bg-muted" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-64 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    </div>
  )
}
