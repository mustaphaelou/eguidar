"use client"

import { Suspense } from "react"

import { AuthDialogs } from "./auth-dialogs"
import { SessionInactiveController } from "./session-inactive"

export function AuthSessionLayer({
  children,
  hasGoogle,
  hasFacebook,
}: {
  children: React.ReactNode
  hasGoogle?: boolean
  hasFacebook?: boolean
}) {
  return (
    <AuthDialogs hasGoogle={hasGoogle} hasFacebook={hasFacebook}>
      <Suspense fallback={null}>
        <SessionInactiveController />
      </Suspense>
      {children}
    </AuthDialogs>
  )
}
