"use client"

import type { ApercuDuPanier, CompteurDuPanier } from "@/lib/panier-transport"

const ADRESSE_DU_COMPTEUR = "/api/panier"
const ADRESSE_DE_L_APERCU = "/api/panier/apercu"

async function lireJson<T>(
  adresse: string,
  signal: AbortSignal
): Promise<T | null> {
  try {
    const reponse = await fetch(adresse, { signal, cache: "no-store" })
    if (!reponse.ok) return null
    return (await reponse.json()) as T
  } catch {
    return null
  }
}

export async function lireLeCompteurDuPanier(
  signal: AbortSignal
): Promise<number | null> {
  const corps = await lireJson<CompteurDuPanier>(ADRESSE_DU_COMPTEUR, signal)
  return typeof corps?.itemCount === "number" ? corps.itemCount : null
}

export async function lireLApercuDuPanier(
  signal: AbortSignal
): Promise<ApercuDuPanier | null> {
  return lireJson<ApercuDuPanier>(ADRESSE_DE_L_APERCU, signal)
}
