import Link from "next/link"

import { CONTENEUR_BOUTIQUE } from "@/lib/conteneur-boutique"
import { cn } from "@/lib/utils"

export interface Crumb {
  name: string
  href?: string
}

export function AppleBreadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Fil d'Ariane" className="border-be border-hairline">
      <ol
        className={cn(
          CONTENEUR_BOUTIQUE,
          "rail-defilant flex flex-nowrap items-center gap-x-2 py-2.5 text-[clamp(0.75rem,0.7rem+0.25vw,0.824rem)] leading-[1.4286] tracking-[-0.016em] whitespace-nowrap text-muted-foreground"
        )}
      >
        {crumbs.map((crumb, index) => (
          <li key={index} className="flex shrink-0 items-center gap-x-2">
            {index > 0 && (
              <span aria-hidden="true" className="text-encre-attenuee">
                ›
              </span>
            )}
            {crumb.href ? (
              <Link
                href={crumb.href}
                className="inline-flex items-center transition-[color,opacity] duration-150 ease-out min-block-7 active:opacity-70 [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
              >
                {crumb.name}
              </Link>
            ) : (
              <span
                aria-current="page"
                className="inline-flex items-center font-medium text-foreground min-block-7"
              >
                {crumb.name}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
