import { periodeDepuis } from "./periodes"
import { VarianteA } from "./variante-a"
import { VarianteB } from "./variante-b"
import { VarianteC } from "./variante-c"
import type { CleVariante } from "./variantes"

/**
 * PROTOTYPE (#963) — la première page du Tableau de bord, trois lectures.
 * Elle ne touche pas à la page réelle : `page.tsx` la rend quand `?etat=vide`
 * (le défaut en développement), et `?etat=reel` rend le Tableau de bord
 * d'aujourd'hui pour comparer.
 */
export function PremierePage({
  cle,
  periode,
}: {
  cle: CleVariante
  periode: string | undefined
}) {
  return (
    <div className="pb-20">
      {cle === "A" ? <VarianteA /> : null}
      {cle === "B" ? <VarianteB periode={periodeDepuis(periode)} /> : null}
      {cle === "C" ? <VarianteC /> : null}
    </div>
  )
}
