import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { cn } from "@/lib/utils"

export function LigneCalme({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 border-t border-hairline/60 px-(--card-spacing) py-5",
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
      <span className="min-w-0 text-sm font-medium">Rien à signaler.</span>
    </div>
  )
}
