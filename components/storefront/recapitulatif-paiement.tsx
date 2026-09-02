import type {
  CommandePourRécapitulatif,
  DevisPourRécapitulatif,
  RécapitulatifFacts,
  RécapitulatifRow,
} from "@/lib/recapitulatif-paiement"
import {
  récapitulatifRows,
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
 * - Faits assemblés (`sousTotal` + `shipping` + `total`) : chemin de
 *   compatibilité pour les pages existantes, rendu inchangé.
 * - `devis` : Devis (villes disponibles + devis par ville + identifiant de
 *   Ville de livraison optionnel), résolution identifiant → nom avec repli
 *   vers « Livraison » sans ville.
 * - `commande` : Commande sous forme structurelle minimale
 *   (`total`, `shippingFee`, `totalPayable`, `cityName`), Total à payer
 *   consommé tel quel, jamais re-dérivé.
 */
export type RecapitulatifPaiementProps =
  | (RecapitulatifPaiementBase &
      RécapitulatifFacts & { devis?: never; commande?: never })
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

  let rows: RécapitulatifRow[]
  const devis = (props as { devis?: DevisPourRécapitulatif }).devis
  const commande = (props as { commande?: CommandePourRécapitulatif }).commande
  if (devis) {
    rows = récapitulatifRowsFromDevis(devis)
  } else if (commande) {
    rows = récapitulatifRowsFromCommande(commande)
  } else {
    const { sousTotal, shipping, total } = props as RécapitulatifFacts
    rows = récapitulatifRows({ sousTotal, shipping, total })
  }

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
