import { randomUUID } from "node:crypto"

import { revalidatePath } from "next/cache"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import { prisma } from "@/lib/db"
import { Prisma } from "@/lib/generated/prisma/client"
import { createProduct } from "@/lib/use-cases/admin-catalog"
import {
  LIBELLE_SANS_STRUCTURE,
  SLUG_SANS_STRUCTURE,
} from "@/lib/index-projection"

const sendMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/r2", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/r2")>()
  return {
    ...original,
    stockageImageProduitR2: {
      ...original.stockageImageProduitR2,
      supprimerImageCategorie: () => sendMock(),
    },
  }
})

import {
  CategoryAncestorCycleError,
  CategoryBusyError,
  CategoryHasChildrenError,
  CategoryHasProductsError,
  CategoryNotFoundError,
  CategorySlugConflictError,
  CategoryTransactionExpiredError,
  CategoryValidationError,
  DELAI_VERROU_STRUCTURE_MS,
  createCategory,
  deleteCategory,
  deplacerStructure,
  updateCategory,
  type CategoryInput,
} from "@/lib/use-cases/admin-structure"
import { lireStructure } from "@/lib/use-cases/lecture-structure"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"
import {
  verifierFrontiereBestEffort,
  verifierRefusValidation,
} from "@/test/mutation-squelette-recette"
import { planterUnCycleEnBase } from "@/test/structure-fixtures"

const runId = randomUUID().slice(0, 8)
const categorySlug = (suffix: string) => `cat-${runId}-${suffix}`
const productSlug = (suffix: string) => `struc-${runId}-${suffix}`

interface ReleveEffet {
  effet: string
  structureSourcePresente: boolean
  categorieDuProduit: string | null
}

interface ReleveReattribution {
  effet: string
  structureSourcePresente: boolean
  parenteEnfant: string | null
}

function makeCategoryInput(
  overrides: Partial<CategoryInput> = {}
): CategoryInput {
  return {
    name: "Catégorie Test T3",
    slug: categorySlug("base"),
    image: "https://example.com/cat.jpg",
    ...overrides,
  }
}

async function makeProductIn(
  category: { id: string },
  suffix: string,
  name: string
) {
  return prisma.product.create({
    data: {
      name,
      slug: productSlug(suffix),
      description: "desc",
      brand: "Marque",
      price: 10000,
      specs: {},
      images: [],
      categoryId: category.id,
    },
  })
}

function effectSpies() {
  return {
    reindexProducts: vi.fn(),
    revalidateCategories: vi.fn(),
    deleteImage: vi.fn(),
  }
}

function expectNoEffects(effets: ReturnType<typeof effectSpies>) {
  expect(effets.reindexProducts).not.toHaveBeenCalled()
  expect(effets.revalidateCategories).not.toHaveBeenCalled()
  expect(effets.deleteImage).not.toHaveBeenCalled()
}

function attendre(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function retenirTransaction(
  tenir: (
    tx: Prisma.TransactionClient,
    liberation: Promise<void>
  ) => Promise<unknown>
) {
  let liberer = () => {}
  const liberation = new Promise<void>((resolve) => {
    liberer = resolve
  })
  const transaction = prisma.$transaction(
    async (tx) => {
      await tenir(tx, liberation)
      await liberation
    },
    { timeout: 30_000 }
  )
  transaction.catch(() => {})
  return { transaction, liberer }
}

function attendreQue(acquis: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const verifier = () => (acquis() ? resolve() : setTimeout(verifier, 10))
    verifier()
  })
}

async function attendreQuUneAttenteDeVerrou(): Promise<void> {
  const uneAttenteDeVerrou = async () => {
    const lignes = await prisma.$queryRawUnsafe<{ attendu: bigint }[]>(
      `SELECT count(*) AS attendu
         FROM pg_stat_activity
        WHERE datname = current_database()
          AND state = 'active'
          AND wait_event_type = 'Lock'
          AND query LIKE '%FROM "Category" FOR UPDATE%'`
    )
    return Number(lignes[0]?.attendu ?? 0) > 0
  }
  while (!(await uneAttenteDeVerrou())) {
    await attendre(10)
  }
}

function refusDe(promesse: Promise<unknown>): Promise<unknown> {
  return promesse.then(
    () => undefined,
    (error: unknown) => error
  )
}

async function eprouverLeDelaiDeVerrou(
  demarrer: () => Promise<unknown>
): Promise<unknown> {
  let tierceVerrouillee = false
  const { transaction, liberer } = retenirTransaction(
    async (tx, liberation) => {
      await tx.$queryRawUnsafe(`SELECT id FROM "Category" FOR UPDATE`)
      tierceVerrouillee = true
      await liberation
    }
  )
  await attendreQue(() => tierceVerrouillee)

  const mutation = demarrer()
  mutation.catch(() => {})
  try {
    const refus = await Promise.race([
      refusDe(mutation),
      attendre(DELAI_VERROU_STRUCTURE_MS + 400).then(() => "en attente"),
    ])
    expect(refus).toBeInstanceOf(CategoryBusyError)
    expect(refus).toBeInstanceOf(UserFacingError)
    expect(refus).not.toBeInstanceOf(Prisma.PrismaClientKnownRequestError)
    expect((refus as Error).message).toBe(
      "la Structure est en cours de modification, réessayez"
    )
    return refus
  } finally {
    liberer()
    await transaction
  }
}

async function planterUneChaine(prefixe: string, profondeur: number) {
  const deplacee = await createCategory(
    makeCategoryInput({ slug: categorySlug(`${prefixe}-deplacee`) })
  )
  let plusProfonde = await createCategory(
    makeCategoryInput({ slug: categorySlug(`${prefixe}-0`) })
  )
  for (let rang = 1; rang < profondeur; rang += 1) {
    plusProfonde = await createCategory(
      makeCategoryInput({
        slug: categorySlug(`${prefixe}-${rang}`),
        parentId: plusProfonde.id,
      })
    )
  }
  return { deplacee, plusProfonde }
}

async function lePoolEstSature(): Promise<boolean> {
  const issue = await refusDe(
    prisma.$transaction(async (tx) => tx.$queryRaw`SELECT 1`, { maxWait: 100 })
  )
  if (issue === undefined) return false
  expect((issue as { code?: unknown }).code).toBe("P2028")
  return true
}

async function saturerLePoolDeConnexions(): Promise<{
  tenues: Promise<unknown>[]
  liberer: () => void
}> {
  const nombre = 16
  let etablies = 0
  const retenues = Array.from({ length: nombre }, () =>
    retenirTransaction(async (tx, liberation) => {
      await tx.$queryRaw`SELECT 1`
      etablies += 1
      await liberation
    })
  )

  await attendreQue(() => etablies > 0)
  let essais = 0
  while (!(await lePoolEstSature())) {
    essais += 1
    if (essais > 40) {
      throw new Error("le pool ne s'est jamais saturé")
    }
    await attendre(50)
  }
  expect(
    etablies,
    "le pool doit être plus petit que le nombre de transactions retenues, sans quoi l'épreuve ne mesure aucune saturation"
  ).toBeLessThan(nombre)

  return {
    tenues: retenues.map((tenue) => tenue.transaction.catch(() => {})),
    liberer: () => retenues.forEach((tenue) => tenue.liberer()),
  }
}

async function compterLesLecturesDeChaine(
  demarrer: () => Promise<unknown>
): Promise<{ issue: unknown; lectures: number }> {
  type TransactionInteractive = (
    callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
    options?: unknown
  ) => Promise<unknown>
  const transactionReelle = prisma.$transaction.bind(
    prisma
  ) as unknown as TransactionInteractive

  let lectures = 0
  const espion = vi.spyOn(prisma, "$transaction").mockImplementation(((
    callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
    options?: unknown
  ) =>
    transactionReelle(async (tx) => {
      const lecturesDeLaTransaction = vi.spyOn(tx.category, "findUnique")
      try {
        return await callback(tx)
      } finally {
        lectures += lecturesDeLaTransaction.mock.calls.length
        lecturesDeLaTransaction.mockRestore()
      }
    }, options)) as unknown as typeof prisma.$transaction)

  try {
    const issue = await refusDe(demarrer())
    return { issue, lectures }
  } finally {
    espion.mockRestore()
  }
}

