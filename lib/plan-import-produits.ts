/**
 * Le plan d'un Lot d'import : la pure fonction qui juge des Lignes déjà lues
 * contre un instantané du Catalogue. Elle décide, Produit par Produit, s'il
 * faut le créer, le modifier, le laisser inchangé ou le refuser ; elle calcule
 * l'état désiré complet et le diff avant → après, sans aucune écriture.
 *
 * La Vérification et l'application appellent ce même module : l'application
 * rejoue la vérification avec un instantané frais, elle ne la réimplémente pas.
 * Le module n'importe que le contrat du fichier ; il est sans base, sans
 * horloge et sans réseau.
 */

import {
  grouperParProduit,
  normaliserLeNom,
  type AvertissementImport,
  type CellulesImport,
  type CodeRefusImport,
  type ColonneImport,
  type LigneImport,
  type RefusImport,
  type StatutLigneImport,
} from "./import-produits"

/** Une Variante telle que le Catalogue la porte au moment du jugement. */
export interface InstantaneVarianteProduit {
  id: string
  name: string
  sku: string
  priceDelta: number
  stock: number
}

/** Un Produit tel que le Catalogue le porte au moment du jugement. */
export interface InstantaneProduit {
  id: string
  slug: string
  name: string
  brand: string
  description: string
  categoryId: string | null
  /** Le slug de la Structure du Produit, pour un diff lisible. */
  structureSlug: string | null
  price: number
  variants: readonly InstantaneVarianteProduit[]
}

export interface InstantaneStructure {
  id: string
  slug: string
}

export interface NomDeProduitExistant {
  slug: string
  name: string
}

/**
 * Le Catalogue figé que reçoit le plan. `produitsParSku` donne le slug du
 * Produit qui possède déjà chaque sku, même quand ce Produit n'est pas dans le
 * fichier ; `nomsExistants` porte tous les noms, pour la ressemblance.
 */
export interface InstantaneCatalogue {
  produitsParSlug: Readonly<Record<string, InstantaneProduit>>
  structuresParSlug: Readonly<Record<string, InstantaneStructure>>
  produitsParSku: Readonly<Record<string, string>>
  nomsExistants: readonly NomDeProduitExistant[]
}

export type IssueProduit = "cree" | "modifie" | "inchange" | "refuse"

export type ChampProduitPlan =
  "name" | "brand" | "description" | "category" | "price"

export type ChampVariantePlan = "name" | "price" | "stock"

export type ChampPlanImport = ChampProduitPlan | ChampVariantePlan

export interface ChangementPlanImport {
  champ: ChampPlanImport
  avant: string | number | null
  apres: string | number | null
}

export interface DiffVariantePlanImport {
  sku: string
  changements: readonly ChangementPlanImport[]
}

export interface DiffProduitPlanImport {
  produit: readonly ChangementPlanImport[]
  variantes: readonly DiffVariantePlanImport[]
}

/** Une Variante de l'état désiré : `id` quand elle existe déjà. */
export interface VarianteDesireeImport {
  id?: string
  name: string
  sku: string
  priceDelta: number
  stock: number
}

/**
 * L'état désiré complet des champs que l'import possède. Les champs que le
 * fichier ne mentionne pas — images, `specs`, mise en avant, livraison — sont
 * lus et préservés par l'écriture (#985), pas par le plan.
 */
export interface EtatDesireProduitImport {
  name: string
  brand: string
  description: string
  categoryId: string | null
  price: number
  variants: readonly VarianteDesireeImport[]
}

export interface LignePlanifieeImport {
  numero: number
  statut: StatutLigneImport
  refus: RefusImport | null
  avertissements: readonly AvertissementImport[]
}

export interface PlanProduit {
  slug: string
  issue: IssueProduit
  codeRefus: CodeRefusImport | null
  refus: RefusImport | null
  avertissements: readonly AvertissementImport[]
  diff: DiffProduitPlanImport
  /** L'état à écrire, ou `null` quand il n'y a rien à écrire. */
  etatDesire: EtatDesireProduitImport | null
  statuts: readonly { numero: number; statut: StatutLigneImport }[]
  lignes: readonly LignePlanifieeImport[]
}

interface GroupeDeLignes {
  slug: string
  lignes: readonly LigneImport[]
}

