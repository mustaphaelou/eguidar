import { execFileSync } from "node:child_process"

import {
  type FaitsDuRuleset,
  type PorteDeFusion,
} from "@/infra/porte-de-fusion"

const API = "https://api.github.com"

const TENTATIVES = 3

const PAUSES = [500, 1500] as const

const DELAI_DE_LECTURE = 5_000

const COMMANDE_GH = "gh"

const ARGUMENTS_DU_DEPOT = [
  "repo",
  "view",
  "--json",
  "nameWithOwner",
  "--jq",
  ".nameWithOwner",
] as const

const ARGUMENTS_DU_JETON = ["auth", "token"] as const

export const REMEDE_PLAN_OU_VISIBILITE =
  "le plan GitHub du dépôt ou sa visibilité ne permet pas de lire les rulesets (HTTP 403/404) : rendez le dépôt public ou passez à un plan qui autorise les rulesets, puis relancez le docteur."

export const REMEDE_DU_JETON =
  "aucun jeton GitHub lisible : définissez GH_TOKEN avec un jeton qui peut administrer le dépôt, ou connectez-vous avec « gh auth login ». Un GITHUB_TOKEN de CI n'est pas un jeton d'administration."

export const REMEDE_DU_DEPOT =
  "aucun dépôt GitHub résolu : définissez GITHUB_REPOSITORY (owner/repo), ou connectez-vous avec « gh auth login » pour que « gh repo view » réponde."

export type ReponseHttp = {
  statut: number
  corps: unknown
}

export type DependancesDeLecture = {
  env: NodeJS.ProcessEnv
  executer: (commande: string, arguments_: readonly string[]) => string
  recuperer: (url: string, jeton: string) => Promise<ReponseHttp>
  attendre: (pause: number) => Promise<void>
}

export type LectureDeLaPorte =
  { lisible: true; faits: FaitsDuRuleset } | { lisible: false; raison: string }

// Une panne de droits ou un choix impossible ne se répare pas en réessayant.
class LectureDefinitive extends Error {}

// Une panne réseau, un statut inattendu ou une réponse malformée peut être
// transitoire : elle se réessaie avant d'être déclarée illisible.
class LectureTemporaire extends Error {}

type ResumeDeRuleset = {
  id: number
  nom: string
}

type Candidat = ResumeDeRuleset & {
  detail: Record<string, unknown>
}

function estObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur)
}

function estTexteNonVide(valeur: unknown): valeur is string {
  return typeof valeur === "string" && valeur.trim() !== ""
}

function estTableauDeTextes(valeur: unknown): valeur is string[] {
  return (
    Array.isArray(valeur) &&
    valeur.every((entree) => typeof entree === "string" && entree.trim() !== "")
  )
}

function messageDe(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur)
}

function exigerUneBonneReponse(reponse: ReponseHttp, source: string): void {
  if (reponse.statut === 403 || reponse.statut === 404) {
    throw new LectureDefinitive(`${source} : ${REMEDE_PLAN_OU_VISIBILITE}`)
  }
  if (reponse.statut < 200 || reponse.statut >= 300) {
    throw new LectureTemporaire(`${source} : HTTP ${reponse.statut}`)
  }
}

function exigerLaListe(
  corps: unknown,
  source: string
): Record<string, unknown>[] {
  if (!Array.isArray(corps)) {
    throw new LectureTemporaire(
      `${source} : la réponse n'est pas une liste de rulesets`
    )
  }
  for (const entree of corps) {
    if (!estObjet(entree)) {
      throw new LectureTemporaire(
        `${source} : un ruleset de la liste n'est pas un objet lisible`
      )
    }
  }
  return corps
}

function exigerLeResume(
  resume: Record<string, unknown>,
  source: string
): ResumeDeRuleset {
  if (typeof resume.id !== "number" || !Number.isInteger(resume.id)) {
    throw new LectureTemporaire(
      `${source} : un ruleset de dépôt n'a pas d'\`id\` lisible`
    )
  }
  if (!estTexteNonVide(resume.name)) {
    throw new LectureTemporaire(
      `${source} : un ruleset de dépôt n'a pas de \`name\` lisible`
    )
  }
  return { id: resume.id, nom: resume.name }
}

function exigerUnRuleset(
  corps: unknown,
  source: string
): Record<string, unknown> {
  if (!estObjet(corps)) {
    throw new LectureTemporaire(`${source} : la réponse n'est pas un ruleset`)
  }
  return corps
}

function lireLesConditions(
  detail: Record<string, unknown>,
  source: string
): { incluses: string[]; exclues: string[] } {
  const conditions = detail.conditions
  if (!estObjet(conditions) || !estObjet(conditions.ref_name)) {
    throw new LectureTemporaire(
      `${source} : la condition de branche est absente ou illisible`
    )
  }
  const { include, exclude } = conditions.ref_name
  if (!estTableauDeTextes(include) || !estTableauDeTextes(exclude)) {
    throw new LectureTemporaire(
      `${source} : la condition de branche est absente ou illisible`
    )
  }
  return { incluses: [...include], exclues: [...exclude] }
}

