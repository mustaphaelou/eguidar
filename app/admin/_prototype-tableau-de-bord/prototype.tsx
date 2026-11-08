import type { DashboardStats } from "@/lib/use-cases/admin-dashboard"

import type { ContextePrototype } from "./contexte"
import {
  commandesAffichees,
  compteursDAlerte,
  montantAffiche,
  serieDeChiffreAffaires,
  stockFaibleAffiche,
} from "./donnees"
import type { Reglages } from "./reglages"
import { SelecteurDePrototype } from "./selecteur"
import { estCleVariante } from "./variantes"
import { VarianteA } from "./variante-a"
import { VarianteB } from "./variante-b"
import { VarianteC } from "./variante-c"
import { VarianteD } from "./variante-d"

/**
 * PROTOTYPE (#964) — la route du prototype. `page.tsx` ne la rend qu'en
 * développement et que si `?variant` n'est pas `reel` ; la page réelle reste
 * intacte et sert de référence.
 */
export function PrototypeTableauDeBord({
  reglages,
  stats,
  sansAlt,
  echecs,
}: {
  reglages: Reglages
  stats: DashboardStats
  sansAlt: number
  echecs: number
}) {
  const cle = estCleVariante(reglages.variante) ? reglages.variante : "A"
  const commandes = commandesAffichees(stats, reglages.commandes)

  const contexte: ContextePrototype = {
    reglages,
    stats,
    montantDuChiffreAffaires: montantAffiche(stats, reglages.montants),
    serie: serieDeChiffreAffaires(stats, reglages.periode),
    commandes: commandes.liste,
    totalCommandes: commandes.total,
    compteurs: compteursDAlerte(stats, sansAlt, echecs, reglages.alertes),
    stockFaible: stockFaibleAffiche(stats, reglages.alertes),
  }

  return (
    <div data-prototype-page="" className="flex flex-col gap-6 pb-24">
      {cle === "A" ? <VarianteA contexte={contexte} /> : null}
      {cle === "B" ? <VarianteB contexte={contexte} /> : null}
      {cle === "C" ? <VarianteC contexte={contexte} /> : null}
      {cle === "D" ? <VarianteD contexte={contexte} /> : null}
      <SelecteurDePrototype />
    </div>
  )
}
