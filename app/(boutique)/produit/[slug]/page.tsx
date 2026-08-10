import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { ProductGallery } from "@/components/storefront/product-gallery"
import { VariantPicker } from "@/components/storefront/variant-picker"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatPrice } from "@/lib/money"
import { getProductPageData } from "@/lib/use-cases/storefront"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const data = await getProductPageData(slug)
  if (!data) return { title: "Produit introuvable" }
  return {
    title: `${data.name} — eguidar.ma`,
    description: `${data.brand} ${data.name}. Prix ${formatPrice(data.price)} (TVA 20% incluse), paiement à la livraison.`,
  }
}

export default function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
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

  return (
    <>
      <nav aria-label="Fil d'Ariane" className="mb-4 text-sm text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/" className="transition-colors hover:text-foreground">
              Accueil
            </Link>
          </li>
          {data.categoryChain.map((category, index) => (
            <li key={category.slug} className="flex items-center gap-1.5">
              <span aria-hidden="true">/</span>
              {index === data.categoryChain.length - 1 ? (
                <span className="text-foreground">{category.name}</span>
              ) : (
                <Link
                  href={`/categorie/${category.slug}`}
                  className="transition-colors hover:text-foreground"
                >
                  {category.name}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2">
        <ProductGallery images={data.images} name={data.name} />

        <div className="flex flex-col gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{data.brand}</p>
            <h1 className="mt-1 text-2xl font-bold">{data.name}</h1>
            {data.freeShipping ? (
              <div className="mt-2">
                <Badge variant="secondary">Livraison offerte</Badge>
              </div>
            ) : null}
          </div>

          <VariantPicker basePrice={data.price} variants={data.variants} productPath={`/produit/${data.slug}`} />

          <p className="text-xs text-muted-foreground">
            Prix affichés en MAD, TVA 20% incluse. Paiement à la livraison partout au Maroc.
          </p>
        </div>
      </div>

      {data.description ? (
        <section className="mt-10">
          <h2 className="mb-3 text-xl font-bold">Description</h2>
          <p className="max-w-3xl whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {data.description}
          </p>
        </section>
      ) : null}

      {specEntries.length > 0 ? (
        <section className="mt-10">
          <h2 className="mb-3 text-xl font-bold">Caractéristiques</h2>
          <div className="max-w-3xl overflow-hidden rounded-2xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-1/3">Caractéristique</TableHead>
                  <TableHead>Valeur</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {specEntries.map(([label, value]) => (
                  <TableRow key={label}>
                    <TableCell className="font-medium">{label}</TableCell>
                    <TableCell>{value}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}
    </>
  )
}

function ProductSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="h-5 w-72 animate-pulse rounded-full bg-muted" />
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="aspect-square animate-pulse rounded-2xl bg-muted" />
        <div className="flex flex-col gap-4">
          <div className="h-4 w-24 animate-pulse rounded-full bg-muted" />
          <div className="h-8 w-3/4 animate-pulse rounded-full bg-muted" />
          <div className="h-9 w-64 animate-pulse rounded-full bg-muted" />
          <div className="h-8 w-40 animate-pulse rounded-full bg-muted" />
          <div className="h-9 w-full max-w-64 animate-pulse rounded-full bg-muted" />
        </div>
      </div>
    </div>
  )
}
