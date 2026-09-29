"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"

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

function TestSecuriteWidget({
  siteKey,
  onTokenChange,
  status,
  onStatusChange,
  resetSignal,
}: {
  siteKey: string
  onTokenChange: (token: string | null) => void
  status: WidgetStatus
  onStatusChange: (status: WidgetStatus) => void
  resetSignal: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const onTokenChangeRef = useRef(onTokenChange)

  const [loaded, setLoaded] = useState(false)

  const resetWidget = useCallback(() => {
    if (!widgetIdRef.current || !window.turnstile) return
    try {
      window.turnstile.reset(widgetIdRef.current)
    } catch {
      window.turnstile.remove(widgetIdRef.current)
      widgetIdRef.current = null
      setLoaded(false)
      queueMicrotask(() => setLoaded(true))
    }
  }, [])

  useEffect(() => {
    onTokenChangeRef.current = onTokenChange
  })

  // La balige appartient au document, pas au Test de sécurité : aucun
  // démontage ne la retire. Le Test de sécurité suivant la retrouve, attend son
  // `load` ou lit `window.turnstile` si elle a déjà chargé — sans jamais
  // redemander `api.js`.
  useEffect(() => {
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
  }, [])

  useEffect(() => {
    if (!loaded || !containerRef.current || !window.turnstile) return
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: (token) => onTokenChangeRef.current(token),
      "expired-callback": () => {
        onTokenChangeRef.current(null)
        onStatusChange("expired")
      },
      "error-callback": () => {
        onTokenChangeRef.current(null)
        onStatusChange("error")
      },
      theme: "auto",
    })
    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }
    }
  }, [loaded, siteKey, onStatusChange])

  useEffect(() => {
    if (resetSignal === 0) return
    queueMicrotask(() => resetWidget())
  }, [resetSignal, resetWidget])

  function retry() {
    onStatusChange("idle")
    resetWidget()
  }

  return (
    <div className="flex flex-col gap-1">
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

export function useTestDeSecurite() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  const [token, setToken] = useState<string | null>(null)
  const [status, setStatus] = useState<WidgetStatus>("idle")
  const [resetSignal, setResetSignal] = useState(0)

  function reset() {
    setToken(null)
    setStatus("idle")
    setResetSignal((count) => count + 1)
  }

  return {
    ready: !siteKey || token !== null,
    headers: token ? { "x-captcha-response": token } : undefined,
    field: siteKey ? (
      <TestSecuriteWidget
        siteKey={siteKey}
        onTokenChange={setToken}
        status={status}
        onStatusChange={setStatus}
        resetSignal={resetSignal}
      />
    ) : null,
    reset,
  }
}
