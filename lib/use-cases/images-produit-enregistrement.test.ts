import { randomUUID } from "node:crypto"

import sharp from "sharp"
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { prisma } from "@/lib/db"
import {
  createProduct,
  getAdminProduct,
  MissingImageAltError,
  updateProduct,
  type ProductInput,
} from "@/lib/use-cases/admin-catalog"
import { draftObjectKey } from "@/lib/r2"
import {
  creerHorlogeControllable,
  creerRegistreImageProduitMemoire,
  creerStockageImageProduitMemoire,
} from "@/test/cycle-vie-image-produit-memoire"
import { creerCycleVieImageProduit } from "@/lib/cycle-vie-image-produit"

const runId = randomUUID().slice(0, 8)
const PREFIXE_URL = `https://cdn.example.test/products/save-${runId}-`
const PREFIXE_SLUG = `p-save-images-${runId}-`

const url = (suffix: string) => `${PREFIXE_URL}${suffix}`
const dateInitiale = new Date("2026-07-01T10:00:00.000Z")

let categoryId: string

function makeInput(overrides: Partial<ProductInput> = {}): ProductInput {
  const slug = overrides.slug ?? `${PREFIXE_SLUG}base`
  return {
    name: "Produit avec registre",
    slug,
    description: "description",
    brand: "Marque",
    categoryId,
    price: 10000,
    specs: {},
    images: [],
    isFeatured: false,
    featuredOrder: 0,
    freeShipping: false,
    variants: [
      {
        name: "Standard",
        sku: `SKU-${runId}-${randomUUID().slice(0, 6)}`,
        priceDelta: 0,
        stock: 2,
      },
    ],
    ...overrides,
  }
}

function effetsSansReseau() {
  return {
    reindexProducts: vi.fn(async () => {}),
    revalidateCatalog: vi.fn(),
    removeProductFromIndex: vi.fn(async () => {}),
    deleteImages: vi.fn(async () => {}),
  }
}

async function ligne(publicUrl: string) {
  return prisma.imageProduit.findUnique({ where: { publicUrl } })
}

async function imagePng(): Promise<Buffer> {
  return sharp({
    create: {
      width: 3,
      height: 2,
      channels: 3,
      background: { r: 200, g: 40, b: 40 },
    },
  })
    .png()
    .toBuffer()
}

beforeAll(async () => {
  const category = await prisma.category.create({
    data: {
      name: "Catégorie registre",
      slug: `cat-save-images-${runId}`,
    },
  })
  categoryId = category.id
})

beforeEach(async () => {
  await prisma.product.deleteMany({
    where: { slug: { startsWith: PREFIXE_SLUG } },
  })
  await prisma.imageProduit.deleteMany({
    where: { publicUrl: { startsWith: PREFIXE_URL } },
  })
})

afterAll(async () => {
  await prisma.product.deleteMany({
    where: { slug: { startsWith: PREFIXE_SLUG } },
  })
  await prisma.imageProduit.deleteMany({
    where: { publicUrl: { startsWith: PREFIXE_URL } },
  })
  await prisma.category.deleteMany({ where: { id: categoryId } })
  await prisma.$disconnect()
})

