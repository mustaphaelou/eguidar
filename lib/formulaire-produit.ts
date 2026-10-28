import {
  galerieImageProduitSchema,
  type EntreeBrouillonImage,
  type EntreeImagePersistee,
  type EntreeImageProduit,
} from "@/lib/galerie-image-produit"
import { centsToInputValue, parseMadToCents } from "@/lib/money"
import type { ProductInput } from "@/lib/use-cases/admin-catalog"

export const CHAMPS_FORMULAIRE_PRODUIT = {
  nom: "name",
  slug: "slug",
  marque: "brand",
  structure: "categoryId",
  description: "description",
  prix: "price",
  specifications: "specsText",
  miseEnAvant: "isFeatured",
  livraisonOfferte: "freeShipping",
  ordre: "featuredOrder",
  galerie: "images",
  variantes: "variants",
  tentative: "tentativeId",
  produit: "productId",
} as const

export interface FaitsVarianteFormulaire {
  id?: string
  name: string
  sku: string
  priceDelta: number
  stock: number
}

export interface FaitsFormulaireProduit {
  id?: string
  name: string
  slug: string
  brand: string
  categoryId: string | null
  description: string
  price: number
  isFeatured: boolean
  featuredOrder: number
  freeShipping: boolean
  specs: Record<string, string>
  images: EntreeImageProduitFormulaire[]
  variants: FaitsVarianteFormulaire[]
}

export type EntreeImageProduitFormulaire =
  | (EntreeImagePersistee & { suppressionEnAttente?: boolean })
  | EntreeBrouillonImage

export const SECTIONS_FORMULAIRE_PRODUIT = [
  "informations",
  "miseEnAvant",
  "images",
  "variantes",
  "structure",
] as const

export type SectionFormulaireProduit =
  (typeof SECTIONS_FORMULAIRE_PRODUIT)[number]

export type SectionsErreurProduit = Partial<
  Record<SectionFormulaireProduit, string>
>

export interface EtatFormulaireProduit {
  error?: string
  sections?: SectionsErreurProduit
}

function sectionDuProbleme(probleme: string): SectionFormulaireProduit | null {
  if (/variante|sku|stock/i.test(probleme)) return "variantes"
  if (/image|galerie|brouillon/i.test(probleme)) return "images"
  if (/catégorie|structure/i.test(probleme)) return "structure"
  if (/mise en avant|mis en avant|ordre de mise/i.test(probleme))
    return "miseEnAvant"
  if (/nom|slug|marque|prix|spécification|description/i.test(probleme))
    return "informations"
  return null
}

/**
 * La carte des sections qu'un refus du Catalogue met en cause. Elle lit les
 * messages du Catalogue sans les réécrire : chaque problème reste cité tel
 * quel dans la section qui le porte, et un refus inclassable n'est affecté à
 * aucune section — il reste le message global du formulaire.
 */
export function sectionsDerreurProduit(message: string): SectionsErreurProduit {
  const interieur = message.replace(/^Données invalides\s*:\s*/, "")
  const sections: SectionsErreurProduit = {}
  for (const probleme of interieur.split(/\s*;\s*/)) {
    const section = sectionDuProbleme(probleme)
    if (section === null) continue
    sections[section] = sections[section]
      ? `${sections[section]} ; ${probleme}`
      : probleme
  }
  return sections
}

export const MESSAGE_SECTIONS_INVALIDES =
  "Certaines sections sont invalides : corrigez les champs signalés."

export const MESSAGE_SPECIFICATIONS_INVALIDE =
  "Format de spécifications invalide (clé : valeur par ligne)"

export const MESSAGE_FORMULAIRE_INVALIDE = "Formulaire invalide"

export interface SoumissionFormulaireProduit {
  champsCatalogue: Omit<ProductInput, "images">
  images: EntreeImageProduit[]
  tentativeId: string
}

export function texteSpecifications(specs: Record<string, string>): string {
  return Object.entries(specs)
    .map(([cle, valeur]) => `${cle} : ${valeur}`)
    .join("\n")
}

