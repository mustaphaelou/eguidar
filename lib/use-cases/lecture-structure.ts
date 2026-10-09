import { prisma } from "@/lib/db"
import {
  complementDepuis,
  comparerParNom,
  descendanceDe,
  liensDesStructures,
  marcheDesStructures,
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

function faitsParId(
  structures: readonly FaitStructure[]
): Map<string, FaitStructure> {
  return new Map(structures.map((fait) => [fait.id, fait]))
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

export function projeterArbreAccueil(
  structures: readonly FaitStructure[]
): NoeudAccueil[] {
  const marche = marcheDesStructures(structures)
  marche.horsArbre()

  const parId = faitsParId(structures)
  const noeuds = new Map<string, NoeudAccueil>()
  const noeudDe = (id: string): NoeudAccueil => {
    const noeud = noeuds.get(id)
    if (noeud) return noeud
    const fait = parId.get(id)!
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

  const racines = marche.racines().map(noeudDe)
  const pile = [...racines]
  while (pile.length > 0) {
    const noeud = pile.pop()!
    for (const id of marche.enfantsDe(noeud.id)) {
      const enfant = noeudDe(id)
      noeud.children.push(enfant)
      pile.push(enfant)
    }
  }

  cumulerLesProduits(racines)
  return racines
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

export async function lireArbreAccueil(): Promise<NoeudAccueil[]> {
  return projeterArbreAccueil(await lireToutesLesStructures())
}

export interface LigneStructureAdmin {
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

export interface CiblesSuppression {
  id: string
  produits: string[]
  sousCategories: string[]
}

export interface EcranAdminStructure {
  lignes: LigneStructureAdmin[]
  cibles: CiblesSuppression[]
}
export function projeterEcranAdmin(
  structures: readonly FaitStructure[]
): EcranAdminStructure {
  const liens = liensDesStructures(structures)
  const marche = marcheStructure(liens)
  const horsArbre = new Set(marche.horsArbre())
  const parId = faitsParId(structures)

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
      fait.parentId === null ? null : (parId.get(fait.parentId)?.name ?? null),
    nombreProduits: fait.produitsDirects,
    nombreEnfants,
    profondeur,
    horsArbre: hors,
  })

  const cibles: CiblesSuppression[] = structures.map((fait) => {
    const partition = complementDepuis(marche, liens, fait.id)
    return {
      id: fait.id,
      produits: partition.horsSoi,
      sousCategories: partition.horsDescendance,
    }
  })

  const lignes: LigneStructureAdmin[] = []
  const racines = marche.racines()
  const pile: { fait: FaitStructure; profondeur: number }[] = []
  for (let rang = racines.length - 1; rang >= 0; rang -= 1) {
    pile.push({ fait: parId.get(racines[rang]!)!, profondeur: 0 })
  }
  while (pile.length > 0) {
    const { fait, profondeur } = pile.pop()!
    const fratrie = marche.enfantsDe(fait.id)
    lignes.push(ligneDe(fait, profondeur, false, fratrie.length))
    for (let rang = fratrie.length - 1; rang >= 0; rang -= 1) {
      pile.push({
        fait: parId.get(fratrie[rang]!)!,
        profondeur: profondeur + 1,
      })
    }
  }

  // Le compte d'une ligne hors arbre est **brut**, et c'est délibéré : il compte
  // toute la fratrie que la marche rend, un enfant dans une branche corrompue
  // compris. Une ligne doit dire la taille réelle de ce qu'un éditeur s'apprête à
  // changer (US 7) ; l'ensemble hors arbre étant fermé vers le bas, un enfant
  // hors arbre l'est toujours, donc **filtrer le compte le rendrait nul sur
  // toutes les lignes hors arbre** — c'est-à-dire juste sur celles qu'un éditeur
  // vient réparer. C'est le seul endroit où la **fratrie** de ces rangées est
  // demandée à la marche, qu'aucune descente partie des racines n'atteint, et c'est
  // le même nombre que `_count.children` aurait rendu, la lecture prenant la
  // table entière sans `where` : personne ne paie une jointure de plus pour un
  // fait que les liens portent déjà.
  const horsLignes = structures
    .filter((fait) => horsArbre.has(fait.id))
    .sort(comparerParNom)
    .map((fait) => ligneDe(fait, 0, true, marche.enfantsDe(fait.id).length))

  return { lignes: [...lignes, ...horsLignes], cibles }
}

export async function lireEcranAdmin(): Promise<EcranAdminStructure> {
  return projeterEcranAdmin(await lireToutesLesStructures())
}

export interface OptionStructure {
  id: string
  name: string
}

export function projeterOptionsSelecteur(
  structures: readonly FaitStructure[]
): OptionStructure[] {
  return [...structures].sort(comparerParNom).map((fait) => ({
    id: fait.id,
    name: fait.name,
  }))
}

export async function lireOptionsSelecteur(): Promise<OptionStructure[]> {
  return projeterOptionsSelecteur(await lireToutesLesStructures())
}

export interface StructureEditable {
  id: string
  name: string
  slug: string
  image: string | null
  parentId: string | null
}

export interface EcranEditionStructure {
  structureEditee: StructureEditable
  candidates: OptionStructure[]
  parentesExclues: string[]
}

export function projeterEcranEdition(
  structures: readonly FaitStructure[],
  id: string
): EcranEditionStructure | null {
  const fait = structures.find((structure) => structure.id === id)
  if (!fait) return null

  return {
    structureEditee: {
      id: fait.id,
      name: fait.name,
      slug: fait.slug,
      image: fait.image,
      parentId: fait.parentId,
    },
    candidates: [...structures].sort(comparerParNom).map((candidat) => ({
      id: candidat.id,
      name: candidat.name,
    })),
    parentesExclues: descendanceDe(structures, id),
  }
}

export async function lireEcranEdition(
  id: string
): Promise<EcranEditionStructure | null> {
  return projeterEcranEdition(await lireToutesLesStructures(), id)
}

export interface MaillonAriane {
  name: string
  slug: string
}

export interface PageCategorie {
  categorie: { id: string; name: string; slug: string; image: string | null }
  filAriane: MaillonAriane[]
  enfants: PageCategorie["categorie"][]
  idsProduits: string[]
}

export function projeterPageCategorie(
  structures: readonly FaitStructure[],
  slug: string
): PageCategorie | null {
  const fait = structures.find((candidat) => candidat.slug === slug)
  if (!fait) return null
  const parId = faitsParId(structures)

  const marche = marcheDesStructures(structures)

  return {
    categorie: {
      id: fait.id,
      name: fait.name,
      slug: fait.slug,
      image: fait.image,
    },
    filAriane: marche.ancetres(fait.id).map((id) => {
      const maillon = parId.get(id)!
      return { name: maillon.name, slug: maillon.slug }
    }),
    enfants: marche.enfantsDe(fait.id).map((id) => {
      const enfant = parId.get(id)!
      return {
        id: enfant.id,
        name: enfant.name,
        slug: enfant.slug,
        image: enfant.image,
      }
    }),
    idsProduits: marche.descendance(fait.id),
  }
}

export async function lirePageCategorie(
  slug: string
): Promise<PageCategorie | null> {
  return projeterPageCategorie(await lireToutesLesStructures(), slug)
}

export function projeterFilAriane(
  structures: readonly FaitStructure[],
  idStructure: string
): MaillonAriane[] {
  const marche = marcheDesStructures(structures)
  const parId = faitsParId(structures)

  const maillons: MaillonAriane[] = []
  for (const id of marche.ancetres(idStructure)) {
    const fait = parId.get(id)
    if (fait === undefined) continue
    maillons.push({ name: fait.name, slug: fait.slug })
  }
  return maillons
}

export async function lireFilAriane(
  idStructure: string
): Promise<MaillonAriane[]> {
  return projeterFilAriane(await lireToutesLesStructures(), idStructure)
}
