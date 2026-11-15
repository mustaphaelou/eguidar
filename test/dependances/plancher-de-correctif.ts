import { existsSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

/** Le nombre de dossiers remontés avant de renoncer à trouver un manifeste. */
const PROFONDEUR_DE_REMONTEE = 8

/** La section de `package.json` qui porte une plage déclarée. */
export type SectionDeManifeste =
  "dependencies" | "devDependencies" | "overrides"

/** L'endroit de `package.json` où la plage déclarée d'un paquet est écrite. */
export type EmplacementDePlage = {
  section: SectionDeManifeste
  /** La clé de la section, quand elle diffère du nom du paquet. */
  cle?: string
}

/** Ce que la ligne exige quand le paquet est absent de l'arbre installé. */
export type DispositionDabsence = "echoue" | "passe"

/**
 * La ligne d'un paquet installé : son plancher de correctif, les avis qui le
 * fondent, la plage qui le déclare et sa politique d'absence.
 */
export type PlancherInstalle = {
  paquet: string
  plancher: string
  avis: readonly string[]
  raison: string
  plage: EmplacementDePlage
  absence: DispositionDabsence
  /** Les paquets qui doivent partager la version de la ligne. */
  famille?: readonly string[]
}

/** Les parties numériques d'une version, sans sa préversion. */
function partiesDeVersion(version: string): number[] {
  const release = version.split("-", 1)[0] ?? ""
  return release.split(".").map((partie) => Number.parseInt(partie, 10))
}

/** Vrai quand `version` tient le plancher `plancher`. */
export function respecteLePlancher(version: string, plancher: string): boolean {
  if (version.includes("-")) return false
  const [majeure = 0, mineure = 0, correctif = 0] = partiesDeVersion(version)
  const [majeurePlancher = 0, mineurePlancher = 0, correctifPlancher = 0] =
    partiesDeVersion(plancher)
  if (majeure !== majeurePlancher) return majeure > majeurePlancher
  if (mineure !== mineurePlancher) return mineure > mineurePlancher
  return correctif >= correctifPlancher
}

function manifesteDansLaRemontee(
  cheminDentree: string,
  paquet: string
): { version?: unknown } | null {
  let dossier = path.dirname(cheminDentree)
  for (let profondeur = 0; profondeur < PROFONDEUR_DE_REMONTEE; profondeur++) {
    const cheminManifeste = path.join(dossier, "package.json")
    if (existsSync(cheminManifeste)) {
      const manifeste = JSON.parse(readFileSync(cheminManifeste, "utf8")) as {
        name?: unknown
        version?: unknown
      }
      if (manifeste.name === paquet) return manifeste
    }
    const parent = path.dirname(dossier)
    if (parent === dossier) return null
    dossier = parent
  }
  return null
}

/**
 * La version du paquet dans l'arbre installé, ou `null` quand il est absent.
 * Certains paquets n'exportent pas leur manifeste : on remonte alors depuis
 * leur entrée résolue, comme le demande l'arbre installé.
 */
export function versionInstallee(paquet: string): string | null {
  const require = createRequire(import.meta.url)
  try {
    const cheminManifeste = require.resolve(`${paquet}/package.json`)
    const manifeste = JSON.parse(readFileSync(cheminManifeste, "utf8")) as {
      version?: unknown
    }
    return typeof manifeste.version === "string" ? manifeste.version : null
  } catch {
    // Le manifeste n'est pas exporté : la remontée depuis l'entrée le trouve.
  }
  try {
    const manifeste = manifesteDansLaRemontee(require.resolve(paquet), paquet)
    return typeof manifeste?.version === "string" ? manifeste.version : null
  } catch {
    return null
  }
}

/** Le plancher qu'une plage déclare : l'opérateur qui la précède est retiré. */
export function plancherDePlage(plage: string): string {
  return plage.replace(/^[^0-9]*/, "")
}

// 1.7.7 is the release that closes every open better-auth advisory:
// - GHSA-965c-763c-88jm (critical): an OAuth state value is accepted as a
//   Magic Link token, so an attacker can sign in as any known address;
// - GHSA-r4xp-prcw-77qf (high): an OAuth Proxy deployment lets an attacker
//   sign in as another user;
// - GHSA-q84f-53jg-9ppm (high): device login approval shows neither the
//   requesting client nor its permissions (patched in 1.7.0-rc.3);
// - GHSA-44jh-23m7-hpcf (low): concurrent drizzle-adapter requests exceed
//   PostgreSQL-backed rate limits.
export const PLANCHERS_INSTALLES: readonly PlancherInstalle[] = [
  {
    paquet: "next",
    plancher: "16.4.1",
    avis: [
      "GHSA-p293-qw3h-jr36",
      "GHSA-2xp9-vwfh-vxw4",
      "GHSA-vcvr-r3jv-pc5j",
      "GHSA-673q-mjm6-r5xr",
      "GHSA-2464-fhr4-w9xw",
      "GHSA-p3m5-59mp-jv5r",
    ],
    raison:
      "16.4.1 ferme l'exécution de code de `use cache`, l'optimisation d'image SVG et le déni de service des Server Actions",
    plage: { section: "dependencies" },
    absence: "echoue",
  },
  {
    paquet: "better-auth",
    plancher: "1.7.7",
    avis: [
      "GHSA-965c-763c-88jm",
      "GHSA-r4xp-prcw-77qf",
      "GHSA-q84f-53jg-9ppm",
      "GHSA-44jh-23m7-hpcf",
    ],
    raison: "1.7.7 ferme tous les avis better-auth ouverts",
    plage: { section: "dependencies" },
    absence: "echoue",
    famille: ["@better-auth/core", "@better-auth/prisma-adapter"],
  },
  {
    paquet: "fast-uri",
    plancher: "3.1.8",
    avis: ["GHSA-hrr3-gc8f-f4qj"],
    raison:
      "3.1.8 normalise les octets pourcent-encodés d'un hôte avant sa comparaison",
    plage: { section: "overrides" },
    absence: "passe",
  },
  {
    paquet: "hono",
    plancher: "4.13.11",
    avis: [
      "GHSA-5r4p-p66f-jhc7",
      "GHSA-gqvv-2mrq-wpjv",
      "GHSA-g6gw-c38x-mqfc",
      "GHSA-crvj-82cr-hjcx",
    ],
    raison: "4.13.11 ferme le double décodage du chemin par serveStatic",
    plage: { section: "overrides" },
    absence: "passe",
  },
  {
    paquet: "ip-address",
    plancher: "10.7.1",
    avis: [
      "GHSA-rpw4-54j3-4h4q",
      "GHSA-2vr4-cq9g-pvrc",
      "GHSA-j6r3-76f7-8jcv",
      "GHSA-h3mg-xc3c-68pw",
    ],
    raison:
      "10.7.1 corrige les décisions d'allowlist : link-local, NAT64, sous-réseau v4/v6 et diagnostic non borné",
    plage: { section: "overrides" },
    absence: "passe",
  },
  {
    paquet: "mysql2",
    plancher: "3.22.0",
    avis: ["GHSA-3f6p-5ww8-9rcr"],
    raison:
      "3.22.0 empêche le passage en clair lors d'un changement d'authentification",
    plage: { section: "overrides" },
    absence: "passe",
  },
  {
    paquet: "systeminformation",
    plancher: "5.33.16",
    avis: ["GHSA-3f7j-7jwc-fxfj"],
    raison: "5.33.16 ferme l'injection de commandes par caractères Unicode",
    plage: { section: "overrides" },
    absence: "passe",
  },
  {
    paquet: "vitest",
    plancher: "4.1.12",
    avis: ["GHSA-xp26-3454-mjgp", "GHSA-qxg6-89mg-rqv8"],
    raison:
      "4.1.12 porte le @vitest/mocker qui normalise le chemin et sérialise l'URL d'un mock",
    plage: { section: "devDependencies" },
    absence: "echoue",
  },
  {
    paquet: "@vitest/mocker",
    plancher: "4.1.12",
    avis: ["GHSA-xp26-3454-mjgp", "GHSA-qxg6-89mg-rqv8"],
    raison:
      "4.1.12 normalise les antislashs du chemin et sérialise l'URL d'un mock manuel",
    plage: { section: "overrides" },
    absence: "echoue",
  },
]
