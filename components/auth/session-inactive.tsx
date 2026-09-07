"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"

import { SESSION_INACTIVE_SECONDS } from "@/lib/session-constants"
import { signOut, useSession } from "@/lib/client"

import { useAuthUrlSync } from "./use-auth-url-sync"

const ACTIVITY_EVENTS = [
  "pointerdown",
  "pointermove",
  "touchstart",
  "touchmove",
  "scroll",
  "keydown",
] as const

const NOTICE_DURATION_MS = 5000

export const SESSION_INACTIVE_NOTICE =
  "Votre session a pris fin pour cause d'inactivité."

export function SessionInactiveController() {
  const { data: session, isPending } = useSession()
  const { openLoginForCurrentPage } = useAuthUrlSync()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [noticeVisible, setNoticeVisible] = useState(false)
  const timerRef = useRef<number | null>(null)
  const expiringRef = useRef(false)
  const lastActivityRef = useRef<number | null>(null)
  const sessionRef = useRef(session)
  const expiryRef = useRef<() => void>(() => {})

  const handleExpiry = useCallback(async () => {
    if (expiringRef.current || !sessionRef.current) return
    expiringRef.current = true
    setNoticeVisible(true)
    await signOut()
    openLoginForCurrentPage()
  }, [openLoginForCurrentPage])

  useEffect(() => {
    sessionRef.current = session
    expiryRef.current = () => {
      void handleExpiry()
    }
  }, [session, handleExpiry])

  const resetTimer = useCallback(() => {
    if (expiringRef.current) return
    lastActivityRef.current = Date.now()
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      expiryRef.current()
    }, SESSION_INACTIVE_SECONDS * 1000)
  }, [])

  useEffect(() => {
    if (isPending || !session) return

    const onWake = () => {
      if (document.visibilityState !== "visible") return
      if (expiringRef.current) return
      const lastActivity = lastActivityRef.current
      if (lastActivity === null) return
      const elapsed = Date.now() - lastActivity
      const remaining = SESSION_INACTIVE_SECONDS * 1000 - elapsed
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = null
      if (remaining <= 0) {
        expiryRef.current()
        return
      }
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        expiryRef.current()
      }, remaining)
    }

    document.addEventListener("visibilitychange", onWake)
    return () => {
      document.removeEventListener("visibilitychange", onWake)
    }
  }, [isPending, session])

  useEffect(() => {
    if (isPending || !session) return
    expiringRef.current = false
    resetTimer()

    const onActivity = () => resetTimer()
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true })
    }

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity)
      }
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [isPending, session, resetTimer])

  useEffect(() => {
    if (isPending || !session) return
    resetTimer()
  }, [pathname, searchParams, isPending, session, resetTimer])

  useEffect(() => {
    if (!noticeVisible) return
    const id = window.setTimeout(
      () => setNoticeVisible(false),
      NOTICE_DURATION_MS
    )
    return () => window.clearTimeout(id)
  }, [noticeVisible])

  if (!noticeVisible) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
    >
      <p className="rounded-md bg-foreground px-4 py-2 text-sm text-background shadow-lg">
        {SESSION_INACTIVE_NOTICE}
      </p>
    </div>
  )
}
