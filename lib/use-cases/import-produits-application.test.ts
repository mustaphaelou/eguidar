import { randomUUID } from "node:crypto"

import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { prisma } from "@/lib/db"
import type { IndexableProduct } from "@/lib/index-projection"
import {
  COLONNES_IMPORT,
  MESSAGE_IMPORT_EN_COURS,
  type ColonneImport,
} from "@/lib/import-produits"
import {
  appliquerLeLot,
  lireLeLot,
  televerserLeFichier,
  verifierLeLot,
} from "@/lib/use-cases/import-produits"
import type { CatalogEffects } from "@/lib/use-cases/admin-catalog"
import { enregistrerImagesProduit } from "@/lib/use-cases/images-produit"

const runId = randomUUID().slice(0, 8)
const AUTEUR_ID = `application-auteur-${runId}`
const AUTEUR_NOM = `Auteur application ${runId}`
const AUTEUR_EMAIL = `application-${runId}@example.test`

const slug = (suffixe: string) => `a-${runId}-${suffixe}`
const sku = (suffixe: string) => `A-${runId}-${suffixe}`

const CELLULE_VIDE = ""

function celluleCsv(valeur: string): string {
  return /[",\r\n]/.test(valeur) ? `"${valeur.replaceAll('"', '""')}"` : valeur
}

function ligneCsv(valeurs: Partial<Record<ColonneImport, string>>): string {
  return COLONNES_IMPORT.map((colonne) =>
    celluleCsv(valeurs[colonne] ?? CELLULE_VIDE)
  ).join(",")
}

function fichierCsv(...lignes: string[]): string {
  return [COLONNES_IMPORT.join(","), ...lignes].join("\r\n") + "\r\n"
}

interface EffetsDeTest {
  overrides: Partial<CatalogEffects>
  indexes: Map<string, IndexableProduct>
  reindexProducts: ReturnType<typeof vi.fn>
}

function effetsDeTest(
  options: { echecsIndexation?: ReadonlySet<string> } = {}
): EffetsDeTest {
  const indexes = new Map<string, IndexableProduct>()
  const echecs = options.echecsIndexation ?? new Set<string>()
  const reindexProducts = vi.fn(async (produits: IndexableProduct[]) => {
    for (const produit of produits) {
      if (echecs.has(produit.slug)) {
        throw new Error(`indexation indisponible pour ${produit.slug}`)
      }
      indexes.set(produit.slug, produit)
    }
  })

  return {
    indexes,
    reindexProducts,
    overrides: {
      reindexProducts,
      revalidateCatalog: vi.fn(),
      purgeCatalogue: vi.fn(),
      deleteImages: vi.fn(async () => {}),
      enregistrerImages: vi.fn(enregistrerImagesProduit),
    },
  }
}

async function preparerLeLot(contenu: string): Promise<string> {
  const televerse = await televerserLeFichier({
    nomFichier: "catalogue.csv",
    octets: new TextEncoder().encode(contenu),
    auteurId: AUTEUR_ID,
  })
  await verifierLeLot(televerse.lotId)
  return televerse.lotId
}

async function creerLaStructure(suffixe = "maison"): Promise<string> {
  const structure = await prisma.category.create({
    data: { name: "Maison", slug: slug(suffixe) },
  })
  return structure.id
}

beforeEach(async () => {
  await prisma.ligneImport.deleteMany()
  await prisma.lotImport.deleteMany()
  await prisma.imageProduit.deleteMany({
    where: {
      publicUrl: { startsWith: `https://images.example.test/a-${runId}` },
    },
  })
  await prisma.product.deleteMany({
    where: { slug: { startsWith: `a-${runId}-` } },
  })
  await prisma.category.deleteMany({
    where: { slug: { startsWith: `a-${runId}-` } },
  })
  await prisma.user.deleteMany({ where: { id: AUTEUR_ID } })
  await prisma.user.create({
    data: {
      id: AUTEUR_ID,
      name: AUTEUR_NOM,
      email: AUTEUR_EMAIL,
      role: "admin",
    },
  })
})

afterAll(async () => {
  await prisma.ligneImport.deleteMany()
  await prisma.lotImport.deleteMany()
  await prisma.imageProduit.deleteMany({
    where: {
      publicUrl: { startsWith: `https://images.example.test/a-${runId}` },
    },
  })
  await prisma.product.deleteMany({
    where: { slug: { startsWith: `a-${runId}-` } },
  })
  await prisma.category.deleteMany({
    where: { slug: { startsWith: `a-${runId}-` } },
  })
  await prisma.user.deleteMany({ where: { id: AUTEUR_ID } })
  await prisma.$disconnect()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("appliquerLeLot — la création", () => {
  it("crée un Produit et toutes ses Variantes depuis des slugs répétés", async () => {
    const structureId = await creerLaStructure()
    const contenu = fichierCsv(
      ligneCsv({
        slug: slug("banc"),
        name: "Banc",
        brand: "Maison",
        category: slug("maison"),
        description: "Bois massif",
        variant_sku: sku("BANC-1"),
        variant_name: "Petit",
        variant_price: "10.00",
        variant_stock: "2",
      }),
      ligneCsv({
        slug: slug("banc"),
        variant_sku: sku("BANC-2"),
        variant_name: "Grand",
        variant_price: "15.00",
        variant_stock: "1",
      })
    )
    const lotId = await preparerLeLot(contenu)
    const effets = effetsDeTest()

    const resultat = await appliquerLeLot(lotId, 0, effets.overrides)

    expect(resultat).toMatchObject({
      traites: 1,
      reste: 0,
      curseurSuivant: 1,
      ecrits: 1,
      indexes: 1,
      echecs: [],
      indexationEnAttente: false,
      statut: "termine",
    })

    const produit = await prisma.product.findUniqueOrThrow({
      where: { slug: slug("banc") },
      include: { variants: { orderBy: { sku: "asc" } } },
    })
    expect(produit).toMatchObject({
      name: "Banc",
      brand: "Maison",
      description: "Bois massif",
      categoryId: structureId,
      price: 1000,
      specs: {},
      images: [],
      isFeatured: false,
      featuredOrder: 0,
      freeShipping: false,
    })
    expect(produit.variants).toHaveLength(2)
    expect(produit.variants.map((variante) => variante.sku)).toEqual([
      sku("BANC-1"),
      sku("BANC-2"),
    ])
    expect(produit.variants.map((variante) => variante.priceDelta)).toEqual([
      0, 500,
    ])

    const lot = await lireLeLot(lotId)
    expect(lot).toMatchObject({
      statut: "termine",
      curseur: 1,
      ecrits: 1,
      indexes: 1,
    })
    expect(lot?.lignes.map((ligne) => ligne.statut)).toEqual([
      "ecrite",
      "ecrite",
    ])
  })
})

describe("appliquerLeLot — l'isolement d'un Produit en échec", () => {
  it("écrit les autres Produits, marque les Lignes du fautif avec sa raison et finit partiel", async () => {
    const contenu = fichierCsv(
      ligneCsv({
        slug: slug("en-echec"),
        name: "En échec",
        brand: "Maison",
        variant_sku: sku("ECHEC-1"),
        variant_name: "Unique",
        variant_price: "10.00",
      }),
      ligneCsv({
        slug: slug("reussi"),
        name: "Réussi",
        brand: "Maison",
        variant_sku: sku("REUSSI-1"),
        variant_name: "Unique",
        variant_price: "20.00",
      })
    )
    const lotId = await preparerLeLot(contenu)
    const effets = effetsDeTest()

    // On injecte la panne sur la première transaction du writer : la première
    // écriture de Produit échoue, les suivantes retrouvent la vraie transaction.
    const panne = new Error("Panne simulée du Catalogue")
    vi.spyOn(prisma, "$transaction").mockImplementationOnce((() =>
      Promise.reject(panne)) as never)

    const resultat = await appliquerLeLot(lotId, 0, effets.overrides)

    expect(resultat).toMatchObject({
      traites: 2,
      reste: 0,
      ecrits: 1,
      indexes: 1,
      statut: "partiel",
      indexationEnAttente: false,
    })
    expect(resultat.echecs).toEqual([
      {
        slug: slug("en-echec"),
        motif: expect.stringContaining("Panne simulée"),
      },
    ])

    await expect(
      prisma.product.findUnique({ where: { slug: slug("en-echec") } })
    ).resolves.toBeNull()
    await expect(
      prisma.product.findUnique({ where: { slug: slug("reussi") } })
    ).resolves.not.toBeNull()

    const lot = await lireLeLot(lotId)
    expect(lot?.statut).toBe("partiel")
    expect(lot?.ecrits).toBe(1)
    expect(lot?.indexes).toBe(1)
    const lignesEchouees = lot?.lignes.filter(
      (ligne) => ligne.slug === slug("en-echec")
    )
    expect(lignesEchouees?.map((ligne) => ligne.statut)).toEqual(["echouee"])
    expect(lignesEchouees?.[0]?.motifEchec).toContain("Panne simulée")
    expect(
      lot?.lignes
        .filter((ligne) => ligne.slug === slug("reussi"))
        .map((ligne) => ligne.statut)
    ).toEqual(["ecrite"])
  })
})

describe("appliquerLeLot — l'avancement du curseur", () => {
  it("applique 25 Produits par appel, reprend au curseur et ne recompte jamais", async () => {
    const contenu = fichierCsv(
      ...Array.from({ length: 27 }, (_inutilise, position) =>
        ligneCsv({
          slug: slug(`lot-${position}`),
          name: `Produit ${position}`,
          brand: "Maison",
          variant_sku: sku(`LOT-${position}`),
          variant_name: "Unique",
          variant_price: "10.00",
        })
      )
    )
    const lotId = await preparerLeLot(contenu)
    const effets = effetsDeTest()

    const premier = await appliquerLeLot(lotId, 0, effets.overrides)

    expect(premier).toMatchObject({
      traites: 25,
      reste: 2,
      curseurSuivant: 25,
      ecrits: 25,
      indexes: 25,
      echecs: [],
      indexationEnAttente: false,
      statut: "en_cours",
    })
    const updatedAtPremier = new Map(
      (
        await prisma.product.findMany({
          where: {
            slug: {
              in: Array.from({ length: 25 }, (_x, i) => slug(`lot-${i}`)),
            },
          },
          select: { slug: true, updatedAt: true },
        })
      ).map((produit) => [produit.slug, produit.updatedAt.getTime()])
    )

    const second = await appliquerLeLot(
      lotId,
      premier.curseurSuivant,
      effets.overrides
    )

    expect(second).toMatchObject({
      traites: 2,
      reste: 0,
      curseurSuivant: 27,
      ecrits: 27,
      indexes: 27,
      echecs: [],
      statut: "termine",
    })

    expect(
      await prisma.product.count({
        where: { slug: { startsWith: `a-${runId}-lot-` } },
      })
    ).toBe(27)
    expect(
      await prisma.productVariant.count({
        where: { product: { slug: { startsWith: `a-${runId}-lot-` } } },
      })
    ).toBe(27)

    const updatedAtSecond = new Map(
      (
        await prisma.product.findMany({
          where: {
            slug: {
              in: Array.from({ length: 25 }, (_x, i) => slug(`lot-${i}`)),
            },
          },
          select: { slug: true, updatedAt: true },
        })
      ).map((produit) => [produit.slug, produit.updatedAt.getTime()])
    )
    expect(updatedAtSecond).toEqual(updatedAtPremier)

    const lot = await lireLeLot(lotId)
    expect(lot).toMatchObject({
      statut: "termine",
      curseur: 27,
      ecrits: 27,
      indexes: 27,
    })
    expect(lot?.lignes.every((ligne) => ligne.statut === "ecrite")).toBe(true)
  })
})

describe("appliquerLeLot — l'indexation après l'écriture", () => {
  it("garde le Lot en cours et signale l'attente quand l'indexation n'a pas suivi, puis termine au rattrapage", async () => {
    const contenu = fichierCsv(
      ligneCsv({
        slug: slug("indexe"),
        name: "Indexé",
        brand: "Maison",
        variant_sku: sku("INDEXE-1"),
        variant_name: "Unique",
        variant_price: "10.00",
      }),
      ligneCsv({
        slug: slug("non-indexe"),
        name: "Non indexé",
        brand: "Maison",
        variant_sku: sku("NON-INDEXE-1"),
        variant_name: "Unique",
        variant_price: "20.00",
      })
    )
    const lotId = await preparerLeLot(contenu)
    const echecs = new Set([slug("non-indexe")])
    const effets = effetsDeTest({ echecsIndexation: echecs })

    const premier = await appliquerLeLot(lotId, 0, effets.overrides)

    expect(premier).toMatchObject({
      traites: 2,
      reste: 0,
      ecrits: 2,
      indexes: 1,
      echecs: [],
      indexationEnAttente: true,
      statut: "en_cours",
    })
    let lot = await lireLeLot(lotId)
    expect(lot?.statut).toBe("en_cours")
    expect(lot?.ecrits).toBe(2)
    expect(lot?.indexes).toBe(1)
    expect(lot?.statut).not.toBe("termine")

    echecs.clear()
    const second = await appliquerLeLot(
      lotId,
      premier.curseurSuivant,
      effets.overrides
    )

    expect(second).toMatchObject({
      traites: 0,
      reste: 0,
      ecrits: 2,
      indexes: 2,
      echecs: [],
      indexationEnAttente: false,
      statut: "termine",
    })
    lot = await lireLeLot(lotId)
    expect(lot).toMatchObject({ statut: "termine", ecrits: 2, indexes: 2 })
  })
})

describe("appliquerLeLot — les statuts", () => {
  async function creerUnLot(
    statut:
      "brouillon" | "verifie" | "en_cours" | "partiel" | "termine" | "echoue"
  ) {
    return prisma.lotImport.create({
      data: {
        auteurId: AUTEUR_ID,
        empreinte: "a".repeat(64),
        taille: 42,
        statut,
      },
    })
  }

  it("refuse les statuts qui ne s'appliquent pas, en français", async () => {
    const attendus = [
      ["brouillon", /vérifié/i],
      ["partiel", /partiel/i],
      ["termine", /déjà appliqué/i],
      ["echoue", /échoué/i],
    ] as const

    for (const [statut, motif] of attendus) {
      const lot = await creerUnLot(statut)
      await expect(appliquerLeLot(lot.id, 0)).rejects.toMatchObject({
        name: "UserFacingError",
        message: expect.stringMatching(motif),
      })
    }

    await expect(appliquerLeLot("lot-inconnu", 0)).rejects.toThrow(
      /introuvable/
    )
  })

  it("accepte un Lot vérifié ou en cours et refuse un curseur invalide", async () => {
    const verifie = await creerUnLot("verifie")
    await expect(appliquerLeLot(verifie.id, 0)).resolves.toMatchObject({
      statut: "termine",
      traites: 0,
      reste: 0,
    })

    const enCours = await creerUnLot("en_cours")
    await expect(appliquerLeLot(enCours.id, 0)).resolves.toMatchObject({
      statut: "termine",
      traites: 0,
    })

    const negatif = await creerUnLot("verifie")
    await expect(appliquerLeLot(negatif.id, -1)).rejects.toThrow(/curseur/i)
    await expect(appliquerLeLot(negatif.id, 1.5)).rejects.toThrow(/curseur/i)
  })
})

describe("appliquerLeLot — le merge complet", () => {
  const IMAGE_FACE = `https://images.example.test/a-${runId}-face.jpg`
  const IMAGE_DOS = `https://images.example.test/a-${runId}-dos.jpg`

  async function creerLeProduitComplet(structureId: string) {
    const produit = await prisma.product.create({
      data: {
        slug: slug("fauteuil"),
        name: "Fauteuil",
        brand: "Maison",
        description: "Cuir et bois",
        categoryId: structureId,
        price: 5000,
        specs: { Matière: "Cuir", Couleur: "Noyer" },
        images: [IMAGE_FACE, IMAGE_DOS],
        isFeatured: true,
        featuredOrder: 7,
        freeShipping: true,
        variants: {
          create: [
            {
              name: "Droit",
              sku: sku("FAUTEUIL-1"),
              priceDelta: 0,
              stock: 3,
            },
            {
              name: "Inclinable",
              sku: sku("FAUTEUIL-2"),
              priceDelta: 5000,
              stock: 9,
            },
          ],
        },
      },
      include: { variants: { orderBy: { sku: "asc" } } },
    })
    await prisma.imageProduit.createMany({
      data: [
        {
          publicUrl: IMAGE_FACE,
          mimeType: "image/jpeg",
          byteSize: 100,
          width: 800,
          height: 600,
          alt: "Fauteuil de face",
        },
        {
          publicUrl: IMAGE_DOS,
          mimeType: "image/jpeg",
          byteSize: 100,
          width: 800,
          height: 600,
          alt: null,
        },
      ],
    })
    return produit
  }

  it("préserve images et alt, specs, drapeaux, Structure et Variantes absentes, et met à jour prix et stock", async () => {
    const structureId = await creerLaStructure()
    const avant = await creerLeProduitComplet(structureId)
    const variantesAvant = new Map(
      avant.variants.map((variante) => [variante.sku, variante.id])
    )
    const structuresAvant = await prisma.category.count()

    const contenu = fichierCsv(
      ligneCsv({
        slug: slug("fauteuil"),
        variant_sku: sku("FAUTEUIL-1"),
        variant_price: "55.00",
        variant_stock: "8",
      }),
      ligneCsv({
        slug: slug("fauteuil"),
        variant_sku: sku("FAUTEUIL-3"),
        variant_name: "Haut",
        variant_price: "70.00",
        variant_stock: "4",
      })
    )
    const lotId = await preparerLeLot(contenu)
    const effets = effetsDeTest()

    const resultat = await appliquerLeLot(lotId, 0, effets.overrides)

    expect(resultat).toMatchObject({
      traites: 1,
      reste: 0,
      ecrits: 1,
      indexes: 1,
      echecs: [],
      statut: "termine",
    })
    expect(await prisma.category.count()).toBe(structuresAvant)

    const produit = await prisma.product.findUniqueOrThrow({
      where: { id: avant.id },
      include: { variants: { orderBy: { sku: "asc" } } },
    })
    expect(produit).toMatchObject({
      name: "Fauteuil",
      brand: "Maison",
      description: "Cuir et bois",
      categoryId: structureId,
      price: 5500,
      specs: { Matière: "Cuir", Couleur: "Noyer" },
      images: [IMAGE_FACE, IMAGE_DOS],
      isFeatured: true,
      featuredOrder: 7,
      freeShipping: true,
    })
    expect(produit.variants).toHaveLength(3)
    expect(produit.variants.map((variante) => variante.sku)).toEqual([
      sku("FAUTEUIL-1"),
      sku("FAUTEUIL-2"),
      sku("FAUTEUIL-3"),
    ])
    expect(
      produit.variants.map((variante) => [
        variante.sku,
        variante.priceDelta,
        variante.stock,
      ])
    ).toEqual([
      [sku("FAUTEUIL-1"), 0, 8],
      [sku("FAUTEUIL-2"), 4500, 9],
      [sku("FAUTEUIL-3"), 1500, 4],
    ])
    expect(produit.variants[0]?.id).toBe(variantesAvant.get(sku("FAUTEUIL-1")))
    expect(produit.variants[1]?.id).toBe(variantesAvant.get(sku("FAUTEUIL-2")))

    const altFace = await prisma.imageProduit.findUniqueOrThrow({
      where: { publicUrl: IMAGE_FACE },
    })
    const altDos = await prisma.imageProduit.findUniqueOrThrow({
      where: { publicUrl: IMAGE_DOS },
    })
    expect(altFace.alt).toBe("Fauteuil de face")
    expect(altDos.alt).toBeNull()

    const lot = await lireLeLot(lotId)
    expect(lot).toMatchObject({ statut: "termine", ecrits: 1, indexes: 1 })
    expect(lot?.lignes.map((ligne) => ligne.statut)).toEqual([
      "ecrite",
      "ecrite",
    ])

    const indexe = effets.indexes.get(slug("fauteuil"))
    expect(indexe?.skus).toEqual([
      sku("FAUTEUIL-1"),
      sku("FAUTEUIL-2"),
      sku("FAUTEUIL-3"),
    ])
  })

  it("re-téléverser le même fichier après application rend 0 créé, 0 modifié, N inchangés", async () => {
    const structureId = await creerLaStructure()
    await creerLeProduitComplet(structureId)
    const contenu = fichierCsv(
      ligneCsv({
        slug: slug("fauteuil"),
        variant_sku: sku("FAUTEUIL-1"),
        variant_price: "55.00",
        variant_stock: "8",
      })
    )

    const premierLot = await preparerLeLot(contenu)
    await appliquerLeLot(premierLot, 0, effetsDeTest().overrides)

    const televerse = await televerserLeFichier({
      nomFichier: "catalogue.csv",
      octets: new TextEncoder().encode(contenu),
      auteurId: AUTEUR_ID,
    })
    const second = await verifierLeLot(televerse.lotId)

    expect(second.compteurs).toEqual({
      produitsCrees: 0,
      produitsModifies: 0,
      produitsInchanges: 1,
      produitsRefuses: 0,
    })
    expect(second.peutAppliquer).toBe(true)
  })
})

function fichierDeNProduits(prefixe: string, nombre: number): string {
  return fichierCsv(
    ...Array.from({ length: nombre }, (_inutilise, position) =>
      ligneCsv({
        slug: slug(`${prefixe}-${position}`),
        name: `Produit ${prefixe} ${position}`,
        brand: "Maison",
        variant_sku: sku(`${prefixe}-${position}`),
        variant_name: "Unique",
        variant_price: "10.00",
      })
    )
  )
}

describe("appliquerLeLot — un seul Lot en cours", () => {
  it("l'index partiel de la base refuse un second Lot en cours", async () => {
    await prisma.lotImport.create({
      data: {
        auteurId: AUTEUR_ID,
        empreinte: "1".repeat(64),
        taille: 12,
        statut: "en_cours",
      },
    })

    await expect(
      prisma.lotImport.create({
        data: {
          auteurId: AUTEUR_ID,
          empreinte: "2".repeat(64),
          taille: 12,
          statut: "en_cours",
        },
      })
    ).rejects.toMatchObject({ code: "P2002" })

    await expect(
      prisma.lotImport.count({ where: { statut: "en_cours" } })
    ).resolves.toBe(1)
  })

  it("fait gagner une seule des deux applications concurrentes ; la perdante est refusée en français et n'écrit rien", async () => {
    const lotA = await preparerLeLot(fichierDeNProduits("course-a", 27))
    const lotB = await preparerLeLot(fichierDeNProduits("course-b", 27))
    const effets = effetsDeTest()

    const resultats = await Promise.allSettled([
      appliquerLeLot(lotA, 0, effets.overrides),
      appliquerLeLot(lotB, 0, effets.overrides),
    ])
    const reussites = resultats.filter(
      (
        resultat
      ): resultat is PromiseFulfilledResult<
        Awaited<ReturnType<typeof appliquerLeLot>>
      > => resultat.status === "fulfilled"
    )
    const refus = resultats.filter(
      (resultat): resultat is PromiseRejectedResult =>
        resultat.status === "rejected"
    )

    expect(reussites).toHaveLength(1)
    expect(refus).toHaveLength(1)
    expect(refus[0]?.reason).toMatchObject({
      name: "UserFacingError",
      message: MESSAGE_IMPORT_EN_COURS,
    })

    const gagnant = reussites[0]!.value
    const perdantId = gagnant.lotId === lotA ? lotB : lotA
    expect(gagnant).toMatchObject({
      traites: 25,
      reste: 2,
      ecrits: 25,
      statut: "en_cours",
    })

    const lotsEnCours = await prisma.lotImport.findMany({
      where: { statut: "en_cours" },
      select: { id: true },
    })
    expect(lotsEnCours.map((lot) => lot.id)).toEqual([gagnant.lotId])

    const perdant = await prisma.lotImport.findUniqueOrThrow({
      where: { id: perdantId },
    })
    expect(perdant).toMatchObject({
      statut: "verifie",
      curseur: 0,
      ecrits: 0,
      indexes: 0,
    })
    await expect(
      prisma.ligneImport.count({
        where: { lotId: perdantId, statut: { in: ["ecrite", "echouee"] } },
      })
    ).resolves.toBe(0)

    const prefixeGagnant = gagnant.lotId === lotA ? "course-a" : "course-b"
    const prefixePerdant = gagnant.lotId === lotA ? "course-b" : "course-a"
    await expect(
      prisma.product.count({
        where: { slug: { startsWith: `a-${runId}-${prefixeGagnant}-` } },
      })
    ).resolves.toBe(25)
    await expect(
      prisma.product.count({
        where: { slug: { startsWith: `a-${runId}-${prefixePerdant}-` } },
      })
    ).resolves.toBe(0)
  })
})

describe("appliquerLeLot — la reprise après une interruption", () => {
  it("laisse le Lot en cours au curseur, le reprend sans réécrire ni recompter les Produits déjà écrits", async () => {
    const lotId = await preparerLeLot(fichierDeNProduits("reprise", 27))
    const effets = effetsDeTest()

    // L'onglet est fermé pendant l'application : plus aucun appel jusqu'à la
    // réouverture. Le Lot, son curseur et ses Lignes restent en base.
    const interrompu = await appliquerLeLot(lotId, 0, effets.overrides)

    expect(interrompu).toMatchObject({
      traites: 25,
      reste: 2,
      curseurSuivant: 25,
      ecrits: 25,
      indexes: 25,
      statut: "en_cours",
    })
    const lotInterrompu = await lireLeLot(lotId)
    expect(lotInterrompu).toMatchObject({
      statut: "en_cours",
      curseur: 25,
      ecrits: 25,
      indexes: 25,
    })
    expect(lotInterrompu?.statut).not.toBe("termine")
    expect(
      lotInterrompu?.lignes.filter((ligne) => ligne.statut === "ecrite")
    ).toHaveLength(25)
    expect(
      lotInterrompu?.lignes.filter((ligne) => ligne.statut !== "ecrite")
    ).toHaveLength(2)

    const updatedAtAvant = new Map(
      (
        await prisma.product.findMany({
          where: {
            slug: {
              in: Array.from({ length: 25 }, (_x, i) => slug(`reprise-${i}`)),
            },
          },
          select: { slug: true, updatedAt: true },
        })
      ).map((produit) => [produit.slug, produit.updatedAt.getTime()])
    )

    const reprise = await appliquerLeLot(
      lotId,
      lotInterrompu!.curseur,
      effets.overrides
    )

    expect(reprise).toMatchObject({
      traites: 2,
      reste: 0,
      curseurSuivant: 27,
      ecrits: 27,
      indexes: 27,
      echecs: [],
      indexationEnAttente: false,
      statut: "termine",
    })
    await expect(
      prisma.product.count({
        where: { slug: { startsWith: `a-${runId}-reprise-` } },
      })
    ).resolves.toBe(27)

    const updatedAtApres = new Map(
      (
        await prisma.product.findMany({
          where: {
            slug: {
              in: Array.from({ length: 25 }, (_x, i) => slug(`reprise-${i}`)),
            },
          },
          select: { slug: true, updatedAt: true },
        })
      ).map((produit) => [produit.slug, produit.updatedAt.getTime()])
    )
    expect(updatedAtApres).toEqual(updatedAtAvant)

    const lot = await lireLeLot(lotId)
    expect(lot).toMatchObject({
      statut: "termine",
      curseur: 27,
      ecrits: 27,
      indexes: 27,
    })
    expect(lot?.lignes.every((ligne) => ligne.statut === "ecrite")).toBe(true)
  })
})
