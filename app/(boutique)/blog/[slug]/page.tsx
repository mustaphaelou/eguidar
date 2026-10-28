import Image from "next/image"
import { notFound } from "next/navigation"
import { Fragment, Suspense } from "react"

import { AppleBreadcrumb } from "@/components/storefront/apple-breadcrumb"
import { LigneArticleLie } from "@/components/storefront/ligne-article-lie"
import { PartageArticle } from "@/components/storefront/partage-article"
import { ProduitLieCarte } from "@/components/storefront/produit-lie-carte"
import {
  buildArticleDonneesStructurees,
  buildBreadcrumbListDonneesStructurees,
  serializeJsonLd,
} from "@/lib/donnees-structurees"
import {
  decoupeContenuArticle,
  decoupeRenvoisDeNote,
  lignesDeNotes,
  type FragmentArticle,
} from "@/lib/blog-contenu"
import { formatPublishedAt, publishedAtISO } from "@/lib/blog-dates"
import { pageMetadata } from "@/lib/metadata"
import {
  getArticleParSlug,
  getArticlesLies,
  parametresDesArticles,
} from "@/lib/use-cases/blog"

export async function generateStaticParams() {
  return parametresDesArticles()
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const data = await getArticleParSlug(slug)
  if (!data)
    return pageMetadata({
      title: "Article de blog introuvable",
      description: "Cet article de blog est introuvable.",
      path: `/blog/${slug}`,
      noindex: true,
    })
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

  const articlesLies = await getArticlesLies(slug, data.theme.slug)

  const crumbs = [
    { name: "Accueil", href: "/" },
    { name: "Blog", href: "/blog" },
    { name: data.titre },
  ]

  const fragments = decoupeContenuArticle(data.contenu)
  const notes = lignesDeNotes(data.notes)
  const notesCitees = notesCiteesDans(fragments, notes.length)
  const occurrences = new Map<number, number>()
  const idDeRenvoi = (numero: number) => {
    const occurrence = (occurrences.get(numero) ?? 0) + 1
    occurrences.set(numero, occurrence)
    return `renvoi-note-${numero}-${occurrence}`
  }

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

      <div className="mx-auto w-full max-w-[980px]">
        <article className="grid grid-cols-1 px-4 text-[19px] leading-[1.4211] tracking-[0.012em] max-[1068px]:text-body max-[1068px]:leading-body max-[1068px]:tracking-[-0.022em] sm:px-6 md:grid-cols-[1fr_min(653px,100%)_1fr] md:px-0 [&>*+*]:mt-[44px] max-[1068px]:[&>*+*]:mt-[36px] max-[734px]:[&>*+*]:mt-[32px] [&>p+p]:mt-[1.4211em] max-[1068px]:[&>p+p]:mt-[1.471em]">
          <header className="pt-[52px] max-[1068px]:pt-[40px] max-[734px]:pt-[32px] md:col-start-2">
            <span className="block text-[12px] leading-[1.3334] font-bold tracking-[-0.01em] text-muted-foreground uppercase">
              {data.theme.nom}
            </span>
            {data.publishedAt ? (
              <time
                dateTime={publishedAtISO(data.publishedAt)}
                className="mt-[4px] block text-[14px] leading-[1.2858] font-semibold tracking-[-0.016em] text-muted-foreground"
              >
                {formatPublishedAt(data.publishedAt)}
              </time>
            ) : null}
            <h1 className="mt-[20px] text-[48px] leading-[1.0835] font-bold tracking-[-0.003em] max-[1068px]:text-[40px] max-[1068px]:leading-[1.1] max-[1068px]:tracking-[0em] max-[734px]:text-[32px] max-[734px]:leading-[1.125] max-[734px]:tracking-[0.004em]">
              {data.titre}
            </h1>
            <p className="mt-[20px] text-[24px] leading-[1.1667] font-medium tracking-[0.009em] text-foreground max-[1068px]:text-[21px] max-[1068px]:leading-[1.1905] max-[1068px]:tracking-[0.011em]">
              {data.chapo ?? data.extrait}
            </p>
            <PartageArticle titre={data.titre} slug={data.slug} />
          </header>

          {data.couverture ? (
            <FigureArticle url={data.couverture} alt="" priorite />
          ) : null}

          {fragments.map((fragment, index) => (
            <FragmentDuContenu
              key={index}
              fragment={fragment}
              nombreDeNotes={notes.length}
              idDeRenvoi={idDeRenvoi}
            />
          ))}

          {notes.length > 0 ? (
            <ol className="list-decimal pl-6 text-[12px] leading-[1.3334] tracking-[-0.01em] text-muted-foreground md:col-start-2">
              {notes.map((note, index) => {
                const numero = index + 1
                return (
                  <li key={numero} id={`note-${numero}`}>
                    {note}
                    {notesCitees.has(numero) ? (
                      <>
                        {" "}
                        <a
                          href={`#renvoi-note-${numero}-1`}
                          aria-label={`Retour au renvoi de la note ${numero}`}
                          className="underline"
                        >
                          ↩
                        </a>
                      </>
                    ) : null}
                  </li>
                )
              })}
            </ol>
          ) : null}
        </article>
      </div>

      {data.produits.length > 0 ? (
        <section className="mt-12 bg-muted">
          <div className="mx-auto max-w-[980px] px-4 py-12 sm:px-6">
            <h2 className="text-center text-[24px] leading-[1.125] font-bold tracking-[0.002em] sm:text-[28px] lg:text-[32px]">
              Produits liés
            </h2>
            <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-4">
              {data.produits.map((product) => (
                <ProduitLieCarte key={product.id} product={product} />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {articlesLies.length > 0 ? (
        <section
          aria-labelledby="articles-lies"
          className="mx-auto mt-12 w-full max-w-[980px] px-4 sm:px-6 md:px-0"
        >
          <h2
            id="articles-lies"
            className="text-[24px] leading-[1.1667] font-bold tracking-[0.009em] max-[1068px]:text-[21px] max-[1068px]:leading-[1.1905] max-[1068px]:tracking-[0.011em]"
          >
            Articles liés
          </h2>
          <ul className="mt-6 border-t border-border">
            {articlesLies.map((article) => (
              <LigneArticleLie key={article.slug} article={article} />
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}

function FragmentDuContenu({
  fragment,
  nombreDeNotes,
  idDeRenvoi,
}: {
  fragment: FragmentArticle
  nombreDeNotes: number
  idDeRenvoi: (numero: number) => string
}) {
  switch (fragment.type) {
    case "intertitre":
      return (
        <h2 className="text-[24px] leading-[1.1667] font-bold tracking-[0.009em] max-[1068px]:text-[21px] max-[1068px]:leading-[1.1905] max-[1068px]:tracking-[0.011em] md:col-start-2">
          {fragment.texte}
        </h2>
      )
    case "figure":
      return (
        <FigureArticle
          url={fragment.url}
          alt={fragment.alt}
          legende={fragment.legende}
        />
      )
    case "liste":
      return (
        <ul className="list-disc pl-6 md:col-start-2">
          {fragment.items.map((item, index) => (
            <li key={index}>
              <TexteAvecRenvois
                texte={item}
                nombreDeNotes={nombreDeNotes}
                idDeRenvoi={idDeRenvoi}
              />
            </li>
          ))}
        </ul>
      )
    case "citation":
      return (
        <blockquote className="whitespace-pre-line md:col-start-2">
          <TexteAvecRenvois
            texte={fragment.texte}
            nombreDeNotes={nombreDeNotes}
            idDeRenvoi={idDeRenvoi}
          />
        </blockquote>
      )
    case "paragraphe":
      return (
        <p className="whitespace-pre-line md:col-start-2">
          <TexteAvecRenvois
            texte={fragment.texte}
            nombreDeNotes={nombreDeNotes}
            idDeRenvoi={idDeRenvoi}
          />
        </p>
      )
  }
}

function TexteAvecRenvois({
  texte,
  nombreDeNotes,
  idDeRenvoi,
}: {
  texte: string
  nombreDeNotes: number
  idDeRenvoi: (numero: number) => string
}) {
  return decoupeRenvoisDeNote(texte, nombreDeNotes).map((morceau, index) =>
    morceau.type === "texte" ? (
      <Fragment key={index}>{morceau.texte}</Fragment>
    ) : (
      <sup key={index}>
        <a
          id={idDeRenvoi(morceau.numero)}
          href={`#note-${morceau.numero}`}
          aria-label={`Renvoi vers la note ${morceau.numero}`}
          className="underline"
        >
          {morceau.numero}
        </a>
      </sup>
    )
  )
}

function notesCiteesDans(
  fragments: FragmentArticle[],
  nombreDeNotes: number
): Set<number> {
  const citees = new Set<number>()

  for (const fragment of fragments) {
    const textes =
      fragment.type === "paragraphe" || fragment.type === "citation"
        ? [fragment.texte]
        : fragment.type === "liste"
          ? fragment.items
          : []

    for (const texte of textes) {
      for (const morceau of decoupeRenvoisDeNote(texte, nombreDeNotes)) {
        if (morceau.type === "renvoi") citees.add(morceau.numero)
      }
    }
  }

  return citees
}

function FigureArticle({
  url,
  alt,
  legende,
  priorite = false,
}: {
  url: string
  alt: string
  legende?: string | null
  priorite?: boolean
}) {
  return (
    <figure className="-mx-4 sm:-mx-6 md:col-span-3 md:mx-0">
      <div className="relative aspect-video overflow-hidden rounded-[10px] bg-muted">
        <Image
          src={url}
          alt={alt}
          fill
          sizes="(min-width: 1069px) 980px, 100vw"
          className="object-cover"
          priority={priorite}
        />
      </div>
      {legende != null ? (
        <figcaption className="mx-auto mt-[16px] w-[87.5%] text-[12px] leading-[1.3334] font-semibold tracking-[-0.01em] text-muted-foreground max-[1068px]:mt-[12px] md:w-full md:max-w-[653px]">
          {legende}
        </figcaption>
      ) : null}
    </figure>
  )
}

function ArticleSkeleton() {
  return (
    <>
      <div className="h-11 animate-pulse bg-muted" />
      <div className="mx-auto w-full max-w-[980px]">
        <div className="grid grid-cols-1 px-4 sm:px-6 md:grid-cols-[1fr_min(653px,100%)_1fr] md:px-0">
          <div className="flex flex-col gap-4 pt-[52px] max-[1068px]:pt-[40px] max-[734px]:pt-[32px] md:col-start-2">
            <div className="h-4 w-48 animate-pulse rounded-full bg-muted" />
            <div className="h-12 w-full animate-pulse rounded-2xl bg-muted" />
            <div className="h-6 w-5/6 animate-pulse rounded-full bg-muted" />
          </div>
          <div className="-mx-4 mt-[44px] max-[1068px]:mt-[36px] max-[734px]:mt-[32px] sm:-mx-6 md:col-span-3 md:mx-0">
            <div className="aspect-video w-full animate-pulse rounded-[10px] bg-muted" />
          </div>
          <div className="mt-[44px] flex flex-col gap-3 max-[1068px]:mt-[36px] max-[734px]:mt-[32px] md:col-start-2">
            <div className="h-4 w-full animate-pulse rounded-full bg-muted" />
            <div className="h-4 w-full animate-pulse rounded-full bg-muted" />
            <div className="h-4 w-2/3 animate-pulse rounded-full bg-muted" />
          </div>
        </div>
      </div>
    </>
  )
}
