import type {
  CommandePourRécapitulatif,
  DevisPourRécapitulatif,
} from "@/lib/recapitulatif-paiement"
import {
  récapitulatifRowsFromCommande,
  récapitulatifRowsFromDevis,
} from "@/lib/recapitulatif-paiement"
import { cn } from "@/lib/utils"

type RecapitulatifPaiementBase = {
  className?: string
}

/**
 * Entrées du Récapitulatif de paiement.
 *
 * - `devis` : Devis (villes disponibles + devis par ville + identifiant de
 *   Ville de livraison optionnel), résolution identifiant → nom avec repli
 *   vers « Livraison » sans ville.
 * - `commande` : Commande sous forme structurelle minimale
 *   (`total`, `shippingFee`, `totalPayable`, `cityName`), Total à payer
 *   consommé tel quel, jamais re-dérivé.
 *
 * Un seul chemin, six adapteurs : le module ne se rend plus que par la
 * nouvelle interface (l'ancienne interface à faits assemblés à la main et
 * ses props de compatibilité sont supprimées).
 */
export type RecapitulatifPaiementProps =
  | (RecapitulatifPaiementBase & {
      devis: DevisPourRécapitulatif
      commande?: never
    })
  | (RecapitulatifPaiementBase & {
      commande: CommandePourRécapitulatif
      devis?: never
    })

export function RecapitulatifPaiement(props: RecapitulatifPaiementProps) {
  const { className } = props

  const rows = props.devis
    ? récapitulatifRowsFromDevis(props.devis)
    : récapitulatifRowsFromCommande(props.commande)

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