describe("l'enregistrement du Produit écrit le registre après l'engagement", () => {
  it("écrit une ligne par Image produit, avec son Texte alternatif et son créateur", async () => {
    const image = url("a.webp")

    await createProduct(
      makeInput({
        images: [{ kind: "persistee", url: image, alt: "  Écran  " }],
        ownerId: "admin-1",
      }),
      effetsSansReseau()
    )

    expect(await ligne(image)).toMatchObject({
      publicUrl: image,
      alt: "Écran",
      mimeType: "image/webp",
      byteSize: 0,
      width: 0,
      height: 0,
      createdBy: "admin-1",
    })
  })

  it("réenregistrer le même Produit ne duplique pas les lignes", async () => {
    const image = url("b.webp")
    const produit = await createProduct(
      makeInput({
        images: [{ kind: "persistee", url: image, alt: "Premier" }],
      }),
      effetsSansReseau()
    )

    await updateProduct(
      produit.id,
      makeInput({
        slug: produit.slug,
        images: [{ kind: "persistee", url: image, alt: "Second" }],
        variants: [],
      }),
      effetsSansReseau()
    )

    const lignes = await prisma.imageProduit.findMany({
      where: { publicUrl: { startsWith: PREFIXE_URL } },
    })
    expect(lignes).toHaveLength(1)
    expect(lignes[0]).toMatchObject({ publicUrl: image, alt: "Second" })
  })

  it("un enregistrement refusé ne laisse aucune ligne", async () => {
    await prisma.product.create({
      data: {
        name: "Produit existant",
        slug: `${PREFIXE_SLUG}conflit`,
        description: "description",
        brand: "Marque",
        price: 10000,
        specs: {},
        images: [],
      },
    })
    const image = url("refus.webp")

    await expect(
      createProduct(
        makeInput({
          slug: `${PREFIXE_SLUG}conflit`,
          images: [{ kind: "persistee", url: image, alt: "Écran" }],
        }),
        effetsSansReseau()
      )
    ).rejects.toMatchObject({ name: "SlugConflictError" })

    expect(await ligne(image)).toBeNull()
  })

  it("refuse un nouveau Brouillon sans Texte alternatif avant toute promotion", async () => {
    const horloge = creerHorlogeControllable(dateInitiale)
    const stockage = creerStockageImageProduitMemoire()
    const registre = creerRegistreImageProduitMemoire(() =>
      horloge.horloge.maintenant()
    )
    const cycleVie = creerCycleVieImageProduit({
      stockage,
      registre,
      horloge: horloge.horloge,
    })
    const demande = await cycleVie.demanderBrouillon({
      ownerId: "admin-1",
      contentType: "image/png",
      size: 2048,
    })
    if (!demande.ok) throw new Error("La demande devait réussir")

    await expect(
      createProduct(
        makeInput({
          slug: `${PREFIXE_SLUG}sans-alt`,
          images: [
            {
              kind: "brouillon",
              draftId: demande.draftId,
              previewUrl: demande.previewUrl,
            },
          ],
          tentativeId: "tentative-sans-alt",
          ownerId: "admin-1",
        }),
        { cycleVie, ...effetsSansReseau() }
      )
    ).rejects.toBeInstanceOf(MissingImageAltError)

    expect(stockage.promotions).toEqual([])
    expect(registre.records.get(demande.draftId)).toMatchObject({
      state: "vivant",
      tentativeId: null,
    })
    expect(
      await prisma.imageProduit.findMany({
        where: { publicUrl: { startsWith: PREFIXE_URL } },
      })
    ).toEqual([])
  })

  it("écrit les faits réels d'un Brouillon promu : type, dimensions et taille", async () => {
    const octets = await imagePng()
    const horloge = creerHorlogeControllable(dateInitiale)
    const stockage = creerStockageImageProduitMemoire()
    const registre = creerRegistreImageProduitMemoire(() =>
      horloge.horloge.maintenant()
    )
    const cycleVieSansTransaction = creerCycleVieImageProduit({
      stockage,
      registre,
      horloge: horloge.horloge,
    })
    const cycleVie = {
      ...cycleVieSansTransaction,
      confirmerBrouillons: (
        productId: string,
        promotions: Parameters<
          typeof cycleVieSansTransaction.confirmerBrouillons
        >[1]
      ) => cycleVieSansTransaction.confirmerBrouillons(productId, promotions),
    }
    const demande = await cycleVie.demanderBrouillon({
      ownerId: "admin-1",
      contentType: "image/png",
      size: 2048,
    })
    if (!demande.ok) throw new Error("La demande devait réussir")
    stockage.contenus.set(draftObjectKey(demande.draftId, "image/png"), octets)

    await createProduct(
      makeInput({
        slug: `${PREFIXE_SLUG}promu`,
        images: [
          {
            kind: "brouillon",
            draftId: demande.draftId,
            previewUrl: demande.previewUrl,
            alt: "Un visuel",
          },
        ],
        tentativeId: "tentative-promue",
        ownerId: "admin-1",
      }),
      { cycleVie, ...effetsSansReseau() }
    )

    expect(stockage.verifications).toHaveLength(1)
    expect(stockage.promotions).toHaveLength(1)
    const publique = stockage.promotions[0]!.publicUrl
    expect(await ligne(publique)).toMatchObject({
      mimeType: "image/png",
      width: 3,
      height: 2,
      alt: "Un visuel",
      createdBy: "admin-1",
    })
    expect((await ligne(publique))!.byteSize).toBeGreaterThan(0)
  })

  it("accepte une ancienne Image produit sans alt et garde le repli du nom", async () => {
    const image = url("ancienne.jpg")
    const produit = await createProduct(
      makeInput({
        images: [{ kind: "persistee", url: image }],
      }),
      effetsSansReseau()
    )

    expect(await ligne(image)).toMatchObject({ alt: null })
    const faits = await getAdminProduct(produit.id)
    expect(faits?.images).toEqual([{ kind: "persistee", url: image }])
  })

  it("relit l'alt du registre pour préremplir la Galerie produit", async () => {
    const image = url("relue.webp")
    const produit = await createProduct(
      makeInput({
        images: [{ kind: "persistee", url: image, alt: "Déjà écrit" }],
      }),
      effetsSansReseau()
    )

    const faits = await getAdminProduct(produit.id)
    expect(faits?.images).toEqual([
      { kind: "persistee", url: image, alt: "Déjà écrit" },
    ])
  })
})