function exigerUnBooleen(
  valeur: unknown,
  cle: string,
  source: string
): boolean {
  if (typeof valeur !== "boolean") {
    throw new LectureTemporaire(`${source} : \`${cle}\` n'est pas un booléen`)
  }
  return valeur
}

function decrireUnActeur(acteur: unknown, source: string): string {
  if (estTexteNonVide(acteur)) return acteur
  if (!estObjet(acteur)) {
    throw new LectureTemporaire(
      `${source} : un acteur de contournement n'est pas lisible`
    )
  }

  const morceaux: string[] = []
  if (estTexteNonVide(acteur.actor_type)) morceaux.push(acteur.actor_type)
  if (typeof acteur.actor_id === "number" || estTexteNonVide(acteur.actor_id)) {
    morceaux.push(String(acteur.actor_id))
  }
  if (estTexteNonVide(acteur.bypass_mode)) morceaux.push(acteur.bypass_mode)

  return morceaux.length === 0 ? "un acteur non décrit" : morceaux.join(" ")
}

function analyserLesFaits(
  detail: Record<string, unknown>,
  source: string
): FaitsDuRuleset {
  const nom = detail.name
  if (!estTexteNonVide(nom)) {
    throw new LectureTemporaire(`${source} : clé \`name\` absente ou illisible`)
  }
  const dans = `${source} (ruleset « ${nom} ») : `

  const { incluses, exclues } = lireLesConditions(detail, source)

  const rules = detail.rules
  if (!Array.isArray(rules)) {
    throw new LectureTemporaire(`${dans}clé \`rules\` absente ou illisible`)
  }

  const regleStatuts = rules.find(
    (regle) => estObjet(regle) && regle.type === "required_status_checks"
  )
  if (!estObjet(regleStatuts) || !estObjet(regleStatuts.parameters)) {
    throw new LectureTemporaire(
      `${dans}aucune règle \`required_status_checks\``
    )
  }

  const parameters = regleStatuts.parameters
  const statuts = parameters.required_status_checks
  if (!Array.isArray(statuts)) {
    throw new LectureTemporaire(
      `${dans}clé \`required_status_checks\` absente ou illisible`
    )
  }

  const contextes: string[] = []
  for (const statut of statuts) {
    if (!estObjet(statut) || !estTexteNonVide(statut.context)) {
      throw new LectureTemporaire(
        `${dans}un statut exigé n'a pas de \`context\` lisible`
      )
    }
    contextes.push(statut.context)
  }

  const exigeBrancheAJour = exigerUnBooleen(
    parameters.strict_required_status_checks_policy,
    "strict_required_status_checks_policy",
    dans
  )
  const suspendLExigenceALaCreation = exigerUnBooleen(
    parameters.do_not_enforce_on_create,
    "do_not_enforce_on_create",
    dans
  )

  const reglePull = rules.find(
    (regle) => estObjet(regle) && regle.type === "pull_request"
  )
  let pullRequestRequise = false
  let revueRequise = false
  if (reglePull !== undefined) {
    pullRequestRequise = true
    if (!estObjet(reglePull.parameters)) {
      throw new LectureTemporaire(
        `${dans}la règle \`pull_request\` n'a pas de paramètres lisibles`
      )
    }
    const revues = reglePull.parameters.required_approving_review_count
    if (typeof revues !== "number" || !Number.isInteger(revues) || revues < 0) {
      throw new LectureTemporaire(
        `${dans}\`required_approving_review_count\` absent ou illisible`
      )
    }
    revueRequise = revues > 0
  }

  const bypass = detail.bypass_actors
  if (!Array.isArray(bypass)) {
    throw new LectureTemporaire(
      `${dans}clé \`bypass_actors\` absente ou illisible`
    )
  }
  const contournement = bypass.map((acteur) => decrireUnActeur(acteur, dans))

  return {
    nom,
    branchesIncluses: incluses,
    branchesExclues: exclues,
    contextes,
    exigeBrancheAJour,
    suspendLExigenceALaCreation,
    pullRequestRequise,
    revueRequise,
    contournement,
  }
}

function choisirLeCandidat(
  candidats: ResumeDeRuleset[],
  contrat: PorteDeFusion,
  source: string
): ResumeDeRuleset {
  if (candidats.length === 1) return candidats[0]

  const parNom = candidats.filter((candidat) => candidat.nom === contrat.nom)
  if (parNom.length === 1) return parNom[0]

  const noms = candidats.map((candidat) => `« ${candidat.nom} »`).join(", ")
  throw new LectureDefinitive(
    `${source} : plusieurs rulesets de dépôt couvrent la branche \`${contrat.branche}\` (${noms}) et le nom du contrat « ${contrat.nom} » ne permet pas d'en choisir un seul`
  )
}

