/**
 * PROTOTYPE (#963) — la boutique vide est le sujet ; le Tableau de bord réel
 * reste à un clic, comme référence. `?etat=reel` rend la page d'aujourd'hui.
 */
export type EtatPrototype = "vide" | "reel"

export function etatDepuis(valeur: string | undefined): EtatPrototype {
  return valeur === "reel" ? "reel" : "vide"
}
