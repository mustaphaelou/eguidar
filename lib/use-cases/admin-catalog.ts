import { z } from "zod"

import { enregistrerEvenement } from "@/lib/automations/evenements"
import { prisma } from "@/lib/db"
import {
  Prisma,
  type Category,
  type Product,
  type ProductVariant,
} from "@/lib/generated/prisma/client"
import cycleVieImageProduitParDefaut, {
  estLieAuProduit,
  MESSAGE_REGISTRE_INDISPONIBLE,
  portTransactionRegistreBrouillonImageProduit,
  type BrouillonImageProduit,
  type CycleVieImageProduit,
  type PreuvePromotion,
  type RefusCycleVieImageProduit,
} from "@/lib/cycle-vie-image-produit"
import type { FaitsFormulaireProduit } from "@/lib/formulaire-produit"
import {
  entreeGalerieImageProduitSchema,
  identifiantsBrouillonsGalerie,
  LIMITE_IMAGES_PRODUIT,
  normaliserTexteAlternatif,
  type EntreeImageProduit,
} from "@/lib/galerie-image-produit"
import {
  LIBELLE_SANS_STRUCTURE,
  toIndexableProduct,
} from "@/lib/index-projection"
import type { IndexableProduct } from "@/lib/index-projection"
import { deleteProductDocument, indexProductDocuments } from "@/lib/meili"
import {
  specificationsProduit,
  totalVariantStock,
  urlsImagesProduit,
} from "@/lib/product-metrics"
import {
  PRODUIT_LISTING_PAGE_DEFAULT,
  PRODUIT_LISTING_PAGE_SIZE_DEFAULT,
  PRODUIT_LISTING_SENS_DEFAULT,
  PRODUIT_LISTING_TRI_DEFAULT,
  PRODUIT_STRUCTURE_SANS,
  PRODUIT_STOCK_NON_NUL,
  PRODUIT_STOCK_ZERO,
  type ProduitListingParams,
  type ProduitTri,
} from "@/lib/produit-listing"
import { stockageImageProduitR2, type FaitImageProduitVerifiee } from "@/lib/r2"
import {
  enregistrerImagesProduit,
  type EntreeRegistreImageProduit,
} from "@/lib/use-cases/images-produit"
import type {
  CatalogueEventCategory,
  CatalogueEventProduct,
} from "@/lib/use-cases/cache-invalidation"
import {
  chaineDeLaStructure,
  invalidateCatalogue,
} from "@/lib/use-cases/cache-invalidation"
import { lireStructure } from "@/lib/use-cases/lecture-structure"
import {
  avecSurcharges,
  leverConflitUnique,
  messageDeValidation,
  runEffect,
} from "@/lib/use-cases/mutation-squelette"
import { hasUniqueViolation } from "@/lib/use-cases/unique-violation"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

export interface ProductVariantInput {
  id?: string
  name: string
  sku: string
  priceDelta: number
  stock: number
}

export interface ProductInput {
  name: string
  slug: string
  description: string
  brand: string
  categoryId: string
  price: number
  specs: Record<string, string>
  images: readonly (string | EntreeImageProduit)[]
  tentativeId?: string
  ownerId?: string
  isFeatured: boolean
  featuredOrder: number
  freeShipping: boolean
  variants: ProductVariantInput[]
}

export interface CatalogEffects {
  cycleVie: CycleVieImageProduit
  reindexProducts(products: IndexableProduct[]): Promise<void>
  removeProductFromIndex(productId: string): Promise<void>
  revalidateCatalog(product: CatalogueEventProduct): Promise<void> | void
  deleteImages(urls: string[]): Promise<void>
  enregistrerImages(
    entrees: readonly EntreeRegistreImageProduit[],
    createdBy: string | null
  ): Promise<void>
}

function journaliserEchecSuppressionImage(
  libelleJournal: string,
  url: string,
  erreur: unknown
): void {
  console.warn(
    `[catalog] suppression d'image R2 non effectuée pour ${libelleJournal}, image ${url}`,
    erreur
  )
}

export function defaultCatalogEffects(libelleJournal: string): CatalogEffects {
  return {
    cycleVie: cycleVieImageProduitParDefaut,
    reindexProducts: indexProductDocuments,
    async removeProductFromIndex(id) {
      await deleteProductDocument(id)
    },
    revalidateCatalog(product) {
      return invalidateCatalogue(product)
    },
    async deleteImages(urls) {
      for (const url of urls) {
        try {
          const resultat =
            await stockageImageProduitR2.supprimerImagePersistee(url)
          if (!resultat.ok) {
            journaliserEchecSuppressionImage(
              libelleJournal,
              url,
              resultat.erreur
            )
          }
        } catch (error) {
          journaliserEchecSuppressionImage(libelleJournal, url, error)
        }
      }
    },
    enregistrerImages: enregistrerImagesProduit,
  }
}

export class CatalogValidationError extends UserFacingError {
  constructor(issues: string[]) {
    super(messageDeValidation(issues))
    this.name = "CatalogValidationError"
  }
}

export class SlugConflictError extends UserFacingError {
  constructor() {
    super("Un produit avec ce slug existe déjà")
    this.name = "SlugConflictError"
  }
}

export class DuplicateSkuError extends UserFacingError {
  constructor() {
    super("Une variante avec ce SKU existe déjà")
    this.name = "DuplicateSkuError"
  }
}

export class ProductNotFoundError extends UserFacingError {
  constructor() {
    super("Produit introuvable")
    this.name = "ProductNotFoundError"
  }
}

export class VariantNotFoundError extends Error {
  constructor() {
    super("Variante introuvable")
    this.name = "VariantNotFoundError"
  }
}

export class DraftPromotionRefusedError extends UserFacingError {
  constructor(message: string) {
    super(message)
    this.name = "DraftPromotionRefusedError"
  }
}

