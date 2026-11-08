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

import {
  declarerApresEcriture,
  type ConsequenceStructure,
  type FaitsStructureSupprimee,
} from "@/lib/apres-ecriture"
import type { Charge } from "@/lib/automations/charge"
import { creerPont } from "@/lib/automations/ponts"
import { prisma } from "@/lib/db"
import {
  creerPortRechercheMemoire,
  dependancesDeTest,
} from "@/test/automations-memoire"

const { lireStructure } = vi.hoisted(() => ({ lireStructure: vi.fn() }))

vi.mock("@/lib/use-cases/lecture-structure", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/use-cases/lecture-structure")>()
  return { ...original, lireStructure }
})

const MAINTENANT = new Date("2026-11-08T10:00:00.000Z")
const PREFIXE = `pont-951-${randomUUID().slice(0, 8)}`

const CHARGE: Charge<"structure.supprimee"> = {
  categorieId: `${PREFIXE}-supprimee`,
  imagesRetirees: [],
  destinations: [`${PREFIXE}-a`, `${PREFIXE}-b`],
}

async function creerStructure(suffixe: string): Promise<string> {
  const categorie = await prisma.category.create({
    data: { name: `Structure ${suffixe}`, slug: `${PREFIXE}-${suffixe}` },
  })
  return categorie.id
}

async function creerProduit(suffixe: string, categoryId: string | null) {
  return prisma.product.create({
    data: {
      name: `Produit ${suffixe}`,
      slug: `${PREFIXE}-${suffixe}`,
      description: "description",
      brand: "Marque",
      price: 1000,
      specs: {},
      images: [],
      categoryId,
    },
  })
}

function reindexations(
  faits: FaitsStructureSupprimee
): Extract<ConsequenceStructure, { effet: "reindexation" }>[] {
  const plan = declarerApresEcriture("structure.supprimee", faits)
  return plan.consequences.filter(
    (
      consequence
    ): consequence is Extract<
      ConsequenceStructure,
      { effet: "reindexation" }
    > => consequence.effet === "reindexation"
  )
}

let categorieA: string
let categorieB: string
let produitA: string
let produitB: string

beforeAll(async () => {
  categorieA = await creerStructure("a")
  categorieB = await creerStructure("b")
  produitA = (await creerProduit("a", categorieA)).id
  produitB = (await creerProduit("b", categorieB)).id
})

beforeEach(() => {
  lireStructure.mockReset()
  vi.restoreAllMocks()
})

afterAll(async () => {
  await prisma.product.deleteMany({ where: { slug: { startsWith: PREFIXE } } })
  await prisma.category.deleteMany({
    where: { slug: { startsWith: PREFIXE } },
  })
  await prisma.$disconnect()
})

describe("le pont du Catalogue", () => {
  it("réindexe un changement de stock sans lire d'Événement Catalogue", async () => {
    const produit = await creerProduit("stock", null)
    const recherche = creerPortRechercheMemoire()
    const dependances = dependancesDeTest(MAINTENANT, {
      recherche: recherche.port,
    })
    const plan = declarerApresEcriture("variante.stock.changee", {
      produitId: produit.id,
    })
    const reindexation = plan.consequences.find(
      (consequence) => consequence.effet === "reindexation"
    )!
    const pont = creerPont(
      "variante.stock.changee",
      "variante.stock.changee",
      { produitId: produit.id },
      dependances
    )

    await pont.executerUne(reindexation)

    expect(lireStructure).not.toHaveBeenCalled()
    expect(recherche.operations).toEqual([
      { operation: "indexer", ids: [produit.id] },
    ])
  })
})

describe("le pont de la Structure", () => {
  it("lit l'arbre une seule fois et chaque branche une seule fois par plan", async () => {
    lireStructure.mockResolvedValue({
      structure: () => null,
      filAriane: () => [],
      branche: (id: string) => [id],
    })
    const recherche = creerPortRechercheMemoire()
    const dependances = dependancesDeTest(MAINTENANT, {
      recherche: recherche.port,
    })
    const documentsLus = vi.spyOn(prisma.product, "findMany")
    const pont = creerPont(
      "structure.supprimee",
      "structure.supprimee",
      CHARGE,
      dependances
    )
    const [brancheA, brancheB] = reindexations({
      categorieId: CHARGE.categorieId,
      imagesRetirees: [],
      destinations: [categorieA, categorieB],
    })

    await pont.executerUne(brancheA!)
    await pont.executerUne(brancheB!)
    // Une même branche rejouée dans le même plan ne relit ni l'arbre ni ses
    // documents : le pont vit plus longtemps que la carte de gestionnaires que
    // `executerUne` reconstruit à chaque appel. La conséquence, elle, se
    // réexécute — c'est l'action durable, pas une lecture.
    await pont.executerUne(brancheA!)

    expect(lireStructure).toHaveBeenCalledTimes(1)
    expect(documentsLus).toHaveBeenCalledTimes(2)
    expect(recherche.operations).toEqual([
      { operation: "indexer", ids: [produitA] },
      { operation: "indexer", ids: [produitB] },
      { operation: "indexer", ids: [produitA] },
    ])
  })
})