async function lireUneFois(
  depot: string,
  jeton: string,
  contrat: PorteDeFusion,
  dependances: DependancesDeLecture
): Promise<FaitsDuRuleset> {
  const urlListe = `${API}/repos/${depot}/rulesets`
  const sourceListe = `GET ${urlListe}`

  const reponseListe = await dependances.recuperer(urlListe, jeton)
  exigerUneBonneReponse(reponseListe, sourceListe)
  const resumes = exigerLaListe(reponseListe.corps, sourceListe)

  // La liste de l'API ne porte pas les conditions de branche : chaque ruleset
  // de dépôt est donc lu pour savoir s'il couvre la branche du contrat. La
  // sélection reste celle de la spec — une seule couverture, puis le nom du
  // contrat comme départage — et le nom n'est jamais comparé comme un fait.
  const candidats: Candidat[] = []
  for (const resume of resumes) {
    if (resume.source_type !== "Repository") continue

    const { id, nom } = exigerLeResume(resume, sourceListe)
    const urlDetail = `${urlListe}/${id}`
    const sourceDetail = `GET ${urlDetail}`

    const reponseDetail = await dependances.recuperer(urlDetail, jeton)
    exigerUneBonneReponse(reponseDetail, sourceDetail)
    const detail = exigerUnRuleset(reponseDetail.corps, sourceDetail)
    const { incluses, exclues } = lireLesConditions(detail, sourceDetail)

    if (!incluses.includes(contrat.branche)) continue
    if (exclues.includes(contrat.branche)) continue

    candidats.push({ id, nom, detail })
  }

  if (candidats.length === 0) {
    throw new LectureDefinitive(
      `${sourceListe} : aucun ruleset de dépôt ne couvre la branche \`${contrat.branche}\``
    )
  }

  const choisi = choisirLeCandidat(
    candidats.map(({ id, nom }) => ({ id, nom })),
    contrat,
    sourceListe
  )
  const selectionne = candidats.find((candidat) => candidat.id === choisi.id)
  if (selectionne === undefined) {
    throw new LectureTemporaire(
      `${sourceListe} : le ruleset choisi « ${choisi.nom} » a disparu de la lecture`
    )
  }

  return analyserLesFaits(selectionne.detail, `GET ${urlListe}/${choisi.id}`)
}

function resoudreLeDepot(dependances: DependancesDeLecture): string | null {
  const depuisEnvironnement = dependances.env.GITHUB_REPOSITORY
  if (estTexteNonVide(depuisEnvironnement)) {
    return depuisEnvironnement.trim()
  }

  try {
    const rendu = dependances
      .executer(COMMANDE_GH, [...ARGUMENTS_DU_DEPOT])
      .trim()
    return rendu === "" ? null : rendu
  } catch {
    return null
  }
}

function resoudreLeJeton(dependances: DependancesDeLecture): string | null {
  const depuisEnvironnement = dependances.env.GH_TOKEN
  if (estTexteNonVide(depuisEnvironnement)) {
    return depuisEnvironnement.trim()
  }

  try {
    const rendu = dependances
      .executer(COMMANDE_GH, [...ARGUMENTS_DU_JETON])
      .trim()
    return rendu === "" ? null : rendu
  } catch {
    return null
  }
}

export function dependancesParDefaut(): DependancesDeLecture {
  return {
    env: process.env,
    executer: (commande, arguments_) =>
      execFileSync(commande, [...arguments_], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 3_000,
      }),
    recuperer: async (url, jeton) => {
      const reponse = await fetch(url, {
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${jeton}`,
          "x-github-api-version": "2022-11-28",
        },
        signal: AbortSignal.timeout(DELAI_DE_LECTURE),
      })

      let corps: unknown = null
      try {
        corps = await reponse.json()
      } catch {
        corps = null
      }
      return { statut: reponse.status, corps }
    },
    attendre: (pause) =>
      new Promise((tenu) => {
        setTimeout(tenu, pause)
      }),
  }
}

export async function lireLaPorteVivante(
  contrat: PorteDeFusion,
  dependances: Partial<DependancesDeLecture> = {}
): Promise<LectureDeLaPorte> {
  const deps = { ...dependancesParDefaut(), ...dependances }

  const depot = resoudreLeDepot(deps)
  if (depot === null) return { lisible: false, raison: REMEDE_DU_DEPOT }

  const jeton = resoudreLeJeton(deps)
  if (jeton === null) return { lisible: false, raison: REMEDE_DU_JETON }

  let derniere = "aucune tentative n'a rendu de raison"
  for (let tentative = 1; tentative <= TENTATIVES; tentative += 1) {
    try {
      const faits = await lireUneFois(depot, jeton, contrat, deps)
      return { lisible: true, faits }
    } catch (erreur) {
      if (erreur instanceof LectureDefinitive) {
        return { lisible: false, raison: erreur.message }
      }
      derniere = messageDe(erreur)
    }

    if (tentative < TENTATIVES) {
      await deps.attendre(PAUSES[tentative - 1])
    }
  }

  return {
    lisible: false,
    raison: `${TENTATIVES} lectures du ruleset ont échoué, la dernière dit : ${derniere}`,
  }
}