export class DraftExpiredError extends DraftPromotionRefusedError {
  constructor(message: string) {
    super(message)
    this.name = "DraftExpiredError"
  }
}

export class DraftConflictError extends DraftPromotionRefusedError {
  constructor(message: string) {
    super(message)
    this.name = "DraftConflictError"
  }
}

export class ImageStorageUnavailableError extends DraftPromotionRefusedError {
  constructor(message: string) {
    super(message)
    this.name = "ImageStorageUnavailableError"
  }
}

export class DraftRegistryUnavailableError extends DraftPromotionRefusedError {
  constructor(message: string) {
    super(message)
    this.name = "DraftRegistryUnavailableError"
  }
}

export class MissingImageAltError extends UserFacingError {
  constructor(positions: readonly number[]) {
    const images = positions.map((position) => `l'image ${position}`).join(", ")
    super(
      `Texte alternatif manquant pour ${images} : un Brouillon d'Image produit doit en avoir un avant d'être publié`
    )
    this.name = "MissingImageAltError"
  }
}

const variantInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "nom de variante requis"),
  sku: z.string().min(1, "SKU requis"),
  priceDelta: z.number().int(),
  stock: z.number().int().min(0, "le stock doit être positif ou nul"),
})

function normaliserGalerie(
  entrees: readonly (string | EntreeImageProduit)[]
): EntreeImageProduit[] {
  return entrees.map((entree) =>
    typeof entree === "string" ? { kind: "persistee", url: entree } : entree
  )
}

const galerieSoumiseSchema = z
  .array(z.union([z.string(), entreeGalerieImageProduitSchema]))
  .transform(normaliserGalerie)
  .refine(
    (galerie) => galerie.length <= LIMITE_IMAGES_PRODUIT,
    `au maximum ${LIMITE_IMAGES_PRODUIT} images par produit`
  )

const productInputSchema = z.object({
  name: z.string().min(1, "nom requis"),
  slug: z
    .string()
    .min(1, "slug requis")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "slug invalide (minuscules, chiffres et tirets uniquement)"
    ),
  description: z.string(),
  brand: z.string().min(1, "marque requise"),
  categoryId: z.string().min(1, "catégorie requise"),
  price: z.number().int().min(0, "le prix doit être positif ou nul"),
  specs: z.record(z.string(), z.string()),
  images: galerieSoumiseSchema,
  tentativeId: z
    .string()
    .min(1, "identifiant de tentative invalide")
    .optional(),
  ownerId: z.string().min(1, "identifiant de propriétaire invalide").optional(),
  isFeatured: z.boolean(),
  featuredOrder: z.number().int().min(0),
  freeShipping: z.boolean(),
  variants: z.array(variantInputSchema),
})

interface ProduitValide extends Omit<ProductInput, "images"> {
  images: EntreeImageProduit[]
}

function parseProductInput(input: ProductInput): ProduitValide {
  const result = productInputSchema.safeParse(input)
  if (!result.success) {
    throw new CatalogValidationError(
      result.error.issues.map((issue) => issue.message)
    )
  }
  return result.data
}

function assertNonNegativeVariantPrices(input: ProductInput): void {
  const problems = input.variants
    .filter((variant) => variant.priceDelta + input.price < 0)
    .map((variant) => `prix final négatif pour le SKU ${variant.sku}`)
  if (problems.length > 0) throw new CatalogValidationError(problems)
}

function assertTextesAlternatifsDesNouvellesImages(
  galerie: readonly EntreeImageProduit[]
): void {
  const manquantes = galerie.flatMap((entree, index) =>
    entree.kind === "brouillon" && !normaliserTexteAlternatif(entree.alt)
      ? [index + 1]
      : []
  )
  if (manquantes.length > 0) throw new MissingImageAltError(manquantes)
}

function assertUniqueSkusInInput(variants: ProductVariantInput[]): void {
  const seen = new Set<string>()
  for (const variant of variants) {
    if (seen.has(variant.sku)) throw new DuplicateSkuError()
    seen.add(variant.sku)
  }
}

async function assertUniqueSlug(
  slug: string,
  excludeProductId?: string
): Promise<void> {
  const existing = await prisma.product.findUnique({ where: { slug } })
  if (existing && existing.id !== excludeProductId)
    throw new SlugConflictError()
}

async function assertUniqueSkus(
  skus: string[],
  excludeProductId?: string
): Promise<void> {
  if (skus.length === 0) return
  const existing = await prisma.productVariant.findMany({
    where: {
      sku: { in: skus },
      ...(excludeProductId ? { productId: { not: excludeProductId } } : {}),
    },
    select: { sku: true },
  })
  if (existing.length > 0) throw new DuplicateSkuError()
}

function urlsGalerie(galerie: readonly EntreeImageProduit[]): string[] {
  return galerie.flatMap((entree) =>
    entree.kind === "persistee" ? [entree.url] : []
  )
}

const MESSAGE_IMAGE_AUTRE_PRODUIT =
  "une entrée de Galerie ne peut pas nommer une Image produit qui appartient à un autre Produit"

async function assertAucuneImageDAutreProduit(
  galerie: readonly EntreeImageProduit[],
  autorisees: readonly string[]
): Promise<void> {
  const connues = new Set(autorisees)
  const candidates = [
    ...new Set(
      galerie.flatMap((entree) =>
        entree.kind === "persistee" && !connues.has(entree.url)
          ? [entree.url]
          : []
      )
    ),
  ]
  if (candidates.length === 0) return

  const autre = await prisma.product.findFirst({
    where: {
      OR: candidates.map((url) => ({ images: { array_contains: [url] } })),
    },
    select: { id: true },
  })
  if (autre) throw new CatalogValidationError([MESSAGE_IMAGE_AUTRE_PRODUIT])
}

