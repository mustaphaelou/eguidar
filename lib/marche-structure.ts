/**
 * La Marche de la Structure — la traversée d'une Structure par `parentId`, qui
 * s'arrête sur toute revisite et rend ce qu'elle a parcouru (ADR-0030).
 *
 * **Elle répond des faits, jamais des verdicts.** Un cycle n'est pas une faute
 * ici : c'est une revisite, donc une fin de marche. Ce qu'il *signifie* reste à
 * l'appelant — une mutation le refuse, parce qu'un éditeur a une saisie à qui
 * rendre une faute ; une lecture dégrade et rend sa page, parce qu'un visiteur
 * n'a personne à qui se plaindre. Les deux surfaces se contredisent
 * délibérément, et c'est la décision, pas un accident : un module qui rendrait
 * le verdict les rendrait identiques, et supprimerait la divergence que
 * `delete-category-button.tsx` argumente depuis des mois (ADR-0030).
 *
 * **Elle est neutre, et c'est une condition, pas une élégance.** Un de ses
 * appelants est un composant client : ni `"use client"`, ni `"use server"`, ni
 * `@/lib/db`, ni `next/headers`, ni `server-only`, ni `node:`, ni React. Le
 * même contrat que `lib/carte-produit.ts` (ADR-0022) et
 * `lib/formulaire-produit.ts` (ADR-0026) — et
 * `lib/marche-structure-frontiere.test.ts` le prouve par le graphe d'imports.
 *
 * **Elle est synchrone et sans I/O.** Des faits en entrée (`parentId` déjà en
 * mémoire), des faits en sortie : aucune requête, aucune attente, aucun état
 * hors de la marche. C'est ce qui la rend exerçable sans base — la première
 * preuve de terminaison du dépôt qui n'a pas besoin d'un PostgreSQL — et assez
 * peu chère pour être construite une fois par requête et interrogée sept fois.
 *
 * **Une seule chose y est retenue, et c'est le journal.** Chaque marche se
 * souvient des cycles qu'*elle* a déjà signalés : une requête qui atteint le
 * même cycle par trois surfaces produit une ligne, pas trois. Ce n'est pas un
 * cache de module — la retenue meurt avec la marche, donc avec la requête — et
 * c'est délibéré : un `Set` au niveau du module ferait dépendre les suites de
 * leur ordre d'exécution, et tairait l'avertissement pour toute la vie du
 * processus. Le journal reste donc un fait de la requête, comme la marche.
 */

/**
 * Les faits que la marche consomme : le lien de chaque Structure vers sa
 * parente, et — quand l'appelant les a sous la main — les noms qui rendent le
 * journal lisible.
 *
 * `parents` porte l'absence de parente par `null`, pas par une clé absente :
 * une Structure dont la parente n'est pas dans la carte est une Structure
 * inconnue, une Structure sans parente est une racine. Les deux se confondraient
 * si l'absence de clé valait `null`.
 */
export interface LiensStructure {
  parents: ReadonlyMap<string, string | null>
  noms?: ReadonlyMap<string, string>
}

/** Ce qu'une marche rend : des identifiants, chacun au plus une fois. */
export interface MarcheStructure {
  /**
   * La Structure et ses ancêtres, la Structure courante **en dernier** — la
   * forme du fil d'Ariane. Toute revisite l'arrête : une chaîne cyclique rend
   * ses maillons une fois chacun, et la Structure courante reste la dernière.
   */
  ancetres(id: string): string[]
  /**
   * La Structure et toutes ses descendantes, chacune au plus une fois. Un cycle
   * atteint par la descente s'arrête sur sa propre revisite.
   */
  descendance(id: string): string[]
  /**
   * Les Structures qu'aucune racine n'atteint — un cycle, une chaîne qui mène
   * dans un cycle, ou toute branche qu'un cycle soustrait à l'arbre. Ce sont
   * les **Structures hors arbre** du glossaire : présentes en base, absentes de
   * toute branche.
   */
  horsArbre(): string[]
}

