import { prisma } from "@/lib/db"
import {
  complementDepuis,
  comparerParNom,
  liensDesStructures,
  marcheStructure,
} from "@/lib/marche-structure"

export interface FaitStructure {
  id: string
  name: string
  slug: string
  image: string | null
  parentId: string | null
  produitsDirects: number
}

export interface NoeudAccueil {
  id: string
  name: string
  slug: string
  image: string | null
  productCount: number
  children: NoeudAccueil[]
}

interface FicheStructure {
  id: string
  name: string
  slug: string
  image: string | null
  parentId: string | null
}

interface LigneStructureAdmin {
  id: string
  name: string
  slug: string
  image: string | null
  parentId: string | null
  nomParente: string | null
  nombreProduits: number
  nombreEnfants: number
  profondeur: number
  horsArbre: boolean
}

interface CibleSuppression {
  id: string
  produits: string[]
  sousCategories: string[]
}

interface OptionStructure {
  id: string
  name: string
}

interface MaillonAriane {
  name: string
  slug: string
}

export interface LectureStructure {
  arbreAccueil(): NoeudAccueil[]
  lignesAdmin(): LigneStructureAdmin[]
  ciblesSuppression(): CibleSuppression[]
  options(): OptionStructure[]
  structure(id: string): FicheStructure | null
  structureParSlug(slug: string): FicheStructure | null
  filAriane(id: string): MaillonAriane[]
  enfants(id: string): FicheStructure[]
  branche(id: string): string[]
}

function uneFois<T>(construire: () => T): () => T {
  let memorise: { valeur: T } | undefined
  return () => (memorise ??= { valeur: construire() }).valeur
}

function cumulerLesProduits(racines: NoeudAccueil[]): void {
  const noeuds = new Map<string, NoeudAccueil>()
  const parenteDe = new Map<string, string>()
  const ordre: NoeudAccueil[] = []
  const pile: { noeud: NoeudAccueil; parente: string | null }[] = racines.map(
    (noeud) => ({ noeud, parente: null })
  )
  while (pile.length > 0) {
    const { noeud, parente } = pile.pop()!
    noeuds.set(noeud.id, noeud)
    if (parente !== null) parenteDe.set(noeud.id, parente)
    ordre.push(noeud)
    for (const enfant of noeud.children) {
      pile.push({ noeud: enfant, parente: noeud.id })
    }
  }
  for (let i = ordre.length - 1; i >= 0; i -= 1) {
    const noeud = ordre[i]!
    const parente = parenteDe.get(noeud.id)
    if (parente !== undefined) {
      noeuds.get(parente)!.productCount += noeud.productCount
    }
  }
}

