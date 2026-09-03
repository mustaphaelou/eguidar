import Image from "next/image"
import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { BlogReveal } from "@/components/storefront/blog-reveal"
import { pageMetadata } from "@/lib/metadata"
import { getBlogLanding, type CardBlog } from "@/lib/use-cases/blog"

export const metadata: Metadata = pageMetadata({
  title: "Blog",
  description:
    "Le blog Eguidar : guides d'achat, conseils et annonces — smartphones, ordinateurs, TV, gaming et accessoires au meilleur prix au Maroc.",
  path: "/blog",
})

const formatDateArticle = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
})

function formatPublishedAt(value: Date | string): string {
  return formatDateArticle.format(new Date(value))
}

function publishedAtISO(value: Date | string): string {
  return new Date(value).toISOString()
}

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

function BlogHeroCard({ article }: { article: CardBlog }) {
  return (
    <Link
      href={`/blog/${article.slug}`}
      aria-label={`Lire : ${article.titre}`}
      className="group relative block aspect-video w-full overflow-hidden rounded-[32px] bg-[#1d1d1f]"
    >
      {article.couverture ? (
        <Image
          src={article.couverture}
          alt=""
          fill
          sizes="(min-width: 1024px) 980px, 100vw"
          className="object-cover transition-transform duration-500 [@media(hover:hover)]:group-hover:scale-[1.03]"
        />
      ) : null}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"
      />
      <div className="absolute inset-x-0 bottom-0 p-6 sm:p-9">
        <p className="text-[12px] leading-[1.3334] font-bold tracking-[-0.01em] text-white/80 uppercase sm:text-[14px]">
          {article.theme.nom}
        </p>
        <h2 className="mt-2 line-clamp-3 text-[24px] leading-[1.1667] font-bold tracking-[0.009em] text-white sm:text-[40px] sm:leading-[1.1] sm:tracking-[0em] lg:text-[48px] lg:leading-[1.0835] lg:tracking-[-0.003em] [@media(hover:hover)]:group-hover:underline">
          {article.titre}
        </h2>
        <p className="mt-2 line-clamp-2 text-[17px] leading-[1.4706] tracking-[-0.022em] text-white/80">
          {article.extrait}
        </p>
        <p className="mt-3 text-[14px] leading-[1.4286] font-semibold tracking-[-0.016em] text-[#86868b] sm:text-[17px] sm:tracking-[-0.022em]">
          <time dateTime={publishedAtISO(article.publishedAt)}>
            {formatPublishedAt(article.publishedAt)}
          </time>
        </p>
      </div>
    </Link>
  )
}

function BlogFeedCard({ article }: { article: CardBlog }) {
  return (
    <Link
      href={`/blog/${article.slug}`}
      aria-label={`Lire : ${article.titre}`}
      className="group relative flex min-h-[328px] flex-col justify-end overflow-hidden rounded-2xl bg-[#1d1d1f] sm:min-h-[332px] lg:min-h-[314px]"
    >
      {article.couverture ? (
        <Image
          src={article.couverture}
          alt=""
          fill
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover transition-transform duration-500 [@media(hover:hover)]:group-hover:scale-[1.03]"
        />
      ) : null}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"
      />
      <div className="relative p-6">
        <p className="text-[12px] leading-[1.3334] font-bold tracking-[-0.01em] text-white/80 uppercase">
          {article.theme.nom}
        </p>
        <h3 className="mt-2 line-clamp-4 text-[24px] leading-[1.1667] font-bold tracking-[0.009em] text-white lg:text-[21px] lg:leading-[1.1905] lg:tracking-[0.011em] [@media(hover:hover)]:group-hover:underline">
          {article.titre}
        </h3>
        <p className="mt-2 line-clamp-2 text-[14px] leading-[1.4286] tracking-[-0.016em] text-white/80">
          {article.extrait}
        </p>
        <p className="mt-2 text-[14px] leading-[1.4286] font-semibold tracking-[-0.016em] text-[#86868b]">
          <time dateTime={publishedAtISO(article.publishedAt)}>
            {formatPublishedAt(article.publishedAt)}
          </time>
        </p>
      </div>
    </Link>
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