function mapUniqueViolation(error: unknown): never {
  return leverConflitUnique(
    error,
    [
      { champs: ["slug"], erreur: new SlugConflictError() },
      { champs: ["sku"], erreur: new DuplicateSkuError() },
    ],
    hasUniqueViolation
  )
}

const MESSAGE_BROUILLONS_PARTIELLEMENT_LIES =
  "Les Brouillons ne sont pas tous liés à la même tentative"

const MESSAGE_REPRISE_AUTRE_PRODUIT =
  "Cette Tentative d'édition a déjà été enregistrée pour un autre Produit"

const MESSAGE_ENREGISTREMENT_ECHOUE = "L'enregistrement du Catalogue a échoué"

function erreurDePreparation(
  refus: RefusCycleVieImageProduit
): UserFacingError {
  switch (refus.code) {
    case "brouillon-expire":
      return new DraftExpiredError(refus.message)
    case "brouillon-non-vivant":
      return new DraftConflictError(refus.message)
    case "stockage-indisponible":
    case "stockage-refuse":
      return new ImageStorageUnavailableError(refus.message)
    case "registre-indisponible":
      return new DraftRegistryUnavailableError(refus.message)
    default:
      return new DraftPromotionRefusedError(refus.message)
  }
}

async function produitDeLaTentative(
  tentativeId: string | undefined,
  brouillonsSoumis: readonly string[],
  effects: CatalogEffects
) {
  if (!tentativeId || brouillonsSoumis.length === 0) return null

  let lus: BrouillonImageProduit[]
  try {
    lus = await effects.cycleVie.lireBrouillonsDeLaTentative(tentativeId)
  } catch {
    throw new DraftRegistryUnavailableError(MESSAGE_REGISTRE_INDISPONIBLE)
  }

  const soumis = new Set(brouillonsSoumis)
  const lies = lus
    .filter((brouillon) => soumis.has(brouillon.id))
    .filter(estLieAuProduit)
  if (lies.length === 0) return null
  if (
    lies.length !== brouillonsSoumis.length ||
    new Set(lies.map((brouillon) => brouillon.productId)).size !== 1
  ) {
    throw new DraftConflictError(MESSAGE_BROUILLONS_PARTIELLEMENT_LIES)
  }

  const produit = await prisma.product.findUnique({
    where: { id: lies[0].productId },
    include: { variants: true, category: true },
  })
  if (!produit) throw new UserFacingError(MESSAGE_ENREGISTREMENT_ECHOUE)
  return produit
}

async function promouvoirBrouillons(
  data: ProduitValide,
  effects: CatalogEffects
): Promise<{ images: string[]; promotions: PreuvePromotion[] }> {
  if (identifiantsBrouillonsGalerie(data.images).length === 0) {
    return { images: urlsGalerie(data.images), promotions: [] }
  }

  const preparation = await effects.cycleVie.preparerPromotionBrouillons({
    tentativeId: data.tentativeId ?? "",
    ownerId: data.ownerId ?? "",
    galerie: data.images,
  })
  if (!preparation.ok) throw erreurDePreparation(preparation)
  return { images: preparation.galerie, promotions: preparation.promotions }
}

function entreesRegistreImagesProduit(
  galerie: readonly EntreeImageProduit[],
  promotions: readonly PreuvePromotion[],
  urls: readonly string[]
): EntreeRegistreImageProduit[] {
  const preuveParBrouillon = new Map(
    promotions.map((preuve) => [preuve.draftId, preuve])
  )
  const altParUrl = new Map<string, string | null>()
  const faitsParUrl = new Map<string, FaitImageProduitVerifiee>()
  for (const entree of galerie) {
    if (entree.kind === "persistee") {
      altParUrl.set(entree.url, normaliserTexteAlternatif(entree.alt))
      continue
    }
    const preuve = preuveParBrouillon.get(entree.draftId)
    if (!preuve) continue
    altParUrl.set(preuve.publicUrl, normaliserTexteAlternatif(entree.alt))
    if (preuve.faits) faitsParUrl.set(preuve.publicUrl, preuve.faits)
  }
  return urls.map((publicUrl) => ({
    publicUrl,
    alt: altParUrl.get(publicUrl) ?? null,
    faits: faitsParUrl.get(publicUrl) ?? null,
  }))
}

async function compenserPromotions(
  promotions: readonly PreuvePromotion[],
  effects: CatalogEffects
): Promise<void> {
  if (promotions.length === 0) return
  await effects.cycleVie.compenserPromotionBrouillons(promotions)
}

interface ProduitExistant {
  slug: string
  images: string[]
  categoryId: string | null
}

type ProduitEcrit = Product & {
  variants: ProductVariant[]
  category: Category | null
}

interface FaitsEcritureProduit {
  produit: ProduitEcrit
  imagesRetirees: string[]
  slugPrecedent?: string
}

type ModeEnregistrement =
  { kind: "creation" } | { kind: "miseAJour"; id: string }

type ContexteEnregistrement =
  | { kind: "creation" }
  | { kind: "miseAJour"; id: string; existant: ProduitExistant }

async function lireProduitExistant(id: string): Promise<ProduitExistant> {
  const produit = await prisma.product.findUnique({ where: { id } })
  if (!produit) throw new ProductNotFoundError()
  return {
    slug: produit.slug,
    images: urlsImagesProduit(produit.images),
    categoryId: produit.categoryId,
  }
}

async function contexteDe(
  mode: ModeEnregistrement
): Promise<ContexteEnregistrement> {
  if (mode.kind === "creation") return mode
  return { ...mode, existant: await lireProduitExistant(mode.id) }
}

