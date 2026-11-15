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

/** Une copie d'un paquet dans l'arbre que le fichier de verrouillage décrit. */
export type Copie = {
  paquet: string
  /** La clé de `packages` du fichier de verrouillage. */
  chemin: string
  version: string
}

/** Les entrées de `packages` du fichier de verrouillage. */
export type ArbreDeVerrouillage = Record<string, { version?: unknown }>

/**
 * La ligne d'un paquet dont le plancher est prouvé par chaque copie du fichier
 * de verrouillage : son plancher, les avis qui le fondent, la plage d'override
 * qui le déclare et la ligne majeure à laquelle il s'applique.
 */
export type PlancherDeCopie = {
  paquet: string
  majeure: number
  plancher: string
  avis: readonly string[]
  raison: string
  plage: EmplacementDePlage
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

/** Le contenu de `packages` dans le fichier de verrouillage du dépôt. */
export function arbreDeVerrouillage(): ArbreDeVerrouillage {
  const racine = path.resolve(import.meta.dirname, "..", "..")
  const lock = JSON.parse(
    readFileSync(path.join(racine, "package-lock.json"), "utf8")
  ) as { packages?: ArbreDeVerrouillage }
  return lock.packages ?? {}
}

/**
 * Les copies qu'un arbre de verrouillage installe d'un paquet : `npm ci` rejoue
 * cet arbre, et une résolution depuis la racine ne voit pas les copies
 * imbriquées sous leur consommateur.
 */
export function copiesDe(
  paquet: string,
  arbre: ArbreDeVerrouillage = arbreDeVerrouillage()
): Copie[] {
  const suffixe = `node_modules/${paquet}`
  return Object.entries(arbre)
    .filter(([cle]) => cle === suffixe || cle.endsWith(`/${suffixe}`))
    .map(([chemin, entree]) => ({
      paquet,
      chemin,
      version: typeof entree.version === "string" ? entree.version : "",
    }))
}

/** La ligne majeure d'une version. */
export function majeureDeVersion(version: string): number {
  return partiesDeVersion(version)[0] ?? 0
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

// A row whose floor is evidenced by the lockfile rather than by an installed
// package: the tree can hold one copy per major line, and each line was patched
// on its own schedule, so the override key pins one range per line.
//
// minimatch (GHSA-g3hv-75wg-m249, CVE-2026-118764) — during the first phase of
// pattern preprocessing, minimatch rewrites `**/../` into two patterns and
// re-runs the pass until nothing changes, so N occurrences become 2**N
// patterns; the second phase then compares every pair, which is quadratic in
// that set. 11.0.1 is the first release that stops the first phase at
// `braceExpandMax` and skips the pairwise pass above 1000 patterns.
//
// brace-expansion (GHSA-q2hr-2g5m-vwhr, GHSA-qhr7-859c-m2p7,
// GHSA-6j4f-fj2g-mc7p) — a glob is expanded once per match, so the quadratic
// `{a},b}` expansion and the two stack-exhaustion recursions are a CPU and
// stack DoS; both major lines were patched separately.
export const PLANCHERS_DE_COPIE: readonly PlancherDeCopie[] = [
  {
    paquet: "minimatch",
    majeure: 11,
    plancher: "11.0.1",
    avis: ["GHSA-g3hv-75wg-m249"],
    raison:
      "11.0.1 borne l'expansion de `**/../` à `braceExpandMax` et saute la comparaison par paires au-delà de mille motifs",
    plage: { section: "overrides" },
  },
  {
    paquet: "brace-expansion",
    majeure: 1,
    plancher: "1.1.21",
    avis: ["GHSA-q2hr-2g5m-vwhr", "GHSA-qhr7-859c-m2p7", "GHSA-6j4f-fj2g-mc7p"],
    raison:
      "1.1.21 ferme l'expansion quadratique des accolades et les deux récursions qui épuisent la pile",
    plage: { section: "overrides", cle: "brace-expansion@1" },
  },
  {
    paquet: "brace-expansion",
    majeure: 5,
    plancher: "5.0.12",
    avis: ["GHSA-q2hr-2g5m-vwhr", "GHSA-qhr7-859c-m2p7", "GHSA-6j4f-fj2g-mc7p"],
    raison:
      "5.0.12 ferme l'expansion quadratique des accolades et les deux récursions qui épuisent la pile",
    plage: { section: "overrides", cle: "brace-expansion@5" },
  },
]
