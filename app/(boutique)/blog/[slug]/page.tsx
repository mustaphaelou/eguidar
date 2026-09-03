import Image from "next/image"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { AppleBreadcrumb } from "@/components/storefront/apple-breadcrumb"
import {
  buildArticleDonneesStructurees,
  buildBreadcrumbListDonneesStructurees,
  serializeJsonLd,
} from "@/lib/donnees-structurees"
import { pageMetadata } from "@/lib/metadata"
import { getArticleParSlug } from "@/lib/use-cases/blog"

const formatDateArticle = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
})

function formatPublishedAt(value: Date | string): string {
  return formatDateArticle.format(new Date(value))
}

function publishedAtISO(value: Date | string): string {
  return new Date(value).toISOString()
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const data = await getArticleParSlug(slug)
  if (!data) return { title: "Article de blog introuvable" }
  return pageMetadata({
    title: data.titre,
    description: data.extrait,
    path: `/blog/${data.slug}`,
    images: data.couverture ? [data.couverture] : undefined,
  })
}

export default function ArticleBlogPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <div className="flex flex-col pb-16">
      <Suspense fallback={<ArticleSkeleton />}>
        <ArticleContent paramsPromise={params} />
      </Suspense>
    </div>
  )
}

async function ArticleContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ slug: string }>
}) {
  const { slug } = await paramsPromise
  const data = await getArticleParSlug(slug)
  if (!data) notFound()

  const crumbs = [
    { name: "Accueil", href: "/" },
    { name: "Blog", href: "/blog" },
    { name: data.titre },
  ]

  return (
    <>
      {data.publishedAt ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: serializeJsonLd(
              buildArticleDonneesStructurees({
                titre: data.titre,
                extrait: data.extrait,
                couverture: data.couverture,
                publishedAt: data.publishedAt,
              })
            ),
          }}
        />
      ) : null}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            buildBreadcrumbListDonneesStructurees(crumbs)
          ),
        }}
      />
      <AppleBreadcrumb crumbs={crumbs} />

      <article className="mx-auto w-[653px] pt-8 max-md:w-[576px] max-sm:w-[87.5%]">
        <p className="text-[12px] leading-[1.3334] font-bold tracking-[-0.01em] text-muted-foreground uppercase sm:text-[14px]">
          {data.theme.nom}
          {data.publishedAt ? (
            <>
              {" · "}
              <time dateTime={publishedAtISO(data.publishedAt)}>
                {formatPublishedAt(data.publishedAt)}
              </time>
            </>
          ) : null}
        </p>
        <h1 className="mt-3 text-[48px] leading-[1.0835] font-bold tracking-[-0.003em] max-md:text-[40px] max-md:leading-[1.1] max-md:tracking-[0em] max-sm:text-[32px] max-sm:leading-[1.125] max-sm:tracking-[0.004em]">
          {data.titre}
        </h1>
        <p className="mt-4 text-[19px] leading-[1.4211] tracking-[0.012em] text-muted-foreground">
          {data.extrait}
        </p>

        {data.couverture ? (
          <div className="relative mt-8 aspect-video overflow-hidden rounded-[10px] bg-muted">
            <Image
              src={data.couverture}
              alt=""
              fill
              sizes="(min-width: 1069px) 653px, 100vw"
              className="object-cover"
              priority
            />
          </div>
        ) : null}

        <div className="mt-8 text-[19px] leading-[1.4211] tracking-[0.012em] whitespace-pre-line max-md:text-[17px] max-md:leading-[1.4706] max-md:tracking-[-0.022em]">
          {data.contenu}
        </div>
      </article>
    </>
  )
}

function ArticleSkeleton() {
  return (
    <>
      <div className="h-11 animate-pulse bg-muted" />
      <div className="mx-auto flex w-[653px] flex-col gap-4 pt-8 max-md:w-[576px] max-sm:w-[87.5%]">
        <div className="h-4 w-48 animate-pulse rounded-full bg-muted" />
        <div className="h-12 w-full animate-pulse rounded-2xl bg-muted" />
        <div className="h-6 w-5/6 animate-pulse rounded-full bg-muted" />
        <div className="mt-4 aspect-video w-full animate-pulse rounded-[10px] bg-muted" />
        <div className="mt-4 flex flex-col gap-3">
          <div className="h-4 w-full animate-pulse rounded-full bg-muted" />
          <div className="h-4 w-full animate-pulse rounded-full bg-muted" />
          <div className="h-4 w-2/3 animate-pulse rounded-full bg-muted" />
        </div>
      </div>
    </>
  )
}