async function chainesDuProduit(
  courante: string | null | undefined,
  precedente?: string | null
): Promise<{
  categoryChain: CatalogueEventCategory[]
  previousCategoryChain?: CatalogueEventCategory[]
}> {
  const categories = [
    ...new Set(
      [courante, precedente].filter(
        (id): id is string => id !== null && id !== undefined
      )
    ),
  ]
  if (categories.length === 0) return { categoryChain: [] }

  const lecture = await lireStructure()
  const categoryChain = chaineDeLaStructure(lecture, courante)
  if (!precedente || precedente === courante) return { categoryChain }
  return {
    categoryChain,
    previousCategoryChain: chaineDeLaStructure(lecture, precedente),
  }
}

async function assertVariantesDuProduit(
  id: string,
  variants: readonly ProductVariantInput[]
): Promise<void> {
  const existantes = await prisma.productVariant.findMany({
    where: { productId: id },
    select: { id: true },
  })
  const possedees = new Set(existantes.map((variant) => variant.id))
  for (const variant of variants) {
    if (variant.id && !possedees.has(variant.id)) {
      throw new CatalogValidationError(["variante inconnue pour ce produit"])
    }
  }
}

function donneesProduit(data: ProduitValide, images: string[]) {
  return {
    name: data.name,
    slug: data.slug,
    description: data.description,
    brand: data.brand,
    price: data.price,
    specs: data.specs,
    images,
    isFeatured: data.isFeatured,
    featuredOrder: data.featuredOrder,
    freeShipping: data.freeShipping,
    categoryId: data.categoryId,
  }
}

function donneesVariante(variant: ProductVariantInput) {
  return {
    name: variant.name,
    sku: variant.sku,
    priceDelta: variant.priceDelta,
    stock: variant.stock,
  }
}

async function ecrireCreation(
  tx: Prisma.TransactionClient,
  data: ProduitValide,
  images: string[]
): Promise<FaitsEcritureProduit> {
  const produit = await tx.product.create({
    data: {
      ...donneesProduit(data, images),
      variants: {
        create: data.variants.map((variant) => donneesVariante(variant)),
      },
    },
    include: { variants: true, category: true },
  })
  return { produit, imagesRetirees: [] }
}

async function ecrireMiseAJour(
  tx: Prisma.TransactionClient,
  id: string,
  data: ProduitValide,
  images: string[],
  existant: ProduitExistant
): Promise<FaitsEcritureProduit> {
  const variantesExistantes = await tx.productVariant.findMany({
    where: { productId: id },
    select: { id: true },
  })

  await tx.product.update({
    where: { id },
    data: donneesProduit(data, images),
  })

  for (const variant of data.variants) {
    if (variant.id) {
      await tx.productVariant.update({
        where: { id: variant.id },
        data: donneesVariante(variant),
      })
    } else {
      await tx.productVariant.create({
        data: { ...donneesVariante(variant), productId: id },
      })
    }
  }

  const conservees = new Set(
    data.variants.flatMap((variant) => (variant.id ? [variant.id] : []))
  )
  const supprimees = variantesExistantes
    .map((variant) => variant.id)
    .filter((variantId) => !conservees.has(variantId))
  if (supprimees.length > 0) {
    await tx.productVariant.deleteMany({ where: { id: { in: supprimees } } })
  }

  const produit = await tx.product.findUniqueOrThrow({
    where: { id },
    include: { variants: true, category: true },
  })
  return {
    produit,
    imagesRetirees: existant.images.filter((url) => !images.includes(url)),
    slugPrecedent: existant.slug !== produit.slug ? existant.slug : undefined,
  }
}

