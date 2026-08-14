// PROTOTYPE — throwaway homepage variants, switchable via ?variant=.
// Do not build on this file; the winning variant gets folded into
// app/(boutique)/page.tsx and this file goes to a throwaway branch.

import Link from "next/link"

import { Button } from "@/components/ui/button"
import { formatPrice } from "@/lib/money"
import { cn } from "@/lib/utils"
import type { CategoryNode, HomeData, ProductCard } from "@/lib/use-cases/storefront"

const HERO_HEADLINE =
  "L'électronique au meilleur prix, au Maroc"
const HERO_SUBHEAD =
  "Smartphones, ordinateurs, TV, gaming et accessoires. Prix en MAD, TVA incluse, paiement à la livraison."
const HERO_LINK_LABEL = "Tous nos produits"
const FEATURED_TITLE = "Nos coups de cœur"

function heroHeadlineClass() {
  return "mt-2 text-[32px] leading-[1.0714] font-semibold tracking-[-0.005em] sm:text-[48px] lg:text-[56px]"
}

function heroSubheadClass() {
  return "mt-3 text-[19px] leading-[1.1429] tracking-[0.007em] sm:text-[24px] lg:text-[28px]"
}

function CategoryImage({
  category,
  className,
}: {
  category: CategoryNode
  className?: string
}) {
  if (!category.image) {
    return (
      <div className={cn("flex items-center justify-center bg-background", className)}>
        <span className="text-sm text-muted-foreground">{category.name}</span>
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={category.image}
      alt={category.name}
      loading="lazy"
      className={cn("object-cover", className)}
    />
  )
}

function HomeProductCard({ product }: { product: ProductCard }) {
  return (
    <Link
      href={`/produit/${product.slug}`}
      className="group flex flex-col gap-2"
    >
      <div className="aspect-square overflow-hidden rounded-2xl bg-muted">
        {product.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            {product.name}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        <p className="text-xs text-muted-foreground">{product.brand}</p>
        <p className="line-clamp-2 text-sm font-medium group-hover:text-link">
          {product.name}
        </p>
        <p className="text-sm font-semibold">{formatPrice(product.minPrice)}</p>
        <p
          className={cn(
            "text-xs",
            product.totalStock > 0 ? "text-muted-foreground" : "text-destructive"
          )}
        >
          {product.totalStock > 0 ? "En stock" : "Rupture de stock"}
          {product.totalStock > 0 && product.freeShipping ? " · Livraison offerte" : ""}
        </p>
      </div>
    </Link>
  )
}

/* ---------------- Variant A — Rythme classique ---------------- */
/* Full-bleed light hero tile, then one full-width alternating tile
   per top-level category, then a white featured grid. No black tiles. */

export function HomeVariantA({ data }: { data: HomeData }) {
  return (
    <div className="flex flex-col">
      <section className="bg-muted">
        <div className="mx-auto max-w-[980px] px-4 py-12 text-center sm:px-6 sm:py-16">
          <h1 className={heroHeadlineClass()}>{HERO_HEADLINE}</h1>
          <p className={cn(heroSubheadClass(), "text-foreground/80")}>{HERO_SUBHEAD}</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
            <Button
              render={<Link href="/produits" />}
              className="h-10 rounded-full px-5 text-[17px]"
            >
              {HERO_LINK_LABEL}
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

      {data.categories.map((category, index) => (
        <section
          key={category.id}
          className={cn(index % 2 === 1 ? "bg-muted" : "bg-background")}
        >
          <div className="mx-auto flex max-w-[980px] flex-col items-center gap-8 px-4 py-12 sm:px-6 lg:flex-row lg:gap-16 lg:py-16">
            <Link
              href={`/categorie/${category.slug}`}
              className={cn("w-full lg:w-1/2", index % 2 === 1 && "lg:order-2")}
            >
              <CategoryImage
                category={category}
                className="aspect-[4/3] w-full rounded-2xl"
              />
            </Link>
            <div
              className={cn(
                "flex w-full flex-col items-center text-center lg:w-1/2 lg:items-start lg:text-left",
                index % 2 === 1 && "lg:order-1"
              )}
            >
              <p className="text-sm leading-[1.2858] tracking-[-0.016em] text-muted-foreground">
                {category.productCount} produit{category.productCount > 1 ? "s" : ""}
              </p>
              <h2 className="mt-1 text-[28px] leading-[1.1] font-semibold sm:text-[32px] lg:text-[40px]">
                {category.name}
              </h2>
              <Link
                href={`/categorie/${category.slug}`}
                className="mt-3 text-[17px] text-link hover:underline"
              >
                Découvrir ›
              </Link>
            </div>
          </div>
        </section>
      ))}

      <section
        id="coups-de-coeur"
        className="mx-auto w-full max-w-[980px] px-4 py-16 sm:px-6"
      >
        <h2 className="text-[24px] font-semibold tracking-[0.002em] sm:text-[28px] lg:text-[32px]">
          {FEATURED_TITLE}
        </h2>
        {data.featured.length > 0 ? (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {data.featured.map((product) => (
              <HomeProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : null}
      </section>
    </div>
  )
}

/* ---------------- Variant B — Promos en duo ---------------- */
/* White centered hero (no tile background), then a two-column grid of
   category promo tiles (one black accent tile), then the featured strip
   on a light-gray band. */

export function HomeVariantB({ data }: { data: HomeData }) {
  return (
    <div className="flex flex-col">
      <section className="bg-background">
        <div className="mx-auto max-w-[980px] px-4 py-12 text-center sm:px-6 sm:py-16">
          <h1 className={heroHeadlineClass()}>{HERO_HEADLINE}</h1>
          <p className={cn(heroSubheadClass(), "text-foreground/80")}>{HERO_SUBHEAD}</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
            <Button
              render={<Link href="/produits" />}
              className="h-10 rounded-full px-5 text-[17px]"
            >
              {HERO_LINK_LABEL}
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
                <CategoryImage
                  category={category}
                  className="aspect-[16/10] w-full transition-transform group-hover:scale-[1.02]"
                />
                <div className="flex flex-col gap-1 p-8 sm:p-10">
                  <p
                    className={cn(
                      "text-sm leading-[1.2858] tracking-[-0.016em]",
                      dark ? "text-background/70" : "text-muted-foreground"
                    )}
                  >
                    {category.productCount} produit{category.productCount > 1 ? "s" : ""}
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

      <section id="coups-de-coeur" className="mt-16 bg-muted">
        <div className="mx-auto max-w-[980px] px-4 py-12 sm:px-6">
          <h2 className="text-center text-[24px] font-semibold tracking-[0.002em] sm:text-[28px] lg:text-[32px]">
            {FEATURED_TITLE}
          </h2>
          {data.featured.length > 0 ? (
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {data.featured.map((product) => (
                <HomeProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}

/* ---------------- Variant C — Accent noir ---------------- */
/* Full-bleed black hero as the single dramatic accent, stacked light
   category tiles below, featured products as a horizontal scroller. */

export function HomeVariantC({ data }: { data: HomeData }) {
  return (
    <div className="flex flex-col">
      <section className="bg-foreground">
        <div className="mx-auto max-w-[980px] px-4 py-12 text-center sm:px-6 sm:py-16">
          <h1 className={cn(heroHeadlineClass(), "text-background")}>{HERO_HEADLINE}</h1>
          <p className={cn(heroSubheadClass(), "text-background/70")}>{HERO_SUBHEAD}</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
            <Button
              render={<Link href="/produits" />}
              className="h-10 rounded-full px-5 text-[17px]"
            >
              {HERO_LINK_LABEL}
            </Button>
            <Link
              href="#coups-de-coeur"
              className="text-[17px] text-[#2997ff] hover:underline"
            >
              Nos coups de cœur ›
            </Link>
          </div>
        </div>
      </section>

      {data.categories.map((category) => (
        <section key={category.id} className="bg-muted first:border-t-0">
          <div className="mx-auto flex max-w-[980px] flex-col items-center gap-8 border-b border-border/60 px-4 py-10 sm:px-6 lg:flex-row lg:gap-16 lg:py-14">
            <div className="flex w-full flex-col items-center text-center lg:w-1/2 lg:items-start lg:text-left">
              <h2 className="text-[28px] leading-[1.1] font-semibold sm:text-[32px] lg:text-[40px]">
                {category.name}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {category.productCount} produit{category.productCount > 1 ? "s" : ""}
              </p>
              <Link
                href={`/categorie/${category.slug}`}
                className="mt-3 text-[17px] text-link hover:underline"
              >
                Découvrir ›
              </Link>
            </div>
            <Link href={`/categorie/${category.slug}`} className="w-full lg:w-1/2">
              <CategoryImage category={category} className="aspect-[4/3] w-full rounded-2xl" />
            </Link>
          </div>
        </section>
      ))}

      <section id="coups-de-coeur" className="bg-background">
        <div className="mx-auto max-w-[980px] px-4 py-16 sm:px-6">
          <h2 className="text-[24px] font-semibold tracking-[0.002em] sm:text-[28px] lg:text-[32px]">
            {FEATURED_TITLE}
          </h2>
          {data.featured.length > 0 ? (
            <div className="mt-6 flex gap-4 overflow-x-auto pb-4">
              {data.featured.map((product) => (
                <div key={product.id} className="min-w-[240px] max-w-[240px]">
                  <HomeProductCard product={product} />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
