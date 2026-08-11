"use client"

import { useEffect, useRef, useState } from "react"

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
    }
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

export function Turnstile({
  onTokenChange,
}: {
  onTokenChange: (token: string | null) => void
}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const onTokenChangeRef = useRef(onTokenChange)

  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    onTokenChangeRef.current = onTokenChange
  })

  useEffect(() => {
    if (!siteKey) return
    const existing = document.getElementById("turnstile-script") as HTMLScriptElement | null
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
    if (!loaded || !siteKey || !containerRef.current || !window.turnstile) return
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: (token) => onTokenChangeRef.current(token),
      "expired-callback": () => onTokenChangeRef.current(null),
      "error-callback": () => onTokenChangeRef.current(null),
      theme: "light",
    })
    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }
    }
  }, [loaded, siteKey])

  if (!siteKey) return null

  return <div ref={containerRef} className="min-h-16" />
}
