import Image from "next/image"
import Link from "next/link"

import { formatPublishedAt, publishedAtISO } from "@/lib/blog-dates"
import type { CardBlog } from "@/lib/use-cases/blog"

function BlogCarteFond({
  couverture,
  sizes,
}: {
  couverture: string | null
  sizes: string
}) {
  return (
    <>
      {couverture ? (
        <Image
          src={couverture}
          alt=""
          fill
          sizes={sizes}
          className="object-cover motion-safe:transition-transform motion-safe:duration-250 motion-safe:ease-out motion-reduce:transform-none motion-reduce:transition-none motion-safe:[@media(hover:hover)_and_(pointer:fine)]:group-hover:scale-[1.03]"
        />
      ) : null}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"
      />
    </>
  )
}

function BlogCarteTexte({
  article,
  kickerClasse,
  titreClasse,
  Titre,
  extraitClasse,
  dateClasse,
  titreLignes,
}: {
  article: CardBlog
  kickerClasse: string
  titreClasse: string
  Titre: "h2" | "h3"
  extraitClasse: string
  dateClasse: string
  titreLignes: string
}) {
  return (
    <>
      <p className={kickerClasse}>{article.theme.nom}</p>
      <Titre
        className={`${titreClasse} ${titreLignes} mt-2 text-white [@media(hover:hover)]:group-hover:underline`}
      >
        {article.titre}
      </Titre>
      <p className={`${extraitClasse} mt-2 line-clamp-2 text-white/80`}>
        {article.extrait}
      </p>
      <p className={dateClasse}>
        <time dateTime={publishedAtISO(article.publishedAt)}>
          {formatPublishedAt(article.publishedAt)}
        </time>
      </p>
    </>
  )
}

export function BlogHeroCard({ article }: { article: CardBlog }) {
  return (
    <Link
      href={`/blog/${article.slug}`}
      aria-label={`Lire : ${article.titre}`}
      className="group relative block aspect-video w-full overflow-clip rounded-[32px] bg-[#1d1d1f] motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.99] motion-reduce:transform-none motion-reduce:transition-none"
    >
      <BlogCarteFond
        couverture={article.couverture}
        sizes="(min-width: 1024px) 980px, 100vw"
      />
      <div className="absolute inset-x-0 bottom-0 p-6 sm:p-9">
        <BlogCarteTexte
          article={article}
          Titre="h2"
          titreLignes="line-clamp-3"
          kickerClasse="text-[12px] leading-[1.3334] font-bold tracking-[-0.01em] text-white/80 uppercase sm:text-[14px]"
          titreClasse="text-[24px] leading-[1.1667] font-bold tracking-[0.009em] sm:text-[40px] sm:leading-[1.1] sm:tracking-[0em] lg:text-[48px] lg:leading-[1.0835] lg:tracking-[-0.003em]"
          extraitClasse="text-body leading-body tracking-[-0.022em]"
          dateClasse="mt-3 text-[14px] leading-[1.4286] font-semibold tracking-[-0.016em] text-[#86868b] sm:text-body sm:tracking-[-0.022em]"
        />
      </div>
    </Link>
  )
}

export function BlogFeedCard({ article }: { article: CardBlog }) {
  return (
    <Link
      href={`/blog/${article.slug}`}
      aria-label={`Lire : ${article.titre}`}
      className="group relative flex min-h-[328px] flex-col justify-end overflow-clip rounded-2xl bg-[#1d1d1f] motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.99] motion-reduce:transform-none motion-reduce:transition-none sm:min-h-[332px] lg:min-h-[314px]"
    >
      <BlogCarteFond
        couverture={article.couverture}
        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
      />
      <div className="relative p-6">
        <BlogCarteTexte
          article={article}
          Titre="h3"
          titreLignes="line-clamp-4"
          kickerClasse="text-[12px] leading-[1.3334] font-bold tracking-[-0.01em] text-white/80 uppercase"
          titreClasse="text-[24px] leading-[1.1667] font-bold tracking-[0.009em] lg:text-[21px] lg:leading-[1.1905] lg:tracking-[0.011em]"
          extraitClasse="text-[14px] leading-[1.4286] tracking-[-0.016em]"
          dateClasse="mt-2 text-[14px] leading-[1.4286] font-semibold tracking-[-0.016em] text-[#86868b]"
        />
      </div>
    </Link>
  )
}
