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
 * Un montant suit la largeur de sa carte : `cqi` est relatif au `CardContent`,
 * qui porte `@container`. La borne haute est 1,25 rem, un cran sous les
 * comptes, pour que l'argent ne remonte jamais au niveau d'un nombre d'articles.
 */
export const VALEUR_MONETAIRE =
  "text-[length:clamp(0.5rem,10.5cqi,1.25rem)] font-semibold tracking-tight break-normal whitespace-nowrap tabular-nums"

/**
 * Le retour d'appui d'une carte cliquable : 0,97 à 160 ms, sous
 * `prefers-reduced-motion: no-preference`. Le lien couvre la carte entière par
 * son `::after`, donc `:has(:active)` allume la carte au doigt.
 */
const CARTE_CLIQUABLE =
  "relative motion-safe:has-[:active]:scale-[0.97] motion-safe:transition-transform motion-safe:duration-[160ms] motion-safe:ease-out"

/**
 * Le survol n'existe que sur un pointeur fin : un écran tactile ne garde pas
 * l'état souligné après le tap.
 */
const SURVOL_SOULIGNE =
  "[@media(hover:hover)_and_(pointer:fine)]:hover:underline"

export function CarteStat({
  label,
  value,
  hint,
  icon,
  href,
  action,
  valueClassName = VALEUR_DE_CARTE,
}: {
  label: string
  value: React.ReactNode
  hint: React.ReactNode
  icon: React.ComponentProps<typeof HugeiconsIcon>["icon"]
  href?: string
  /** Le nom accessible du lien qui couvre la carte. */
  action?: string
  /** La taille de la valeur : les montants suivent la carte (`VALEUR_MONETAIRE`). */
  valueClassName?: string
}) {
  return (
    <Card
      size="sm"
      className={cn(
        "h-full gap-3",
        href ? CARTE_CLIQUABLE : undefined,
        href && "has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring"
      )}
    >
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
            <Link
              href={href}
              aria-label={action}
              className={cn(
                "inline-block underline-offset-4 after:absolute after:inset-0 after:content-['']",
                SURVOL_SOULIGNE
              )}
            >
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