async function enregistrerProduit(
  mode: ModeEnregistrement,
  input: ProductInput,
  overrides?: Partial<CatalogEffects>
) {
  const contexte = await contexteDe(mode)
  const data = parseProductInput(input)
  const effects = avecSurcharges(
    defaultCatalogEffects(
      contexte.kind === "creation" ? data.slug : contexte.id
    ),
    overrides
  )

  const repris = await produitDeLaTentative(
    data.tentativeId,
    identifiantsBrouillonsGalerie(data.images),
    effects
  )
  if (repris) {
    if (contexte.kind === "miseAJour" && repris.id !== contexte.id) {
      throw new DraftConflictError(MESSAGE_REPRISE_AUTRE_PRODUIT)
    }
    return repris
  }

  const idMiseAJour = contexte.kind === "miseAJour" ? contexte.id : undefined
  const imagesExistantes =
    contexte.kind === "miseAJour" ? contexte.existant.images : []

  assertNonNegativeVariantPrices(data)
  assertUniqueSkusInInput(data.variants)
  await assertAucuneImageDAutreProduit(data.images, imagesExistantes)
  await assertUniqueSlug(data.slug, idMiseAJour)
  await assertUniqueSkus(
    data.variants.map((variant) => variant.sku),
    idMiseAJour
  )
  if (contexte.kind === "miseAJour") {
    await assertVariantesDuProduit(contexte.id, data.variants)
  }
  assertTextesAlternatifsDesNouvellesImages(data.images)

  const { images, promotions } = await promouvoirBrouillons(data, effects)

  let ecriture: FaitsEcritureProduit
  try {
    ecriture = await prisma.$transaction(async (tx) => {
      const ecrit =
        contexte.kind === "creation"
          ? await ecrireCreation(tx, data, images)
          : await ecrireMiseAJour(
              tx,
              contexte.id,
              data,
              images,
              contexte.existant
            )

      if (promotions.length > 0) {
        await effects.cycleVie.confirmerBrouillons(
          ecrit.produit.id,
          promotions,
          portTransactionRegistreBrouillonImageProduit(tx)
        )
      }
      await enregistrerEvenement(tx, {
        type: "produit.enregistre",
        entityType: "produit",
        entityId: ecrit.produit.id,
        payload: {
          produitId: ecrit.produit.id,
          slug: ecrit.produit.slug,
          slugPrecedent: ecrit.slugPrecedent ?? null,
          categoryId: ecrit.produit.categoryId,
          categoryIdPrecedent:
            contexte.kind === "miseAJour" ? contexte.existant.categoryId : null,
        },
      })
      return ecrit
    })
  } catch (error) {
    await compenserPromotions(promotions, effects)
    mapUniqueViolation(error)
  }

  const entreesRegistre = entreesRegistreImagesProduit(
    data.images,
    promotions,
    images
  )
  if (entreesRegistre.length > 0) {
    await runEffect({
      effet: "registre-images",
      entite: { type: "produit", id: ecriture.produit.id },
      message: `[catalog] écriture du registre des Images produit non effectuée pour ${ecriture.produit.id}`,
      fn: () =>
        effects.enregistrerImages(entreesRegistre, data.ownerId ?? null),
    })
  }
  if (promotions.length > 0) {
    await runEffect({
      effet: "suppression-brouillons",
      entite: { type: "produit", id: ecriture.produit.id },
      message: `[catalog] suppression des Brouillons d'Image produit non effectuée pour ${ecriture.produit.id}`,
      fn: () => effects.cycleVie.supprimerSources(promotions),
    })
  }
  if (contexte.kind === "miseAJour") {
    await runEffect({
      effet: "suppression-images",
      entite: { type: "produit", id: ecriture.produit.id },
      message: `[catalog] suppression d'images R2 non effectuée pour ${ecriture.produit.id}`,
      fn: () => effects.deleteImages(ecriture.imagesRetirees),
    })
  }
  await runEffect({
    effet: "reindexation",
    entite: { type: "produit", id: ecriture.produit.id },
    message: `[catalog] réindexation Meilisearch non effectuée pour ${ecriture.produit.id}`,
    fn: () => effects.reindexProducts([toIndexableProduct(ecriture.produit)]),
  })
  const evenementCatalogue =
    ecriture.slugPrecedent === undefined
      ? { id: ecriture.produit.id, slug: ecriture.produit.slug }
      : {
          id: ecriture.produit.id,
          slug: ecriture.produit.slug,
          previousSlug: ecriture.slugPrecedent,
        }
  await runEffect({
    effet: "invalidation-cache",
    entite: { type: "produit", id: ecriture.produit.id },
    message: `[catalog] invalidation du cache non effectuée pour ${ecriture.produit.id}`,
    fn: async () => {
      const chaines = await chainesDuProduit(
        ecriture.produit.categoryId,
        contexte.kind === "miseAJour" ? contexte.existant.categoryId : null
      )
      await effects.revalidateCatalog({ ...evenementCatalogue, ...chaines })
    },
  })
  return ecriture.produit
}

export async function createProduct(
  input: ProductInput,
  overrides?: Partial<CatalogEffects>
) {
  return enregistrerProduit({ kind: "creation" }, input, overrides)
}

export async function updateProduct(
  id: string,
  input: ProductInput,
  overrides?: Partial<CatalogEffects>
) {
  return enregistrerProduit({ kind: "miseAJour", id }, input, overrides)
}

export async function deleteProduct(
  id: string,
  overrides?: Partial<CatalogEffects>
): Promise<void> {
  const effects = avecSurcharges(defaultCatalogEffects(id), overrides)
  const existing = await prisma.$transaction(async (tx) => {
    const produit = await tx.product.findUnique({ where: { id } })
    if (!produit) throw new ProductNotFoundError()

    await tx.product.delete({ where: { id } })
    await enregistrerEvenement(tx, {
      type: "produit.supprime",
      entityType: "produit",
      entityId: id,
      payload: {
        produitId: id,
        slug: produit.slug,
        categoryId: produit.categoryId,
      },
    })
    return produit
  })
  await runEffect({
    effet: "suppression-images",
    entite: { type: "produit", id },
    message: `[catalog] suppression d'images R2 non effectuée pour ${id}`,
    fn: () => effects.deleteImages(urlsImagesProduit(existing.images)),
  })
  await runEffect({
    effet: "desindexation",
    entite: { type: "produit", id },
    message: `[catalog] suppression de l'index Meilisearch non effectuée pour ${id}`,
    fn: () => effects.removeProductFromIndex(id),
  })
  await runEffect({
    effet: "invalidation-cache",
    entite: { type: "produit", id },
    message: `[catalog] invalidation du cache non effectuée pour ${id}`,
    fn: async () => {
      const chaines = await chainesDuProduit(existing.categoryId)
      await effects.revalidateCatalog({ id, slug: existing.slug, ...chaines })
    },
  })
}

export interface RapportLot {
  succes: string[]
  echecs: { id: string; raison: string }[]
}

const MESSAGE_PRODUIT_INTROUVABLE = "Produit introuvable"
const MESSAGE_STRUCTURE_INTROUVABLE = "Structure introuvable"

interface DocumentDeLot {
  indexable: IndexableProduct
  evenement: CatalogueEventProduct
}

async function documentsDeLot(
  ids: readonly string[]
): Promise<DocumentDeLot[]> {
  if (ids.length === 0) return []
  const produits = await prisma.product.findMany({
    where: { id: { in: [...ids] } },
    include: { variants: true },
  })
  const lecture = await lireStructure()
  return produits.map((produit) => {
    const fiche =
      produit.categoryId === null ? null : lecture.structure(produit.categoryId)
    return {
      indexable: toIndexableProduct({
        ...produit,
        category:
          fiche === null
            ? null
            : { id: fiche.id, slug: fiche.slug, name: fiche.name },
      }),
      evenement: {
        id: produit.id,
        slug: produit.slug,
        categoryChain: chaineDeLaStructure(lecture, produit.categoryId),
      },
    }
  })
}