describe("deplacerStructure — un déplacement, un propriétaire", () => {
  beforeEach(async () => {
    await prisma.product.deleteMany({
      where: { slug: { startsWith: `struc-${runId}-` } },
    })
    await prisma.category.deleteMany({
      where: { slug: { startsWith: `cat-${runId}-` } },
    })
  })

  async function creerFratrie(prefixe: string) {
    const racine = await createCategory(
      makeCategoryInput({
        name: `Racine ${prefixe}`,
        slug: categorySlug(`${prefixe}-racine`),
      })
    )
    const a = await createCategory(
      makeCategoryInput({
        name: `Alpha ${prefixe}`,
        slug: categorySlug(`${prefixe}-a`),
        parentId: racine.id,
      })
    )
    const b = await createCategory(
      makeCategoryInput({
        name: `Bêta ${prefixe}`,
        slug: categorySlug(`${prefixe}-b`),
        parentId: racine.id,
      })
    )
    const c = await createCategory(
      makeCategoryInput({
        name: `Gamma ${prefixe}`,
        slug: categorySlug(`${prefixe}-c`),
        parentId: racine.id,
      })
    )
    return { racine, a, b, c }
  }

  async function ordreDesEnfants(parentId: string | null): Promise<string[]> {
    return (await lireStructure())
      .lignesAdmin()
      .filter((ligne) => ligne.parentId === parentId && !ligne.horsArbre)
      .map((ligne) => ligne.id)
  }

  async function parentDe(id: string): Promise<string | null> {
    return (
      await prisma.category.findUniqueOrThrow({
        where: { id },
        select: { parentId: true },
      })
    ).parentId
  }

  it("déplace une Structure avant une sœur et persiste le nouvel ordre", async () => {
    const effets = effectSpies()
    const { racine, a, b, c } = await creerFratrie("mv-monter")

    const resultat = await deplacerStructure(
      { id: c.id, nouvelleParenteId: racine.id, avantId: a.id },
      effets
    )

    expect(resultat).toMatchObject({
      nomDestination: racine.name,
      position: 1,
      nombreFreres: 3,
    })
    expect(await ordreDesEnfants(racine.id)).toEqual([c.id, a.id, b.id])
    expect(effets.revalidateCategories).toHaveBeenCalledOnce()
  })

  it("déplace une Structure après une sœur, et une destination nulle la met à la racine", async () => {
    const { racine, a, b, c } = await creerFratrie("mv-descendre")

    await deplacerStructure(
      { id: a.id, nouvelleParenteId: racine.id, avantId: null },
      effectSpies()
    )
    expect(await ordreDesEnfants(racine.id)).toEqual([b.id, c.id, a.id])

    const resultat = await deplacerStructure(
      { id: b.id, nouvelleParenteId: null, avantId: racine.id },
      effectSpies()
    )
    expect(resultat).toMatchObject({
      nomDestination: null,
      position: 1,
      nombreFreres: 2,
    })
    expect(await parentDe(b.id)).toBeNull()
    expect(await ordreDesEnfants(null)).toContain(b.id)
  })

  it("indente une Structure sous sa sœur précédente, en dernier enfant", async () => {
    const { racine, a, b, c } = await creerFratrie("mv-indenter")

    await deplacerStructure(
      { id: b.id, nouvelleParenteId: a.id, avantId: null },
      effectSpies()
    )

    expect(await parentDe(b.id)).toBe(a.id)
    expect(await ordreDesEnfants(a.id)).toEqual([b.id])
    expect(await ordreDesEnfants(racine.id)).toEqual([a.id, c.id])
  })

  it("désindente une Structure sous la grand-mère, avant la sœur suivante de sa parente", async () => {
    const { racine, a, b, c } = await creerFratrie("mv-desindenter")

    await deplacerStructure(
      { id: c.id, nouvelleParenteId: a.id, avantId: null },
      effectSpies()
    )
    await deplacerStructure(
      { id: c.id, nouvelleParenteId: racine.id, avantId: b.id },
      effectSpies()
    )

    expect(await parentDe(c.id)).toBe(racine.id)
    expect(await ordreDesEnfants(racine.id)).toEqual([a.id, c.id, b.id])
    expect(await ordreDesEnfants(a.id)).toEqual([])
  })

  it("refuse une destination dans la sous-structure déplacée, sans toucher à l'arbre", async () => {
    const effets = effectSpies()
    const { racine, a, petit } = await creerFratrie("mv-descendante").then(
      async (fratrie) => {
        const petit = await createCategory(
          makeCategoryInput({
            name: "Petit déplacé",
            slug: categorySlug("mv-descendante-petit"),
            parentId: fratrie.a.id,
          })
        )
        return { ...fratrie, petit }
      }
    )
    const avant = await ordreDesEnfants(racine.id)

    const refus: unknown = await refusDe(
      deplacerStructure(
        { id: a.id, nouvelleParenteId: petit.id, avantId: null },
        effets
      )
    )

    expect(refus).toBeInstanceOf(CategoryValidationError)
    expect((refus as Error).message).toContain("descendantes")
    expect(await ordreDesEnfants(racine.id)).toEqual(avant)
    expect(await parentDe(a.id)).toBe(racine.id)
    expect(await parentDe(petit.id)).toBe(a.id)
    expectNoEffects(effets)
  })

  it("refuse une Structure insérée avant elle-même", async () => {
    const effets = effectSpies()
    const { racine, a } = await creerFratrie("mv-soi")

    const refus: unknown = await refusDe(
      deplacerStructure(
        { id: a.id, nouvelleParenteId: racine.id, avantId: a.id },
        effets
      )
    )

    expect(refus).toBeInstanceOf(CategoryValidationError)
    expectNoEffects(effets)
  })

  it("refuse une Structure d'insertion qui n'est pas une sœur de la destination", async () => {
    const effets = effectSpies()
    const { racine, a } = await creerFratrie("mv-avant-inconnue")

    const refus: unknown = await refusDe(
      deplacerStructure(
        { id: a.id, nouvelleParenteId: racine.id, avantId: "inconnue" },
        effets
      )
    )

    expect(refus).toBeInstanceOf(CategoryValidationError)
    expect((refus as Error).message).toContain("insertion")
    expectNoEffects(effets)
  })

  it("nomme l'arête qui ferme le cycle quand la destination est corrompue", async () => {
    const effets = effectSpies()
    const deplacee = await createCategory(
      makeCategoryInput({
        name: "À rattacher",
        slug: categorySlug("mv-cycle-deplacee"),
      })
    )
    const a = await createCategory(
      makeCategoryInput({ name: "Cycle A", slug: categorySlug("mv-cycle-a") })
    )
    const b = await createCategory(
      makeCategoryInput({ name: "Cycle B", slug: categorySlug("mv-cycle-b") })
    )
    await planterUnCycleEnBase([a.id, b.id])

    const refus: unknown = await refusDe(
      deplacerStructure(
        { id: deplacee.id, nouvelleParenteId: a.id, avantId: null },
        effets
      )
    )

    expect(refus).toBeInstanceOf(CategoryAncestorCycleError)
    const message = (refus as Error).message
    expect(message).toContain("Cycle A")
    expect(message).toContain("Cycle B")
    expect(message).toContain("l'arête")
    expect(await parentDe(deplacee.id)).toBeNull()
    expectNoEffects(effets)
  })

  it("traduit l'expiration de la transaction en Refus de la Structure, pas en contention", async () => {
    const effets = effectSpies()
    const { racine, a } = await creerFratrie("mv-p2028")
    const { tenues, liberer } = await saturerLePoolDeConnexions()

    let refus: unknown
    try {
      refus = await refusDe(
        deplacerStructure(
          { id: a.id, nouvelleParenteId: racine.id, avantId: null },
          effets
        )
      )
    } finally {
      liberer()
      await Promise.all(tenues)
    }

    expect(refus).toBeInstanceOf(CategoryTransactionExpiredError)
    expect(refus).not.toBeInstanceOf(CategoryBusyError)
    expect((refus as Error).message).toBe(
      "Refus de la Structure : la transaction a dépassé son délai"
    )
    expectNoEffects(effets)
  })

  it("attend le verrou grossier d'une transaction tierce, puis committe", async () => {
    const { racine, a, b, c } = await creerFratrie("mv-verrou")
    let tierceVerrouillee = false
    const { transaction, liberer } = retenirTransaction(
      async (tx, liberation) => {
        await tx.$queryRawUnsafe(`SELECT id FROM "Category" FOR UPDATE`)
        tierceVerrouillee = true
        await liberation
      }
    )
    await attendreQue(() => tierceVerrouillee)

    const deplacement = deplacerStructure({
      id: b.id,
      nouvelleParenteId: racine.id,
      avantId: a.id,
    })
    deplacement.catch(() => {})
    try {
      const avantLiberation = await Promise.race([
        deplacement.then(() => "committe"),
        attendre(150).then(() => "attend"),
      ])
      expect(avantLiberation).toBe("attend")
    } finally {
      liberer()
      await transaction
    }

    await expect(deplacement).resolves.toMatchObject({ position: 1 })
    expect(await ordreDesEnfants(racine.id)).toEqual([b.id, a.id, c.id])
  })
})

