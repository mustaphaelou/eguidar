"use client"

import { Suspense } from "react"

import { AuthDialogs } from "./auth-dialogs"
import { SessionInactiveController } from "./session-inactive"

export function AuthSessionLayer({
  children,
  hasGoogle,
}: {
  children: React.ReactNode
  hasGoogle?: boolean
}) {
  return (
    <AuthDialogs hasGoogle={hasGoogle}>
      <Suspense fallback={null}>
        <SessionInactiveController />
      </Suspense>
      {children}
    </AuthDialogs>
  )
}
