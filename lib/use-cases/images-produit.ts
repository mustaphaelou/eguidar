import { prisma } from "@/lib/db"
import { urlsImagesProduit } from "@/lib/product-metrics"
import {
  stockageImageProduitR2,
  type FaitImageProduitVerifiee,
  type ResultatStockageImageProduit,
} from "@/lib/r2"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

export interface EntreeRegistreImageProduit {
  publicUrl: string
  alt: string | null
  faits: FaitImageProduitVerifiee | null
}

export interface ProduitQuiUtilise {
  id: string
  name: string
}

export interface FaitsImageProduit {
  publicUrl: string
  mimeType: string
  byteSize: number
  width: number
  height: number
  alt: string | null
  createdBy: string | null
  createdAt: Date
  usageCount: number
  produits: ProduitQuiUtilise[]
}

export interface FiltresImagesProduit {
  q?: string
  inutilisees?: boolean
  sansAlt?: boolean
}

export interface PageImagesProduit {
  images: FaitsImageProduit[]
  totalCount: number
  inutiliseesCount: number
  sansAltCount: number
}

export interface ImagesProduitEffects {
  supprimerImage(publicUrl: string): Promise<ResultatStockageImageProduit<null>>
}

export function defaultImagesProduitEffects(): ImagesProduitEffects {
  return {
    supprimerImage: (url) =>
      stockageImageProduitR2.supprimerImagePersistee(url),
  }
}

export class ImageProduitIntrouvableError extends UserFacingError {
  constructor() {
    super("Image produit introuvable")
    this.name = "ImageProduitIntrouvableError"
  }
}

export class ImageProduitUtiliseeError extends UserFacingError {
  constructor(produits: readonly string[]) {
    const noms = [...new Set(produits)].map((nom) => `« ${nom} »`).join(", ")
    super(`Refus de suppression : Image produit utilisée par ${noms}`)
    this.name = "ImageProduitUtiliseeError"
  }
}

export class ImageProduitSuppressionImpossibleError extends UserFacingError {
  constructor(publicUrl: string) {
    super(
      `La suppression de l'Image produit ${publicUrl} a échoué dans le stockage. Réessayez : la réconciliation réparera l'écart entre le registre et le stockage.`
    )
    this.name = "ImageProduitSuppressionImpossibleError"
  }
}

const MIME_PAR_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
}

const SEGMENT_BROUILLONS_IMAGE_PRODUIT = "products/brouillons/"

/** L'URL d'un Brouillon n'a pas sa place dans le registre des Images produit. */
export function urlEstBrouillonImageProduit(publicUrl: string): boolean {
  try {
    return new URL(publicUrl).pathname.includes(
      SEGMENT_BROUILLONS_IMAGE_PRODUIT
    )
  } catch {
    return publicUrl.includes(SEGMENT_BROUILLONS_IMAGE_PRODUIT)
  }
}

export function mimeTypeDepuisUrl(publicUrl: string): string {
  const extension = publicUrl.split("?")[0]?.split("#")[0]?.split(".").pop()
  return (
    (extension && MIME_PAR_EXTENSION[extension.toLowerCase()]) || "image/jpeg"
  )
}

export function normaliserTexteAlternatif(
  valeur: string | null | undefined
): string | null {
  const rogne = valeur?.trim() ?? ""
  return rogne.length > 0 ? rogne : null
}

async function chargerLesUsages(): Promise<Map<string, ProduitQuiUtilise[]>> {
  const produits = await prisma.product.findMany({
    select: { id: true, name: true, images: true },
  })
  const usages = new Map<string, ProduitQuiUtilise[]>()
  for (const produit of produits) {
    for (const url of new Set(urlsImagesProduit(produit.images))) {
      const liste = usages.get(url)
      const reference = { id: produit.id, name: produit.name }
      if (liste) liste.push(reference)
      else usages.set(url, [reference])
    }
  }
  return usages
}

/**
 * L'écriture du registre est un effet après engagement : un upsert par URL
 * publique, pour que réenregistrer le même Produit ne duplique jamais une ligne.
 * Les faits de vérification d'un Brouillon promu remplacent les valeurs
 * inconnues d'une ligne réparée par la réconciliation.
 */
export async function enregistrerImagesProduit(
  entrees: readonly EntreeRegistreImageProduit[],
  createdBy: string | null
): Promise<void> {
  const vues = new Set<string>()
  for (const entree of entrees) {
    if (vues.has(entree.publicUrl)) continue
    vues.add(entree.publicUrl)
    const alt = normaliserTexteAlternatif(entree.alt)
    const faits = entree.faits
    await prisma.imageProduit.upsert({
      where: { publicUrl: entree.publicUrl },
      create: {
        publicUrl: entree.publicUrl,
        mimeType: faits?.mimeType ?? mimeTypeDepuisUrl(entree.publicUrl),
        byteSize: faits?.byteSize ?? 0,
        width: faits?.width ?? 0,
        height: faits?.height ?? 0,
        alt,
        createdBy,
      },
      update: faits
        ? {
            mimeType: faits.mimeType,
            byteSize: faits.byteSize,
            width: faits.width,
            height: faits.height,
            alt,
          }
        : { alt },
    })
  }
}

function correspondALaRecherche(
  image: FaitsImageProduit,
  recherche: string
): boolean {
  if (image.publicUrl.toLocaleLowerCase("fr").includes(recherche)) {
    return true
  }
  if (image.alt?.toLocaleLowerCase("fr").includes(recherche)) return true
  return image.produits.some((produit) =>
    produit.name.toLocaleLowerCase("fr").includes(recherche)
  )
}

