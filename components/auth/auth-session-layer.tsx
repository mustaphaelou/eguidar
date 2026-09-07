"use client"

import { Suspense } from "react"

import { AuthDialogs } from "./auth-dialogs"
import { SessionInactiveController } from "./session-inactive"

export function AuthSessionLayer({ children }: { children: React.ReactNode }) {
  return (
    <AuthDialogs>
      <Suspense fallback={null}>
        <SessionInactiveController />
      </Suspense>
      {children}
    </AuthDialogs>
  )
}
