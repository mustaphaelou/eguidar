"use client"

import { useSyncExternalStore } from "react"

import { authClient } from "@/lib/client"

function nePasSouscrire(): () => void {
  return () => {}
}

function lireLeMoyen(): string | null {
  return authClient.getLastUsedLoginMethod()
}

function lireLeMoyenSurLeServeur(): null {
  return null
}

export function useMoyenDeConnexion(): string | null {
  return useSyncExternalStore(
    nePasSouscrire,
    lireLeMoyen,
    lireLeMoyenSurLeServeur
  )
}
