"use client"

import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type TurnstileOptions = {
  sitekey: string
  callback: (token: string) => void
  "expired-callback"?: () => void
  "error-callback"?: () => void
  theme?: "auto" | "light" | "dark"
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: TurnstileOptions) => string
      remove: (widgetId: string) => void
      reset: (widgetId?: string) => void
    }
  }
}

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

type WidgetStatus = "idle" | "expired" | "error"

export function Turnstile({
  onTokenChange,
  className,
}: {
  onTokenChange: (token: string | null) => void
  className?: string
}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const onTokenChangeRef = useRef(onTokenChange)

  const [loaded, setLoaded] = useState(false)
  const [status, setStatus] = useState<WidgetStatus>("idle")

  useEffect(() => {
    onTokenChangeRef.current = onTokenChange
  })

  useEffect(() => {
    if (!siteKey) return
    const existing = document.getElementById(
      "turnstile-script"
    ) as HTMLScriptElement | null
    if (existing) {
      if (window.turnstile) queueMicrotask(() => setLoaded(true))
      else existing.addEventListener("load", () => setLoaded(true))
      return
    }
    const script = document.createElement("script")
    script.id = "turnstile-script"
    script.src = SCRIPT_SRC
    script.async = true
    script.defer = true
    script.addEventListener("load", () => setLoaded(true))
    document.head.appendChild(script)
    return () => script.remove()
  }, [siteKey])

  useEffect(() => {
    if (!loaded || !siteKey || !containerRef.current || !window.turnstile)
      return
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: (token) => onTokenChangeRef.current(token),
      "expired-callback": () => {
        onTokenChangeRef.current(null)
        setStatus("expired")
      },
      "error-callback": () => {
        onTokenChangeRef.current(null)
        setStatus("error")
      },
      theme: "auto",
    })
    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }
    }
  }, [loaded, siteKey])

  function retry() {
    setStatus("idle")
    if (widgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.reset(widgetIdRef.current)
      } catch {
        window.turnstile?.remove(widgetIdRef.current)
        widgetIdRef.current = null
        setLoaded(false)
        queueMicrotask(() => setLoaded(true))
      }
    }
  }

  if (!siteKey) return null

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div
        ref={containerRef}
        className="min-h-16 overflow-hidden rounded-xl border bg-background/60 p-1"
      />
      {status !== "idle" && (
        <div className="flex items-center justify-between gap-2 text-xs">
          <span
            className={
              status === "error" ? "text-destructive" : "text-muted-foreground"
            }
          >
            {status === "expired"
              ? "Vérification de sécurité expirée."
              : "Impossible de charger le test de sécurité."}
          </span>
          <Button
            type="button"
            variant="link"
            size="xs"
            className="h-auto p-0"
            onClick={retry}
          >
            Réessayer
          </Button>
        </div>
      )}
    </div>
  )
}
