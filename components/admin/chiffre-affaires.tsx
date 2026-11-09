import Link from "next/link"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import {
  buildTableauDeBordUrl,
  libelleCourtPeriode,
  libelleLongPeriode,
  PERIODE_VALUES,
  type Periode,
  type PointDeChiffreAffaires,
} from "@/lib/tableau-de-bord-periode"
import { cn } from "@/lib/utils"

import { GraphiqueDuChiffreAffaires } from "./graphique-chiffre-affaires"

/**
 * La carte du Chiffre d'affaires encaissé.
 *
 * La période est trois liens serveur : `aria-current` porte l'état, chaque
 * `aria-label` dit la forme longue, et `scroll={false}` laisse la page où elle
 * est. Le graphique est une hauteur **minimale** de 260 px : quand la liste des
 * Commandes est plus haute, la carte s'étire et le graphique prend la place.
 */
export function CarteChiffreAffaires({
  data,
  periode,
  className,
}: {
  data: PointDeChiffreAffaires[]
  periode: Periode
  className?: string
}) {
  return (
    <Card className={cn("flex h-full flex-col", className)}>
      <CardHeader className="block">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <CardTitle>Chiffre d&apos;affaires encaissé</CardTitle>
            <CardDescription>
              Commandes livrées, frais de livraison inclus.
            </CardDescription>
          </div>
          <div
            role="group"
            aria-label="Période"
            className="flex flex-wrap items-center gap-1"
          >
            {PERIODE_VALUES.map((choix) => {
              const actif = choix === periode
              return (
                <Link
                  key={choix}
                  href={buildTableauDeBordUrl({ periode: choix })}
                  scroll={false}
                  aria-current={actif ? "page" : undefined}
                  aria-label={libelleLongPeriode(choix)}
                  className={buttonVariants({
                    variant: actif ? "outline" : "ghost",
                    size: "sm",
                  })}
                >
                  {libelleCourtPeriode(choix)}
                </Link>
              )
            })}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <div className="flex min-h-[260px] flex-1 flex-col">
          <GraphiqueDuChiffreAffaires data={data} />
        </div>
      </CardContent>
    </Card>
  )
}