async function reindexerLot(
  ids: readonly string[],
  effects: CatalogEffects
): Promise<void> {
  const documents = await documentsDeLot(ids)
  if (documents.length === 0) return

  await runEffect({
    effet: "reindexation",
    entite: { type: "produit", id: ids[0]! },
    message:
      "[catalog] réindexation Meilisearch non effectuée pour un geste en lot",
    fn: () =>
      effects.reindexProducts(documents.map(({ indexable }) => indexable)),
  })
  for (const { indexable, evenement } of documents) {
    await runEffect({
      effet: "invalidation-cache",
      entite: { type: "produit", id: indexable.id },
      message: `[catalog] invalidation du cache non effectuée pour ${indexable.id}`,
      fn: () => effects.revalidateCatalog(evenement),
    })
  }
}

function partitionDesIdentifiants(
  ids: readonly string[],
  existants: ReadonlySet<string>,
  raisonAbsence: string
): RapportLot {
  return {
    succes: ids.filter((id) => existants.has(id)),
    echecs: ids
      .filter((id) => !existants.has(id))
      .map((id) => ({ id, raison: raisonAbsence })),
  }
}

async function mettreAJourLot(
  ids: readonly string[],
  data: Prisma.ProductUncheckedUpdateManyInput,
  effects: CatalogEffects,
  raisonAbsence = MESSAGE_PRODUIT_INTROUVABLE
): Promise<RapportLot> {
  const uniques = [...new Set(ids)]
  if (uniques.length === 0) return { succes: [], echecs: [] }

  const existants = await prisma.product.findMany({
    where: { id: { in: uniques } },
    select: { id: true },
  })
  const partage = partitionDesIdentifiants(
    uniques,
    new Set(existants.map((produit) => produit.id)),
    raisonAbsence
  )
  if (partage.succes.length > 0) {
    await prisma.product.updateMany({
      where: { id: { in: partage.succes } },
      data,
    })
    await reindexerLot(partage.succes, effects)
  }
  return partage
}

export async function bulkSetFeatured(
  ids: readonly string[],
  valeur: boolean,
  overrides?: Partial<CatalogEffects>
): Promise<RapportLot> {
  const effects = avecSurcharges(
    defaultCatalogEffects("lot-produits"),
    overrides
  )
  return mettreAJourLot(ids, { isFeatured: valeur }, effects)
}

export async function bulkSetFreeShipping(
  ids: readonly string[],
  valeur: boolean,
  overrides?: Partial<CatalogEffects>
): Promise<RapportLot> {
  const effects = avecSurcharges(
    defaultCatalogEffects("lot-produits"),
    overrides
  )
  return mettreAJourLot(ids, { freeShipping: valeur }, effects)
}

export async function bulkSetStructure(
  ids: readonly string[],
  structureId: string,
  overrides?: Partial<CatalogEffects>
): Promise<RapportLot> {
  const uniques = [...new Set(ids)]
  const lecture = await lireStructure()
  if (lecture.structure(structureId) === null) {
    return {
      succes: [],
      echecs: uniques.map((id) => ({
        id,
        raison: MESSAGE_STRUCTURE_INTROUVABLE,
      })),
    }
  }
  const effects = avecSurcharges(
    defaultCatalogEffects("lot-produits"),
    overrides
  )
  return mettreAJourLot(
    uniques,
    { categoryId: structureId },
    effects,
    MESSAGE_PRODUIT_INTROUVABLE
  )
}

export async function bulkDelete(
  ids: readonly string[],
  overrides?: Partial<CatalogEffects>
): Promise<RapportLot> {
  const effects = avecSurcharges(
    defaultCatalogEffects("lot-produits"),
    overrides
  )
  const uniques = [...new Set(ids)]
  if (uniques.length === 0) return { succes: [], echecs: [] }

  const existants = await prisma.product.findMany({
    where: { id: { in: uniques } },
    select: { id: true, slug: true, images: true, categoryId: true },
  })
  const partage = partitionDesIdentifiants(
    uniques,
    new Set(existants.map((produit) => produit.id)),
    MESSAGE_PRODUIT_INTROUVABLE
  )
  if (partage.succes.length === 0) return partage

  const supprimes = new Set(partage.succes)
  await prisma.$transaction(async (tx) => {
    await tx.product.deleteMany({ where: { id: { in: partage.succes } } })
    for (const produit of existants) {
      if (!supprimes.has(produit.id)) continue
      await enregistrerEvenement(tx, {
        type: "produit.supprime",
        entityType: "produit",
        entityId: produit.id,
        payload: {
          produitId: produit.id,
          slug: produit.slug,
          categoryId: produit.categoryId,
        },
      })
    }
  })
  const lecture = await lireStructure()
  for (const produit of existants) {
    await runEffect({
      effet: "suppression-images",
      entite: { type: "produit", id: produit.id },
      message: `[catalog] suppression d'images R2 non effectuée pour ${produit.id}`,
      fn: () => effects.deleteImages(urlsImagesProduit(produit.images)),
    })
    await runEffect({
      effet: "desindexation",
      entite: { type: "produit", id: produit.id },
      message: `[catalog] suppression de l'index Meilisearch non effectuée pour ${produit.id}`,
      fn: () => effects.removeProductFromIndex(produit.id),
    })
    await runEffect({
      effet: "invalidation-cache",
      entite: { type: "produit", id: produit.id },
      message: `[catalog] invalidation du cache non effectuée pour ${produit.id}`,
      fn: () =>
        effects.revalidateCatalog({
          id: produit.id,
          slug: produit.slug,
          categoryChain: chaineDeLaStructure(lecture, produit.categoryId),
        }),
    })
  }
  return partage
}

async function nomDeCopie(
  base: string,
  estLibre: (candidat: string) => Promise<boolean>
): Promise<string> {
  for (let rang = 1; rang < 100; rang += 1) {
    const candidat = rang === 1 ? base : `${base}-${rang}`
    if (await estLibre(candidat)) return candidat
  }
  throw new CatalogValidationError(["impossible de nommer la copie"])
}

