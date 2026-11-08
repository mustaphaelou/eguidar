import Link from "next/link"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import type { PointDeChiffreAffaires } from "./donnees"
import { GraphiqueDuChiffreAffaires } from "./graphique"
import {
  hrefPrototype,
  libellePeriode,
  PERIODES,
  type Reglages,
} from "./reglages"

/**
 * PROTOTYPE (#964) — la carte du Chiffre d'affaires encaissé.
 *
 * Le graphique est une hauteur **minimale** de 260 px : quand la liste des
 * Commandes est plus haute que lui, la carte s'étire et le graphique prend la
 * place, au lieu de laisser un vide sous ses barres. La période est trois liens
 * serveur (la recherche #962 a écarté le ToggleGroup), avec `aria-current` sur
 * le choix actif et `scroll={false}` sur la navigation.
 */
export function CarteDuChiffreAffaires({
  serie,
  reglages,
  className,
}: {
  serie: PointDeChiffreAffaires[]
  reglages: Reglages
  className?: string
}) {
  return (
    <Card className={cn("flex h-full flex-col", className)}>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <CardTitle>Chiffre d’affaires encaissé</CardTitle>
            <CardDescription>
              Commandes livrées, frais de livraison inclus.
            </CardDescription>
          </div>
          <div
            role="group"
            aria-label="Période"
            className="flex flex-wrap items-center gap-1"
          >
            {PERIODES.map((choix) => {
              const actif = choix.cle === reglages.periode
              return (
                <Link
                  key={choix.cle}
                  href={hrefPrototype(reglages, { periode: choix.cle })}
                  scroll={false}
                  aria-current={actif ? "page" : undefined}
                  className={buttonVariants({
                    variant: actif ? "outline" : "ghost",
                    size: "sm",
                  })}
                >
                  {libellePeriode(choix.cle, reglages.etiquettes)}
                </Link>
              )
            })}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <div className="flex min-h-[260px] flex-1 flex-col">
          <GraphiqueDuChiffreAffaires data={serie} axe={reglages.axe} />
        </div>
      </CardContent>
    </Card>
  )
}