export function lectureDesStructures(
  faits: readonly FaitStructure[]
): LectureStructure {
  const liens = uneFois(() => liensDesStructures(faits))
  const marche = uneFois(() => marcheStructure(liens()))
  const parId = uneFois(
    (): Map<string, FaitStructure> =>
      new Map(faits.map((fait) => [fait.id, fait]))
  )
  const parSlug = uneFois(
    (): Map<string, FaitStructure> =>
      new Map(faits.map((fait) => [fait.slug, fait]))
  )

  function dansLOrdre(ids: readonly string[]): string[] {
    return ids
      .map((id) => ({ id, name: parId().get(id)?.name ?? id }))
      .sort(comparerParNom)
      .map((ordonne) => ordonne.id)
  }

  function fiche(fait: FaitStructure): FicheStructure {
    return {
      id: fait.id,
      name: fait.name,
      slug: fait.slug,
      image: fait.image,
      parentId: fait.parentId,
    }
  }

  function arbreAccueil(): NoeudAccueil[] {
    const courant = marche()
    courant.horsArbre()

    const noeuds = new Map<string, NoeudAccueil>()
    const noeudDe = (id: string): NoeudAccueil => {
      const noeud = noeuds.get(id)
      if (noeud) return noeud
      const fait = parId().get(id)!
      const bati: NoeudAccueil = {
        id,
        name: fait.name,
        slug: fait.slug,
        image: fait.image,
        productCount: fait.produitsDirects,
        children: [],
      }
      noeuds.set(id, bati)
      return bati
    }

    const racines = courant.racines().map(noeudDe)
    const pile = [...racines]
    while (pile.length > 0) {
      const noeud = pile.pop()!
      for (const id of courant.enfantsDe(noeud.id)) {
        const enfant = noeudDe(id)
        noeud.children.push(enfant)
        pile.push(enfant)
      }
    }

    cumulerLesProduits(racines)
    return racines
  }

  function lignesAdmin(): LigneStructureAdmin[] {
    const courant = marche()
    const horsArbre = new Set(courant.horsArbre())
    const index = parId()

    const ligneDe = (
      fait: FaitStructure,
      profondeur: number,
      hors: boolean,
      nombreEnfants: number
    ): LigneStructureAdmin => ({
      id: fait.id,
      name: fait.name,
      slug: fait.slug,
      image: fait.image,
      parentId: fait.parentId,
      nomParente:
        fait.parentId === null
          ? null
          : (index.get(fait.parentId)?.name ?? null),
      nombreProduits: fait.produitsDirects,
      nombreEnfants,
      profondeur,
      horsArbre: hors,
    })

    const lignes: LigneStructureAdmin[] = []
    const racines = courant.racines()
    const pile: { fait: FaitStructure; profondeur: number }[] = []
    for (let rang = racines.length - 1; rang >= 0; rang -= 1) {
      pile.push({ fait: index.get(racines[rang]!)!, profondeur: 0 })
    }
    while (pile.length > 0) {
      const { fait, profondeur } = pile.pop()!
      const fratrie = courant.enfantsDe(fait.id)
      lignes.push(ligneDe(fait, profondeur, false, fratrie.length))
      for (let rang = fratrie.length - 1; rang >= 0; rang -= 1) {
        pile.push({
          fait: index.get(fratrie[rang]!)!,
          profondeur: profondeur + 1,
        })
      }
    }

    const horsLignes = faits
      .filter((fait) => horsArbre.has(fait.id))
      .sort(comparerParNom)
      .map((fait) => ligneDe(fait, 0, true, courant.enfantsDe(fait.id).length))

    return [...lignes, ...horsLignes]
  }

  function ciblesSuppression(): CibleSuppression[] {
    return faits.map((fait) => {
      const partition = complementDepuis(marche(), liens(), fait.id)
      return {
        id: fait.id,
        produits: partition.horsSoi,
        sousCategories: partition.horsDescendance,
      }
    })
  }

  function options(): OptionStructure[] {
    return [...faits].sort(comparerParNom).map((fait) => ({
      id: fait.id,
      name: fait.name,
    }))
  }

  function structure(id: string): FicheStructure | null {
    const fait = parId().get(id)
    return fait === undefined ? null : fiche(fait)
  }

  function structureParSlug(slug: string): FicheStructure | null {
    const fait = parSlug().get(slug)
    return fait === undefined ? null : fiche(fait)
  }

  function filAriane(id: string): MaillonAriane[] {
    const maillons: MaillonAriane[] = []
    for (const ancetre of marche().ancetres(id)) {
      const fait = parId().get(ancetre)
      if (fait === undefined) continue
      maillons.push({ name: fait.name, slug: fait.slug })
    }
    return maillons
  }

  function enfants(id: string): FicheStructure[] {
    return marche()
      .enfantsDe(id)
      .map((enfant) => fiche(parId().get(enfant)!))
  }

  function branche(id: string): string[] {
    return [
      id,
      ...dansLOrdre(
        marche()
          .descendance(id)
          .filter((atteinte) => atteinte !== id)
      ),
    ]
  }

  return {
    arbreAccueil,
    lignesAdmin,
    ciblesSuppression,
    options,
    structure,
    structureParSlug,
    filAriane,
    enfants,
    branche,
  }
}

async function lireToutesLesStructures(): Promise<FaitStructure[]> {
  const rangees = await prisma.category.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      image: true,
      parentId: true,
      _count: { select: { products: true } },
    },
  })
  return rangees.map((rangee) => ({
    id: rangee.id,
    name: rangee.name,
    slug: rangee.slug,
    image: rangee.image,
    parentId: rangee.parentId,
    produitsDirects: rangee._count.products,
  }))
}

export async function lireStructure(): Promise<LectureStructure> {
  return lectureDesStructures(await lireToutesLesStructures())
}
