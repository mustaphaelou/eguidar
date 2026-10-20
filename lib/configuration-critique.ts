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

export function avertirConfigurationCritiqueManquante(
  env: Environnement = process.env,
  avertir: (message: string) => void = console.warn
): void {
  if (env.NODE_ENV !== "production") return
  if (env.NEXT_PHASE === "phase-production-build") return

  const manquantes = variablesCritiquesManquantes(env)
  if (manquantes.length === 0) return

  avertir(
    `[configuration] Variables critiques absentes : ${manquantes.join(", ")}. Les protections correspondantes restent dégradées jusqu'à leur renseignement.`
  )
}