/**
 * La Bibliothèque des médias lit le registre et joint ses usages. Une ligne du
 * registre qui n'est plus nommée par aucun Produit est une Image produit à
 * réparer : le filtre « inutilisées » est sa file d'attente.
 */
export async function listerImagesProduit(
  filtres: FiltresImagesProduit = {}
): Promise<PageImagesProduit> {
  const [lignes, usages] = await Promise.all([
    prisma.imageProduit.findMany({ orderBy: { createdAt: "desc" } }),
    chargerLesUsages(),
  ])

  const toutes: FaitsImageProduit[] = lignes.map((ligne) => {
    const produits = usages.get(ligne.publicUrl) ?? []
    return {
      publicUrl: ligne.publicUrl,
      mimeType: ligne.mimeType,
      byteSize: ligne.byteSize,
      width: ligne.width,
      height: ligne.height,
      alt: normaliserTexteAlternatif(ligne.alt),
      createdBy: ligne.createdBy,
      createdAt: ligne.createdAt,
      usageCount: produits.length,
      produits,
    }
  })

  const recherche = filtres.q?.trim().toLocaleLowerCase("fr") ?? ""
  const images = toutes.filter((image) => {
    if (filtres.inutilisees && image.usageCount > 0) return false
    if (filtres.sansAlt && image.alt !== null) return false
    if (recherche && !correspondALaRecherche(image, recherche)) return false
    return true
  })

  return {
    images,
    totalCount: toutes.length,
    inutiliseesCount: toutes.filter((image) => image.usageCount === 0).length,
    sansAltCount: toutes.filter((image) => image.alt === null).length,
  }
}

export async function mettreAJourTexteAlternatif(
  publicUrl: string,
  alt: string | null
): Promise<string | null> {
  const ligne = await prisma.imageProduit.findUnique({
    where: { publicUrl },
    select: { publicUrl: true },
  })
  if (!ligne) throw new ImageProduitIntrouvableError()
  const normalise = normaliserTexteAlternatif(alt)
  await prisma.imageProduit.update({
    where: { publicUrl },
    data: { alt: normalise },
  })
  return normalise
}

/**
 * La suppression est une décision du Catalogue, pas du bucket : une Image
 * produit nommée par un Produit est refusée. Un objet supprimé avant sa ligne
 * laisse une ligne inutilisée que la réconciliation enlève.
 */
export async function supprimerImagesProduit(
  publicUrls: readonly string[],
  overrides?: Partial<ImagesProduitEffects>
): Promise<{ supprimees: string[] }> {
  const effects = { ...defaultImagesProduitEffects(), ...overrides }
  const urls = [...new Set(publicUrls)]
  if (urls.length === 0) return { supprimees: [] }

  const [lignes, usages] = await Promise.all([
    prisma.imageProduit.findMany({
      where: { publicUrl: { in: urls } },
      select: { publicUrl: true },
    }),
    chargerLesUsages(),
  ])
  const connues = new Set(lignes.map((ligne) => ligne.publicUrl))
  const produitsUtilisateurs = urls.flatMap((url) =>
    (usages.get(url) ?? []).map((produit) => produit.name)
  )
  if (produitsUtilisateurs.length > 0) {
    throw new ImageProduitUtiliseeError(produitsUtilisateurs)
  }
  if (urls.some((url) => !connues.has(url))) {
    throw new ImageProduitIntrouvableError()
  }

  for (const url of urls) {
    let suppression: ResultatStockageImageProduit<null>
    try {
      suppression = await effects.supprimerImage(url)
    } catch {
      throw new ImageProduitSuppressionImpossibleError(url)
    }
    if (!suppression.ok) {
      throw new ImageProduitSuppressionImpossibleError(url)
    }
    await prisma.imageProduit.delete({ where: { publicUrl: url } })
  }

  return { supprimees: urls }
}

export interface BilanReconstitutionRegistre {
  ajoutees: number
  supprimees: number
}

/**
 * La réconciliation répare les deux moitiés d'un écart : une Image produit du
 * Catalogue sans ligne de registre, et une ligne que plus aucun Produit ne
 * nomme (par exemple après l'échec de sa suppression de ligne). Le bucket n'est
 * jamais l'autorité : seuls les `Product.images` et le registre sont lus.
 */
export async function reconstituerRegistreImagesProduit(): Promise<BilanReconstitutionRegistre> {
  const [produits, lignes] = await Promise.all([
    prisma.product.findMany({ select: { images: true } }),
    prisma.imageProduit.findMany({ select: { publicUrl: true } }),
  ])

  const attendues = new Set<string>()
  for (const produit of produits) {
    for (const url of urlsImagesProduit(produit.images)) {
      if (!urlEstBrouillonImageProduit(url)) attendues.add(url)
    }
  }
  const existantes = new Set(lignes.map((ligne) => ligne.publicUrl))

  let ajoutees = 0
  for (const publicUrl of attendues) {
    if (existantes.has(publicUrl)) continue
    await prisma.imageProduit.create({
      data: {
        publicUrl,
        mimeType: mimeTypeDepuisUrl(publicUrl),
        byteSize: 0,
        width: 0,
        height: 0,
      },
    })
    ajoutees += 1
  }

  let supprimees = 0
  for (const publicUrl of existantes) {
    if (attendues.has(publicUrl)) continue
    await prisma.imageProduit.delete({ where: { publicUrl } })
    supprimees += 1
  }

  return { ajoutees, supprimees }
}