export async function duplicateProduct(
  id: string,
  overrides?: Partial<CatalogEffects>
) {
  const effects = avecSurcharges(defaultCatalogEffects(id), overrides)
  const faits = await getAdminProduct(id)
  if (faits === null) throw new ProductNotFoundError()

  const slug = await nomDeCopie(`${faits.slug}-copie`, async (candidat) => {
    const existant = await prisma.product.findUnique({
      where: { slug: candidat },
      select: { id: true },
    })
    return existant === null
  })

  const variantes: ProductVariantInput[] = []
  for (const variante of faits.variants) {
    const sku = await nomDeCopie(`${variante.sku}-copie`, async (candidat) => {
      const existant = await prisma.productVariant.findUnique({
        where: { sku: candidat },
        select: { id: true },
      })
      return existant === null
    })
    variantes.push({
      name: variante.name,
      sku,
      priceDelta: variante.priceDelta,
      stock: variante.stock,
    })
  }

  const copie = await prisma.$transaction(async (tx) => {
    const creee = await tx.product.create({
      data: {
        name: `${faits.name} (copie)`,
        slug,
        description: faits.description,
        brand: faits.brand,
        price: faits.price,
        specs: faits.specs,
        images: [],
        isFeatured: faits.isFeatured,
        featuredOrder: faits.featuredOrder,
        freeShipping: faits.freeShipping,
        categoryId: faits.categoryId,
        variants: { create: variantes },
      },
      include: { variants: true },
    })
    await enregistrerEvenement(tx, {
      type: "produit.enregistre",
      entityType: "produit",
      entityId: creee.id,
      payload: {
        produitId: creee.id,
        slug: creee.slug,
        slugPrecedent: null,
        categoryId: creee.categoryId,
        categoryIdPrecedent: null,
      },
    })
    return creee
  })

  await reindexerLot([copie.id], effects)
  return copie
}

export async function updateVariantStock(
  variantId: string,
  stock: number,
  overrides?: Partial<CatalogEffects>
) {
  if (!Number.isInteger(stock) || stock < 0) {
    throw new CatalogValidationError(["le stock doit être positif ou nul"])
  }

  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    include: { product: { include: { category: true, variants: true } } },
  })
  if (!variant) throw new VariantNotFoundError()

  const effects = avecSurcharges(
    defaultCatalogEffects(variant.product.id),
    overrides
  )
  await prisma.$transaction(async (tx) => {
    await tx.productVariant.update({
      where: { id: variantId },
      data: { stock },
    })
    await enregistrerEvenement(tx, {
      type: "variante.stock.changee",
      entityType: "produit",
      entityId: variant.product.id,
      payload: { produitId: variant.product.id },
    })
  })
  const product = {
    ...variant.product,
    variants: variant.product.variants.map((v) =>
      v.id === variantId ? { ...v, stock } : v
    ),
  }
  await runEffect({
    effet: "reindexation",
    entite: { type: "produit", id: product.id },
    message: `[catalog] réindexation Meilisearch non effectuée pour ${product.id}`,
    fn: () => effects.reindexProducts([toIndexableProduct(product)]),
  })
  await runEffect({
    effet: "invalidation-cache",
    entite: { type: "produit", id: product.id },
    message: `[catalog] invalidation du cache non effectuée pour ${product.id}`,
    fn: async () => {
      const chaines = await chainesDuProduit(product.categoryId)
      await effects.revalidateCatalog({
        id: product.id,
        slug: product.slug,
        ...chaines,
      })
    },
  })
  return product
}

export interface FaitsProduitListe {
  id: string
  name: string
  brand: string
  categoryName: string
  price: number
  isFeatured: boolean
  freeShipping: boolean
  image: string | null
  totalStock: number
  createdAt: Date
}

export interface AdminProductsPage {
  produits: FaitsProduitListe[]
  totalCount: number
  pageCount: number
}

type FiltreStructure =
  { kind: "toutes" } | { kind: "sans" } | { kind: "ids"; ids: string[] }

const COLONNE_DE_TRI: Record<ProduitTri, Prisma.Sql> = {
  nom: Prisma.raw(`p."name"`),
  prix: Prisma.raw(`p."price"`),
  stock: Prisma.raw(
    `COALESCE((SELECT SUM(sv."stock") FROM "ProductVariant" sv WHERE sv."productId" = p."id"), 0)`
  ),
  date: Prisma.raw(`p."createdAt"`),
}

const STOCK_TOTAL = Prisma.raw(
  `COALESCE((SELECT SUM(sv."stock") FROM "ProductVariant" sv WHERE sv."productId" = p."id"), 0)`
)

async function filtreStructureDe(
  structure: string | undefined
): Promise<FiltreStructure> {
  if (!structure) return { kind: "toutes" }
  if (structure === PRODUIT_STRUCTURE_SANS) return { kind: "sans" }

  const lecture = await lireStructure()
  if (lecture.structure(structure) === null) return { kind: "toutes" }
  return { kind: "ids", ids: lecture.branche(structure) }
}

/**
 * Le terme cherché est une donnée, pas un motif : `%` et `_` sont des
 * caractères littéraux, et l'anti-slash échappe l'anti-slash lui-même.
 */
function motifIlike(terme: string): string {
  return `%${terme.replace(/[\\%_]/g, "\\$&")}%`
}

