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

import type { PointDeChiffreAffaires } from "./donnees"
import type { Axe } from "./reglages"

const moneyFormatter = new Intl.NumberFormat("fr-FR", {
  notation: "compact",
  maximumFractionDigits: 1,
})

const AXE = {
  stroke: "var(--muted-foreground)",
  fontSize: 11,
  axisLine: false,
} as const

/**
 * PROTOTYPE (#964) — deux façons de tenir trente barres dans ~305 px.
 *
 * `epure` laisse Recharts espacer les étiquettes (`preserveStartEnd` +
 * `minTickGap`), sans trait de graduation ; `trait` garde une graduation par
 * barre (`interval={0}`) et éteint les étiquettes du milieu, ce qui laisse le
 * rythme des barres visible.
 */
export function GraphiqueDuChiffreAffaires({
  data,
  axe,
}: {
  data: PointDeChiffreAffaires[]
  axe: Axe
}) {
  if (data.every((point) => point.revenue === 0)) {
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

  const pas =
    data.length <= 12 ? 1 : data.length <= 13 ? 2 : Math.ceil(data.length / 6)

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid
          vertical={false}
          stroke="var(--border)"
          strokeDasharray="3 3"
        />
        {axe === "trait" ? (
          <XAxis
            dataKey="label"
            {...AXE}
            interval={0}
            tickLine={{ stroke: "var(--border)" }}
            tickFormatter={(value: string, index: number) =>
              index % pas === 0 || index === data.length - 1 ? value : ""
            }
          />
        ) : (
          <XAxis
            dataKey="label"
            {...AXE}
            interval="preserveStartEnd"
            minTickGap={8}
            tickLine={false}
          />
        )}
        <YAxis
          {...AXE}
          width={44}
          tickLine={false}
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
          formatter={(value) => [formatPrice(Number(value)), "CA encaissé"]}
        />
        <Bar
          dataKey="revenue"
          fill="currentColor"
          radius={[3, 3, 0, 0]}
          className="fill-primary"
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
