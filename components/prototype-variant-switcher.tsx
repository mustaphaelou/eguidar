"use client"

import { useCallback, useEffect } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import {
  PROTOTYPE_VARIANT_NAMES,
  parsePrototypeVariant,
  stepPrototypeVariant,
  type PrototypeVariant,
} from "@/lib/prototype-variant"

export function PrototypeVariantSwitcher({
  names = PROTOTYPE_VARIANT_NAMES,
}: {
  names?: Record<PrototypeVariant, string>
} = {}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const current = parsePrototypeVariant(searchParams.get("variant"))

  const goTo = useCallback(
    (variant: PrototypeVariant) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set("variant", variant)
      router.replace(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams]
  )

  const step = useCallback(
    (delta: number) => {
      goTo(stepPrototypeVariant(current, delta))
    },
    [current, goTo]
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.matches("input, textarea, [contenteditable='true']")) return
      if (event.key === "ArrowLeft") step(-1)
      else if (event.key === "ArrowRight") step(1)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [step])

  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-foreground px-4 py-2 text-background shadow-lg">
      <button
        type="button"
        aria-label="Variante précédente"
        onClick={() => step(-1)}
        className="flex size-6 items-center justify-center rounded-full transition-colors hover:bg-background/20"
      >
        ←
      </button>
      <span className="text-sm font-medium">
        {current} — {names[current] ?? PROTOTYPE_VARIANT_NAMES[current]}
      </span>
      <button
        type="button"
        aria-label="Variante suivante"
        onClick={() => step(1)}
        className="flex size-6 items-center justify-center rounded-full transition-colors hover:bg-background/20"
      >
        →
      </button>
    </div>
  )
}