function whereDesProduits(
  params: ProduitListingParams,
  filtre: FiltreStructure
): Prisma.Sql {
  const conditions: Prisma.Sql[] = []
  if (filtre.kind === "sans") {
    conditions.push(Prisma.sql`p."categoryId" IS NULL`)
  } else if (filtre.kind === "ids") {
    conditions.push(Prisma.sql`p."categoryId" IN (${Prisma.join(filtre.ids)})`)
  }
  if (params.q) {
    const motif = motifIlike(params.q)
    conditions.push(Prisma.sql`(
      p."name" ILIKE ${motif} ESCAPE '\\'
      OR p."brand" ILIKE ${motif} ESCAPE '\\'
      OR p."slug" ILIKE ${motif} ESCAPE '\\'
      OR EXISTS (
        SELECT 1 FROM "ProductVariant" recherche
        WHERE recherche."productId" = p."id"
          AND recherche."sku" ILIKE ${motif} ESCAPE '\\'
      )
    )`)
  }
  if (params.misEnAvant) conditions.push(Prisma.sql`p."isFeatured" = TRUE`)
  if (params.livraisonOfferte)
    conditions.push(Prisma.sql`p."freeShipping" = TRUE`)
  if (params.stock === PRODUIT_STOCK_ZERO)
    conditions.push(Prisma.sql`${STOCK_TOTAL} = 0`)
  if (params.stock === PRODUIT_STOCK_NON_NUL)
    conditions.push(Prisma.sql`${STOCK_TOTAL} > 0`)

  if (conditions.length === 0) return Prisma.empty
  return Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
}

function orderDesProduits(params: ProduitListingParams): Prisma.Sql {
  const tri = params.tri ?? PRODUIT_LISTING_TRI_DEFAULT
  const sens = params.sens ?? PRODUIT_LISTING_SENS_DEFAULT
  const direction = sens === "asc" ? Prisma.raw("ASC") : Prisma.raw("DESC")
  return Prisma.sql`ORDER BY ${COLONNE_DE_TRI[tri]} ${direction}, p."id" ${direction}`
}

function faitDeListe(produit: {
  id: string
  name: string
  brand: string
  price: number
  images: unknown
  isFeatured: boolean
  freeShipping: boolean
  category: { name: string } | null
  variants: { stock: number }[]
  createdAt: Date
}): FaitsProduitListe {
  return {
    id: produit.id,
    name: produit.name,
    brand: produit.brand,
    categoryName: produit.category?.name ?? LIBELLE_SANS_STRUCTURE,
    price: produit.price,
    isFeatured: produit.isFeatured,
    freeShipping: produit.freeShipping,
    image: urlsImagesProduit(produit.images)[0] ?? null,
    totalStock: totalVariantStock(produit.variants),
    createdAt: produit.createdAt,
  }
}

export async function listAdminProducts(
  params: ProduitListingParams
): Promise<AdminProductsPage> {
  const page = params.page ?? PRODUIT_LISTING_PAGE_DEFAULT
  const pageSize = params.pageSize ?? PRODUIT_LISTING_PAGE_SIZE_DEFAULT
  const filtre = await filtreStructureDe(params.structure)
  const where = whereDesProduits(params, filtre)
  const orderBy = orderDesProduits(params)
  const offset = (page - 1) * pageSize

  const resultat = await prisma.$transaction(async (tx) => {
    const lignes = await tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT p."id" FROM "Product" p ${where} ${orderBy} LIMIT ${pageSize} OFFSET ${offset}`
    )
    const [compte] = await tx.$queryRaw<{ total: number }[]>(
      Prisma.sql`SELECT COUNT(*)::int AS total FROM "Product" p ${where}`
    )
    const ids = lignes.map((ligne) => ligne.id)
    const produits =
      ids.length === 0
        ? []
        : await tx.product.findMany({
            where: { id: { in: ids } },
            select: {
              id: true,
              name: true,
              brand: true,
              price: true,
              images: true,
              isFeatured: true,
              freeShipping: true,
              createdAt: true,
              category: { select: { name: true } },
              variants: { select: { stock: true } },
            },
          })
    return { ids, produits, total: compte?.total ?? 0 }
  })

  const parId = new Map(
    resultat.produits.map((produit) => [produit.id, produit])
  )
  const produits = resultat.ids.flatMap((id) => {
    const produit = parId.get(id)
    return produit === undefined ? [] : [faitDeListe(produit)]
  })
  const totalCount = resultat.total

  return {
    produits,
    totalCount,
    pageCount: Math.ceil(totalCount / pageSize),
  }
}

/** Le libellé d'un Produit sans Structure, pour la facette de la liste. */
export function libelleSansStructure(): string {
  return LIBELLE_SANS_STRUCTURE
}

export async function getAdminProduct(
  id: string
): Promise<FaitsFormulaireProduit | null> {
  const produit = await prisma.product.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      brand: true,
      categoryId: true,
      description: true,
      price: true,
      isFeatured: true,
      featuredOrder: true,
      freeShipping: true,
      specs: true,
      images: true,
      variants: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          sku: true,
          priceDelta: true,
          stock: true,
        },
      },
    },
  })
  if (!produit) return null

  const urls = urlsImagesProduit(produit.images)
  const registre =
    urls.length > 0
      ? await prisma.imageProduit.findMany({
          where: { publicUrl: { in: urls } },
          select: { publicUrl: true, alt: true },
        })
      : []
  const altParUrl = new Map(
    registre.map((ligne) => [ligne.publicUrl, ligne.alt])
  )

  return {
    id: produit.id,
    name: produit.name,
    slug: produit.slug,
    brand: produit.brand,
    categoryId: produit.categoryId,
    description: produit.description,
    price: produit.price,
    isFeatured: produit.isFeatured,
    featuredOrder: produit.featuredOrder,
    freeShipping: produit.freeShipping,
    specs: specificationsProduit(produit.specs),
    images: urls.map((url) => {
      const alt = normaliserTexteAlternatif(altParUrl.get(url))
      return alt
        ? { kind: "persistee" as const, url, alt }
        : { kind: "persistee" as const, url }
    }),
    variants: produit.variants.map((variante) => ({
      id: variante.id,
      name: variante.name,
      sku: variante.sku,
      priceDelta: variante.priceDelta,
      stock: variante.stock,
    })),
  }
}
