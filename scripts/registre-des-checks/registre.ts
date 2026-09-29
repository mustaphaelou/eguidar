import { execFileSync } from "node:child_process"

import { checksParJob, estObjet } from "../ci-liste"

/**
 * L'API qui porte la seule information que ce dépôt ne peut pas écrire dans un
 * fichier : ce que GitHub exige réellement d'une pull request. Tout le reste —
 * quels jobs la CI déclare — est déjà lu par `ci-liste.ts`, et ce module ne le
 * relit pas. Il se range derrière, et n'ajoute que ce qu'un fichier ne sait pas
 * dire.
 */
const API = "https://api.github.com"

/**
 * Le nombre de tentatives d'une lecture, et les pauses qui les séparent.
 *
 * Trois suffisent : ce que ce module absorbe est une panne brève de GitHub ou
 * d'un relais, pas une API en panne durable. Au-delà, le rouge est plus utile
 * qu'une attente — et c'est dans le bon sens, parce que le contraire, une porte
 * qui s'ouvre parce qu'elle n'a pas su lire, est précisément ce que ce module
 * existe pour empêcher.
 */
const TENTATIVES = 3

/**
 * Les pauses, en millisecondes, qui séparent les tentatives. Le nom n'est pas
 * « repos » : en français, un dépôt git s'écrit comme ça, et une attente qui se
 * dit comme un dépôt se relit de travers au moins une fois.
 */
const PAUSES = [500, 1500]

/**
 * Le délai que chaque requête HTTP s'accorde. Il borne l'attente quand GitHub
 * ne répond pas du tout, où une promesse qui n'est jamais tenue ferait expirer
 * le test sans rien dire de la cause.
 */
const DELAI_LIRE = 5_000

/**
 * Le temps au-delà duquel une lecture ne peut plus aboutir : trois requêtes
 * bornées, plus les deux pauses qui les séparent. Le test qui appelle la
 * lecture s'accorde ce budget-là et non les 5 000 ms par défaut de Vitest,
 * qui sont précisément le délai d'une seule requête — le run échouerait alors
 * sur son propre délai d'attente, en nommant une porte qui n'a rien à voir avec
 * la cause.
 */
export const BUDGET_DE_LECTURE =
  TENTATIVES * DELAI_LIRE + PAUSES.reduce((total, pause) => total + pause, 0)

/**
 * Le dépôt dont on veut le ruleset. `GITHUB_REPOSITORY` le dit en CI, et la
 * constante le dit ailleurs, comme `FLUX` désigne son fichier sans demander à
 * `git` où se trouve le dépôt. Une valeur fausse ici ne resterait pas
 * invisible : l'API répondrait 404, et ce module nommerait l'endpoint qui l'a
 * dit.
 */
function leDepot(): string {
  return process.env.GITHUB_REPOSITORY ?? "mustaphaelou/eguidar"
}

/**
 * L'erreur que la lecture lève quand la réponse n'est pas la forme attendue.
 * Elle est nommée pour que l'appelant sache, sans lire la pile, qu'il n'a pas
 * sous les yeux un désaccord entre le flux et le ruleset mais une charge utile
 * qu'il ne sait pas interpréter. Un désaccord se répare dans les réglages de
 * GitHub ; une forme inconnue se répare dans ce module, ou dans l'hypothèse
 * que l'API a changé. Confondre les deux enverrait un agent chercher au mauvais
 * endroit pendant une heure.
 */
export class ErreurDeLectureDuRuleset extends Error {
  constructor(raison: string) {
    super(raison)
    this.name = "ErreurDeLectureDuRuleset"
  }
}

/**
 * Ce que le ruleset du dépôt exige d'une pull request avant de la laisser
 * fusionner.
 *
 * Les deux drapeaux sont nommés dans le sens où l'assertion les lit — « exige »
 * et « suspend » — et non dans celui de l'API, où ils se lisent à l'envers
 * (`do_not_enforce_on_create: false` pour dire « ne suspend pas »). Un fait
 * renversé entre le module et sa phrase est un fait que le test ne peut plus
 * relire sans le traduire deux fois, donc sans le traduire de travers.
 */
export type Exigences = {
  /** Le nom que GitHub affiche — pour nommer la cible quand une porte manque. */
  nom: string
  /** Les contextes de statut exigés, dans l'ordre où le ruleset les porte. */
  contextes: string[]
  /** Une branche à jour avec `main` est-elle un préalable à la fusion ? */
  exigeBrancheAJour: boolean
  /** L'exigence est-elle suspendue tant que la pull request vient d'être ouverte ? */
  suspendLExigenceALaCreation: boolean
}