/**
 * Le nombre de maillons au-delà duquel le journal résume le cycle au lieu de
 * l'énumérer. Un cycle est une corruption à réparer à la main : au-delà de
 * quelques Structures, la ligne complète noie le journal sans rien dire de
 * plus, et la première ligne utile reste « il y a un cycle, et le voici ».
 */
const MAILLONS_ENUMERES = 10

/**
 * Le nom d'une Structure pour le journal : celui que l'appelant a fourni, ou
 * son identifiant faute de mieux. Un journal qui ne nommerait que des `cuid`
 * obligerait à ouvrir une console de base pour lire ce qu'il dit.
 */
function nommer(
  id: string,
  noms: ReadonlyMap<string, string> | undefined
): string {
  return noms?.get(id) ?? id
}

/**
 * Construit une marche sur des liens déjà en mémoire.
 *
 * La marche est une valeur : elle se construit une fois, s'interroge autant de
 * fois qu'une requête en a besoin, et ne retient rien d'autre que les cycles
 * qu'elle a déjà signalés.
 */
export function marcheStructure(liens: LiensStructure): MarcheStructure {
  const { parents, noms } = liens
  const cyclesSignales = new Set<string>()

  /**
   * Le cycle qu'un pas vers la parente vient de refermer, s'il y en a un.
   *
   * `chemin` est la remontée déjà faite, la Structure de départ en premier ;
   * `visite` est la parente sur laquelle ce pas retombe. Deux surfaces
   * l'empruntent — la remontée qui s'arrête, et la descente qui retombe sur un
   * identifiant déjà atteint — et elles doivent journaliser **le même** cycle :
   * d'où le chemin reconstruit à l'identique dans les deux cas.
   */
  function cycleRefermePar(
    chemin: string[],
    visite: string | null
  ): string[] | null {
    if (visite === null) return null
    const debut = chemin.indexOf(visite)
    return debut === -1 ? null : [...chemin.slice(debut), visite]
  }

  /**
   * Une remontée complète, et le cycle qu'elle a refermé s'il y en a un. Rend
   * les deux parce que les deux se lisent dans la même marche : l'appelant qui
   * veut les ancêtres n'a pas à la refaire pour savoir s'il y avait un cycle.
   */
  function remonter(id: string): { chemin: string[]; cycle: string[] | null } {
    const chemin: string[] = []
    const vus = new Set<string>()
    let curseur: string | null = id
    while (curseur !== null && !vus.has(curseur)) {
      chemin.push(curseur)
      vus.add(curseur)
      curseur = parents.get(curseur) ?? null
    }
    return { chemin, cycle: cycleRefermePar(chemin, curseur) }
  }

  /**
   * Le journal, une fois par cycle et par marche. La signature est l'ensemble
   * **trié** des maillons : le même cycle atteint par un autre de ses maillons
   * — ou par une branche qui y mène — porte la même signature, et ne produit
   * donc pas une seconde ligne.
   */
  function signaler(cycle: string[]): void {
    const maillons = cycle.slice(0, -1)
    const signature = [...maillons].sort().join("\u0000")
    if (cyclesSignales.has(signature)) return
    cyclesSignales.add(signature)
    // Un cycle très long est résumé : la ligne reste lisible, et elle dit
    // toujours ce qui compte — qu'il y a un cycle, et de quelle taille.
    const resume =
      maillons.length > MAILLONS_ENUMERES
        ? `${maillons.length} Structures, dont ${cycle
            .slice(0, MAILLONS_ENUMERES)
            .map((id) => nommer(id, noms))
            .join(" → ")} → …`
        : cycle.map((id) => nommer(id, noms)).join(" → ")
    console.warn(`[marche-structure] cycle : ${resume}`)
  }

  function ancetres(id: string): string[] {
    const { chemin, cycle } = remonter(id)
    if (cycle) signaler(cycle)
    // La remontée se lit de la Structure vers sa racine ; le fil d'Ariane se
    // lit dans l'autre sens, la Structure courante en dernier.
    return chemin.reverse()
  }

  function descendance(id: string): string[] {
    const enfants = new Map<string, string[]>()
    for (const [enfant, parente] of parents) {
      if (parente === null) continue
      const fratrie = enfants.get(parente)
      if (fratrie) fratrie.push(enfant)
      else enfants.set(parente, [enfant])
    }

    const atteints: string[] = []
    const vus = new Set<string>()
    /** Les enfants déjà atteints : chacun est le pas qui referme un cycle. */
    const revisites = new Set<string>()
    const file = [id]
    while (file.length > 0) {
      const courant = file.shift()!
      if (vus.has(courant)) continue
      vus.add(courant)
      atteints.push(courant)
      for (const enfant of enfants.get(courant) ?? []) {
        if (vus.has(enfant)) {
          revisites.add(enfant)
          continue
        }
        file.push(enfant)
      }
    }

    // Un cycle refermé par la descente : un enfant déjà atteint. Le cycle est
    // celui que la remontée depuis cet enfant referme — la même lecture que
    // `ancetres`, donc le même journal, et une seule ligne pour les deux.
    for (const revisite of revisites) {
      const { cycle } = remonter(revisite)
      if (cycle) signaler(cycle)
    }

    return atteints
  }

  /**
   * Les Structures hors arbre, en **une** passe sur les liens : on part de
   * toutes les racines, on descend ce qui est atteignable, et tout le reste est
   * hors arbre. Une boucle par Structure, chacune appelant `ancetres`, dirait
   * la même chose en coûtant un parcours complet par Structure — et la
   * détection doit rester assez bon marché pour être appelée sur chaque lecture
   * (ADR-0030, #544).
   */
  function horsArbre(): string[] {
    const enfants = new Map<string, string[]>()
    const racines: string[] = []
    for (const [id, parente] of parents) {
      if (parente === null) {
        racines.push(id)
        continue
      }
      const fratrie = enfants.get(parente)
      if (fratrie) fratrie.push(id)
      else enfants.set(parente, [id])
    }

    const atteints = new Set<string>()
    const file = [...racines]
    while (file.length > 0) {
      const courant = file.shift()!
      if (atteints.has(courant)) continue
      atteints.add(courant)
      for (const enfant of enfants.get(courant) ?? []) {
        if (!atteints.has(enfant)) file.push(enfant)
      }
    }

    const horsArbre: string[] = []
    for (const id of parents.keys()) {
      if (!atteints.has(id)) horsArbre.push(id)
    }

    // Chaque Structure hors arbre est dans un cycle ou mène à un cycle : c'est
    // ce que dit son absence de l'arbre, et c'est ce que le journal nomme. La
    // remontée s'arrête au premier maillon déjà classé, donc chaque Structure
    // n'est remontée qu'une fois en tout — et non une fois par Structure hors
    // arbre, ce qui serait quadratique sur une longue chaîne corrompue.
    const dansUnCycle = new Set<string>()
    for (const id of horsArbre) {
      if (dansUnCycle.has(id)) continue
      const chemin: string[] = []
      const vus = new Set<string>()
      let curseur: string | null = id
      while (
        curseur !== null &&
        !dansUnCycle.has(curseur) &&
        !vus.has(curseur)
      ) {
        chemin.push(curseur)
        vus.add(curseur)
        curseur = parents.get(curseur) ?? null
      }
      const cycle = cycleRefermePar(chemin, curseur)
      if (!cycle) continue
      signaler(cycle)
      // Seuls les maillons du cycle sont classés : l'amont qui y mène n'en fait
      // pas partie, et une autre branche peut encore le remonter.
      for (const maillon of cycle.slice(0, -1)) dansUnCycle.add(maillon)
    }

    return horsArbre
  }

  return { ancetres, descendance, horsArbre }
}
