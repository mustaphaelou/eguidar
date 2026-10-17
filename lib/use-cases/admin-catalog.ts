import { z } from "zod"

import { prisma } from "@/lib/db"
import cycleVieImageProduitParDefaut, {
  horlogeSysteme,
  portTransactionRegistreBrouillonImageProduit,
  type CycleVieImageProduit,
  type Horloge,
  type RevendicationImagesProduit,
} from "@/lib/cycle-vie-image-produit"
import type { FaitsFormulaireProduit } from "@/lib/formulaire-produit"
import { LIMITE_IMAGES_PRODUIT } from "@/lib/galerie-image-produit"
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
import { stockageImageProduitR2 } from "@/lib/r2"
import type { CatalogueEventProduct } from "@/lib/use-cases/cache-invalidation"
import { invalidateCatalogue } from "@/lib/use-cases/cache-invalidation"
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
  images: string[]
  isFeatured: boolean
  featuredOrder: number
  freeShipping: boolean
  variants: ProductVariantInput[]
}

export interface CatalogEffects {
  reindexProducts(products: IndexableProduct[]): Promise<void>
  removeProductFromIndex(productId: string): Promise<void>
  revalidateCatalog(product: CatalogueEventProduct): void
  deleteImages(urls: string[]): Promise<void>
  preparerPromotion: CycleVieImageProduit["preparerPromotionBrouillons"]
  confirmerPromotion: CycleVieImageProduit["confirmerBrouillons"]
  compenserPromotion: CycleVieImageProduit["compenserPromotionBrouillons"]
  horloge: Horloge
}

function journaliserEchecSuppressionImage(
  productId: string,
  url: string,
  erreur: unknown
): void {
  console.warn(
    `[catalog] suppression d'image R2 non effectuée pour le produit ${productId}, image ${url}`,
    erreur
  )
}

export function defaultCatalogEffects(productId: string): CatalogEffects {
  return {
    reindexProducts: indexProductDocuments,
    async removeProductFromIndex(id) {
      await deleteProductDocument(id)
    },
    revalidateCatalog(product) {
      invalidateCatalogue(product)
    },
    async deleteImages(urls) {
      for (const url of urls) {
        try {
          const resultat =
            await stockageImageProduitR2.supprimerImagePersistee(url)
          if (!resultat.ok) {
            journaliserEchecSuppressionImage(productId, url, resultat.erreur)
          }
        } catch (error) {
          journaliserEchecSuppressionImage(productId, url, error)
        }
      }
    },
    preparerPromotion:
      cycleVieImageProduitParDefaut.preparerPromotionBrouillons,
    confirmerPromotion: cycleVieImageProduitParDefaut.confirmerBrouillons,
    compenserPromotion:
      cycleVieImageProduitParDefaut.compenserPromotionBrouillons,
    horloge: horlogeSysteme,
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

export class ProductNotFoundError extends Error {
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

const variantInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "nom de variante requis"),
  sku: z.string().min(1, "SKU requis"),
  priceDelta: z.number().int(),
  stock: z.number().int().min(0, "le stock doit être positif ou nul"),
})

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
  images: z
    .array(z.string())
    .max(
      LIMITE_IMAGES_PRODUIT,
      `au maximum ${LIMITE_IMAGES_PRODUIT} images par produit`
    ),
  isFeatured: z.boolean(),
  featuredOrder: z.number().int().min(0),
  freeShipping: z.boolean(),
  variants: z.array(variantInputSchema),
})

