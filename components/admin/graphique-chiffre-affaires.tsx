"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import { ChartIncreaseIcon } from "@hugeicons/core-free-icons"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { formatPrice } from "@/lib/money"
import type { PointDeChiffreAffaires } from "@/lib/tableau-de-bord-periode"

const moneyFormatter = new Intl.NumberFormat("fr-FR", {
  notation: "compact",
  maximumFractionDigits: 1,
})

/** Le gris des axes suit les jetons du thème plutôt qu'une valeur en dur. */
const AXE = {
  stroke: "var(--muted-foreground)",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const

/**
 * Trente barres ne tiennent pas trente étiquettes à 390 px. `preserveStartEnd`
 * garde les deux bouts et laisse Recharts espacer le milieu d'au moins 8 px ;
 * les tooltips restent par barre, car l'axe des tooltips lit le domaine complet.
 * Aucune animation d'entrée : le graphique est posé, il ne se présente pas.
 */
export function GraphiqueDuChiffreAffaires({
  data,
}: {
  data: PointDeChiffreAffaires[]
}) {
  if (data.every((point) => point.montant === 0)) {
    return (
      <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/20 px-6 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <HugeiconsIcon
            icon={ChartIncreaseIcon}
            strokeWidth={2}
            className="size-5"
          />
        </span>
        <p className="text-sm font-medium">
          Aucune vente encaissée sur cette période.
        </p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Le graphique se remplit dès que des Commandes passent au statut «
          Livrée ».
        </p>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid
          vertical={false}
          stroke="var(--border)"
          strokeDasharray="3 3"
        />
        <XAxis
          dataKey="label"
          {...AXE}
          interval="preserveStartEnd"
          minTickGap={8}
        />
        <YAxis
          {...AXE}
          width={44}
          tickFormatter={(value: number) => moneyFormatter.format(value / 100)}
        />
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.5 }}
          contentStyle={{
            borderRadius: "0.75rem",
            border: "1px solid var(--border)",
            background: "var(--popover)",
            color: "var(--popover-foreground)",
            fontSize: "0.75rem",
          }}
          formatter={(value) => [
            formatPrice(Number(value)),
            "Chiffre d'affaires encaissé",
          ]}
        />
        <Bar
          dataKey="montant"
          fill="currentColor"
          radius={[3, 3, 0, 0]}
          className="fill-primary"
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
