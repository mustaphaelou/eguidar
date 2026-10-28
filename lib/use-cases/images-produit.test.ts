import { randomUUID } from "node:crypto"

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
  ImageProduitIntrouvableError,
  ImageProduitSuppressionImpossibleError,
  ImageProduitUtiliseeError,
  enregistrerImagesProduit,
  listerImagesProduit,
  mettreAJourTexteAlternatif,
  reconstituerRegistreImagesProduit,
  supprimerImagesProduit,
} from "@/lib/use-cases/images-produit"

const runId = randomUUID().slice(0, 8)
const PREFIXE = `https://cdn.example.test/products/registre-${runId}-`
const PREFIXE_SLUG = `p-registre-${runId}-`

function url(suffix: string): string {
  return `${PREFIXE}${suffix}`
}

const URL_A = url("a.webp")
const URL_B = url("b.png")
const URL_C = url("c.jpg")
const URL_D = url("d.avif")
const URL_BROUILLON = `https://cdn.example.test/products/brouillons/draft-${runId}.webp`

function faits(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    mimeType: "image/webp",
    byteSize: 2048,
    width: 1200,
    height: 800,
    ...overrides,
  }
}

async function creerProduit(nom: string, images: string[]): Promise<string> {
  const produit = await prisma.product.create({
    data: {
      name: nom,
      slug: `${PREFIXE_SLUG}${randomUUID().slice(0, 8)}`,
      description: "description",
      brand: "Marque",
      price: 10000,
      specs: {},
      images,
    },
    select: { id: true },
  })
  return produit.id
}

async function lignes() {
  return prisma.imageProduit.findMany({
    where: { publicUrl: { startsWith: PREFIXE } },
    orderBy: { publicUrl: "asc" },
  })
}

beforeAll(async () => {
  await prisma.product.deleteMany({
    where: { slug: { startsWith: PREFIXE_SLUG } },
  })
})

beforeEach(async () => {
  await prisma.product.deleteMany({
    where: { slug: { startsWith: PREFIXE_SLUG } },
  })
  await prisma.imageProduit.deleteMany({
    where: { publicUrl: { startsWith: PREFIXE } },
  })
})

afterAll(async () => {
  await prisma.product.deleteMany({
    where: { slug: { startsWith: PREFIXE_SLUG } },
  })
  await prisma.imageProduit.deleteMany({
    where: { publicUrl: { startsWith: PREFIXE } },
  })
  await prisma.$disconnect()
})

describe("registre des Images produit", () => {
  it("écrit une ligne par URL, avec l'alt rogné et les faits de vérification", async () => {
    await enregistrerImagesProduit(
      [
        { publicUrl: URL_A, alt: "  Une photo  ", faits: faits() },
        { publicUrl: URL_B, alt: "   ", faits: null },
      ],
      "admin-1"
    )

    const ecrites = await lignes()
    expect(ecrites).toHaveLength(2)
    expect(ecrites[0]).toMatchObject({
      publicUrl: URL_A,
      mimeType: "image/webp",
      byteSize: 2048,
      width: 1200,
      height: 800,
      alt: "Une photo",
      createdBy: "admin-1",
    })
    expect(ecrites[1]).toMatchObject({
      publicUrl: URL_B,
      mimeType: "image/png",
      byteSize: 0,
      width: 0,
      height: 0,
      alt: null,
      createdBy: "admin-1",
    })
  })

  it("est idempotent : réenregistrer le même Produit met à jour l'alt sans dupliquer", async () => {
    await enregistrerImagesProduit(
      [{ publicUrl: URL_A, alt: "Premier", faits: faits() }],
      "admin-1"
    )
    await enregistrerImagesProduit(
      [{ publicUrl: URL_A, alt: "Second", faits: null }],
      "admin-2"
    )

    const ecrites = await lignes()
    expect(ecrites).toHaveLength(1)
    expect(ecrites[0]).toMatchObject({
      publicUrl: URL_A,
      alt: "Second",
      createdBy: "admin-1",
      byteSize: 2048,
      width: 1200,
      height: 800,
    })
  })

  it("ne duplique pas une URL citée deux fois dans la même écriture", async () => {
    await enregistrerImagesProduit(
      [
        { publicUrl: URL_A, alt: "Une", faits: null },
        { publicUrl: URL_A, alt: "Deux", faits: null },
      ],
      null
    )

    expect(await lignes()).toHaveLength(1)
  })
})

