export const VARIABLES_CRITIQUES = [
  "RESEND_API_KEY",
  "TURNSTILE_SECRET_KEY",
] as const

export type VariableCritique = (typeof VARIABLES_CRITIQUES)[number]

type Environnement = Record<string, string | undefined>

export function variablesCritiquesManquantes(
  env: Environnement
): VariableCritique[] {
  return VARIABLES_CRITIQUES.filter((nom) => (env[nom] ?? "").trim() === "")
}

/**
 * Les deux moitiés du Test de sécurité vivent dans deux variables distinctes :
 * la clé publique rend le widget, la clé secrète le vérifie. Une seule des deux
 * renseignée est une incohérence : soit le serveur réclame un jeton qu'aucun
 * widget ne peut produire (impasse), soit le widget est rendu sans que le
 * serveur le vérifie (protection affaiblie). Le retour est le message à
 * avertir, ou null quand les deux moitiés s'accordent.
 */
export function incoherenceTestDeSecurite(env: Environnement): string | null {
  const secret = (env.TURNSTILE_SECRET_KEY ?? "").trim()
  const sitekey = (env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "").trim()
  if (Boolean(secret) === Boolean(sitekey)) return null

  if (secret) {
    return "NEXT_PUBLIC_TURNSTILE_SITE_KEY est absente alors que TURNSTILE_SECRET_KEY est renseignée : le serveur réclamera un Test de sécurité qu'aucun widget ne rendra."
  }
  return "TURNSTILE_SECRET_KEY est absente alors que NEXT_PUBLIC_TURNSTILE_SITE_KEY est renseignée : le widget sera rendu sans que le serveur ne le vérifie."
}

export function avertirConfigurationCritiqueManquante(
  env: Environnement = process.env,
  avertir: (message: string) => void = console.warn
): void {
  if (env.NODE_ENV !== "production") return
  if (env.NEXT_PHASE === "phase-production-build") return

  const manquantes = variablesCritiquesManquantes(env)
  const incoherence = incoherenceTestDeSecurite(env)
  if (manquantes.length === 0 && incoherence === null) return

  const parties: string[] = []
  if (manquantes.length > 0) {
    parties.push(
      `Variables critiques absentes : ${manquantes.join(", ")}. Les protections correspondantes restent dégradées jusqu'à leur renseignement.`
    )
  }
  if (incoherence) parties.push(incoherence)

  avertir(`[configuration] ${parties.join(" ")}`)
}
