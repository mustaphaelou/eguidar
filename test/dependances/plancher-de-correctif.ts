import { existsSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

const PROFONDEUR_DE_REMONTEE = 8

export type SectionDeManifeste =
  "dependencies" | "devDependencies" | "overrides"

export type EmplacementDePlage = {
  section: SectionDeManifeste
  cle?: string
}

export type DispositionDabsence = "echoue" | "passe"

export type PlancherInstalle = {
  paquet: string
  plancher: string
  avis: readonly string[]
  raison: string
  plage: EmplacementDePlage
  absence: DispositionDabsence
  famille?: readonly string[]
}

export type Copie = {
  paquet: string
  chemin: string
  version: string
}

export type ArbreDeVerrouillage = Record<string, { version?: unknown }>

export type PlancherDeCopie = {
  paquet: string
  majeure: number
  plancher: string
  avis: readonly string[]
  raison: string
  plage: EmplacementDePlage
}

function partiesDeVersion(version: string): number[] {
  const release = version.split("-", 1)[0] ?? ""
  return release.split(".").map((partie) => Number.parseInt(partie, 10))
}

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

function versionDuManifesteExporte(paquet: string): string | null {
  try {
    const manifeste = JSON.parse(
      readFileSync(
        createRequire(import.meta.url).resolve(`${paquet}/package.json`),
        "utf8"
      )
    ) as { version?: unknown }
    return typeof manifeste.version === "string" ? manifeste.version : null
  } catch {
    return null
  }
}

export function versionInstallee(paquet: string): string | null {
  const version = versionDuManifesteExporte(paquet)
  if (version !== null) return version
  try {
    const manifeste = manifesteDansLaRemontee(
      createRequire(import.meta.url).resolve(paquet),
      paquet
    )
    return typeof manifeste?.version === "string" ? manifeste.version : null
  } catch {
    return null
  }
}

export function versionVerrouillee(
  paquet: string,
  arbre: ArbreDeVerrouillage = arbreDeVerrouillage()
): string | null {
  const version = arbre[`node_modules/${paquet}`]?.version
  return typeof version === "string" ? version : null
}

export function plancherDePlage(plage: string): string {
  return plage.replace(/^[^0-9]*/, "")
}

export function arbreDeVerrouillage(): ArbreDeVerrouillage {
  const racine = path.resolve(import.meta.dirname, "..", "..")
  const lock = JSON.parse(
    readFileSync(path.join(racine, "package-lock.json"), "utf8")
  ) as { packages?: ArbreDeVerrouillage }
  return lock.packages ?? {}
}

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

export function majeureDeVersion(version: string): number {
  return partiesDeVersion(version)[0] ?? 0
}

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
    paquet: "js-yaml",
    plancher: "4.3.2",
    avis: ["GHSA-2883-xcg3-v3hh"],
    raison:
      "4.3.2 borne les clés de fusion d'un document YAML pour fermer le merge-bomb",
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
    paquet: "undici",
    plancher: "7.29.1",
    avis: ["GHSA-rfgv-xxqx-mfg5"],
    raison:
      "7.29.1 refuse un sous-protocole WebSocket non demandé au lieu de tuer le processus",
    plage: { section: "overrides" },
    absence: "passe",
  },
  {
    paquet: "vite",
    plancher: "8.3.3",
    avis: ["GHSA-587h-7wmj-h5pm", "GHSA-698v-4r3x-3vcv", "GHSA-r825-w8mm-5pxw"],
    raison:
      "8.3.3 est la première version qui embarque le launch-editor corrigé, où les trois correctifs atterrissent",
    plage: { section: "overrides" },
    absence: "echoue",
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
