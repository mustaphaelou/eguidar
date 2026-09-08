"use client"

// PROTOTYPE — throwaway floating switcher for the sign-in dialog redesign.
// Cycles ?variant=A|B|C while preserving every other search param.
// Delete this file when the winning variant is folded into the real dialog.

import { useCallback, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"

import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons"

export type PrototypeVariant = { key: string; name: string }

export function PrototypeSwitcher({
  variants,
  current,
}: {
  variants: PrototypeVariant[]
  current: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const goTo = useCallback(
    (key: string) => {
      const params = new URLSearchParams(searchParams)
      params.set("variant", key)
      router.replace(`?${params.toString()}`, { scroll: false })
    },
    [router, searchParams]
  )

  const cycle = useCallback(
    (direction: 1 | -1) => {
      const index = variants.findIndex((v) => v.key === current)
      const next =
        variants[(index + direction + variants.length) % variants.length]
      goTo(next.key)
    },
    [variants, current, goTo]
  )

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
      const target = document.activeElement
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return
      }
      event.preventDefault()
      cycle(event.key === "ArrowRight" ? 1 : -1)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [cycle])

  const active = variants.find((v) => v.key === current) ?? variants[0]

  return (
    <div className="fixed start-1/2 bottom-4 z-[70] flex -translate-x-1/2 items-center gap-1 rounded-full bg-foreground py-1.5 ps-1.5 pe-1.5 text-background shadow-lg rtl:translate-x-1/2">
      <button
        type="button"
        aria-label="Variante précédente"
        onClick={() => cycle(-1)}
        className="flex size-7 items-center justify-center rounded-full hover:bg-background/15"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
      </button>
      <span className="px-2 text-xs font-medium whitespace-nowrap">
        {active.key} — {active.name}
      </span>
      <button
        type="button"
        aria-label="Variante suivante"
        onClick={() => cycle(1)}
        className="flex size-7 items-center justify-center rounded-full hover:bg-background/15"
      >
        <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
      </button>
    </div>
  )
}