/**
 * L'écart entre les deux listes, dans les deux sens. Une seule direction n'en
 * verrait qu'une moitié, et la moitié qui compte : un check que le flux déclare
 * et que le ruleset n'exige pas passe au vert partout, personne ne l'attend
 * devant la fusion, et c'est ainsi que `format` a dormi dans le ruleset. L'autre
 * moitié — une exigence qui ne correspond à aucun job — est un ruleset qui
 * finira par bloquer une pull request sans raison, ce qui s'arrange d'un clic
 * et se remarque tout de suite.
 */
export type Ecart = {
  /** Les contextes que le flux déclare et que le ruleset n'exige pas. */
  nonExigés: string[]
  /** Les contextes que le ruleset exige et qu'aucun job du flux ne fournit. */
  sansJob: string[]
}

/**
 * Ce que le registre fait d'une réponse : les faits, ou la raison du silence.
 * Jamais une exception : la forme est aussi une réponse, et un appelant qui
 * devrait distinguer les deux s'y trompe au moins une fois.
 */
export type LectureDuRuleset =
  { lisible: true; exigences: Exigences } | { lisible: false; raison: string }

/**
 * Les contextes que la CI déclare : le nom de chaque job, dans l'ordre du
 * flux.
 *
 * Des noms de jobs, et non des noms de checks, parce que c'est ainsi que GitHub
 * enregistre une porte : le contexte d'un check est le nom du job qui l'a
 * lancé. Le job `format` invoque `format:check`, et c'est `format` qu'un
 * ruleset doit exiger — dire le contraire produirait un écart qui ne se
 * fermera jamais, puisque `format:check` n'est pas un nom de job.
 *
 * `checksParJob()` et non `lireLesJobs()` : les deux lèvent sur un job que le
 * flux ne sait pas lire, mais le premier associe chaque nom à ce que ce job
 * lance. C'est ce qu'il faut ici, parce qu'un contexte sans check derrière
 * n'est pas une porte que le ruleset oublie : c'est un job qui ne vérifie rien,
 * et l'accuser à tort d'être absent des réglages de GitHub enverrait chercher
 * au mauvais endroit.
 */
export function contextesDeclares(): string[] {
  return [...checksParJob().keys()]
}

/**
 * Ce que deux listes ne se disent pas, dans les deux sens, dans l'ordre où
 * chacune les porte.
 *
 * Cette fonction ne lit aucun fichier et n'appelle aucune API : elle prend deux
 * listes et rend l'écart. C'est volontairement le seul endroit du module où la
 * comparaison vit, pour qu'elle se teste sans le réseau — elle décide du nom que
 * l'échec affichera, et une telle décision mérite d'être exercée sur des listes
 * qui divergent vraiment, pas seulement sur celles qu'un ruleset en production a
 * déjà rendues égales.
 */
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

/**
 * Le ruleset du dépôt lui-même, dans la liste que l'API rend : son numéro et
 * son nom, rien de plus.
 *
 * Le tri se fait sur `source_type`, jamais sur le nom ni sur la position : la
 * liste arrive avec les rulesets d'organisation mêlés à ceux du dépôt, et un
 * ruleset d'organisation qui apparaît un jour ne doit pas pouvoir se faire
 * prendre pour celui-ci. Le nom ne filtre rien : l'écrire ici reviendrait à
 * mettre dans le code la valeur qu'il cherche.
 *
 * Un ruleset unique est exigé, et pas « le premier » : à deux, choisir serait
 * deviner lequel protège `main`, et deviner ici se paie par une assertion verte
 * posée sur le mauvais fichier de réglages. Le message nomme alors les
 * candidats, pour que la décision — qu'elle incombe à quelqu'un, pas à ce
 * module — se prenne en connaissance de cause.
 *
 * Le `source` est un paramètre, et sans valeur par défaut, comme celui
 * d'`exigerDesJobsLus` : un test qui fabrique une liste ne doit pas voir son
 * erreur accuser l'endpoint que ce module connaît par cœur.
 */
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

/**
 * Un drapeau de la règle, ou l'erreur qui dit qu'il n'en est pas un.
 *
 * Lu, jamais supposé. `strict_required_status_checks_policy` absent ne doit pas
 * se lire « le ruleset est strict », ni `do_not_enforce_on_create` absent « le
 * ruleset n'en suspend pas » : un fait que la lecture invente est un fait que
 * l'assertion ne peut plus contredire, et une porte qui ne peut plus être
 * contredite est une porte verte.
 */
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