const DIFF_VIDE: DiffProduitPlanImport = { produit: [], variantes: [] }

function valeurDeCellule(
  cellules: CellulesImport,
  colonne: ColonneImport
): string | null {
  const valeur = cellules[colonne]
  return valeur === undefined || valeur === "" ? null : valeur
}

function premiereValeur(
  lignes: readonly LigneImport[],
  colonne: ColonneImport
): string | null {
  for (const ligne of lignes) {
    const valeur = valeurDeCellule(ligne.cellules, colonne)
    if (valeur !== null) return valeur
  }
  return null
}

/**
 * Le premier champ requis d'une création encore vide, dans l'ordre du contrat :
 * `name` et `brand` sur au moins une Ligne, puis `variant_name` et
 * `variant_price` sur chacune. Rend `null` quand tout est là.
 */
export function champRequisManquantALaCreation(
  lignes: readonly { cellules: CellulesImport }[]
): ColonneImport | null {
  if (
    !lignes.some((ligne) => valeurDeCellule(ligne.cellules, "name") !== null)
  ) {
    return "name"
  }
  if (
    !lignes.some((ligne) => valeurDeCellule(ligne.cellules, "brand") !== null)
  ) {
    return "brand"
  }
  for (const ligne of lignes) {
    if (valeurDeCellule(ligne.cellules, "variant_name") === null) {
      return "variant_name"
    }
  }
  for (const ligne of lignes) {
    if (valeurDeCellule(ligne.cellules, "variant_price") === null) {
      return "variant_price"
    }
  }
  return null
}

/**
 * Le champ requis que le rejeu peut retrouver depuis des cellules persistées :
 * la Variante d'abord (elle est exigée sur chaque Ligne d'une création comme
 * d'une Variante nouvelle), puis `name` et `brand`, exigés seulement quand
 * aucune Ligne du Produit ne les porte.
 */
export function champRequisManquantDuProduit(
  lignes: readonly { cellules: CellulesImport }[]
): ColonneImport | null {
  for (const ligne of lignes) {
    if (valeurDeCellule(ligne.cellules, "variant_name") === null) {
      return "variant_name"
    }
  }
  for (const ligne of lignes) {
    if (valeurDeCellule(ligne.cellules, "variant_price") === null) {
      return "variant_price"
    }
  }
  if (
    !lignes.some((ligne) => valeurDeCellule(ligne.cellules, "name") !== null)
  ) {
    return "name"
  }
  if (
    !lignes.some((ligne) => valeurDeCellule(ligne.cellules, "brand") !== null)
  ) {
    return "brand"
  }
  return null
}

function champManquantDeLaNouvelleVariante(
  ligne: LigneImport
): ColonneImport | null {
  if (valeurDeCellule(ligne.cellules, "variant_name") === null) {
    return "variant_name"
  }
  if (valeurDeCellule(ligne.cellules, "variant_price") === null) {
    return "variant_price"
  }
  return null
}

function avertissementsSansDoublon(
  avertissements: readonly AvertissementImport[]
): AvertissementImport[] {
  const vus = new Set<string>()
  return avertissements.filter((avertissement) => {
    if (vus.has(avertissement.code)) return false
    vus.add(avertissement.code)
    return true
  })
}

function planDuRefus(groupe: GroupeDeLignes, refus: RefusImport): PlanProduit {
  const lignes: LignePlanifieeImport[] = groupe.lignes.map((ligne) => ({
    numero: ligne.numero,
    statut: "refusee",
    refus: ligne.refus ?? refus,
    avertissements: [...ligne.avertissements],
  }))

  return {
    slug: groupe.slug,
    issue: "refuse",
    codeRefus: refus.code,
    refus,
    avertissements: [],
    diff: DIFF_VIDE,
    etatDesire: null,
    statuts: lignes.map(({ numero, statut }) => ({ numero, statut })),
    lignes,
  }
}

function enregistrementValide(ligne: LigneImport) {
  if (ligne.enregistrement === null) {
    throw new Error(`La Ligne ${ligne.numero} n'a pas d'enregistrement lisible`)
  }
  return ligne.enregistrement
}

interface VarianteCalculee {
  existante: InstantaneVarianteProduit | null
  name: string
  sku: string
  /** Le prix absolu en centimes, avant réécartement. */
  absolu: number
  stock: number
}

