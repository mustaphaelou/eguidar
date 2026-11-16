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

export const VALEUR_DE_CARTE = "text-xl sm:text-2xl"

export const VALEUR_MONETAIRE =
  "text-[length:clamp(0.5rem,10.5cqi,1.25rem)] font-semibold tracking-tight break-normal whitespace-nowrap tabular-nums"

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
  valueClassName = VALEUR_DE_CARTE,
}: {
  label: string
  value: React.ReactNode
  hint: React.ReactNode
  icon: React.ComponentProps<typeof HugeiconsIcon>["icon"]
  href?: string
  action?: string
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
