import Link from "next/link"

import { cn } from "@/lib/utils"

export function LigneDeListe({
  href,
  titre,
  sousTitre,
  trailing,
  className,
}: {
  href: string
  titre: React.ReactNode
  sousTitre: React.ReactNode
  trailing?: React.ReactNode
  className?: string
}) {
  return (
    <li>
      <Link
        href={href}
        className={cn(
          "flex min-h-16 items-center justify-between gap-4 px-(--card-spacing) py-2.5 transition-colors focus-visible:bg-muted/40 focus-visible:outline-none active:bg-muted/60 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted/40",
          className
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{titre}</span>
          <span className="truncate text-xs text-muted-foreground">
            {sousTitre}
          </span>
        </span>
        {trailing ? (
          <span className="flex shrink-0 items-center gap-2">{trailing}</span>
        ) : null}
      </Link>
    </li>
  )
}