function changementsDUneVariante(
  calculee: VarianteCalculee,
  baseExistante: number
): ChangementPlanImport[] {
  if (calculee.existante === null) {
    return [
      { champ: "name", avant: null, apres: calculee.name },
      { champ: "price", avant: null, apres: calculee.absolu },
      { champ: "stock", avant: null, apres: calculee.stock },
    ]
  }

  const changements: ChangementPlanImport[] = []
  if (calculee.name !== calculee.existante.name) {
    changements.push({
      champ: "name",
      avant: calculee.existante.name,
      apres: calculee.name,
    })
  }

  const absoluAvant = baseExistante + calculee.existante.priceDelta
  if (calculee.absolu !== absoluAvant) {
    changements.push({
      champ: "price",
      avant: absoluAvant,
      apres: calculee.absolu,
    })
  }

  if (calculee.stock !== calculee.existante.stock) {
    changements.push({
      champ: "stock",
      avant: calculee.existante.stock,
      apres: calculee.stock,
    })
  }

  return changements
}

function planifierLeProduit(
  groupe: GroupeDeLignes,
  instantane: InstantaneCatalogue
): PlanProduit {
  const ligneRefusee = groupe.lignes.find((ligne) => ligne.refus !== null)
  if (ligneRefusee?.refus !== undefined && ligneRefusee.refus !== null) {
    return planDuRefus(groupe, ligneRefusee.refus)
  }

  const existant = instantane.produitsParSlug[groupe.slug] ?? null
  const categoryCellule = premiereValeur(groupe.lignes, "category")

  let categoryId: string | null
  let structureSlug: string | null
  if (categoryCellule !== null) {
    const structure = instantane.structuresParSlug[categoryCellule]
    if (structure === undefined) {
      return planDuRefus(groupe, {
        code: "structure_inconnue",
        structure: categoryCellule,
        portee: "produit",
      })
    }
    categoryId = structure.id
    structureSlug = structure.slug
  } else {
    categoryId = existant?.categoryId ?? null
    structureSlug = existant?.structureSlug ?? null
  }

  if (existant === null) {
    const champManquant = champRequisManquantALaCreation(groupe.lignes)
    if (champManquant !== null) {
      return planDuRefus(groupe, {
        code: "champ_requis_manquant",
        champ: champManquant,
        portee: "produit",
      })
    }
  }

  for (const ligne of groupe.lignes) {
    const proprietaire = instantane.produitsParSku[ligne.sku]
    if (proprietaire !== undefined && proprietaire !== groupe.slug) {
      return planDuRefus(groupe, {
        code: "sku_deja_pris",
        sku: ligne.sku,
        portee: "produit",
      })
    }
  }

  const existantes = existant?.variants ?? []
  const existantesParSku = new Map(
    existantes.map((variante) => [variante.sku, variante])
  )

  if (existant !== null) {
    for (const ligne of groupe.lignes) {
      if (existantesParSku.has(ligne.sku)) continue
      const champManquant = champManquantDeLaNouvelleVariante(ligne)
      if (champManquant !== null) {
        return planDuRefus(groupe, {
          code: "champ_requis_manquant",
          champ: champManquant,
          portee: "produit",
        })
      }
    }
  }

  const lignesParSku = new Map(groupe.lignes.map((ligne) => [ligne.sku, ligne]))
  const calculees: VarianteCalculee[] = []

  for (const varianteExistante of existantes) {
    const ligne = lignesParSku.get(varianteExistante.sku)
    const absoluExistant = (existant?.price ?? 0) + varianteExistante.priceDelta
    const enregistrement =
      ligne === undefined ? null : enregistrementValide(ligne)
    calculees.push({
      existante: varianteExistante,
      name: enregistrement?.variante.name ?? varianteExistante.name,
      sku: varianteExistante.sku,
      absolu: enregistrement?.variante.prix ?? absoluExistant,
      stock: enregistrement?.variante.stock ?? varianteExistante.stock,
    })
  }

  for (const ligne of groupe.lignes) {
    if (existantesParSku.has(ligne.sku)) continue
    const enregistrement = enregistrementValide(ligne)
    calculees.push({
      existante: null,
      name: enregistrement.variante.name ?? "",
      sku: ligne.sku,
      absolu: enregistrement.variante.prix ?? 0,
      stock: enregistrement.variante.stock ?? 0,
    })
  }

  const base = Math.min(...calculees.map((calculee) => calculee.absolu))
  const variants: VarianteDesireeImport[] = calculees.map((calculee) => ({
    ...(calculee.existante === null ? {} : { id: calculee.existante.id }),
    name: calculee.name,
    sku: calculee.sku,
    priceDelta: calculee.absolu - base,
    stock: calculee.stock,
  }))

  const name = premiereValeur(groupe.lignes, "name") ?? existant?.name ?? ""
  const brand = premiereValeur(groupe.lignes, "brand") ?? existant?.brand ?? ""
  const description =
    premiereValeur(groupe.lignes, "description") ?? existant?.description ?? ""

  const avertissements: AvertissementImport[] = []
  if (categoryId === null) {
    avertissements.push({ code: "produit_sans_structure" })
  }
  if (existant === null) {
    const nomNormalise = normaliserLeNom(name)
    const ressemblant = instantane.nomsExistants.find(
      ({ slug, name: nomExistant }) =>
        slug !== groupe.slug && normaliserLeNom(nomExistant) === nomNormalise
    )
    if (ressemblant !== undefined) {
      avertissements.push({ code: "nom_ressemblant", slug: ressemblant.slug })
    }
  }

  let diff: DiffProduitPlanImport = DIFF_VIDE
  if (existant !== null) {
    const changementProduit: ChangementPlanImport[] = []
    if (name !== existant.name) {
      changementProduit.push({
        champ: "name",
        avant: existant.name,
        apres: name,
      })
    }
    if (brand !== existant.brand) {
      changementProduit.push({
        champ: "brand",
        avant: existant.brand,
        apres: brand,
      })
    }
    if (description !== existant.description) {
      changementProduit.push({
        champ: "description",
        avant: existant.description,
        apres: description,
      })
    }
    if (categoryId !== existant.categoryId) {
      changementProduit.push({
        champ: "category",
        avant: existant.structureSlug,
        apres: structureSlug,
      })
    }
    if (base !== existant.price) {
      changementProduit.push({
        champ: "price",
        avant: existant.price,
        apres: base,
      })
    }

    const changementsDesVariantes = calculees
      .map((calculee) => ({
        sku: calculee.sku,
        changements: changementsDUneVariante(calculee, existant.price),
      }))
      .filter((diffVariante) => diffVariante.changements.length > 0)

    diff = {
      produit: changementProduit,
      variantes: changementsDesVariantes,
    }
  }

  const issue: IssueProduit =
    existant === null ? "cree" : diffProduitVide(diff) ? "inchange" : "modifie"
  const statut: StatutLigneImport =
    issue === "cree"
      ? "a_creer"
      : issue === "modifie"
        ? "a_modifier"
        : "inchangee"

  const lignes: LignePlanifieeImport[] = groupe.lignes.map((ligne) => ({
    numero: ligne.numero,
    statut,
    refus: null,
    avertissements: avertissementsSansDoublon([
      ...ligne.avertissements,
      ...avertissements,
    ]),
  }))

  return {
    slug: groupe.slug,
    issue,
    codeRefus: null,
    refus: null,
    avertissements,
    diff: issue === "inchange" ? DIFF_VIDE : diff,
    etatDesire:
      issue === "inchange"
        ? null
        : {
            name,
            brand,
            description,
            categoryId,
            price: base,
            variants,
          },
    statuts: lignes.map(({ numero, statut }) => ({ numero, statut })),
    lignes,
  }
}

function diffProduitVide(diff: DiffProduitPlanImport): boolean {
  return diff.produit.length === 0 && diff.variantes.length === 0
}

/**
 * Juge un Lot contre le Catalogue : un plan par slug de Produit, dans l'ordre
 * de première apparition des Lignes. Chaque règle du contrat additif vit ici,
 * et l'acceptation d'une Structure inconnue, d'un sku pris ou d'un champ requis
 * manquant rend le Produit entier refusé.
 */
export function planifierLeLot(
  lignes: readonly LigneImport[],
  instantane: InstantaneCatalogue
): readonly PlanProduit[] {
  return grouperParProduit(lignes).map((groupe) =>
    planifierLeProduit(groupe, instantane)
  )
}
