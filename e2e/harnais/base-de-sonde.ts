/**
 * La base de la sonde : une base dédiée, jamais celle que l'on développe.
 *
 * `E2E_DATABASE_URL` la déclare explicitement ; sinon elle est dérivée de la
 * base de test (ou, à défaut, de la base de développement) en remplaçant son
 * nom par `eguidar_probe`. Toute URL qui désigne `eguidar` ou `eguidar_test`
 * est refusée : la sonde migre, tronque et sème, elle ne doit pas effacer le
 * travail de quelqu'un.
 */

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

/**
 * Refuse les deux bases du poste et rend l'URL validée, telle quelle.
 */
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

/** Remplace le nom de base par `eguidar_probe`, en gardant hôte, port et options. */
export function deriverBaseDeSonde(source: string): string {
  const url = lireUrl(source, "TEST_DATABASE_URL ou DATABASE_URL")
  url.pathname = `/${NOM_DE_BASE_DE_LA_SONDE}`
  return url.toString()
}

/**
 * L'URL que la sonde utilise, dans l'ordre : explicite, dérivée de la base de
 * test, puis dérivée de la base de développement.
 */
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
