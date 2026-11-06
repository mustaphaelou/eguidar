import type {
  CommandePourRécapitulatif,
  RécapitulatifRow,
} from "@/lib/recapitulatif-paiement"
import { récapitulatifRowsFromCommande } from "@/lib/recapitulatif-paiement"
import { cn } from "@/lib/utils"

type RecapitulatifPaiementBase = {
  className?: string
}

export type RecapitulatifPaiementProps =
  | (RecapitulatifPaiementBase & {
      rows: RécapitulatifRow[]
      commande?: never
    })
  | (RecapitulatifPaiementBase & {
      commande: CommandePourRécapitulatif
      rows?: never
    })

export function RecapitulatifPaiement(props: RecapitulatifPaiementProps) {
  const { className } = props

  const rows =
    "rows" in props && props.rows
      ? props.rows
      : récapitulatifRowsFromCommande(props.commande)

  return (
    <dl className={cn("flex flex-col gap-2 text-sm", className)}>
      {rows.map((row) => {
        if (row.kind === "total") {
          return (
            <div
              key={row.label}
              className="flex justify-between gap-2 border-t pt-2 text-base"
            >
              <dt className="font-bold">{row.label}</dt>
              <dd className="shrink-0 text-right font-bold whitespace-nowrap">
                {row.value}
              </dd>
            </div>
          )
        }

        return (
          <div key={row.label} className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd
              className={cn(
                "shrink-0 text-right font-semibold whitespace-nowrap",
                row.tone === "offered" && "text-emerald-600",
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
