"use client"

import { Suspense } from "react"

import { AuthDialogs } from "./auth-dialogs"
import { SessionInactiveController } from "./session-inactive"

export function AuthSessionLayer({
  children,
  hasGoogle,
  hasApple,
}: {
  children: React.ReactNode
  hasGoogle?: boolean
  hasApple?: boolean
}) {
  return (
    <AuthDialogs hasGoogle={hasGoogle} hasApple={hasApple}>
      <Suspense fallback={null}>
        <SessionInactiveController />
      </Suspense>
      {children}
    </AuthDialogs>
  )
}
