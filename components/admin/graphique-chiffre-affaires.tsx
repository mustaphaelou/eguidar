"use client"

import { ChartIncreaseIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { formatPrice } from "@/lib/money"
import type { PointDeChiffreAffaires } from "@/lib/tableau-de-bord-periode"

const moneyFormatter = new Intl.NumberFormat("fr-FR", {
  notation: "compact",
  maximumFractionDigits: 1,
})

const chartConfig = {
  montant: {
    label: "Chiffre d'affaires net",
    color: "var(--primary)",
  },
} satisfies ChartConfig

const AXE = {
  stroke: "var(--muted-foreground)",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const

export function GraphiqueDuChiffreAffaires({
  data,
}: {
  data: PointDeChiffreAffaires[]
}) {
  if (data.every((point) => point.montant === 0)) {
    return (
      <Empty className="min-h-[260px] border border-border/60 bg-muted/20 p-6">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon
              icon={ChartIncreaseIcon}
              strokeWidth={2}
              className="size-5"
            />
          </EmptyMedia>
          <EmptyTitle className="text-sm font-medium">
            Aucun chiffre d&apos;affaires net sur cette période.
          </EmptyTitle>
          <EmptyDescription>
            Le graphique se remplit dès qu&apos;une Commande livrée est
            encaissée, puis se réduit avec les Remboursements.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <ChartContainer
      config={chartConfig}
      className="aspect-auto h-full min-h-[260px] w-full"
    >
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" opacity={0.5} />
        <XAxis
          dataKey="label"
          {...AXE}
          interval="preserveStartEnd"
          minTickGap={8}
        />
        <YAxis
          {...AXE}
          width={48}
          tickFormatter={(value: number) => moneyFormatter.format(value / 100)}
        />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.5 }}
          content={
            <ChartTooltipContent
              formatter={(value) => (
                <div className="flex flex-1 items-center justify-between gap-4">
                  <span className="text-muted-foreground">
                    Chiffre d&apos;affaires net
                  </span>
                  <span className="font-mono font-medium text-foreground tabular-nums">
                    {formatPrice(Number(value))}
                  </span>
                </div>
              )}
            />
          }
        />
        <Bar
          dataKey="montant"
          fill="var(--color-montant)"
          radius={[3, 3, 0, 0]}
          className="fill-primary"
          isAnimationActive={false}
        />
      </BarChart>
    </ChartContainer>
  )
}