describe("admin structure mutations — categories", () => {
  beforeEach(async () => {
    await prisma.product.deleteMany({
      where: { slug: { startsWith: `struc-${runId}-` } },
    })
    await prisma.category.deleteMany({
      where: { slug: { startsWith: `cat-${runId}-` } },
    })
  })

  afterAll(async () => {
    await prisma.product.deleteMany({
      where: { slug: { startsWith: `struc-${runId}-` } },
    })
    await prisma.category.deleteMany({
      where: { slug: { startsWith: `cat-${runId}-` } },
    })
    await prisma.$disconnect()
  })

  it("creates a root category and revalidates the structure", async () => {
    const revalidateCategories = vi.fn()
    const reindexProducts = vi.fn()

    const category = await createCategory(makeCategoryInput(), {
      revalidateCategories,
      reindexProducts,
    })

    expect(category.id).toBeTruthy()
    expect(category.name).toBe("Catégorie Test T3")
    expect(category.parentId).toBeNull()
    const persisted = await prisma.category.findUniqueOrThrow({
      where: { id: category.id },
    })
    expect(persisted.image).toBe("https://example.com/cat.jpg")
    expect(revalidateCategories).toHaveBeenCalledOnce()
    expect(reindexProducts).not.toHaveBeenCalled()
  })

  it("réussit une écriture de Structure sans identifiants Cloudflare et journalise la purge ignorée", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    const zoneInitiale = process.env.CLOUDFLARE_ZONE_ID
    const jetonInitial = process.env.CLOUDFLARE_API_TOKEN
    delete process.env.CLOUDFLARE_ZONE_ID
    delete process.env.CLOUDFLARE_API_TOKEN
    try {
      const category = await createCategory(
        makeCategoryInput({ slug: categorySlug("sans-cloudflare") })
      )

      expect(category.id).toBeTruthy()
      expect(
        fetchSpy.mock.calls.filter(([url]) =>
          String(url).includes("api.cloudflare.com")
        )
      ).toEqual([])
      expect(
        warnSpy.mock.calls.some(([message]) =>
          String(message).includes("purge de l'edge non effectuée")
        )
      ).toBe(true)
    } finally {
      fetchSpy.mockRestore()
      warnSpy.mockRestore()
      if (zoneInitiale === undefined) delete process.env.CLOUDFLARE_ZONE_ID
      else process.env.CLOUDFLARE_ZONE_ID = zoneInitiale
      if (jetonInitial === undefined) delete process.env.CLOUDFLARE_API_TOKEN
      else process.env.CLOUDFLARE_API_TOKEN = jetonInitial
    }
  })

  it("creates a nested category under an existing parent", async () => {
    const parent = await createCategory(
      makeCategoryInput({ slug: categorySlug("parent") })
    )

    const child = await createCategory(
      makeCategoryInput({ slug: categorySlug("child"), parentId: parent.id })
    )

    expect(child.parentId).toBe(parent.id)
    const persisted = await prisma.category.findUniqueOrThrow({
      where: { id: child.id },
      include: { parent: true },
    })
    expect(persisted.parent?.name).toBe("Catégorie Test T3")
  })

  it("rejects a duplicate category slug and persists nothing", async () => {
    await createCategory(makeCategoryInput({ slug: categorySlug("dup") }))

    await expect(
      createCategory(
        makeCategoryInput({ slug: categorySlug("dup"), name: "Autre" })
      )
    ).rejects.toThrow(CategorySlugConflictError)

    const count = await prisma.category.count({
      where: { slug: categorySlug("dup") },
    })
    expect(count).toBe(1)
  })

  it("rejects an invalid slug format", async () => {
    await verifierRefusValidation(CategoryValidationError, () =>
      createCategory(makeCategoryInput({ slug: "Slug Invalide!" }))
    )
  })

  it("refuse la valeur réservée d'un Produit sans Structure comme slug de Structure", async () => {
    await verifierRefusValidation(CategoryValidationError, () =>
      createCategory(
        makeCategoryInput({ slug: SLUG_SANS_STRUCTURE, name: "Collision" })
      )
    )

    await expect(
      prisma.category.findUnique({ where: { slug: SLUG_SANS_STRUCTURE } })
    ).resolves.toBeNull()
  })

  it("rejects an empty name", async () => {
    await verifierRefusValidation(CategoryValidationError, () =>
      createCategory(makeCategoryInput({ name: " " }))
    )
  })

  it("rejects an unknown parent", async () => {
    await verifierRefusValidation(CategoryValidationError, () =>
      createCategory(makeCategoryInput({ parentId: "unknown-parent" }))
    )
  })

  it("borne au délai l'attente du verrou grossier d'une création de racine", async () => {
    const effets = effectSpies()
    await createCategory(
      makeCategoryInput({ slug: categorySlug("create-borne-racine") })
    )

    const slug = categorySlug("create-borne")
    await eprouverLeDelaiDeVerrou(() =>
      createCategory(makeCategoryInput({ slug }), effets)
    )

    await expect(prisma.category.count({ where: { slug } })).resolves.toBe(0)
    expectNoEffects(effets)
  })

  it("refuse une Structure parente disparue entre la lecture et l'écriture", async () => {
    const effets = effectSpies()
    const parente = await createCategory(
      makeCategoryInput({ slug: categorySlug("create-parent-disparu") })
    )

    const slug = categorySlug("create-enfant-disparu")
    let tierceVerrouillee = false
    const { transaction, liberer } = retenirTransaction(
      async (tx, liberation) => {
        await tx.$queryRawUnsafe(`SELECT id FROM "Category" FOR UPDATE`)
        await tx.category.delete({ where: { id: parente.id } })
        tierceVerrouillee = true
        await liberation
      }
    )
    await attendreQue(() => tierceVerrouillee)
    try {
      const creation = createCategory(
        makeCategoryInput({ slug, parentId: parente.id }),
        effets
      )
      creation.catch(() => {})
      await attendreQuUneAttenteDeVerrou()
      liberer()
      await transaction

      await verifierRefusValidation(CategoryValidationError, () => creation)
    } finally {
      liberer()
      await transaction
    }

    await expect(prisma.category.count({ where: { slug } })).resolves.toBe(0)
    expectNoEffects(effets)
  })

  it("rejette le slug déjà pris par une création concurrente", async () => {
    const premierEffets = effectSpies()
    const secondEffets = effectSpies()
    const slugPartage = categorySlug("slug-course-partage")

    const creations = [
      createCategory(
        makeCategoryInput({ slug: slugPartage, name: "Première" }),
        premierEffets
      ),
      createCategory(
        makeCategoryInput({ slug: slugPartage, name: "Seconde" }),
        secondEffets
      ),
    ]
    const issues = await Promise.allSettled(creations)

    const reussites = issues.filter((issue) => issue.status === "fulfilled")
    const refus = issues.filter((issue) => issue.status === "rejected")
    expect(reussites).toHaveLength(1)
    expect(refus).toHaveLength(1)
    expect((refus[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      CategorySlugConflictError
    )

    await expect(
      prisma.category.count({ where: { slug: slugPartage } })
    ).resolves.toBe(1)
    const effetsQuiOntParti = [premierEffets, secondEffets].filter(
      (effets) => effets.revalidateCategories.mock.calls.length > 0
    )
    expect(effetsQuiOntParti).toHaveLength(1)
    const perdante =
      effetsQuiOntParti[0] === secondEffets ? premierEffets : secondEffets
    expectNoEffects(perdante)
  })

  it("ne déclenche l'effet de la création qu'après le commit", async () => {
    const slug = categorySlug("create-effet")
    let slugVisibleALEffet: string | null = null
    const revalidateCategories = vi.fn(async () => {
      const portee = await prisma.category.findUnique({ where: { slug } })
      slugVisibleALEffet = portee?.slug ?? null
    })

    const category = await createCategory(makeCategoryInput({ slug }), {
      revalidateCategories,
    })

    expect(revalidateCategories).toHaveBeenCalledOnce()
    expect(slugVisibleALEffet).toBe(slug)
    expect(category.slug).toBe(slug)
  })

  it("updates a category and revalidates; an empty category is not re-indexed", async () => {
    const revalidateCategories = vi.fn()
    const reindexProducts = vi.fn()
    const parent = await createCategory(
      makeCategoryInput({ slug: categorySlug("update-parent") })
    )
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("update-empty") })
    )

    const updated = await updateCategory(
      category.id,
      makeCategoryInput({
        slug: categorySlug("update-empty"),
        name: "Après",
        parentId: parent.id,
        image: null,
      }),
      { revalidateCategories, reindexProducts }
    )

    expect(updated.name).toBe("Après")
    expect(updated.parentId).toBe(parent.id)
    expect(updated.image).toBeNull()
    expect(revalidateCategories).toHaveBeenCalled()
    expect(reindexProducts).not.toHaveBeenCalled()
  })

  it("deletes the previous image through effects when it is replaced on update", async () => {
    const deleteImage = vi.fn()
    const category = await createCategory(
      makeCategoryInput({
        slug: categorySlug("img-replace"),
        image: "https://example.com/old-cat.jpg",
      })
    )

    await updateCategory(
      category.id,
      makeCategoryInput({
        slug: categorySlug("img-replace"),
        image: "https://example.com/new-cat.jpg",
      }),
      { deleteImage }
    )

    expect(deleteImage).toHaveBeenCalledOnce()
    expect(deleteImage).toHaveBeenCalledWith("https://example.com/old-cat.jpg")
  })

  it("does not delete any image when it is unchanged on update", async () => {
    const deleteImage = vi.fn()
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("img-same") })
    )

    await updateCategory(
      category.id,
      makeCategoryInput({ slug: categorySlug("img-same") }),
      { deleteImage }
    )

    expect(deleteImage).not.toHaveBeenCalled()
  })

  it("deletes the previous image when it is removed on update", async () => {
    const deleteImage = vi.fn()
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("img-remove") })
    )

    await updateCategory(
      category.id,
      makeCategoryInput({ slug: categorySlug("img-remove"), image: null }),
      { deleteImage }
    )

    expect(deleteImage).toHaveBeenCalledOnce()
    expect(deleteImage).toHaveBeenCalledWith("https://example.com/cat.jpg")
  })

  it("journalise une panne R2 sur l'image de catégorie sans faire échouer l'update", async () => {
    sendMock.mockRejectedValueOnce(new Error("secret AWS failure"))
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("img-panne") })
    )

    try {
      const updated = await updateCategory(
        category.id,
        makeCategoryInput({
          slug: categorySlug("img-panne"),
          image: "https://example.com/remplacement.jpg",
        })
      )

      expect(updated.image).toBe("https://example.com/remplacement.jpg")
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("https://example.com/cat.jpg"),
        expect.anything()
      )
    } finally {
      warnSpy.mockRestore()
    }
  })

  it("updates a category name and re-indexes the documents of its products", async () => {
    const reindexProducts = vi.fn()
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("update"), name: "Avant" })
    )
    const product = await prisma.product.create({
      data: {
        name: "Produit reindexé",
        slug: productSlug("update"),
        description: "desc",
        brand: "Marque",
        price: 10000,
        specs: {},
        images: [],
        categoryId: category.id,
        variants: {
          create: {
            name: "Standard",
            sku: `STRUC-${runId}-update`,
            priceDelta: 0,
            stock: 5,
          },
        },
      },
    })

    await updateCategory(
      category.id,
      makeCategoryInput({ slug: categorySlug("update"), name: "Après" }),
      { reindexProducts }
    )

    expect(reindexProducts).toHaveBeenCalledOnce()
    expect(reindexProducts).toHaveBeenCalledWith([
      expect.objectContaining({
        id: product.id,
        name: "Produit reindexé",
        totalStock: 5,
        categorySlug: categorySlug("update"),
        categoryName: "Après",
      }),
    ])
  })

  it("accepts an unchanged slug on update", async () => {
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("self") })
    )

    await expect(
      updateCategory(
        category.id,
        makeCategoryInput({ slug: categorySlug("self"), name: "Renommé" })
      )
    ).resolves.toMatchObject({ slug: categorySlug("self") })
  })

  it("rejects updating a category to another category's slug", async () => {
    const first = await createCategory(
      makeCategoryInput({ slug: categorySlug("slug-a") })
    )
    await createCategory(makeCategoryInput({ slug: categorySlug("slug-b") }))

    await expect(
      updateCategory(
        first.id,
        makeCategoryInput({ slug: categorySlug("slug-b") })
      )
    ).rejects.toThrow(CategorySlugConflictError)
  })

  it("rejects making a category its own parent", async () => {
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("cycle-self") })
    )

    const refus = await verifierRefusValidation(CategoryValidationError, () =>
      updateCategory(
        category.id,
        makeCategoryInput({
          slug: categorySlug("cycle-self"),
          parentId: category.id,
        })
      )
    )

    expect(refus.message).toBe(
      "Données invalides : une catégorie ne peut pas être sa propre parente"
    )
  })

  it("rejects moving a category under one of its own descendants", async () => {
    const parent = await createCategory(
      makeCategoryInput({ slug: categorySlug("cyc-a") })
    )
    const child = await createCategory(
      makeCategoryInput({ slug: categorySlug("cyc-b"), parentId: parent.id })
    )
    const grandchild = await createCategory(
      makeCategoryInput({ slug: categorySlug("cyc-c"), parentId: child.id })
    )

    const refus = await verifierRefusValidation(CategoryValidationError, () =>
      updateCategory(
        parent.id,
        makeCategoryInput({
          slug: categorySlug("cyc-a"),
          parentId: grandchild.id,
        })
      )
    )

    expect(refus.message).toBe(
      "Données invalides : une catégorie ne peut pas être déplacée sous l'une de ses propres descendantes"
    )
  })

  it("accepte une chaîne d'ancêtres profonde tant qu'elle est acyclique", async () => {
    const { deplacee, plusProfonde } = await planterUneChaine("profonde", 20)

    await expect(
      updateCategory(
        deplacee.id,
        makeCategoryInput({
          slug: categorySlug("profonde-deplacee"),
          parentId: plusProfonde.id,
        })
      )
    ).resolves.toMatchObject({ parentId: plusProfonde.id })
  })

  it("lit la chaîne d'ancêtres en une requête, quelle que soit sa profondeur", async () => {
    const courte = await planterUneChaine("courte", 4)
    const longue = await planterUneChaine("longue", 24)

    const surCourte = await compterLesLecturesDeChaine(() =>
      updateCategory(
        courte.deplacee.id,
        makeCategoryInput({
          slug: categorySlug("courte-deplacee"),
          parentId: courte.plusProfonde.id,
        })
      )
    )
    const surLongue = await compterLesLecturesDeChaine(() =>
      updateCategory(
        longue.deplacee.id,
        makeCategoryInput({
          slug: categorySlug("longue-deplacee"),
          parentId: longue.plusProfonde.id,
        })
      )
    )

    expect(surCourte.issue).toBeUndefined()
    expect(surLongue.issue).toBeUndefined()
    expect([surCourte.lectures, surLongue.lectures]).toEqual([2, 2])
  })

  it("refuse une chaîne d'ancêtres dont un maillon a disparu", async () => {
    const effets = effectSpies()
    const deplacee = await createCategory(
      makeCategoryInput({ slug: categorySlug("trouee-deplacee") })
    )
    const trouee = await createCategory(
      makeCategoryInput({ slug: categorySlug("trouee") })
    )

    const superutilisateur = await prisma.$queryRawUnsafe<
      { superuser: boolean }[]
    >(`SELECT rolsuper AS superuser FROM pg_roles WHERE rolname = current_user`)
    expect(
      superutilisateur[0]?.superuser,
      "cette épreuve écrit sans déclencher la clé étrangère : la base de test doit appartenir à un superutilisateur, comme celle de docker-compose et de la CI"
    ).toBe(true)

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL session_replication_role = 'replica'`
      )
      await tx.$executeRawUnsafe(
        `UPDATE "Category" SET "parentId" = $1 WHERE id = $2`,
        randomUUID(),
        trouee.id
      )
    })

    const refus = await refusDe(
      updateCategory(
        deplacee.id,
        makeCategoryInput({
          slug: categorySlug("trouee-deplacee"),
          parentId: trouee.id,
        }),
        effets
      )
    )

    expect(refus).toBeInstanceOf(CategoryValidationError)
    expect(refus).toBeInstanceOf(UserFacingError)
    expect((refus as Error).message).toBe(
      "Données invalides : catégorie parente inconnue"
    )
    await expect(
      prisma.category.findUnique({ where: { id: deplacee.id } })
    ).resolves.toMatchObject({ parentId: null })
    expectNoEffects(effets)
  })

  it("refuse une modification dont la nouvelle parente porte déjà un cycle", async () => {
    const effets = effectSpies()
    const deplacee = await createCategory(
      makeCategoryInput({ slug: categorySlug("corrompu-deplacee") })
    )
    const a = await createCategory(
      makeCategoryInput({ slug: categorySlug("corrompu-a") })
    )
    const b = await createCategory(
      makeCategoryInput({ slug: categorySlug("corrompu-b") })
    )
    const c = await createCategory(
      makeCategoryInput({ slug: categorySlug("corrompu-c") })
    )
    await planterUnCycleEnBase([a.id, b.id, c.id])

    const avant = Date.now()
    const refus: unknown = await refusDe(
      updateCategory(
        deplacee.id,
        makeCategoryInput({
          slug: categorySlug("corrompu-deplacee"),
          parentId: a.id,
        }),
        effets
      )
    )

    expect(refus).toBeInstanceOf(CategoryAncestorCycleError)
    expect(refus).toBeInstanceOf(UserFacingError)
    expect(refus).not.toBeInstanceOf(CategoryValidationError)
    expect(refus).not.toBeInstanceOf(Prisma.PrismaClientKnownRequestError)
    expect((refus as Error).message).toContain(
      "Refus de la Structure : la chaîne d'ancêtres choisie porte déjà un cycle"
    )
    expect((refus as Error).message).toContain("l'arête")
    expect((refus as Error).message).not.toMatch(/^Données invalides :/)
    expect(Date.now() - avant).toBeLessThan(DELAI_VERROU_STRUCTURE_MS)

    await expect(
      prisma.category.findUnique({ where: { id: deplacee.id } })
    ).resolves.toMatchObject({ parentId: null })
    await expect(
      prisma.category.findUnique({ where: { id: a.id } })
    ).resolves.toMatchObject({ parentId: b.id })
    expectNoEffects(effets)
  })

  it("throws CategoryNotFoundError when updating an unknown category", async () => {
    await expect(
      updateCategory("unknown-id", makeCategoryInput())
    ).rejects.toThrow(CategoryNotFoundError)
  })

  it("ferme la course de cycle par deux modifications concurrentes", async () => {
    const effets = effectSpies()
    const racineA = await createCategory(
      makeCategoryInput({ slug: categorySlug("cyc-race-a") })
    )
    const racineB = await createCategory(
      makeCategoryInput({ slug: categorySlug("cyc-race-b") })
    )

    const modifications = [
      updateCategory(
        racineA.id,
        makeCategoryInput({
          slug: categorySlug("cyc-race-a"),
          parentId: racineB.id,
        }),
        effets
      ),
      updateCategory(
        racineB.id,
        makeCategoryInput({
          slug: categorySlug("cyc-race-b"),
          parentId: racineA.id,
        }),
        effets
      ),
    ]
    const issues = await Promise.allSettled(modifications)

    const reussites = issues.filter((issue) => issue.status === "fulfilled")
    const refus = issues.filter((issue) => issue.status === "rejected")
    expect(reussites).toHaveLength(1)
    expect(refus).toHaveLength(1)
    const raison = (refus[0] as PromiseRejectedResult).reason
    expect(raison).toBeInstanceOf(CategoryValidationError)
    expect((raison as Error).message).toBe(
      "Données invalides : une catégorie ne peut pas être déplacée sous l'une de ses propres descendantes"
    )

    const apres = await prisma.category.findMany({
      where: { id: { in: [racineA.id, racineB.id] } },
      select: { id: true, parentId: true },
    })
    const parentIdA = apres.find((c) => c.id === racineA.id)?.parentId ?? null
    const parentIdB = apres.find((c) => c.id === racineB.id)?.parentId ?? null
    expect(
      [parentIdA, parentIdB].filter((parent) => parent !== null)
    ).toHaveLength(1)
    expect(
      [parentIdA, parentIdB].filter((parent) => parent === null)
    ).toHaveLength(1)

    expect(effets.revalidateCategories).toHaveBeenCalledOnce()
    expect(effets.reindexProducts).not.toHaveBeenCalled()
    expect(effets.deleteImage).not.toHaveBeenCalled()
  })

  it("sérialise deux modifications concurrentes de la même Structure", async () => {
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("upd-concurrent") })
    )

    let tierceVerrouillee = false
    const { transaction, liberer } = retenirTransaction(
      async (tx, liberation) => {
        await tx.$queryRawUnsafe(`SELECT id FROM "Category" FOR UPDATE`)
        tierceVerrouillee = true
        await liberation
        await tx.category.delete({ where: { id: category.id } })
      }
    )
    await attendreQue(() => tierceVerrouillee)

    const effets = effectSpies()
    const modification = updateCategory(
      category.id,
      makeCategoryInput({
        slug: categorySlug("upd-concurrent"),
        name: "Après",
      }),
      effets
    )
    modification.catch(() => {})
    await attendre(200)
    liberer()
    await transaction

    await expect(modification).rejects.toBeInstanceOf(CategoryNotFoundError)
    expectNoEffects(effets)
  })

  it("rejette le slug déjà pris par une modification concurrente", async () => {
    const effets = effectSpies()
    const premiere = await createCategory(
      makeCategoryInput({ slug: categorySlug("slug-race-a") })
    )
    const seconde = await createCategory(
      makeCategoryInput({ slug: categorySlug("slug-race-b") })
    )
    const slugPartage = categorySlug("slug-race-partage")

    const modifications = [
      updateCategory(
        premiere.id,
        makeCategoryInput({ slug: slugPartage, name: "Première" }),
        effets
      ),
      updateCategory(
        seconde.id,
        makeCategoryInput({ slug: slugPartage, name: "Seconde" }),
        effets
      ),
    ]
    const issues = await Promise.allSettled(modifications)

    const reussites = issues.filter((issue) => issue.status === "fulfilled")
    const refus = issues.filter((issue) => issue.status === "rejected")
    expect(reussites).toHaveLength(1)
    expect(refus).toHaveLength(1)
    expect((refus[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      CategorySlugConflictError
    )

    await expect(
      prisma.category.count({ where: { slug: slugPartage } })
    ).resolves.toBe(1)
  })

  it("deletes an empty category and revalidates", async () => {
    const revalidateCategories = vi.fn()
    const reindexProducts = vi.fn()
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("delete-empty") })
    )

    await deleteCategory(
      category.id,
      {},
      {
        revalidateCategories,
        reindexProducts,
      }
    )

    await expect(
      prisma.category.findUnique({ where: { id: category.id } })
    ).resolves.toBeNull()
    expect(revalidateCategories).toHaveBeenCalled()
    expect(reindexProducts).not.toHaveBeenCalled()
  })

  it("deletes the category image through effects when present", async () => {
    const deleteImage = vi.fn()
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-img") })
    )

    await deleteCategory(category.id, {}, { deleteImage })

    expect(deleteImage).toHaveBeenCalledOnce()
    expect(deleteImage).toHaveBeenCalledWith("https://example.com/cat.jpg")
  })

  it("does not delete any image when the deleted category has none", async () => {
    const deleteImage = vi.fn()
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-no-img"), image: null })
    )

    await deleteCategory(category.id, {}, { deleteImage })

    expect(deleteImage).not.toHaveBeenCalled()
  })

  it("supprime avec les effets par défaut quand aucune surcharge n'est fournie", async () => {
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-default") })
    )
    sendMock.mockClear()
    vi.mocked(revalidatePath).mockClear()

    await deleteCategory(category.id)

    await expect(
      prisma.category.findUnique({ where: { id: category.id } })
    ).resolves.toBeNull()
    expect(sendMock).toHaveBeenCalledOnce()
    expect(revalidatePath).toHaveBeenCalledWith("/admin/categories")
  })

  it("blocks deletion of a category that still has children", async () => {
    const effets = effectSpies()
    const parent = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-parent") })
    )
    const child = await createCategory(
      makeCategoryInput({
        slug: categorySlug("del-child"),
        parentId: parent.id,
      })
    )

    await expect(deleteCategory(parent.id, {}, effets)).rejects.toThrow(
      CategoryHasChildrenError
    )

    await expect(
      prisma.category.findUnique({ where: { id: parent.id } })
    ).resolves.not.toBeNull()
    await expect(
      prisma.category.findUnique({ where: { id: child.id } })
    ).resolves.not.toBeNull()
    expectNoEffects(effets)
  })

  it("blocks deletion of a category that still has products", async () => {
    const effets = effectSpies()
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-prods") })
    )
    const product = await makeProductIn(category, "blocked", "Produit bloqué")

    await expect(deleteCategory(category.id, {}, effets)).rejects.toThrow(
      CategoryHasProductsError
    )
    await expect(
      prisma.category.findUnique({ where: { id: category.id } })
    ).resolves.not.toBeNull()
    await expect(
      prisma.product.findUnique({ where: { id: product.id } })
    ).resolves.toMatchObject({ categoryId: category.id })
    expectNoEffects(effets)
  })

  it("reassigns products to a target category when deleting", async () => {
    const reindexProducts = vi.fn()
    const revalidateCategories = vi.fn()
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-reassign") })
    )
    const target = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-target") })
    )
    const product = await makeProductIn(category, "moved", "Produit déplacé")

    await deleteCategory(
      category.id,
      { reassignToCategoryId: target.id },
      { reindexProducts, revalidateCategories }
    )

    await expect(
      prisma.category.findUnique({ where: { id: category.id } })
    ).resolves.toBeNull()
    const moved = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    })
    expect(moved.categoryId).toBe(target.id)
    expect(reindexProducts).toHaveBeenCalledWith([
      expect.objectContaining({
        id: product.id,
        categorySlug: target.slug,
        categoryName: target.name,
      }),
    ])
    expect(revalidateCategories).toHaveBeenCalled()
  })

  it("laisse les Produits sans Structure quand l'éditeur le demande", async () => {
    const reindexProducts = vi.fn()
    const revalidateCategories = vi.fn()
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-orphelin") })
    )
    const product = await makeProductIn(
      category,
      "sans-structure",
      "Produit sans Structure"
    )

    await deleteCategory(
      category.id,
      { orphanProducts: true },
      { reindexProducts, revalidateCategories }
    )

    await expect(
      prisma.category.findUnique({ where: { id: category.id } })
    ).resolves.toBeNull()
    const survivant = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    })
    expect(survivant.categoryId).toBeNull()

    const [document] = reindexProducts.mock.calls[0]![0] as [
      Record<string, unknown>[],
    ]
    expect(document).toMatchObject({
      id: product.id,
      categorySlug: SLUG_SANS_STRUCTURE,
      categoryName: LIBELLE_SANS_STRUCTURE,
    })
    expect(document).not.toHaveProperty("categoryId")
    expect(revalidateCategories).toHaveBeenCalled()
  })

  it("refuse encore une Structure qui a des Produits quand personne n'a choisi", async () => {
    const effets = effectSpies()
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-refus-defaut") })
    )
    const product = await makeProductIn(category, "refus", "Produit refusé")

    await expect(
      deleteCategory(category.id, {}, effets)
    ).rejects.toBeInstanceOf(CategoryHasProductsError)

    await expect(
      prisma.category.findUnique({ where: { id: category.id } })
    ).resolves.not.toBeNull()
    await expect(
      prisma.product.findUnique({ where: { id: product.id } })
    ).resolves.toMatchObject({ categoryId: category.id })
    expectNoEffects(effets)
  })

  it("fait prévaloir la réaffectation quand l'orphelinat est demandé aussi", async () => {
    const reindexProducts = vi.fn()
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-contradictoire") })
    )
    const target = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-contradictoire-cible") })
    )
    const product = await makeProductIn(category, "contradictoire", "Produit")

    await deleteCategory(
      category.id,
      { orphanProducts: true, reassignToCategoryId: target.id },
      { reindexProducts, revalidateCategories: vi.fn() }
    )

    await expect(
      prisma.product.findUniqueOrThrow({ where: { id: product.id } })
    ).resolves.toMatchObject({ categoryId: target.id })
    expect(reindexProducts).toHaveBeenCalledWith([
      expect.objectContaining({ categorySlug: target.slug }),
    ])
  })

  it("rattache les sous-catégories à la Structure d'accueil choisie avant de supprimer la Structure source", async () => {
    const reindexProducts = vi.fn()
    const revalidateCategories = vi.fn()
    const parent = await createCategory(
      makeCategoryInput({ slug: categorySlug("rep-parent") })
    )
    const accueil = await createCategory(
      makeCategoryInput({ slug: categorySlug("rep-accueil") })
    )
    const enfant = await createCategory(
      makeCategoryInput({
        slug: categorySlug("rep-enfant"),
        parentId: parent.id,
      })
    )

    await deleteCategory(
      parent.id,
      { reparentChildrenToCategoryId: accueil.id },
      { reindexProducts, revalidateCategories }
    )

    await expect(
      prisma.category.findUnique({ where: { id: parent.id } })
    ).resolves.toBeNull()
    await expect(
      prisma.category.findUniqueOrThrow({ where: { id: enfant.id } })
    ).resolves.toMatchObject({ parentId: accueil.id })
    expect(reindexProducts).not.toHaveBeenCalled()
    expect(revalidateCategories).toHaveBeenCalled()
  })

  it("ne déplace les sous-catégories qu'après le commit, quand les effets partent", async () => {
    const parent = await createCategory(
      makeCategoryInput({ slug: categorySlug("rep-post-commit") })
    )
    const accueil = await createCategory(
      makeCategoryInput({ slug: categorySlug("rep-post-commit-accueil") })
    )
    const enfant = await createCategory(
      makeCategoryInput({
        slug: categorySlug("rep-post-commit-enfant"),
        parentId: parent.id,
      })
    )

    const releves: ReleveReattribution[] = []
    const relever = async (effet: string) => {
      const source = await prisma.category.findUnique({
        where: { id: parent.id },
      })
      const deplace = await prisma.category.findUnique({
        where: { id: enfant.id },
      })
      releves.push({
        effet,
        structureSourcePresente: source !== null,
        parenteEnfant: deplace?.parentId ?? null,
      })
    }
    const revalidateCategories = vi.fn(async () => {
      await relever("invalidation")
    })

    await deleteCategory(
      parent.id,
      { reparentChildrenToCategoryId: accueil.id },
      { revalidateCategories, deleteImage: vi.fn(), reindexProducts: vi.fn() }
    )

    expect(releves).toEqual([
      {
        effet: "invalidation",
        structureSourcePresente: false,
        parenteEnfant: accueil.id,
      },
    ])
  })

  it("refuse de rattacher les sous-catégories à l'une d'elles, sans écriture ni effet", async () => {
    const effets = effectSpies()
    const parent = await createCategory(
      makeCategoryInput({ slug: categorySlug("rep-descendante") })
    )
    const enfant = await createCategory(
      makeCategoryInput({
        slug: categorySlug("rep-descendante-enfant"),
        parentId: parent.id,
      })
    )

    await verifierRefusValidation(CategoryValidationError, () =>
      deleteCategory(
        parent.id,
        { reparentChildrenToCategoryId: enfant.id },
        effets
      )
    )

    await expect(
      prisma.category.findUnique({ where: { id: parent.id } })
    ).resolves.not.toBeNull()
    await expect(
      prisma.category.findUnique({ where: { id: enfant.id } })
    ).resolves.toMatchObject({ parentId: parent.id })
    expectNoEffects(effets)
  })

  it("refuse de rattacher les sous-catégories à une Structure d'accueil inconnue, sans écriture ni effet", async () => {
    const effets = effectSpies()
    const parent = await createCategory(
      makeCategoryInput({ slug: categorySlug("rep-inconnu") })
    )
    const enfant = await createCategory(
      makeCategoryInput({
        slug: categorySlug("rep-inconnu-enfant"),
        parentId: parent.id,
      })
    )

    await verifierRefusValidation(CategoryValidationError, () =>
      deleteCategory(
        parent.id,
        { reparentChildrenToCategoryId: "unknown" },
        effets
      )
    )

    await expect(
      prisma.category.findUnique({ where: { id: parent.id } })
    ).resolves.not.toBeNull()
    await expect(
      prisma.category.findUnique({ where: { id: enfant.id } })
    ).resolves.toMatchObject({ parentId: parent.id })
    expectNoEffects(effets)
  })

  it("refuse de rattacher les sous-catégories à une Structure dont la chaîne porte déjà un cycle", async () => {
    const effets = effectSpies()
    const source = await createCategory(
      makeCategoryInput({ slug: categorySlug("rep-cyc-source") })
    )
    const enfant = await createCategory(
      makeCategoryInput({
        slug: categorySlug("rep-cyc-enfant"),
        parentId: source.id,
      })
    )
    const a = await createCategory(
      makeCategoryInput({ slug: categorySlug("rep-cyc-a") })
    )
    const b = await createCategory(
      makeCategoryInput({ slug: categorySlug("rep-cyc-b") })
    )
    await planterUnCycleEnBase([a.id, b.id])

    const avant = Date.now()
    const refus: unknown = await refusDe(
      deleteCategory(source.id, { reparentChildrenToCategoryId: a.id }, effets)
    )

    expect(refus).toBeInstanceOf(CategoryAncestorCycleError)
    expect(refus).toBeInstanceOf(UserFacingError)
    expect(refus).not.toBeInstanceOf(Prisma.PrismaClientKnownRequestError)
    expect((refus as Error).message).toContain(
      "Refus de la Structure : la chaîne d'ancêtres choisie porte déjà un cycle"
    )
    expect((refus as Error).message).toContain("l'arête")
    expect(Date.now() - avant).toBeLessThan(DELAI_VERROU_STRUCTURE_MS)

    await expect(
      prisma.category.findUnique({ where: { id: source.id } })
    ).resolves.not.toBeNull()
    await expect(
      prisma.category.findUnique({ where: { id: enfant.id } })
    ).resolves.toMatchObject({ parentId: source.id })
    await expect(
      prisma.category.findUnique({ where: { id: a.id } })
    ).resolves.toMatchObject({ parentId: b.id })
    expectNoEffects(effets)
  })

  it("ne déclenche les effets de la suppression qu'après le commit, dans leur ordre", async () => {
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-post-commit") })
    )
    const target = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-post-commit-cible") })
    )
    const product = await makeProductIn(
      category,
      "post-commit",
      "Produit engagé"
    )

    const releves: ReleveEffet[] = []
    const relever = async (effet: string) => {
      const source = await prisma.category.findUnique({
        where: { id: category.id },
      })
      const deplace = await prisma.product.findUnique({
        where: { id: product.id },
      })
      expect(source).toBeNull()
      expect(deplace).toMatchObject({ categoryId: target.id })
      releves.push({
        effet,
        structureSourcePresente: source !== null,
        categorieDuProduit: deplace?.categoryId ?? null,
      })
    }
    const reindexProducts = vi.fn(async () => {
      await relever("réindexation")
    })
    const deleteImage = vi.fn(async () => {
      await relever("image")
    })
    const revalidateCategories = vi.fn(async () => {
      await relever("invalidation")
    })

    await deleteCategory(
      category.id,
      { reassignToCategoryId: target.id },
      { reindexProducts, deleteImage, revalidateCategories }
    )

    expect(releves).toEqual([
      {
        effet: "réindexation",
        structureSourcePresente: false,
        categorieDuProduit: target.id,
      },
      {
        effet: "image",
        structureSourcePresente: false,
        categorieDuProduit: target.id,
      },
      {
        effet: "invalidation",
        structureSourcePresente: false,
        categorieDuProduit: target.id,
      },
    ])
    expect(reindexProducts).toHaveBeenCalledWith([
      expect.objectContaining({
        id: product.id,
        categorySlug: target.slug,
        categoryName: target.name,
      }),
    ])
    expect(deleteImage).toHaveBeenCalledWith("https://example.com/cat.jpg")
  })

  it("attend la transaction tierce au verrou grossier, voit son Produit fantôme et le réaffecte", async () => {
    const effets = effectSpies()
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-attente") })
    )
    const target = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-attente-cible") })
    )
    const product = await makeProductIn(
      category,
      "attente",
      "Produit réaffecté"
    )

    const { transaction, liberer } = retenirTransaction((tx) =>
      tx.product.create({
        data: {
          name: "Produit fantôme",
          slug: productSlug("fantome"),
          description: "desc",
          brand: "Marque",
          price: 10000,
          specs: {},
          images: [],
          categoryId: category.id,
        },
      })
    )
    await attendre(150)

    const suppression = deleteCategory(
      category.id,
      { reassignToCategoryId: target.id },
      effets
    )
    suppression.catch(() => {})
    await attendre(400)
    liberer()
    await expect(suppression).resolves.toBeUndefined()
    await transaction

    await expect(
      prisma.category.findUnique({ where: { id: category.id } })
    ).resolves.toBeNull()
    await expect(
      prisma.product.findUnique({ where: { id: product.id } })
    ).resolves.toMatchObject({ categoryId: target.id })
    await expect(
      prisma.product.findUnique({ where: { slug: productSlug("fantome") } })
    ).resolves.toMatchObject({ categoryId: target.id })
    expect(effets.reindexProducts).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: product.id, categorySlug: target.slug }),
        expect.objectContaining({
          slug: productSlug("fantome"),
          categorySlug: target.slug,
        }),
      ])
    )
    expect(effets.deleteImage).toHaveBeenCalledWith(
      "https://example.com/cat.jpg"
    )
    expect(effets.revalidateCategories).toHaveBeenCalled()
  })

  it("sérialise deux suppressions concurrentes de la même Structure", async () => {
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-concurrent") })
    )
    const premierEffets = effectSpies()
    const secondEffets = effectSpies()

    const resultats = await Promise.allSettled([
      deleteCategory(category.id, {}, premierEffets),
      deleteCategory(category.id, {}, secondEffets),
    ])

    const abouties = resultats.filter(
      (resultat): resultat is PromiseFulfilledResult<void> =>
        resultat.status === "fulfilled"
    )
    const refusee = resultats.find(
      (resultat): resultat is PromiseRejectedResult =>
        resultat.status === "rejected"
    )
    expect(abouties).toHaveLength(1)
    expect(refusee?.reason).toBeInstanceOf(CategoryNotFoundError)

    await expect(
      prisma.category.findUnique({ where: { id: category.id } })
    ).resolves.toBeNull()
    const effetsQuiOntParti = [premierEffets, secondEffets].filter(
      (effets) => effets.revalidateCategories.mock.calls.length > 0
    )
    expect(effetsQuiOntParti).toHaveLength(1)
    expect(effetsQuiOntParti[0]?.deleteImage).toHaveBeenCalledOnce()
  })

  it("traduit le dépassement du délai de verrou en Refus de la Structure", async () => {
    const effets = effectSpies()
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-contention") })
    )
    const target = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-contention-cible") })
    )
    const product = await makeProductIn(
      category,
      "contention",
      "Produit déplacé"
    )

    const { transaction, liberer } = retenirTransaction((tx) =>
      tx.$queryRawUnsafe(
        `SELECT id FROM "Product" WHERE id = $1 FOR UPDATE`,
        product.id
      )
    )
    await attendre(150)

    const refus: unknown = await refusDe(
      deleteCategory(category.id, { reassignToCategoryId: target.id }, effets)
    )
    liberer()
    await transaction

    expect(refus).toBeInstanceOf(CategoryBusyError)
    expect(refus).toBeInstanceOf(UserFacingError)
    expect(refus).not.toBeInstanceOf(Prisma.PrismaClientKnownRequestError)
    expect((refus as Error).message).toBe(
      "la Structure est en cours de modification, réessayez"
    )
    await expect(
      prisma.category.findUnique({ where: { id: category.id } })
    ).resolves.not.toBeNull()
    await expect(
      prisma.product.findUnique({ where: { id: product.id } })
    ).resolves.toMatchObject({ categoryId: category.id })
    expectNoEffects(effets)
  })

  it("traduit une violation de clé étrangère en Refus de la Structure", async () => {
    const effets = effectSpies()
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-fk") })
    )
    const target = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-fk-cible") })
    )
    const product = await makeProductIn(category, "fk", "Produit déplacé")

    const superutilisateur = await prisma.$queryRawUnsafe<
      { superuser: boolean }[]
    >(`SELECT rolsuper AS superuser FROM pg_roles WHERE rolname = current_user`)
    expect(
      superutilisateur[0]?.superuser,
      "cette épreuve écrit sans déclencher la clé étrangère : la base de test doit appartenir à un superutilisateur, comme celle de docker-compose et de la CI"
    ).toBe(true)

    const { transaction, liberer } = retenirTransaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL session_replication_role = 'replica'`
      )
      await tx.$queryRawUnsafe(
        `SELECT id FROM "Product" WHERE id = $1 FOR UPDATE`,
        product.id
      )
      await tx.product.create({
        data: {
          name: "Produit fantôme",
          slug: productSlug("fk-fantome"),
          description: "desc",
          brand: "Marque",
          price: 10000,
          specs: {},
          images: [],
          categoryId: category.id,
        },
      })
    })
    await attendre(150)

    const suppression = deleteCategory(
      category.id,
      { reassignToCategoryId: target.id },
      effets
    )
    suppression.catch(() => {})
    await attendre(200)
    const avantCommit = Date.now()
    liberer()

    await expect(suppression).rejects.toBeInstanceOf(CategoryBusyError)
    expect(Date.now() - avantCommit).toBeLessThan(DELAI_VERROU_STRUCTURE_MS)
    await transaction
    await expect(
      prisma.category.findUnique({ where: { id: category.id } })
    ).resolves.not.toBeNull()
    await expect(
      prisma.product.findUnique({ where: { id: product.id } })
    ).resolves.toMatchObject({ categoryId: category.id })
    expectNoEffects(effets)
  })

  it("traduit l'expiration de la transaction en Refus de la Structure", async () => {
    const effets = effectSpies()
    const { tenues, liberer } = await saturerLePoolDeConnexions()

    const avant = Date.now()
    let refus: unknown
    try {
      refus = await refusDe(
        createCategory(
          makeCategoryInput({ slug: categorySlug("p2028") }),
          effets
        )
      )
    } finally {
      liberer()
      await Promise.all(tenues)
    }
    const attente = Date.now() - avant

    expect(refus).toBeInstanceOf(CategoryTransactionExpiredError)
    expect(refus).toBeInstanceOf(UserFacingError)
    expect(refus).not.toBeInstanceOf(Prisma.PrismaClientKnownRequestError)
    expect((refus as Error).message).toBe(
      "Refus de la Structure : la transaction a dépassé son délai"
    )
    expect(attente).toBeGreaterThanOrEqual(1_900)
    expect(attente).toBeLessThan(4_000)
    await expect(
      prisma.category.findUnique({ where: { slug: categorySlug("p2028") } })
    ).resolves.toBeNull()
    expectNoEffects(effets)
  })

  it("refuse encore, avec `orphanProducts`, la course d'une Tierce partie — puis orpheline au réessai", async () => {
    const effets = effectSpies()
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-fk-orphelin") })
    )
    const product = await makeProductIn(
      category,
      "fk-orphelin",
      "Produit visible"
    )

    const superutilisateur = await prisma.$queryRawUnsafe<
      { superuser: boolean }[]
    >(`SELECT rolsuper AS superuser FROM pg_roles WHERE rolname = current_user`)
    expect(superutilisateur[0]?.superuser).toBe(true)

    const { transaction, liberer } = retenirTransaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL session_replication_role = 'replica'`
      )
      await tx.$queryRawUnsafe(
        `SELECT id FROM "Product" WHERE id = $1 FOR UPDATE`,
        product.id
      )
      await tx.product.create({
        data: {
          name: "Produit fantôme",
          slug: productSlug("fk-orphelin-fantome"),
          description: "desc",
          brand: "Marque",
          price: 10000,
          specs: {},
          images: [],
          categoryId: category.id,
        },
      })
    })
    await attendre(150)

    const suppression = deleteCategory(
      category.id,
      { orphanProducts: true },
      effets
    )
    suppression.catch(() => {})
    await attendre(200)
    liberer()

    await expect(suppression).rejects.toBeInstanceOf(CategoryBusyError)
    await transaction
    await expect(
      prisma.category.findUnique({ where: { id: category.id } })
    ).resolves.not.toBeNull()
    await expect(
      prisma.product.findUnique({ where: { id: product.id } })
    ).resolves.toMatchObject({ categoryId: category.id })
    expectNoEffects(effets)

    await deleteCategory(category.id, { orphanProducts: true }, effets)

    await expect(
      prisma.category.findUnique({ where: { id: category.id } })
    ).resolves.toBeNull()
    for (const slug of [
      productSlug("fk-orphelin"),
      productSlug("fk-orphelin-fantome"),
    ]) {
      await expect(
        prisma.product.findUnique({ where: { slug } })
      ).resolves.toMatchObject({ categoryId: null })
    }
    expect(effets.reindexProducts).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ categorySlug: SLUG_SANS_STRUCTURE }),
      ])
    )
  })

  it("laisse l'insertion d'un Produit mourir du côté Catalogue quand la suppression tient déjà le verrou", async () => {
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-symetrique") })
    )

    const { transaction, liberer } = retenirTransaction(async (tx) => {
      await tx.$queryRawUnsafe(`SELECT id FROM "Category" FOR UPDATE`)
      await tx.category.delete({ where: { id: category.id } })
    })
    await attendre(150)

    const insertion = createProduct(
      {
        name: "Produit tardif",
        slug: productSlug("symetrique"),
        description: "desc",
        brand: "Marque",
        price: 10000,
        specs: {},
        images: [],
        isFeatured: false,
        featuredOrder: 0,
        freeShipping: false,
        categoryId: category.id,
        variants: [
          {
            name: "Standard",
            sku: `SKU-${runId}-sym`,
            priceDelta: 0,
            stock: 1,
          },
        ],
      },
      {
        reindexProducts: vi.fn(),
        removeProductFromIndex: vi.fn(),
        revalidateCatalog: vi.fn(),
        deleteImages: vi.fn(),
      }
    )
    insertion.catch(() => {})
    await attendre(200)
    liberer()
    await transaction

    const refus: unknown = await refusDe(insertion)
    expect(refus).toBeInstanceOf(Prisma.PrismaClientKnownRequestError)
    expect(refus).not.toBeInstanceOf(UserFacingError)
    await expect(
      prisma.product.findUnique({ where: { slug: productSlug("symetrique") } })
    ).resolves.toBeNull()
  })

  it("borne au délai l'attente du verrou grossier lui-même", async () => {
    const effets = effectSpies()
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-borne") })
    )

    await eprouverLeDelaiDeVerrou(() => deleteCategory(category.id, {}, effets))

    await expect(
      prisma.category.findUnique({ where: { id: category.id } })
    ).resolves.not.toBeNull()
    expectNoEffects(effets)
  })

  it("coupe au délai de verrou le cycle que l'ordre inverse des verrous pourrait former", async () => {
    const effets = effectSpies()
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-interblocage") })
    )
    const target = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-interblocage-cible") })
    )
    const product = await makeProductIn(
      category,
      "interblocage",
      "Produit déplacé"
    )

    const { transaction, liberer } = retenirTransaction(
      async (tx, liberation) => {
        await tx.$queryRawUnsafe(
          `SELECT id FROM "Product" WHERE id = $1 FOR UPDATE`,
          product.id
        )
        await liberation
        await tx.$queryRawUnsafe(
          `SELECT id FROM "Category" WHERE id = $1 FOR KEY SHARE`,
          category.id
        )
      }
    )
    await attendre(150)

    const suppression = deleteCategory(
      category.id,
      { reassignToCategoryId: target.id },
      effets
    )
    suppression.catch(() => {})
    await attendre(200)
    liberer()
    await transaction.catch(() => {})

    await expect(suppression).rejects.toBeInstanceOf(CategoryBusyError)
    await expect(
      prisma.category.findUnique({ where: { id: category.id } })
    ).resolves.not.toBeNull()
    await expect(
      prisma.product.findUnique({ where: { id: product.id } })
    ).resolves.toMatchObject({ categoryId: category.id })
    expectNoEffects(effets)
  })

  it("journalise une panne de réindexation sans rejeter la suppression committée", async () => {
    const deleteImage = vi.fn()
    const revalidateCategories = vi.fn()
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-reindex-panne") })
    )
    const target = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-reindex-panne-cible") })
    )
    const product = await makeProductIn(
      category,
      "reindex-panne",
      "Produit indexé ailleurs"
    )

    await verifierFrontiereBestEffort("réindexation", (effetQuiEchoue) =>
      deleteCategory(
        category.id,
        { reassignToCategoryId: target.id },
        { reindexProducts: effetQuiEchoue, deleteImage, revalidateCategories }
      )
    )

    await expect(
      prisma.category.findUnique({ where: { id: category.id } })
    ).resolves.toBeNull()
    await expect(
      prisma.product.findUnique({ where: { id: product.id } })
    ).resolves.toMatchObject({ categoryId: target.id })
    expect(revalidateCategories).toHaveBeenCalledOnce()
  })

  it("journalise une panne de suppression d'image sans rejeter la suppression committée", async () => {
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-img-panne") })
    )

    await verifierFrontiereBestEffort("suppression d'image", (effetQuiEchoue) =>
      deleteCategory(category.id, {}, { deleteImage: effetQuiEchoue })
    )

    await expect(
      prisma.category.findUnique({ where: { id: category.id } })
    ).resolves.toBeNull()
  })

  it("journalise une panne d'invalidation de cache sans rejeter la suppression committée", async () => {
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-cache-panne"), image: null })
    )

    await verifierFrontiereBestEffort("invalidation", (effetQuiEchoue) =>
      deleteCategory(category.id, {}, { revalidateCategories: effetQuiEchoue })
    )

    await expect(
      prisma.category.findUnique({ where: { id: category.id } })
    ).resolves.toBeNull()
  })

  it("refuse la réaffectation vers la Structure supprimée elle-même, sans écriture ni effet", async () => {
    const effets = effectSpies()
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-self-target") })
    )
    const product = await makeProductIn(
      category,
      "self-target",
      "Produit non déplacé"
    )

    await verifierRefusValidation(CategoryValidationError, () =>
      deleteCategory(category.id, { reassignToCategoryId: category.id }, effets)
    )

    await expect(
      prisma.category.findUnique({ where: { id: category.id } })
    ).resolves.not.toBeNull()
    await expect(
      prisma.product.findUnique({ where: { id: product.id } })
    ).resolves.toMatchObject({ categoryId: category.id })
    expectNoEffects(effets)
  })

  it("refuse une réaffectation inconnue sur une Structure qui n'a aucun Produit", async () => {
    const effets = effectSpies()
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-bad-target-vide") })
    )

    await verifierRefusValidation(CategoryValidationError, () =>
      deleteCategory(category.id, { reassignToCategoryId: "unknown" }, effets)
    )

    await expect(
      prisma.category.findUnique({ where: { id: category.id } })
    ).resolves.not.toBeNull()
    expectNoEffects(effets)
  })

  it("still persists the mutation when revalidation throws", async () => {
    const category = await verifierFrontiereBestEffort(
      "invalidation",
      (effetQuiEchoue) =>
        createCategory(
          makeCategoryInput({ slug: categorySlug("fail-cache") }),
          {
            revalidateCategories: effetQuiEchoue,
          }
        )
    )

    expect(category.name).toBe("Catégorie Test T3")
  })

  it("rejects reassigning products to an unknown target", async () => {
    const effets = effectSpies()
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-bad-target") })
    )
    const product = await makeProductIn(
      category,
      "bad-target",
      "Produit non déplacé"
    )

    await verifierRefusValidation(CategoryValidationError, () =>
      deleteCategory(category.id, { reassignToCategoryId: "unknown" }, effets)
    )

    await expect(
      prisma.category.findUnique({ where: { id: category.id } })
    ).resolves.not.toBeNull()
    await expect(
      prisma.product.findUnique({ where: { id: product.id } })
    ).resolves.toMatchObject({ categoryId: category.id })
    expectNoEffects(effets)
  })

  it("throws CategoryNotFoundError when deleting an unknown category", async () => {
    const effets = effectSpies()

    await expect(deleteCategory("unknown-id", {}, effets)).rejects.toThrow(
      CategoryNotFoundError
    )

    expectNoEffects(effets)
  })
})
