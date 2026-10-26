import { execFileSync } from "node:child_process"

import { checksParJob, estObjet } from "../ci-liste"

const API = "https://api.github.com"

const TENTATIVES = 3

const PAUSES = [500, 1500]

const DELAI_LIRE = 5_000

export const BUDGET_DE_LECTURE =
  TENTATIVES * DELAI_LIRE + PAUSES.reduce((total, pause) => total + pause, 0)

function leDepot(): string {
  return process.env.GITHUB_REPOSITORY ?? "mustaphaelou/eguidar"
}

export class ErreurDeLectureDuRuleset extends Error {
  constructor(raison: string) {
    super(raison)
    this.name = "ErreurDeLectureDuRuleset"
  }
}

// 403 : le plan du dépôt ou les droits du jeton ne donnent pas accès aux
// rulesets. 404 : GitHub masque une ressource privée au jeton qui n'y a pas
// accès. Dans les deux cas, la suite ne peut pas lire les réglages ; elle le
// dit et s'ignore, au lieu de faire échouer la CI pour un défaut de droits.
export function estRefusDeDroits(erreur: unknown): boolean {
  return (
    erreur instanceof ErreurDeLectureDuRuleset &&
    /\bHTTP (?:403|404)\b/.test(erreur.message)
  )
}

export type Exigences = {
  nom: string
  contextes: string[]
  exigeBrancheAJour: boolean
  suspendLExigenceALaCreation: boolean
}

export type Ecart = {
  nonExigés: string[]
  sansJob: string[]
}

export type LectureDuRuleset =
  { lisible: true; exigences: Exigences } | { lisible: false; raison: string }

export function contextesDeclares(): string[] {
  return [...checksParJob().keys()]
}

export function comparerLesChecks(
  declares: readonly string[],
  exiges: readonly string[]
): Ecart {
  const vusCommeExigés = new Set(exiges)
  const vusCommeDéclarés = new Set(declares)
  return {
    nonExigés: declares.filter((nom) => !vusCommeExigés.has(nom)),
    sansJob: exiges.filter((nom) => !vusCommeDéclarés.has(nom)),
  }
}

export function exigerLeRulesetDuDepot(
  liste: unknown,
  source: string
): { id: number; nom: string } {
  if (!Array.isArray(liste)) {
    throw new ErreurDeLectureDuRuleset(
      `${source} : la réponse n'est pas une liste de rulesets`
    )
  }

  const duDepot = liste.filter(
    (candidat): candidat is Record<string, unknown> =>
      estObjet(candidat) && candidat.source_type === "Repository"
  )

  if (duDepot.length === 0) {
    throw new ErreurDeLectureDuRuleset(
      `${source} : aucun ruleset \`source_type: "Repository"\`, donc aucune exigence de statut — la branche \`main\` n'est protégée par rien`
    )
  }
  if (duDepot.length > 1) {
    const noms = duDepot.map((candidat) =>
      typeof candidat.name === "string"
        ? `« ${candidat.name} »`
        : "un ruleset sans nom"
    )
    throw new ErreurDeLectureDuRuleset(
      `${source} : ${noms.length} rulesets de dépôt (${noms.join(", ")}) ; ce module ne sait pas lequel lire`
    )
  }

  const [seul] = duDepot
  if (typeof seul.id !== "number" || typeof seul.name !== "string") {
    throw new ErreurDeLectureDuRuleset(
      `${source} : le ruleset de dépôt n'a pas de \`id\` et de \`name\` lisibles`
    )
  }
  return { id: seul.id, nom: seul.name }
}

function exigerUnBooleen(
  valeur: unknown,
  drapeau: string,
  dans: string
): boolean {
  if (typeof valeur !== "boolean") {
    throw new ErreurDeLectureDuRuleset(
      `${dans}\`${drapeau}\` n'est pas un booléen`
    )
  }
  return valeur
}

