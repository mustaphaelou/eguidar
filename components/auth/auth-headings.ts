"use client"

import { useState } from "react"

import { parseAuthParams } from "@/lib/lien-de-connexion"

export type AuthDialogKind = "login" | "signup"

const COMMERCE_PREFIXES = ["/produit", "/panier", "/checkout"]

function leadsToOrder(destination: string): boolean {
  return COMMERCE_PREFIXES.some(
    (prefix) =>
      destination === prefix ||
      destination.startsWith(`${prefix}/`) ||
      destination.startsWith(`${prefix}?`)
  )
}

export function headingForDestination(
  kind: AuthDialogKind,
  destination: string | null
): string | null {
  if (!destination) return null
  const order = leadsToOrder(destination)
  if (kind === "login") {
    return order
      ? "Connectez-vous pour finaliser votre commande"
      : "Connectez-vous pour continuer"
  }
  return order
    ? "Créez votre compte pour finaliser votre commande"
    : "Créez votre compte pour continuer"
}

export function useAuthDestination(): string | null {
  const [destination] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : parseAuthParams(window.location.search).next
  )

  return destination
}
