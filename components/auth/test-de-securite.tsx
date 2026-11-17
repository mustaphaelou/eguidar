"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ActionTestDeSecurite } from "@/lib/vocabulaire-test-de-securite"

type TurnstileOptions = {
  sitekey: string
  action: ActionTestDeSecurite
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

export type EtatTestDeSecurite = "attente" | "pret" | "indisponible"

function TestSecuriteWidget({
  siteKey,
  action,
  onTokenChange,
  etat,
  status,
  onStatusChange,
  resetSignal,
}: {
  siteKey: string
  action: ActionTestDeSecurite
  onTokenChange: (token: string | null) => void
  etat: EtatTestDeSecurite
  status: WidgetStatus
  onStatusChange: (status: WidgetStatus) => void
  resetSignal: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const onTokenChangeRef = useRef(onTokenChange)

  const [loaded, setLoaded] = useState(false)
  const [scriptAttempt, setScriptAttempt] = useState(0)

  const relancerScript = useCallback(() => {
    document.getElementById("turnstile-script")?.remove()
    setLoaded(false)
    setScriptAttempt((essai) => essai + 1)
  }, [])

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

  useEffect(() => {
    const marquerCharge = () => {
      setLoaded(true)
      onStatusChange("idle")
    }
    const marquerInjoignable = () => onStatusChange("error")
    const existing = document.getElementById(
      "turnstile-script"
    ) as HTMLScriptElement | null
    if (existing) {
      if (window.turnstile) {
        queueMicrotask(marquerCharge)
        return
      }
      existing.addEventListener("load", marquerCharge)
      existing.addEventListener("error", marquerInjoignable)
      return () => {
        existing.removeEventListener("load", marquerCharge)
        existing.removeEventListener("error", marquerInjoignable)
      }
    }
    const script = document.createElement("script")
    script.id = "turnstile-script"
    script.src = SCRIPT_SRC
    script.async = true
    script.defer = true
    script.addEventListener("load", marquerCharge)
    script.addEventListener("error", marquerInjoignable)
    document.head.appendChild(script)
    return () => {
      script.removeEventListener("load", marquerCharge)
      script.removeEventListener("error", marquerInjoignable)
    }
  }, [onStatusChange, scriptAttempt])

  useEffect(() => {
    if (!loaded || !containerRef.current || !window.turnstile) return
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      action,
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
  }, [loaded, siteKey, action, onStatusChange])

  useEffect(() => {
    if (resetSignal === 0) return
    queueMicrotask(() => resetWidget())
  }, [resetSignal, resetWidget])

  function retry() {
    onStatusChange("idle")
    if (!loaded) {
      relancerScript()
      return
    }
    resetWidget()
  }

  return (
    <div className="flex flex-col gap-1">
      <div
        ref={containerRef}
        data-testid="test-de-securite-widget"
        className={cn(
          "min-h-16 overflow-hidden rounded-xl border bg-background/60 p-1",
          etat === "indisponible" && "hidden"
        )}
      />
      {etat === "indisponible" && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs">
          <p className="font-medium text-amber-900">
            La vérification de sécurité n&apos;a pas pu aboutir.
          </p>
          <p className="mt-1 leading-5 text-amber-800">
            Réessayez dans un instant. Si cela persiste,{" "}
            <Link
              href="/contact"
              className="underline underline-offset-4 hover:text-amber-950"
            >
              contactez-nous
            </Link>{" "}
            — nous vous aiderons à régler le problème.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={retry}
          >
            Réessayer
          </Button>
        </div>
      )}
      {etat === "attente" && status === "idle" && (
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">
            Terminez la vérification de sécurité pour continuer.
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
      {etat === "attente" && status === "expired" && (
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">
            Vérification de sécurité expirée.
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

export function useTestDeSecurite(action: ActionTestDeSecurite) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  const [token, setToken] = useState<string | null>(null)
  const [status, setStatus] = useState<WidgetStatus>("idle")
  const [resetSignal, setResetSignal] = useState(0)

  const etat: EtatTestDeSecurite =
    !siteKey || token !== null
      ? "pret"
      : status === "error"
        ? "indisponible"
        : "attente"
  const peutEnvoyer = etat === "pret"

  function reset() {
    setToken(null)
    setStatus("idle")
    setResetSignal((count) => count + 1)
  }

  return {
    etat,
    peutEnvoyer,
    headers: token ? { "x-captcha-response": token } : undefined,
    field: siteKey ? (
      <TestSecuriteWidget
        siteKey={siteKey}
        action={action}
        onTokenChange={setToken}
        etat={etat}
        status={status}
        onStatusChange={setStatus}
        resetSignal={resetSignal}
      />
    ) : null,
    reset,
  }
}
