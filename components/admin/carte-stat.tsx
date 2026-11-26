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

export const VALEUR_MONETAIRE =
  "text-[length:var(--text-hero,clamp(1.5rem,10.5cqi,3.5rem))] font-semibold tracking-tight break-normal whitespace-nowrap tabular-nums"

export const VALEUR_CHIFFRE =
  "text-[length:var(--text-chiffre,clamp(1rem,5cqi,1.75rem))] font-semibold tracking-tight tabular-nums"

const CARTE_CLIQUABLE =
  "relative motion-safe:has-[:active]:scale-[0.97] motion-safe:transition-transform motion-safe:duration-[160ms] motion-safe:ease-out"

const SURVOL_SOULIGNE =
  "[@media(hover:hover)_and_(pointer:fine)]:hover:underline"

export function CarteStat({
  label,
  value,
  hint,
  icon,
  href,
  action,
  valueClassName = VALEUR_CHIFFRE,
  variant = "defaut",
  legende,
  badge,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  icon?: React.ComponentProps<typeof HugeiconsIcon>["icon"]
  href?: string
  action?: string
  valueClassName?: string
  variant?: "defaut" | "hero" | "chiffre"
  legende?: React.ReactNode
  badge?: React.ReactNode
}) {
  if (variant === "chiffre") {
    const classes = cn(
      VALEUR_CHIFFRE,
      CARTE_CLIQUABLE,
      "underline-offset-4",
      SURVOL_SOULIGNE
    )

    return href ? (
      <Link href={href} aria-label={action} className={classes}>
        {value}
      </Link>
    ) : (
      <span className={classes}>{value}</span>
    )
  }

  const cliquable = variant === "defaut" && href

  return (
    <Card
      size="sm"
      className={cn(
        "h-full justify-between gap-3 border border-border/60",
        cliquable ? CARTE_CLIQUABLE : undefined,
        cliquable &&
          "has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring"
      )}
    >
      <CardHeader className="items-center">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        {icon ? (
          <CardAction>
            <span className="flex size-8 items-center justify-center rounded-lg bg-muted/70 text-muted-foreground">
              <HugeiconsIcon icon={icon} strokeWidth={2} className="size-4" />
            </span>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="@container flex flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p
            className={cn(
              "font-semibold tracking-tight break-normal tabular-nums",
              valueClassName
            )}
          >
            {cliquable ? (
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
          {badge ?? null}
        </div>
        {hint ? (
          <p className="text-xs text-balance text-muted-foreground">{hint}</p>
        ) : null}
        {variant === "hero" && legende ? (
          <p className="text-xs text-muted-foreground">{legende}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}
