import { readFileSync } from "node:fs"
import path from "node:path"

export type PorteDeFusion = {
  nom: string
  branche: string
  contextes: string[]
  exigeBrancheAJour: boolean
  suspendLExigenceALaCreation: boolean
  pullRequestRequise: boolean
  revueRequise: boolean
  contournement: string[]
}

export class ErreurDePorteDeFusion extends Error {
  constructor(raison: string) {
    super(raison)
    this.name = "ErreurDePorteDeFusion"
  }
}

function estObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur)
}

function estTexteNonVide(valeur: unknown): valeur is string {
  return typeof valeur === "string" && valeur.trim() !== ""
}

function illisible(source: string, cle: string): ErreurDePorteDeFusion {
  return new ErreurDePorteDeFusion(
    `${source} : clé \`${cle}\` absente ou illisible`
  )
}

function lireTexte(valeur: unknown, cle: string, source: string): string {
  if (!estTexteNonVide(valeur)) throw illisible(source, cle)
  return valeur
}

function lireBooleen(valeur: unknown, cle: string, source: string): boolean {
  if (typeof valeur !== "boolean") throw illisible(source, cle)
  return valeur
}

function lireBranche(valeur: unknown, source: string): string {
  if (!estTexteNonVide(valeur)) throw illisible(source, "branche")
  if (!/^refs\/heads\/\S+$/.test(valeur)) {
    throw new ErreurDePorteDeFusion(
      `${source} : clé \`branche\` doit nommer \`refs/heads/<branche>\``
    )
  }
  return valeur
}

function lireContextes(valeur: unknown, source: string): string[] {
  if (!Array.isArray(valeur)) throw illisible(source, "contextes")

  const contextes: string[] = []
  for (const contexte of valeur) {
    if (typeof contexte !== "string") throw illisible(source, "contextes")
    if (contexte.trim() === "") {
      throw new ErreurDePorteDeFusion(
        `${source} : clé \`contextes\` avec un contexte vide`
      )
    }
    if (contextes.includes(contexte)) {
      throw new ErreurDePorteDeFusion(
        `${source} : clé \`contextes\` avec le doublon « ${contexte} »`
      )
    }
    contextes.push(contexte)
  }

  const tries = [...contextes].sort()
  if (contextes.some((contexte, index) => contexte !== tries[index])) {
    throw new ErreurDePorteDeFusion(
      `${source} : clé \`contextes\` non triée (attendu : ${tries.join(", ")})`
    )
  }
  return contextes
}

function lireContournement(valeur: unknown, source: string): string[] {
  if (!Array.isArray(valeur)) throw illisible(source, "contournement")

  const contournement: string[] = []
  for (const entree of valeur) {
    if (!estTexteNonVide(entree)) throw illisible(source, "contournement")
    contournement.push(entree)
  }
  return contournement
}

export function analyserLaPorteDeFusion(
  valeur: unknown,
  source: string
): PorteDeFusion {
  if (!estObjet(valeur)) {
    throw new ErreurDePorteDeFusion(
      `${source} : la Porte de fusion n'est pas un objet`
    )
  }

  return {
    nom: lireTexte(valeur.nom, "nom", source),
    branche: lireBranche(valeur.branche, source),
    contextes: lireContextes(valeur.contextes, source),
    exigeBrancheAJour: lireBooleen(
      valeur.exigeBrancheAJour,
      "exigeBrancheAJour",
      source
    ),
    suspendLExigenceALaCreation: lireBooleen(
      valeur.suspendLExigenceALaCreation,
      "suspendLExigenceALaCreation",
      source
    ),
    pullRequestRequise: lireBooleen(
      valeur.pullRequestRequise,
      "pullRequestRequise",
      source
    ),
    revueRequise: lireBooleen(valeur.revueRequise, "revueRequise", source),
    contournement: lireContournement(valeur.contournement, source),
  }
}

export type EcartsDeContextes = {
  nonExigés: string[]
  sansJob: string[]
}

export function comparerLesContextesDeLaPorte(
  porte: PorteDeFusion,
  jobs: readonly string[]
): EcartsDeContextes {
  const exigés = new Set(porte.contextes)
  const fournis = new Set(jobs)

  return {
    nonExigés: jobs.filter((job) => !exigés.has(job)),
    sansJob: porte.contextes.filter((contexte) => !fournis.has(contexte)),
  }
}

const CHEMIN_DU_CONTRAT_VERSIONNE = path.join(
  import.meta.dirname,
  "porte-de-fusion.json"
)

export function lireLaPorteDeFusion(): PorteDeFusion {
  const source = CHEMIN_DU_CONTRAT_VERSIONNE

  let brut: string
  try {
    brut = readFileSync(source, "utf8")
  } catch {
    throw new ErreurDePorteDeFusion(
      `${source} : la Porte de fusion n'est pas lisible`
    )
  }

  let valeur: unknown
  try {
    valeur = JSON.parse(brut)
  } catch {
    throw new ErreurDePorteDeFusion(
      `${source} : la Porte de fusion n'est pas un JSON lisible`
    )
  }

  return analyserLaPorteDeFusion(valeur, source)
}