export function specificationsDepuisTexte(
  texte: string
): Record<string, string> {
  const specs: Record<string, string> = {}
  for (const ligne of texte.split("\n")) {
    const rognee = ligne.trim()
    if (!rognee) continue
    const deuxPoints = rognee.indexOf(":")
    if (deuxPoints <= 0) {
      throw new Error(MESSAGE_SPECIFICATIONS_INVALIDE)
    }
    specs[rognee.slice(0, deuxPoints).trim()] = rognee
      .slice(deuxPoints + 1)
      .trim()
  }
  return specs
}

export function texteEcartPrix(cents: number): string {
  return centsToInputValue(cents)
}

export function ecartPrixDepuisTexte(texte: string): number {
  return parseMadToCents(texte) ?? 0
}

const VALEUR_CASE_A_COCHER = "on"

export function valeurCaseACocher(cochee: boolean): string {
  return cochee ? VALEUR_CASE_A_COCHER : ""
}

export function caseACocherDepuisValeur(valeur: string): boolean {
  return valeur === VALEUR_CASE_A_COCHER
}

export function soumissionDepuisFormData(
  formData: FormData,
  basePubliqueImageProduit: string | null
): SoumissionFormulaireProduit {
  const imagesBrut = formData.get(CHAMPS_FORMULAIRE_PRODUIT.galerie)
  const variantesBrut = formData.get(CHAMPS_FORMULAIRE_PRODUIT.variantes)
  const tentativeBrut = formData.get(CHAMPS_FORMULAIRE_PRODUIT.tentative)

  let images: EntreeImageProduit[]
  let variantes: ProductInput["variants"]
  try {
    images = galerieImageProduitSchema(basePubliqueImageProduit).parse(
      JSON.parse(String(imagesBrut ?? "[]"))
    )
    variantes = JSON.parse(String(variantesBrut ?? "[]"))
  } catch {
    throw new Error(MESSAGE_FORMULAIRE_INVALIDE)
  }

  const prix = parseMadToCents(
    String(formData.get(CHAMPS_FORMULAIRE_PRODUIT.prix) ?? "")
  )
  if (prix === null) throw new Error(MESSAGE_FORMULAIRE_INVALIDE)

  return {
    champsCatalogue: {
      name: String(formData.get(CHAMPS_FORMULAIRE_PRODUIT.nom) ?? ""),
      slug: String(formData.get(CHAMPS_FORMULAIRE_PRODUIT.slug) ?? ""),
      brand: String(formData.get(CHAMPS_FORMULAIRE_PRODUIT.marque) ?? ""),
      categoryId: String(
        formData.get(CHAMPS_FORMULAIRE_PRODUIT.structure) ?? ""
      ),
      description: String(
        formData.get(CHAMPS_FORMULAIRE_PRODUIT.description) ?? ""
      ),
      price: prix,
      isFeatured: caseACocherDepuisValeur(
        String(formData.get(CHAMPS_FORMULAIRE_PRODUIT.miseEnAvant) ?? "")
      ),
      featuredOrder:
        Number(formData.get(CHAMPS_FORMULAIRE_PRODUIT.ordre) ?? 0) || 0,
      freeShipping: caseACocherDepuisValeur(
        String(formData.get(CHAMPS_FORMULAIRE_PRODUIT.livraisonOfferte) ?? "")
      ),
      specs: specificationsDepuisTexte(
        String(formData.get(CHAMPS_FORMULAIRE_PRODUIT.specifications) ?? "")
      ),
      variants: variantes,
    },
    images,
    tentativeId: typeof tentativeBrut === "string" ? tentativeBrut.trim() : "",
  }
}

export function galerieSoumiseHorsSuppressionsEnAttente(
  images: readonly EntreeImageProduitFormulaire[]
): EntreeImageProduit[] {
  const soumises: EntreeImageProduit[] = []
  for (const image of images) {
    if (image.kind === "persistee") {
      if (image.suppressionEnAttente) continue
      soumises.push({ kind: "persistee", url: image.url })
      continue
    }
    soumises.push({
      kind: "brouillon",
      draftId: image.draftId,
      previewUrl: image.previewUrl,
    })
  }
  return soumises
}