function parseProductInput(input: ProductInput): ProductInput {
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
function imageUrls(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

function assertPersistedImagesAreOwned(
  storedImages: unknown,
  submittedImages: readonly string[],
  promues: readonly string[] = []
): void {
  const autorisees = new Set([...imageUrls(storedImages), ...promues])
  if (submittedImages.some((url) => !autorisees.has(url))) {
    throw new CatalogValidationError([
      "une Image produit persistée n'appartient pas à ce Produit",
    ])
  }
}

function assertCreationImagesArePromoted(
  imagesEcrites: readonly string[],
  revendication?: RevendicationImagesProduit
): void {
  const promues = new Set(revendication?.promues ?? [])
  if (imagesEcrites.some((url) => !promues.has(url))) {
    throw new CatalogValidationError([
      "une création ne peut écrire que des Images produit téléversées dans sa galerie ; une Image produit déjà enregistrée appartient à un autre Produit",
    ])
  }
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

export async function createProduct(
  input: ProductInput,
  overrides?: Partial<CatalogEffects>,
  revendication?: RevendicationImagesProduit
) {
  const data = parseProductInput(input)
  assertCreationImagesArePromoted(data.images, revendication)
  assertNonNegativeVariantPrices(data)
  assertUniqueSkusInInput(data.variants)
  await assertUniqueSlug(data.slug)
  await assertUniqueSkus(data.variants.map((variant) => variant.sku))

  let product
  try {
    product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          name: data.name,
          slug: data.slug,
          description: data.description,
          brand: data.brand,
          price: data.price,
          specs: data.specs,
          images: data.images,
          isFeatured: data.isFeatured,
          featuredOrder: data.featuredOrder,
          freeShipping: data.freeShipping,
          categoryId: data.categoryId,
          variants: {
            create: data.variants.map((variant) => ({
              name: variant.name,
              sku: variant.sku,
              priceDelta: variant.priceDelta,
              stock: variant.stock,
            })),
          },
        },
        include: { variants: true, category: true },
      })
      if (revendication) {
        await revendication.lier(
          created.id,
          portTransactionRegistreBrouillonImageProduit(tx)
        )
      }
      return created
    })
  } catch (error) {
    mapUniqueViolation(error)
  }

  const effects = avecSurcharges(defaultCatalogEffects(product.id), overrides)
  await runEffect(
    `[catalog] réindexation Meilisearch non effectuée pour ${product.id}`,
    () => effects.reindexProducts([toIndexableProduct(product)])
  )
  await runEffect(
    `[catalog] invalidation du cache non effectuée pour ${product.id}`,
    () => effects.revalidateCatalog({ id: product.id, slug: product.slug })
  )
  return product
}

export async function updateProduct(
  id: string,
  input: ProductInput,
  overrides?: Partial<CatalogEffects>,
  revendication?: RevendicationImagesProduit
) {
  const effects = avecSurcharges(defaultCatalogEffects(id), overrides)
  const existing = await prisma.product.findUnique({ where: { id } })
  if (!existing) throw new ProductNotFoundError()

  const data = parseProductInput(input)
  assertPersistedImagesAreOwned(
    existing.images,
    data.images,
    revendication?.promues
  )
  assertNonNegativeVariantPrices(data)
  assertUniqueSkusInInput(data.variants)
  await assertUniqueSlug(data.slug, id)
  await assertUniqueSkus(
    data.variants.map((variant) => variant.sku),
    id
  )

  const keptVariantIds = data.variants.flatMap((variant) =>
    variant.id ? [variant.id] : []
  )
  const existingImages = imageUrls(existing.images)
  const removedImages = existingImages.filter(
    (url) => !data.images.includes(url)
  )
  const existingVariantIds = await prisma.productVariant.findMany({
    where: { productId: id },
    select: { id: true },
  })
  const ownedVariantIds = new Set(
    existingVariantIds.map((variant) => variant.id)
  )
  for (const variant of data.variants) {
    if (variant.id && !ownedVariantIds.has(variant.id)) {
      throw new CatalogValidationError(["variante inconnue pour ce produit"])
    }
  }

  let product
  try {
    product = await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          name: data.name,
          slug: data.slug,
          description: data.description,
          brand: data.brand,
          price: data.price,
          specs: data.specs,
          images: data.images,
          isFeatured: data.isFeatured,
          featuredOrder: data.featuredOrder,
          freeShipping: data.freeShipping,
          categoryId: data.categoryId,
        },
      })

      for (const variant of data.variants) {
        if (variant.id) {
          await tx.productVariant.update({
            where: { id: variant.id },
            data: {
              name: variant.name,
              sku: variant.sku,
              priceDelta: variant.priceDelta,
              stock: variant.stock,
            },
          })
        } else {
          await tx.productVariant.create({
            data: {
              name: variant.name,
              sku: variant.sku,
              priceDelta: variant.priceDelta,
              stock: variant.stock,
              productId: id,
            },
          })
        }
      }

      const toDelete = existingVariantIds
        .map((variant) => variant.id)
        .filter((variantId) => !keptVariantIds.includes(variantId))
      if (toDelete.length > 0) {
        await tx.productVariant.deleteMany({ where: { id: { in: toDelete } } })
      }

      if (revendication) {
        await revendication.lier(
          id,
          portTransactionRegistreBrouillonImageProduit(tx)
        )
      }

      return tx.product.findUniqueOrThrow({
        where: { id },
        include: { variants: true, category: true },
      })
    })
  } catch (error) {
    mapUniqueViolation(error)
  }

  await runEffect(
    `[catalog] suppression d'images R2 non effectuée pour ${id}`,
    () => effects.deleteImages(removedImages)
  )

  await runEffect(
    `[catalog] réindexation Meilisearch non effectuée pour ${product.id}`,
    () => effects.reindexProducts([toIndexableProduct(product)])
  )
  await runEffect(
    `[catalog] invalidation du cache non effectuée pour ${product.id}`,
    () =>
      effects.revalidateCatalog({
        id: product.id,
        slug: product.slug,
        previousSlug:
          existing.slug !== product.slug ? existing.slug : undefined,
      })
  )
  return product
}

