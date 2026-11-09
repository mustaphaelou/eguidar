import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { cn } from "@/lib/utils"

/**
 * Une carte de vigilance entièrement à zéro se dit une fois, doucement. Ce
 * n'est pas un état vide : c'est une bonne nouvelle, et elle prend une ligne.
 */
export function LigneCalme({
  detail,
  className,
}: {
  detail?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 border-t px-(--card-spacing) py-4",
        className
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-emerald-600/20 bg-emerald-500/10 text-emerald-700">
        <HugeiconsIcon
          icon={CheckmarkCircle02Icon}
          strokeWidth={2}
          className="size-4"
        />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-medium">Rien à signaler.</span>
        {detail ? (
          <span className="text-xs text-muted-foreground">{detail}</span>
        ) : null}
      </span>
    </div>
  )
}
