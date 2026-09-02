import type { RécapitulatifFacts } from "@/lib/recapitulatif-paiement"
import { récapitulatifRows } from "@/lib/recapitulatif-paiement"
import { cn } from "@/lib/utils"

export interface RecapitulatifPaiementProps extends RécapitulatifFacts {
  className?: string
}

export function RecapitulatifPaiement({
  sousTotal,
  shipping,
  total,
  className,
}: RecapitulatifPaiementProps) {
  const rows = récapitulatifRows({ sousTotal, shipping, total })

  return (
    <dl className={cn("flex flex-col gap-2 text-sm", className)}>
      {rows.map((row) => {
        if (row.kind === "total") {
          return (
            <div
              key={row.label}
              className="flex justify-between border-t pt-2 text-base"
            >
              <dt className="font-bold">{row.label}</dt>
              <dd className="font-bold">{row.value}</dd>
            </div>
          )
        }

        return (
          <div key={row.label} className="flex justify-between">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd
              className={cn(
                "font-semibold",
                row.tone === "offered" &&
                  "text-emerald-600 dark:text-emerald-400",
                row.tone === "muted" && "text-muted-foreground"
              )}
            >
              {row.value}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