/**
 * Ce que le ruleset exige, lu dans sa charge utile — ou l'erreur qui dit quelle
 * forme a manqué.
 *
 * Elle ne sort pas du module : la porte qui mène jusqu'à elle est
 * `jugerLeRuleset`, qui rend son verdict sans lever. Un appelant qui veut savoir
 * ce que vaut une forme passe par là, comme le test qui fabrique des charges
 * utiles, et personne n'a à attraper l'exception pour savoir ce qu'elle dit.
 *
 * La règle qui porte les statuts est une entrée parmi d'autres dans `rules`, et
 * elle se trouve par son `type`. Elle est cherchée, et non supposée : un ruleset
 * sans elle n'exige rien, ce qui se lirait « le flux déclare cinq portes, le
 * ruleset n'en exige aucune » — un écart réel, mais dont le message enverrait
 * ajouter cinq portes à des réglages qui, eux, n'en ont pas. Dire « il n'y a pas
 * de règle » est la même information, et elle se répare d'une autre manière.
 */
function exigerLesExigences(payload: unknown, source: string): Exigences {
  if (!estObjet(payload) || typeof payload.name !== "string") {
    throw new ErreurDeLectureDuRuleset(
      `${source} : clé \`name\` absente ou illisible`
    )
  }
  const { name: nom } = payload
  const dans = `${source} (ruleset « ${nom} ») : `

  if (!Array.isArray(payload.rules)) {
    throw new ErreurDeLectureDuRuleset(
      `${dans}clé \`rules\` absente ou illisible`
    )
  }

  const regle = payload.rules.find(
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

/**
 * Ce que le registre fait de la réponse d'un ruleset : les exigences, ou la
 * raison pour lesquelles il n'en a pas su faire une.
 *
 * Cette fonction ne lève jamais, parce qu'elle est ce que la lecture appelle
 * pour n'avoir pas à rattraper l'erreur elle-même — et, par là même, ce qu'un
 * test peut appeler sur une charge utile qu'il a fabriquée. Un `throw` ici
 * obligerait le test qui veut voir une forme refusée à la prévoir, à la
 * rattraper, et à ne plus suivre le chemin que suit le vrai appelant.
 */
export function jugerLeRuleset(
  payload: unknown,
  source: string
): LectureDuRuleset {
  try {
    return { lisible: true, exigences: exigerLesExigences(payload, source) }
  } catch (erreur) {
    return { lisible: false, raison: (erreur as Error).message }
  }
}

/**
 * Le jeton qui permet de lire les réglages du dépôt, ou `null` quand il n'y en
 * a aucun.
 *
 * La question n'est pas « la variable est-elle là ? » mais « ai-je quelque
 * chose avec quoi lire ? ». Un `gh` authentifié garde son jeton dans son propre
 * fichier et ne le publie dans aucune variable : un test qui regarderait
 * `GITHUB_TOKEN` se tairait en local alors que la lecture y réussirait, et une
 * porte qui se tait chez le développeur est une porte dont personne n'a jamais
 * vu le rouge. `gh auth token` est donc la dernière chance, et c'est son code de
 * sortie — non pas la présence d'une variable — qui dit qu'il n'y a vraiment
 * rien : un contributeur sans `gh` et sans jeton n'a aucun moyen de vérifier, et
 * il vaut mieux qu'il l'apprenne en lisant la suite ignorée plutôt qu'en croyant
 * le ruleset vérifié.
 */
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

/**
 * Une requête, ou l'erreur qui dit laquelle n'a pas abouti. L'URL est nommée
 * parce qu'elle ne trahit rien : le jeton voyage dans un en-tête, et une cause
 * qui ne dit pas où elle a échoué en laisse l'agent en deviner une.
 */
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

/** Une pause, dite en millisecondes, entre deux tentatives. */
function attendre(pause: number): Promise<void> {
  return new Promise((tenu) => setTimeout(tenu, pause))
}

/**
 * Les exigences du dépôt, lues pour de bon — ou l'erreur qui dit, après
 * épuisement des tentatives, ce que la dernière a rencontré.
 *
 * Deux appels, et non un : la liste des rulesets ne porte aucun `rules`, elle ne
 * dit que ce qui existe. Trouver, puis lire. Un seul appel verrait toujours un
 * ruleset sans aucune porte exigée, et le comparerait au flux pour en déduire
 * que le flux n'en déclare aucune.
 *
 * Toute la tentative est réessayée, garde de forme comprise. C'est moins
 * rigoureux qu'une seconde voie qui ne retenterait que les pannes du réseau, et
 * c'est le bon choix : une charge utile tronquée par un relais se répare à la
 * tentative suivante. Le prix de ce parti est un délai supplémentaire quand la
 * forme est fausse pour de bon — deux secondes et demie, contre un chemin de
 * plus à maintenir et à tester.
 */
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