export async function deleteProduct(
  id: string,
  overrides?: Partial<CatalogEffects>
): Promise<void> {
  const effects = avecSurcharges(defaultCatalogEffects(id), overrides)
  const existing = await prisma.product.findUnique({ where: { id } })
  if (!existing) throw new ProductNotFoundError()

  await prisma.product.delete({ where: { id } })
  await runEffect(
    `[catalog] suppression d'images R2 non effectuée pour ${id}`,
    () => effects.deleteImages(imageUrls(existing.images))
  )
  await runEffect(
    `[catalog] suppression de l'index Meilisearch non effectuée pour ${id}`,
    () => effects.removeProductFromIndex(id)
  )
  await runEffect(
    `[catalog] invalidation du cache non effectuée pour ${id}`,
    () => effects.revalidateCatalog({ id, slug: existing.slug })
  )
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
  await prisma.productVariant.update({
    where: { id: variantId },
    data: { stock },
  })
  const product = {
    ...variant.product,
    variants: variant.product.variants.map((v) =>
      v.id === variantId ? { ...v, stock } : v
    ),
  }
  await runEffect(
    `[catalog] réindexation Meilisearch non effectuée pour ${product.id}`,
    () => effects.reindexProducts([toIndexableProduct(product)])
  )
  await runEffect(
    `[catalog] invalidation du cache non effectuée pour ${product.id}`,
    () => effects.revalidateCatalog({ id: product.id, slug: product.slug })
  )
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
}

export async function listAdminProducts(): Promise<FaitsProduitListe[]> {
  const produits = await prisma.product.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      brand: true,
      price: true,
      images: true,
      isFeatured: true,
      freeShipping: true,
      category: { select: { name: true } },
      variants: { select: { stock: true } },
    },
  })

  return produits.map((produit) => ({
    id: produit.id,
    name: produit.name,
    brand: produit.brand,
    categoryName: produit.category?.name ?? LIBELLE_SANS_STRUCTURE,
    price: produit.price,
    isFeatured: produit.isFeatured,
    freeShipping: produit.freeShipping,
    image: urlsImagesProduit(produit.images)[0] ?? null,
    totalStock: totalVariantStock(produit.variants),
  }))
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
    images: urlsImagesProduit(produit.images).map((url) => ({
      kind: "persistee",
      url,
    })),
    variants: produit.variants.map((variante) => ({
      id: variante.id,
      name: variante.name,
      sku: variante.sku,
      priceDelta: variante.priceDelta,
      stock: variante.stock,
    })),
  }
}
