export const NOM_DE_BASE_DE_LA_SONDE = "eguidar_probe"

const BASES_INTERDITES = new Set(["eguidar", "eguidar_test"])

function nomDeBase(url: URL): string {
  const premierSegment = url.pathname.replace(/^\/+/, "").split("/")[0] ?? ""
  try {
    return decodeURIComponent(premierSegment)
  } catch {
    return premierSegment
  }
}

function lireUrl(source: string, origine: string): URL {
  try {
    return new URL(source)
  } catch {
    throw new Error(
      `la base de la sonde est illisible (${origine} n'est pas une URL de connexion valide)`
    )
  }
}

export function validerBaseDeSonde(source: string): string {
  const url = lireUrl(source, "la valeur fournie")
  const nom = nomDeBase(url)

  if (nom === "") {
    throw new Error(
      "la base de la sonde n'a pas de nom de base : une URL comme postgresql://…/eguidar_probe est attendue"
    )
  }
  if (BASES_INTERDITES.has(nom.toLowerCase())) {
    throw new Error(
      `la sonde refuse la base « ${nom} » : elle migre, tronque et sème, et n'écrit jamais dans eguidar ni eguidar_test. Donnez E2E_DATABASE_URL pointant sur eguidar_probe.`
    )
  }
  return url.toString()
}

export function deriverBaseDeSonde(source: string): string {
  const url = lireUrl(source, "TEST_DATABASE_URL ou DATABASE_URL")
  url.pathname = `/${NOM_DE_BASE_DE_LA_SONDE}`
  return url.toString()
}

export function resoudreBaseDeSonde(
  environnement: Partial<NodeJS.ProcessEnv> = process.env
): string {
  const explicite = environnement.E2E_DATABASE_URL?.trim()
  if (explicite) return validerBaseDeSonde(explicite)

  const source =
    environnement.TEST_DATABASE_URL?.trim() ||
    environnement.DATABASE_URL?.trim()
  if (!source) {
    throw new Error(
      "aucune base de sonde : renseignez E2E_DATABASE_URL, ou TEST_DATABASE_URL pour que la sonde en dérive eguidar_probe"
    )
  }
  return validerBaseDeSonde(deriverBaseDeSonde(source))
}
