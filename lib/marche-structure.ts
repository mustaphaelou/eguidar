export interface StructureLue {
  id: string
  name: string
  parentId: string | null
}

export interface LiensStructure {
  parentParId: ReadonlyMap<string, string | null>
  noms?: ReadonlyMap<string, string>
}

export interface MarcheStructure {
  ancetres(id: string): string[]
  descendance(id: string): string[]
  horsArbre(): string[]
  racines(): string[]
  enfantsDe(id: string): string[]
}

const MAILLONS_ENUMERES = 10

function nommer(
  id: string,
  noms: ReadonlyMap<string, string> | undefined
): string {
  return noms?.get(id) ?? id
}

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

function atteindre(
  depart: readonly string[],
  enfants: ReadonlyMap<string, readonly string[]>
): { atteints: string[]; revisites: Set<string> } {
  const atteints: string[] = []
  const vus = new Set<string>()
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

export function marcheStructure(liens: LiensStructure): MarcheStructure {
  const { parentParId, noms } = liens
  const cyclesSignales = new Set<string>()

  const { enfants, racines: racinesDesLiens } = indexDesLiens(parentParId)

  function cycleRefermePar(
    chemin: string[],
    visite: string | null
  ): string[] | null {
    if (visite === null) return null
    const debut = chemin.indexOf(visite)
    return debut === -1 ? null : [...chemin.slice(debut), visite]
  }

  function remonter(id: string): { chemin: string[]; cycle: string[] | null } {
    const chemin: string[] = []
    const vus = new Set<string>()
    let curseur: string | null = id
    while (curseur !== null && !vus.has(curseur)) {
      chemin.push(curseur)
      vus.add(curseur)
      curseur = parentParId.get(curseur) ?? null
    }
    return { chemin, cycle: cycleRefermePar(chemin, curseur) }
  }

  function signaler(cycle: string[]): void {
    const maillons = cycle.slice(0, -1)
    const signature = [...maillons].sort().join("\u0000")
    if (cyclesSignales.has(signature)) return
    cyclesSignales.add(signature)
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
    return chemin.reverse()
  }

  function descendance(id: string): string[] {
    const { atteints, revisites } = atteindre([id], enfants)

    for (const revisite of revisites) {
      const { cycle } = remonter(revisite)
      if (cycle) signaler(cycle)
    }

    return atteints
  }

  function horsArbre(): string[] {
    const { atteints } = atteindre(racinesDesLiens, enfants)
    const dansLArbre = new Set(atteints)

    const horsArbre: string[] = []
    for (const id of parentParId.keys()) {
      if (!dansLArbre.has(id)) horsArbre.push(id)
    }

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
      for (const maillon of cycle.slice(0, -1)) dansUnCycle.add(maillon)
    }

    return horsArbre
  }

  function racines(): string[] {
    return dansLOrdreDuModule(racinesDesLiens, noms)
  }

  function enfantsDe(id: string): string[] {
    return dansLOrdreDuModule(enfants.get(id) ?? [], noms)
  }

  return { ancetres, descendance, horsArbre, racines, enfantsDe }
}

export function marcheDesStructures(
  structures: readonly StructureLue[]
): MarcheStructure {
  return marcheStructure(liensDesStructures(structures))
}

export function liensDesStructures(
  structures: readonly StructureLue[]
): LiensStructure {
  return {
    parentParId: new Map(
      structures.map((structure) => [structure.id, structure.parentId])
    ),
    noms: nomsDesStructures(structures),
  }
}

function nomsDesStructures(
  structures: readonly StructureLue[]
): ReadonlyMap<string, string> {
  return new Map(structures.map((structure) => [structure.id, structure.name]))
}

export interface StructureOrdonnee {
  id: string
  name: string
}

export function comparerParNom(
  a: StructureOrdonnee,
  b: StructureOrdonnee
): number {
  return a.name.localeCompare(b.name, "fr") || a.id.localeCompare(b.id, "fr")
}

function dansLOrdreDuModule(
  ids: readonly string[],
  noms: ReadonlyMap<string, string> | undefined
): string[] {
  return ids
    .map((id) => ({ id, name: nommer(id, noms) }))
    .sort(comparerParNom)
    .map((ordonne) => ordonne.id)
}

function brancheDansLOrdre(
  marche: MarcheStructure,
  noms: ReadonlyMap<string, string> | undefined,
  id: string
): string[] {
  return [
    id,
    ...dansLOrdreDuModule(
      marche.descendance(id).filter((atteinte) => atteinte !== id),
      noms
    ),
  ]
}

export function descendanceDe(
  structures: readonly StructureLue[],
  id: string
): string[] {
  return brancheDansLOrdre(
    marcheDesStructures(structures),
    nomsDesStructures(structures),
    id
  )
}

export interface PartitionStructure {
  descendance: string[]
  horsSoi: string[]
  horsDescendance: string[]
}

export function complementDe(
  structures: readonly StructureLue[],
  id: string
): PartitionStructure {
  const liens = liensDesStructures(structures)
  return complementDepuis(marcheStructure(liens), liens, id)
}

export function complementDepuis(
  marche: MarcheStructure,
  liens: LiensStructure,
  id: string
): PartitionStructure {
  const noms = liens.noms
  const descendance = brancheDansLOrdre(marche, noms, id)
  const dansLaDescendance = new Set(descendance)
  const tous = [...liens.parentParId.keys()]

  return {
    descendance,
    horsSoi: dansLOrdreDuModule(
      tous.filter((autre) => autre !== id),
      noms
    ),
    horsDescendance: dansLOrdreDuModule(
      tous.filter((autre) => !dansLaDescendance.has(autre)),
      noms
    ),
  }
}
