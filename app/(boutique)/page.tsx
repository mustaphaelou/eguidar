import { Suspense } from "react"
import Image from "next/image"
import Link from "next/link"
import { connection } from "next/server"

import { CarteProduit } from "@/components/storefront/carte-produit"
import { Button } from "@/components/ui/button"
import { pageMetadata } from "@/lib/metadata"
import { cn } from "@/lib/utils"
import { getHomeData } from "@/lib/use-cases/storefront"

export const metadata = pageMetadata({
  title: "Électronique au meilleur prix au Maroc",
  description:
    "Smartphones, ordinateurs, TV, gaming et accessoires au meilleur prix au Maroc. Prix en MAD, TVA 20% incluse, paiement à la livraison partout au Maroc.",
  path: "/",
})

export default function HomePage() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent />
    </Suspense>
  )
}

async function HomeContent() {
  await connection()
  const data = await getHomeData()

  return (
    <div className="flex flex-col">
      <section className="bg-muted">
        <div className="mx-auto max-w-[980px] px-4 py-12 text-center sm:px-6 sm:py-16">
          <h1 className="mt-2 text-[32px] leading-[1.0714] font-semibold tracking-[-0.005em] sm:text-[48px] lg:text-[56px]">
            L&apos;électronique au meilleur prix, au Maroc
          </h1>
          <p className="mt-3 text-[19px] leading-[1.1429] tracking-[0.007em] text-foreground/80 sm:text-[24px] lg:text-[28px]">
            Smartphones, ordinateurs, TV, gaming et accessoires. Prix en MAD,
            TVA incluse, paiement à la livraison.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
            <Button
              render={<Link href="/produits" />}
              className="h-10 rounded-full px-5 text-[17px]"
            >
              Tous nos produits
            </Button>
            <Link
              href="#coups-de-coeur"
              className="text-[17px] text-link hover:underline"
            >
              Nos coups de cœur ›
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-background">
        <div className="mx-auto grid max-w-[980px] grid-cols-1 gap-4 px-4 sm:grid-cols-2 sm:gap-5 sm:px-6">
          {data.categories.map((category, index) => {
            const dark = index === 0
            return (
              <Link
                key={category.id}
                href={`/categorie/${category.slug}`}
                className={cn(
                  "group flex flex-col overflow-hidden rounded-2xl",
                  dark ? "bg-foreground text-background" : "bg-muted"
                )}
              >
                {category.image ? (
                  <div className="relative aspect-[16/10] w-full overflow-hidden">
                    <Image
                      src={category.image}
                      alt={category.name}
                      fill
                      sizes="(min-width: 640px) 50vw, 100vw"
                      className="object-cover transition-transform group-hover:scale-[1.02]"
                    />
                  </div>
                ) : (
                  <div className="flex aspect-[16/10] w-full items-center justify-center bg-background">
                    <span className="text-sm text-muted-foreground">
                      {category.name}
                    </span>
                  </div>
                )}
                <div className="flex flex-col gap-1 p-8 sm:p-10">
                  <p
                    className={cn(
                      "text-sm leading-[1.2858] tracking-[-0.016em]",
                      dark ? "text-background/70" : "text-muted-foreground"
                    )}
                  >
                    {category.productCount} produit
                    {category.productCount > 1 ? "s" : ""}
                  </p>
                  <h2 className="text-[28px] leading-[1.1] font-semibold sm:text-[32px] lg:text-[40px]">
                    {category.name}
                  </h2>
                  <p
                    className={cn(
                      "mt-2 text-[17px]",
                      dark ? "text-[#2997ff]" : "text-link"
                    )}
                  >
                    Découvrir ›
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      {data.featured.length > 0 ? (
        <section id="coups-de-coeur" className="mt-16 bg-muted">
          <div className="mx-auto max-w-[980px] px-4 py-12 sm:px-6">
            <h2 className="text-center text-[24px] font-semibold tracking-[0.002em] sm:text-[28px] lg:text-[32px]">
              Nos coups de cœur
            </h2>
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {data.featured.slice(0, 5).map((product) => (
                <CarteProduit key={product.id} product={product} />
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  )
}

function HomeSkeleton() {
  return (
    <div className="mx-auto flex max-w-[980px] flex-col gap-10 px-4 py-6 sm:px-6">
      <div className="h-64 animate-pulse rounded-2xl bg-muted" />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-80 animate-pulse rounded-2xl bg-muted" />
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
