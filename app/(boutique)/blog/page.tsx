import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { BlogFeedCard, BlogHeroCard } from "@/components/storefront/blog-carte"
import { BlogReveal } from "@/components/storefront/blog-reveal"
import { pageMetadata } from "@/lib/metadata"
import { getBlogLanding } from "@/lib/use-cases/blog"

export const metadata: Metadata = pageMetadata({
  title: "Blog",
  description:
    "Le blog Eguidar : guides d'achat, conseils et annonces — smartphones, ordinateurs, TV, gaming et accessoires au meilleur prix au Maroc.",
  path: "/blog",
})

export default function BlogPage() {
  return (
    <div className="flex flex-col">
      <Suspense fallback={<BlogSkeleton />}>
        <BlogContent />
      </Suspense>
    </div>
  )
}

async function BlogContent() {
  const landing = await getBlogLanding()
  const isEmpty = !landing.hero && landing.articles.length === 0

  return (
    <section className="bg-muted">
      <div className="mx-auto w-full max-w-[980px] px-4 py-12 sm:px-6 sm:py-16">
        <p className="text-center text-sm leading-[1.2858] tracking-[-0.016em] text-muted-foreground">
          Guides et annonces
        </p>
        <h1 className="mt-2 text-center text-[32px] leading-[1.125] font-bold tracking-[0.004em] sm:text-[40px] sm:leading-[1.1] sm:tracking-[0em] lg:text-[48px] lg:leading-[1.0835] lg:tracking-[-0.003em]">
          Blog
        </h1>
        <p className="mx-auto mt-3 max-w-[70ch] text-center text-[17px] leading-[1.4706] tracking-[-0.022em] text-foreground/70 sm:text-[19px]">
          Nos guides d&apos;achat et nos annonces, pour choisir sereinement
          votre électronique.
        </p>

        {landing.hero ? (
          <BlogReveal className="mt-10">
            <BlogHeroCard article={landing.hero} />
          </BlogReveal>
        ) : null}

        {landing.articles.length > 0 ? (
          <>
            <h2 className="mt-12 text-center text-[24px] leading-[1.125] font-bold tracking-[0.002em] sm:text-[28px] lg:text-[32px]">
              Derniers articles
            </h2>
            <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {landing.articles.map((article) => (
                <BlogReveal key={article.slug}>
                  <BlogFeedCard article={article} />
                </BlogReveal>
              ))}
            </div>
          </>
        ) : null}

        {isEmpty ? (
          <div className="mx-auto mt-10 max-w-[70ch] rounded-2xl bg-background p-8 text-center sm:p-10">
            <p className="text-[17px] leading-[1.4706] tracking-[-0.022em] text-foreground/70">
              Aucun article pour le moment. Revenez bientôt pour nos guides et
              nos annonces.
            </p>
            <Link
              href="/produits"
              className="mt-4 inline-block text-[17px] text-link hover:underline"
            >
              Découvrir nos produits ›
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function BlogSkeleton() {
  return (
    <section className="bg-muted">
      <div className="mx-auto flex w-full max-w-[980px] flex-col gap-6 px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto h-4 w-32 animate-pulse rounded-full bg-foreground/10" />
        <div className="mx-auto h-10 w-48 animate-pulse rounded-full bg-foreground/10" />
        <div className="mx-auto h-4 w-3/4 animate-pulse rounded-full bg-foreground/10" />
        <div className="aspect-video w-full animate-pulse rounded-[32px] bg-background" />
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="min-h-[328px] animate-pulse rounded-2xl bg-background"
            />
          ))}
        </div>
      </div>
    </section>
  )
}
