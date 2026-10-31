import Image from "next/image"
import Link from "next/link"

import { formatPublishedAt, publishedAtISO } from "@/lib/blog-dates"
import type { ArticleLie } from "@/lib/use-cases/blog"

export function LigneArticleLie({ article }: { article: ArticleLie }) {
  return (
    <li className="border-b border-border last:border-b-0">
      <Link
        href={`/blog/${article.slug}`}
        className="flex items-center gap-6 py-8 max-[734px]:gap-4 max-[734px]:py-7"
      >
        <div className="relative aspect-video w-[171px] shrink-0 overflow-hidden rounded-[10px] bg-muted max-[734px]:w-[93px]">
          {article.couverture ? (
            <Image
              src={article.couverture}
              alt=""
              fill
              sizes="(min-width: 735px) 171px, 93px"
              className="object-cover"
            />
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col">
          <p className="text-[12px] leading-[1.3334] font-semibold tracking-[-0.01em] text-muted-foreground uppercase">
            {article.theme.nom}
          </p>
          <h3 className="mt-[4px] text-[19px] leading-[1.2105] font-bold tracking-[0.012em] max-[1068px]:text-[17px] max-[1068px]:leading-[1.2354] max-[1068px]:tracking-[-0.022em]">
            {article.titre}
          </h3>
          <time
            dateTime={publishedAtISO(article.publishedAt)}
            className="mt-[8px] text-[14px] leading-[1.4286] font-semibold tracking-[-0.016em] text-muted-foreground"
          >
            {formatPublishedAt(article.publishedAt)}
          </time>
        </div>
      </Link>
    </li>
  )
}
