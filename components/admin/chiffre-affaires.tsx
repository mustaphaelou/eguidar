import Link from "next/link"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
    <Card
      className={cn("flex h-full flex-col border border-border/60", className)}
    >
      <CardHeader className="block">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-col gap-1">
            <CardTitle>Évolution du chiffre d&apos;affaires</CardTitle>
            <CardDescription>
              Encaissements moins Remboursements, frais de livraison inclus.
            </CardDescription>
          </div>
          <div
            role="group"
            aria-label="Période"
            className="flex flex-wrap items-center gap-0.5 rounded-lg bg-muted p-1"
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
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    actif
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
                  )}
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
