export function estObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur)
}

export function estTexteNonVide(valeur: unknown): valeur is string {
  return typeof valeur === "string" && valeur.trim() !== ""
}

export function messageDe(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur)
}
