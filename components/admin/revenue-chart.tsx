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

interface RevenuePoint {
  month: string
  revenue: number
}

const moneyFormatter = new Intl.NumberFormat("fr-FR", {
  notation: "compact",
  maximumFractionDigits: 1,
})

/** Le gris des axes suit les jetons du thème plutôt qu'une valeur en dur. */
const AXE = {
  stroke: "var(--muted-foreground)",
  fontSize: 12,
  tickLine: false,
  axisLine: false,
} as const

export function RevenueChart({ data }: { data: RevenuePoint[] }) {
  if (data.every((point) => point.revenue === 0)) {
    return (
      <div className="flex h-[300px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/20 px-6 text-center">
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
          Le graphique se remplit dès que des commandes passent au statut «
          Livrée ».
        </p>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid
          vertical={false}
          stroke="var(--border)"
          strokeDasharray="3 3"
        />
        <XAxis dataKey="month" {...AXE} />
        <YAxis
          {...AXE}
          width={48}
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
          radius={[4, 4, 0, 0]}
          className="fill-primary"
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
