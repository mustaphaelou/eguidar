export interface IdentifiantsCompteAdmin {
  email: string
  motDePasse: string
}

const VARIABLES = ["ADMIN_EMAIL", "ADMIN_PASSWORD"] as const

export function identifiantsCompteAdmin(
  env: Record<string, string | undefined> = process.env
): IdentifiantsCompteAdmin {
  const email = env.ADMIN_EMAIL ?? ""
  const motDePasse = env.ADMIN_PASSWORD ?? ""
  const valeurs = { ADMIN_EMAIL: email, ADMIN_PASSWORD: motDePasse }
  const manquantes = VARIABLES.filter((nom) => valeurs[nom].trim() === "")

  if (manquantes.length > 0) {
    throw new Error(
      `Le seed refuse de créer le compte admin sans ${manquantes.join(" ni ")} : renseignez ${manquantes.length > 1 ? "ces variables" : "cette variable"} dans .env.`
    )
  }

  return { email, motDePasse }
}
