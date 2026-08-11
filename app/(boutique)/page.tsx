import { Suspense } from "react"
import Link from "next/link"
import type { Metadata } from "next"
import { connection } from "next/server"

import { ProductCardItem } from "@/components/storefront/product-card"
import { Button } from "@/components/ui/button"
import { getHomeData } from "@/lib/use-cases/storefront"

export const metadata: Metadata = {
  title: "Électronique au meilleur prix au Maroc",
  description:
    "Smartphones, ordinateurs, TV, gaming et accessoires au meilleur prix au Maroc. Prix en MAD, TVA 20% incluse, paiement à la livraison partout au Maroc.",
}

export default function HomePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <Suspense fallback={<HomeSkeleton />}>
        <HomeContent />
      </Suspense>
    </div>
  )
}

async function HomeContent() {
  await connection()
  const data = await getHomeData()

  return (
    <div className="flex flex-col gap-10">
      <section className="rounded-2xl bg-gradient-to-br from-primary to-primary/70 px-6 py-10 text-primary-foreground sm:px-10">
        <div className="max-w-xl">
          <h1 className="text-3xl font-bold sm:text-4xl">
            L&apos;électronique au meilleur prix, au Maroc
          </h1>
          <p className="mt-3 text-primary-foreground/80">
            Smartphones, ordinateurs, TV, gaming et accessoires. Prix en MAD, TVA 20% incluse,
            paiement à la livraison.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {data.categories.slice(0, 4).map((category) => (
              <Button
                key={category.id}
                render={<Link href={`/categorie/${category.slug}`} />}
                variant="secondary"
              >
                {category.name}
              </Button>
            ))}
          </div>
        </div>
      </section>

      {data.categories.length > 0 ? (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold">Parcourir par catégorie</h2>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {data.categories.map((category) => (
              <Link
                key={category.id}
                href={`/categorie/${category.slug}`}
                className="group flex flex-col gap-2 rounded-2xl border p-3 transition-colors hover:border-ring"
              >
                <div className="aspect-square overflow-hidden rounded-xl bg-muted">
                  {category.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={category.image}
                      alt={category.name}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
                      {category.name}
                    </div>
                  )}
                </div>
                <p className="line-clamp-2 text-sm font-medium">{category.name}</p>
                <p className="text-xs text-muted-foreground">
                  {category.productCount} produit{category.productCount > 1 ? "s" : ""}
                </p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">Nos coups de cœur</h2>
        </div>
        {data.featured.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {data.featured.map((product) => (
              <ProductCardItem key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            Aucun produit mis en avant pour le moment.
          </div>
        )}
      </section>
    </div>
  )
}

function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-10">
      <div className="h-64 animate-pulse rounded-2xl bg-muted" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-40 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-64 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    </div>
  )
}