describe("Bibliothèque des médias — lecture, filtres et comptes", () => {
  beforeEach(async () => {
    await creerProduit("Produit Alpha", [URL_A])
    await creerProduit("Produit Bêta", [URL_B])
    await enregistrerImagesProduit(
      [
        { publicUrl: URL_A, alt: "Écran du Produit Alpha", faits: faits() },
        {
          publicUrl: URL_B,
          alt: null,
          faits: faits({ mimeType: "image/png" }),
        },
        {
          publicUrl: URL_C,
          alt: "Clavier",
          faits: faits({ mimeType: "image/jpeg" }),
        },
      ],
      "admin-1"
    )
  })

  it("joint le registre aux usages des Produits et compte les files d'attente", async () => {
    const page = await listerImagesProduit()

    expect(page.totalCount).toBe(3)
    expect(page.inutiliseesCount).toBe(1)
    expect(page.sansAltCount).toBe(1)
    const parUrl = new Map(page.images.map((image) => [image.publicUrl, image]))
    expect(parUrl.get(URL_A)).toMatchObject({
      usageCount: 1,
      produits: [{ name: "Produit Alpha" }],
      width: 1200,
      height: 800,
      byteSize: 2048,
      mimeType: "image/webp",
    })
    expect(parUrl.get(URL_C)).toMatchObject({
      usageCount: 0,
      produits: [],
    })
  })

  it("filtre sur la recherche, les inutilisées et l'absence d'alt", async () => {
    const parTexte = await listerImagesProduit({ q: "clavier" })
    expect(parTexte.images.map((image) => image.publicUrl)).toEqual([URL_C])

    const parProduit = await listerImagesProduit({ q: "alpha" })
    expect(parProduit.images.map((image) => image.publicUrl)).toEqual([URL_A])

    const inutilisees = await listerImagesProduit({ inutilisees: true })
    expect(inutilisees.images.map((image) => image.publicUrl)).toEqual([URL_C])

    const sansAlt = await listerImagesProduit({ sansAlt: true })
    expect(sansAlt.images.map((image) => image.publicUrl)).toEqual([URL_B])

    const combinees = await listerImagesProduit({
      inutilisees: true,
      sansAlt: true,
    })
    expect(combinees.images).toEqual([])
  })

  it("modifie l'alt d'une Image produit et refuse une URL inconnue", async () => {
    await expect(
      mettreAJourTexteAlternatif(URL_B, "  Nouveau texte  ")
    ).resolves.toBe("Nouveau texte")
    expect(
      await prisma.imageProduit.findUnique({ where: { publicUrl: URL_B } })
    ).toMatchObject({ alt: "Nouveau texte" })

    await expect(mettreAJourTexteAlternatif(URL_B, "   ")).resolves.toBeNull()
    expect(
      await prisma.imageProduit.findUnique({ where: { publicUrl: URL_B } })
    ).toMatchObject({ alt: null })

    await expect(
      mettreAJourTexteAlternatif(url("inconnue.webp"), "texte")
    ).rejects.toBeInstanceOf(ImageProduitIntrouvableError)
  })
})