function exigerLesExigences(chargeUtile: unknown, source: string): Exigences {
  if (!estObjet(chargeUtile) || typeof chargeUtile.name !== "string") {
    throw new ErreurDeLectureDuRuleset(
      `${source} : clé \`name\` absente ou illisible`
    )
  }
  const { name: nom } = chargeUtile
  const dans = `${source} (ruleset « ${nom} ») : `

  if (!Array.isArray(chargeUtile.rules)) {
    throw new ErreurDeLectureDuRuleset(
      `${dans}clé \`rules\` absente ou illisible`
    )
  }

  const regle = chargeUtile.rules.find(
    (entree) => estObjet(entree) && entree.type === "required_status_checks"
  )
  if (!estObjet(regle) || !estObjet(regle.parameters)) {
    throw new ErreurDeLectureDuRuleset(
      `${dans}aucune règle \`required_status_checks\`, donc aucune porte n'est exigée`
    )
  }

  const { parameters } = regle
  const statuts = parameters.required_status_checks
  if (!Array.isArray(statuts)) {
    throw new ErreurDeLectureDuRuleset(
      `${dans}la règle \`required_status_checks\` ne dit pas quels statuts elle exige`
    )
  }

  const contextes: string[] = []
  for (const statut of statuts) {
    if (!estObjet(statut) || typeof statut.context !== "string") {
      throw new ErreurDeLectureDuRuleset(
        `${dans}un statut exigé n'a pas de \`context\` lisible`
      )
    }
    contextes.push(statut.context)
  }

  return {
    nom,
    contextes,
    exigeBrancheAJour: exigerUnBooleen(
      parameters.strict_required_status_checks_policy,
      "strict_required_status_checks_policy",
      dans
    ),
    suspendLExigenceALaCreation: exigerUnBooleen(
      parameters.do_not_enforce_on_create,
      "do_not_enforce_on_create",
      dans
    ),
  }
}

export function jugerLeRuleset(
  chargeUtile: unknown,
  source: string
): LectureDuRuleset {
  try {
    return { lisible: true, exigences: exigerLesExigences(chargeUtile, source) }
  } catch (erreur) {
    return { lisible: false, raison: (erreur as Error).message }
  }
}

export function jetonDuDepot(): string | null {
  const jeton = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
  if (jeton) return jeton

  try {
    const rendu = execFileSync("gh", ["auth", "token"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3_000,
    }).trim()
    return rendu === "" ? null : rendu
  } catch {
    return null
  }
}

async function appelerJson(url: string, jeton: string): Promise<unknown> {
  const reponse = await fetch(url, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${jeton}`,
      "x-github-api-version": "2022-11-28",
    },
    signal: AbortSignal.timeout(DELAI_LIRE),
  })
  if (!reponse.ok) {
    throw new ErreurDeLectureDuRuleset(
      `${url} : HTTP ${reponse.status} ${reponse.statusText}`.trim()
    )
  }
  return (await reponse.json()) as unknown
}

function attendre(pause: number): Promise<void> {
  return new Promise((tenu) => setTimeout(tenu, pause))
}

export async function lireLesExigences(jeton: string): Promise<Exigences> {
  const urlListe = `${API}/repos/${leDepot()}/rulesets`

  for (let tentative = 1; ; tentative += 1) {
    try {
      const { id } = exigerLeRulesetDuDepot(
        await appelerJson(urlListe, jeton),
        `GET ${urlListe}`
      )
      const url = `${urlListe}/${id}`
      const lecture = jugerLeRuleset(
        await appelerJson(url, jeton),
        `GET ${url}`
      )
      if (!lecture.lisible) throw new ErreurDeLectureDuRuleset(lecture.raison)
      return lecture.exigences
    } catch (erreur) {
      if (tentative === TENTATIVES) {
        throw new ErreurDeLectureDuRuleset(
          `${TENTATIVES} lectures du ruleset ont échoué, la dernière dit : ${(erreur as Error).message}`
        )
      }
      await attendre(PAUSES[tentative - 1])
    }
  }
}
