import { cn } from "@/lib/utils"

import { CHAMP, SURTITRE_PROMO, TITRE_PROMO, type Champ } from "./echelles"
import { APPARITION, retard } from "./apparition"

/**
 * Prototype : l'en-tête d'une bande — un titre, un surtitre, centrés. Les variantes A et C le
 * partagent ; B s'en sert aussi pour ses catégories.
 *
 * La bande de service (paiement à la livraison, livraison partout au Maroc, TVA incluse) a été
 * essayée dans A et dans C, puis refusée le 14 octobre 2026 : le pied de page porte déjà ces
 * deux faits, et la bande les répétait en noir au bas de la page. L'historique la garde.
 */

export function EnteteDeBande({
  titre,
  surtitre,
  champ,
  className,
}: {
  titre: string
  surtitre: string
  champ: Champ
  className?: string
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <h2 className={cn(TITRE_PROMO, "font-semibold", APPARITION)}>{titre}</h2>
      <p
        className={cn(
          SURTITRE_PROMO,
          CHAMP[champ].second,
          APPARITION,
          retard(1)
        )}
      >
        {surtitre}
      </p>
    </div>
  )
}