describe("suppression d'une Image produit", () => {
  it("refuse une Image produit utilisée et nomme les Produits", async () => {
    await creerProduit("Produit Alpha", [URL_A])
    await enregistrerImagesProduit(
      [{ publicUrl: URL_A, alt: null, faits: null }],
      null
    )
    const supprimerImage = vi.fn(async () => ({
      ok: true as const,
      valeur: null,
    }))

    await expect(
      supprimerImagesProduit([URL_A], { supprimerImage })
    ).rejects.toMatchObject({
      name: "ImageProduitUtiliseeError",
      message: expect.stringContaining("Produit Alpha"),
    })
    expect(supprimerImage).not.toHaveBeenCalled()
    expect(await lignes()).toHaveLength(1)
  })

  it("supprime une Image produit inutilisée : l'objet puis la ligne", async () => {
    await enregistrerImagesProduit(
      [{ publicUrl: URL_C, alt: null, faits: null }],
      null
    )
    const ordre: string[] = []
    const supprimerImage = vi.fn(async (publicUrl: string) => {
      ordre.push(`objet:${publicUrl}`)
      return { ok: true as const, valeur: null }
    })

    await expect(
      supprimerImagesProduit([URL_C], { supprimerImage })
    ).resolves.toEqual({ supprimees: [URL_C] })

    expect(ordre).toEqual([`objet:${URL_C}`])
    expect(await lignes()).toEqual([])
  })

  it("garde la ligne et le dit quand le stockage refuse la suppression", async () => {
    await enregistrerImagesProduit(
      [{ publicUrl: URL_C, alt: null, faits: null }],
      null
    )
    const supprimerImage = vi.fn(async () => ({
      ok: false as const,
      erreur: { code: "erreur-stockage" as const, message: "panne" },
    }))

    await expect(
      supprimerImagesProduit([URL_C], { supprimerImage })
    ).rejects.toBeInstanceOf(ImageProduitSuppressionImpossibleError)
    expect(await lignes()).toHaveLength(1)
  })

  it("refuse une URL absente du registre", async () => {
    const supprimerImage = vi.fn(async () => ({
      ok: true as const,
      valeur: null,
    }))

    await expect(
      supprimerImagesProduit([URL_D], { supprimerImage })
    ).rejects.toBeInstanceOf(ImageProduitIntrouvableError)
    expect(supprimerImage).not.toHaveBeenCalled()
  })
})

describe("réconciliation du registre", () => {
  it("ajoute une ligne par Image produit du Catalogue, jamais pour un Brouillon", async () => {
    await creerProduit("Produit Alpha", [URL_A, URL_BROUILLON])
    await creerProduit("Produit Bêta", [URL_A])

    await expect(reconstituerRegistreImagesProduit()).resolves.toEqual({
      ajoutees: 1,
      supprimees: 0,
    })
    const ecrites = await lignes()
    expect(ecrites.map((ligne) => ligne.publicUrl)).toEqual([URL_A])
    expect(ecrites[0]).toMatchObject({
      mimeType: "image/webp",
      byteSize: 0,
      width: 0,
      height: 0,
    })

    await expect(reconstituerRegistreImagesProduit()).resolves.toEqual({
      ajoutees: 0,
      supprimees: 0,
    })
  })

  it("préserve les faits et l'alt d'une ligne déjà présente", async () => {
    await creerProduit("Produit Alpha", [URL_A])
    await enregistrerImagesProduit(
      [{ publicUrl: URL_A, alt: "Déjà là", faits: faits() }],
      "admin-1"
    )

    await reconstituerRegistreImagesProduit()

    expect(await lignes()).toMatchObject([
      {
        publicUrl: URL_A,
        alt: "Déjà là",
        byteSize: 2048,
        width: 1200,
        height: 800,
      },
    ])
  })

  it("supprime une ligne que plus aucun Produit ne nomme", async () => {
    await enregistrerImagesProduit(
      [{ publicUrl: URL_C, alt: "orpheline", faits: null }],
      null
    )

    await expect(reconstituerRegistreImagesProduit()).resolves.toEqual({
      ajoutees: 0,
      supprimees: 1,
    })
    expect(await lignes()).toEqual([])
  })
})
