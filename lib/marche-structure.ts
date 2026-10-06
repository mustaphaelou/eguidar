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
 * l'ADR-0030 consigne comme le cœur de sa décision.
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
 *
 * **Les noms sont un confort, pas une condition.** `noms` reste facultatif :
 * un appelant qui n'a pas le nom sous la main obtient quand même sa traversée,
 * et le journal retombe alors sur l'identifiant. Un `cuid` se lit mal, mais il
 * est vrai — la marche n'a pas à inventer un nom qu'aucune lecture ne lui a
 * donné.
 *
 * **Un cycle très long est résumé, et c'est délibéré.** Le critère de #544 est
 * « un cycle journalisé une fois, nommant les Structures impliquées » : au-delà
 * de dix maillons, la ligne dit la taille du cycle et ses dix premiers, ce qui
 * nomme les Structures impliquées sans verser vingt mille identifiants dans le
 * journal. Une ligne de vingt mille maillons n'est pas un journal, c'est un
 * vidage — et la première ligne utile reste « il y a un cycle, et le voici ».
 */

/**
 * Ce qu'une lecture de la Structure rend, réduit à ce que la marche consomme :
 * une rangée par Structure, avec son nom et sa parente. Les surfaces qui
 * lisaient la Structure le projetaient chacune à leur façon — deux cartes
 * bâties à la main, cinq fois — et cinq copies d'un même fait divergent
 * (ADR-0022).
 */
export interface StructureLue {
  id: string
  name: string
  parentId: string | null
}

/**
 * Les faits que la marche consomme : le lien de chaque Structure vers sa
 * parente, et — quand l'appelant les a sous la main — les noms qui rendent le
 * journal lisible.
 *
 * `parentParId` porte l'absence de parente par `null`, et une clé absente vaut
 * `null` : une Structure dont la parente n'est pas dans la carte termine donc
 * sa marche comme une racine — `ancetres` s'arrête, `horsArbre` n'invente
 * aucun cycle. C'est ce que le code fait, et c'est solide : la clé étrangère
 * `Category_parentId_fkey` garantit qu'un `parentId` nomme une rangée
 * existante, donc une clé absente ne peut dire qu'une chose — la lecture de
 * l'appelant ne couvrait pas cette rangée. La traiter en racine est la
 * dégradation que ce module promet ; l'alternative, une erreur, est exactement
 * ce qu'ADR-0030 interdit à une lecture de faire.
 */
export interface LiensStructure {
  parentParId: ReadonlyMap<string, string | null>
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
 * L'index inverse des liens — chaque parente, et ses enfants — et les racines
 * que les liens déclarent. `descendance` et `horsArbre` descendent le même
 * graphe : le bâtir deux fois était écrire deux fois le même fait, et se donner
 * deux occasions de diverger (ADR-0022).
 */
function indexDesLiens(parentParId: ReadonlyMap<string, string | null>): {
  enfants: Map<string, string[]>
  racines: string[]
} {
  const enfants = new Map<string, string[]>()
  const racines: string[] = []
  for (const [id, parente] of parentParId) {
    if (parente === null) {
      racines.push(id)
      continue
    }
    const fratrie = enfants.get(parente)
    if (fratrie) fratrie.push(id)
    else enfants.set(parente, [id])
  }
  return { enfants, racines }
}

/**
 * Une descente depuis `depart` : ce qu'elle atteint, chacune au plus une fois,
 * et les enfants qu'elle a retrouvés déjà atteints — le pas qui referme un
 * cycle. `descendance` part d'une Structure, `horsArbre` de toutes les racines :
 * c'est la même passe, avec la même règle de terminaison — toute revisite
 * l'arrête —, et elle n'est donc écrite qu'une fois.
 */
function atteindre(
  depart: readonly string[],
  enfants: ReadonlyMap<string, readonly string[]>
): { atteints: string[]; revisites: Set<string> } {
  const atteints: string[] = []
  const vus = new Set<string>()
  /** Les enfants déjà atteints : chacun est le pas qui referme un cycle. */
  const revisites = new Set<string>()
  const file = [...depart]
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
  return { atteints, revisites }
}

/**
 * Construit une marche sur des liens déjà en mémoire.
 *
 * La marche est une valeur : elle se construit une fois, s'interroge autant de
 * fois qu'une requête en a besoin, et ne retient rien d'autre que les cycles
 * qu'elle a déjà signalés.
 */
export function marcheStructure(liens: LiensStructure): MarcheStructure {
  const { parentParId, noms } = liens
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
      // Une parente absente de la carte termine la marche comme une racine :
      // la clé étrangère garantit qu'elle existe en base, donc la lecture de
      // l'appelant ne la couvrait pas (voir `LiensStructure`).
      curseur = parentParId.get(curseur) ?? null
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
    const { enfants } = indexDesLiens(parentParId)
    const { atteints, revisites } = atteindre([id], enfants)

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
    const { enfants, racines } = indexDesLiens(parentParId)
    const { atteints } = atteindre(racines, enfants)
    const dansLArbre = new Set(atteints)

    const horsArbre: string[] = []
    for (const id of parentParId.keys()) {
      if (!dansLArbre.has(id)) horsArbre.push(id)
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
        curseur = parentParId.get(curseur) ?? null
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

/**
 * La marche d'une lecture : les rangées que l'appelant a déjà en main, sans
 * requête de plus. Une seule projection pour les surfaces qui lisent la
 * Structure, parce que cinq copies d'un même fait divergent (ADR-0022).
 *
 * C'est le chemin ordinaire : une lecture qui a ses rangées n'a pas à bâtir
 * deux cartes — les liens et les noms — pour interroger la marche.
 * `marcheStructure` reste l'entrée des faits déjà séparés, et celle que la
 * suite du module exerce sans noms.
 */
export function marcheDesStructures(
  structures: readonly StructureLue[]
): MarcheStructure {
  return marcheStructure({
    parentParId: new Map(
      structures.map((structure) => [structure.id, structure.parentId])
    ),
    noms: new Map(
      structures.map((structure) => [structure.id, structure.name])
    ),
  })
}
