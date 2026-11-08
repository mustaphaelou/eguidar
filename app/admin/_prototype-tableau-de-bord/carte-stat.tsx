import Link from "next/link"

import { HugeiconsIcon } from "@hugeicons/react"

import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

/** La taille des valeurs qui ne sont pas des montants. */
export const VALEUR_DE_CARTE = "text-xl sm:text-2xl"

/**
 * PROTOTYPE (#964) — un montant suit la largeur de sa carte, il n'a pas une
 * taille choisie pour l'échantillon de `15.998,00 MAD`. `cqi` est relatif au
 * conteneur de la valeur (`CardContent` porte `@container`).
 *
 * La borne haute est **1,25 rem**, pas 1,5 rem comme dans #931 : à 1440 px, la
 * carte fait 264 px et le montant redeviendrait aussi grand qu'un compte
 * (24 px), alors que la charte demande un cran de moins pour l'argent. À 390 px,
 * 10,5 cqi donne 14,45 px : 119 px pour `15.998,00 MAD`, 129 px pour
 * `999.999,00 MAD`, dans 138 px de contenu.
 */
export const VALEUR_MONETAIRE =
  "text-[length:clamp(0.5rem,10.5cqi,1.25rem)] font-semibold tracking-tight break-normal whitespace-nowrap tabular-nums"

export function CarteStat({
  label,
  value,
  hint,
  icon,
  href,
  valueClassName = VALEUR_DE_CARTE,
}: {
  label: string
  value: React.ReactNode
  hint: React.ReactNode
  icon: React.ComponentProps<typeof HugeiconsIcon>["icon"]
  href?: string
  /** La taille de la valeur : les montants suivent la carte (`VALEUR_MONETAIRE`). */
  valueClassName?: string
}) {
  return (
    <Card size="sm" className="h-full gap-3">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <CardAction className="hidden sm:block">
          <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <HugeiconsIcon icon={icon} strokeWidth={2} className="size-4" />
          </span>
        </CardAction>
      </CardHeader>
      <CardContent className="@container">
        <p
          className={cn(
            "font-semibold tracking-tight break-normal tabular-nums",
            valueClassName
          )}
        >
          {href ? (
            <Link href={href} className="underline-offset-4 hover:underline">
              {value}
            </Link>
          ) : (
            value
          )}
        </p>
        <p className="mt-1 text-xs text-balance text-muted-foreground">
          {hint}
        </p>
      </CardContent>
    </Card>
  )
}
