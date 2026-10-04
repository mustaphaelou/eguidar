import { randomUUID } from "node:crypto"

import { revalidatePath } from "next/cache"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import { prisma } from "@/lib/db"
import { Prisma } from "@/lib/generated/prisma/client"
import { createProduct } from "@/lib/use-cases/admin-catalog"

// L'image d'une catégorie est une URL libre, hors du préfixe `products/` : elle
// ne passe que par l'opération de stockage réservée aux catégories. Ce mock
// court-circuite l'adaptateur pour éprouver l'effet best-effort de la
// Structure, qui doit journaliser une panne sans faire échouer la mutation.
// L'effet par défaut est éprouvé sans court-circuit dans
// `admin-structure-image-stockage.test.ts`.
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
  CategoryBusyError,
  CategoryHasChildrenError,
  CategoryHasProductsError,
  CategoryNotFoundError,
  CategorySlugConflictError,
  CategoryValidationError,
  DELAI_VERROU_STRUCTURE_MS,
  createCategory,
  deleteCategory,
  updateCategory,
  type CategoryInput,
} from "@/lib/use-cases/admin-structure"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"
import {
  verifierFrontiereBestEffort,
  verifierRefusValidation,
} from "@/test/mutation-squelette-recette"

const runId = randomUUID().slice(0, 8)
const categorySlug = (suffix: string) => `cat-${runId}-${suffix}`
const productSlug = (suffix: string) => `struc-${runId}-${suffix}`

/**
 * Ce qu'un effet observe de la base au moment précis où il s'exécute : relevé
 * à l'intérieur du callback, asserté à l'extérieur, car `runEffect` avale les
 * erreurs d'un effet — un `expect` jeté dans le callback ne ferait pas
 * échouer le test.
 */
interface ReleveEffet {
  effet: string
  structureSourcePresente: boolean
  categorieDuProduit: string | null
}

/**
 * Ce qu'un effet observe de la base quand la suppression a réattribué les
 * sous-catégories : la source doit déjà être absente et l'enfant déjà porté par
 * la Structure d'accueil choisie.
 */
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

/** Le Produit de test rattaché à la Structure donnée, sous son propre slug. */
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

/** Les trois effets de la Structure sous spy, pour prouver leur absence. */
function effectSpies() {
  return {
    reindexProducts: vi.fn(),
    revalidateCategories: vi.fn(),
    deleteImage: vi.fn(),
  }
}

/** Un refus ne publie rien : ni réindexation, ni suppression d'image, ni invalidation. */
function expectNoEffects(effets: ReturnType<typeof effectSpies>) {
  expect(effets.reindexProducts).not.toHaveBeenCalled()
  expect(effets.revalidateCategories).not.toHaveBeenCalled()
  expect(effets.deleteImage).not.toHaveBeenCalled()
}

/** Le repos réel qu'une épreuve de contention doit laisser à l'autre transaction. */
function attendre(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Une transaction tierce qui tient ses verrous et attend d'être libérée — le
 * motif que les épreuves de contention partagent. `tenir` reçoit le client de
 * la transaction et la porte de sortie : une tierce qui doit agir *après* le
 * signal — réclamer un verrou, par exemple — l'attend avant de rendre la main.
 *
 * Le délai d'attente n'est pas borné ici : c'est l'épreuve qui décide quand
 * une transaction en sort, et une transaction tierce qui meurt ne doit pas
 * faire échouer l'épreuve par son propre rejet.
 */
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

/**
 * Attendre qu'un signal soit posé, plutôt que dormir un temps arbitraire.
 *
 * Une épreuve de contention ne peut pas supposer qu'une transaction tierce a
 * pris son verrou après un sommeil fixe : sur une machine lente, la tierce peut
 * n'être pas encore verrouillée quand la mutation part, et l'épreuve mesure
 * alors autre chose que la contention — ou rate son verrou et se croit bornée
 * par le délai alors qu'elle ne l'a jamais attendu. Attendre le signal rend
 * l'épreuve honnête sur une machine lente comme sur une machine rapide.
 */
function attendreQue(acquis: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const verifier = () => (acquis() ? resolve() : setTimeout(verifier, 10))
    verifier()
  })
}

/**
 * L'attente qu'une mutation passe réellement derrière le verrou grossier,
 * mesurée par PostgreSQL et non supposée.
 *
 * Une Tierce partie qui garde ses lignes est `idle in transaction` : elle
 * n'attend rien. La mutation partie derrière elle est `active`, porte
 * `wait_event_type = 'Lock'` et exécute alors le `SELECT … FROM "Category" FOR
 * UPDATE` de `verrouillerStructure`. Les trois conditions ensemble sont ce qui
 * distingue « elle attend le verrou » de « elle n'est pas encore arrivée » : les
 * deux premières seules seraient vraies de n'importe quelle attente de verrou
 * de la base de test, y compris d'une autre.
 *
 * C'est ce que l'épreuve attend avant de relâcher la Tierce partie. Au bout
 * d'un temps fixe, elle prouverait peut-être une contention qui n'a pas eu
 * lieu, et le refus qu'elle observerait serait alors celui d'une course
 * qu'aucune des deux transactions n'a vue.
 */
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

/**
 * Le refus qu'une promesse rend, ou `undefined` si elle réussit.
 *
 * La forme est la même partout — `then` sur les deux voies — pour qu'une épreuve
 * dise toujours la même chose de l'issue : ce qu'elle a reçue, refus compris,
 * et non ce qu'elle a dû rattraper pour la voir.
 */
function refusDe(promesse: Promise<unknown>): Promise<unknown> {
  return promesse.then(
    () => undefined,
    (error: unknown) => error
  )
}

/**
 * L'épreuve du délai de verrou que les mutations de Structure partagent
 * (ADR-0027). La Tierce partie prend le verrou grossier et ne le rend pas,
 * `mutation` part derrière, et son refus doit tomber **dans** le délai — pas
 * après, ce qui distinguerait « encore en attente du verrou » de « refusée »
 * sans rien présumer du chemin qui l'a produit.
 *
 * Le refus rendu est un refus de la Structure, jamais une erreur de lecteur :
 * c'est ce qui fait que `adminFormAction` le rend à l'éditeur au lieu de le
 * relancer. Ce que la mutation laisse dans la base ne se dit pas ici — chaque
 * épreuve le lit dans ses propres termes.
 */
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

  // La mutation ne part qu'ici : une promesse déjà créée au moment de l'appel
  // s'exécuterait avant que la Tierce partie tienne quoi que ce soit, et
  // l'épreuve ne mesurerait plus rien.
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
    // Une Structure déjà là, donc des lignes que le verrou grossier peut
    // prendre : `SELECT … FOR UPDATE` sérialise sur les lignes existantes, et
    // l'Administration gère toujours un arbre déjà planté. Sans elle, la Tierce
    // partie tiendrait un verrou sur rien et l'épreuve ne mesurerait rien.
    await createCategory(
      makeCategoryInput({ slug: categorySlug("create-borne-racine") })
    )

    // La création est la mutation la plus simple de la Structure — une
    // insertion de racine ne pose aucune référence de clé étrangère, donc rien à
    // verrouiller d'elle-même — et c'est pourtant elle qu'une Tierce partie
    // Tenant le verrou grossier fait attendre, jusqu'au délai : personne n'y
    // échappe, pas même elle (ADR-0027). Sans le verrou, la création passerait
    // pendant que l'épreuve croit mesurer une contention.
    const slug = categorySlug("create-borne")
    await eprouverLeDelaiDeVerrou(() =>
      createCategory(makeCategoryInput({ slug }), effets)
    )

    // Rien n'a été écrit et aucun effet n'est parti : c'est un refus de
    // contention, pas une création.
    await expect(prisma.category.count({ where: { slug } })).resolves.toBe(0)
    expectNoEffects(effets)
  })

  it("refuse une Structure parente disparue entre la lecture et l'écriture", async () => {
    const effets = effectSpies()
    const parente = await createCategory(
      makeCategoryInput({ slug: categorySlug("create-parent-disparu") })
    )

    // La Tierce partie supprime la Structure d'accueil sous le verrou grossier
    // et retient son commit. La création part pendant ce retrait, et l'épreuve
    // ne relâche la Tierce partie qu'une fois PostgreSQL dit que la création
    // attend bel et bien le verrou : c'est cet ordre qui fait la différence,
    // pas un temps suffisant.
    //
    // Sans transaction, la création lirait un parent encore présent — la
    // suppression n'est pas committée — puis son écriture attendrait cette
    // suppression et mourrait sur `Category_parentId_fkey`, un
    // `PrismaClientKnownRequestError` que `adminFormAction` relance au lieu de
    // le rendre. Sous le verrou grossier, elle n'a encore rien lu quand elle
    // s'endort : elle se réveille sur une Structure qui n'existe plus et le dit
    // par un refus de validation (ADR-0027).
    const slug = categorySlug("create-enfant-disparu")
    const { transaction, liberer } = retenirTransaction(
      async (tx, liberation) => {
        await tx.$queryRawUnsafe(`SELECT id FROM "Category" FOR UPDATE`)
        await tx.category.delete({ where: { id: parente.id } })
        await liberation
      }
    )
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

    // Rien n'a été écrit, aucun effet n'est parti : le refus a précédé
    // l'engagement, il ne l'a pas annulé.
    await expect(prisma.category.count({ where: { slug } })).resolves.toBe(0)
    expectNoEffects(effets)
  })

  it("rejette le slug déjà pris par une création concurrente", async () => {
    const premierEffets = effectSpies()
    const secondEffets = effectSpies()
    const slugPartage = categorySlug("slug-course-partage")

    // Deux créations du même slug, parties ensemble : l'une gagne, l'autre se
    // fait refuser. L'épreuve ne mesure pas leur sérialisation — rien n'y
    // garantit qu'elles se soient croisées, et l'épreuve du délai l'a déjà
    // prouvée — elle garde la surface du refus : un slug concurrentiel reste
    // `CategorySlugConflictError`, le chemin que le formulaire rend à l'éditeur,
    // et la perdante ne publie rien.
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

    // Une seule Structure porte le slug, et la perdante n'a rien publié.
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
    // L'effet observe la base au moment précis où il s'exécute, et la Structure
    // doit y être déjà engagée : un effet qui partirait avant le commit
    // publierait une Structure que rien ne porte encore (ADR-0014).
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
    // L'effet par défaut doit rester visible : une panne R2 ne doit ni faire
    // échouer une mutation Structure engagée, ni disparaître en silence.
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

    await verifierRefusValidation(CategoryValidationError, () =>
      updateCategory(
        category.id,
        makeCategoryInput({
          slug: categorySlug("cycle-self"),
          parentId: category.id,
        })
      )
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

    await verifierRefusValidation(CategoryValidationError, () =>
      updateCategory(
        parent.id,
        makeCategoryInput({
          slug: categorySlug("cyc-a"),
          parentId: grandchild.id,
        })
      )
    )
  })

  it("throws CategoryNotFoundError when updating an unknown category", async () => {
    await expect(
      updateCategory("unknown-id", makeCategoryInput())
    ).rejects.toThrow(CategoryNotFoundError)
  })

  it("ferme la course de cycle par deux modifications concurrentes", async () => {
    // Deux racines indépendantes : les y faire traverser l'une sous l'autre,
    // puis l'autre sous la première, refermerait la bouche. Sans le verrou
    // grossier, les deux marches d'acyclicité liraient l'état d'avant l'une et
    // l'autre, et les deux écritures passeraient : la base porterait un cycle.
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

    // L'une passe, l'autre refuse : la marche d'acyclicité a lu sous le verrou
    // l'écriture committée de la première, et la referme.
    const reussites = issues.filter((issue) => issue.status === "fulfilled")
    const refus = issues.filter((issue) => issue.status === "rejected")
    expect(reussites).toHaveLength(1)
    expect(refus).toHaveLength(1)
    const raison = (refus[0] as PromiseRejectedResult).reason
    expect(raison).toBeInstanceOf(CategoryValidationError)
    expect((raison as Error).message).toBe(
      "Données invalides : une catégorie ne peut pas être déplacée sous l'une de ses propres descendantes"
    )

    // Aucun cycle : exactement une des deux porte l'autre, l'autre est restée
    // racine — les deux se porterait refermer la bouche.
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

    // Seule la gagnante a publié : la perdante s'est rétractée avant tout effet.
    expect(effets.revalidateCategories).toHaveBeenCalledOnce()
    expect(effets.reindexProducts).not.toHaveBeenCalled()
    expect(effets.deleteImage).not.toHaveBeenCalled()
  })

  it("sérialise deux modifications concurrentes de la même Structure", async () => {
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("upd-concurrent") })
    )

    // Une mutation tierce tient le verrou grossier et retient sa transaction :
    // la modification attend, puis lit une Structure qui n'existe plus. Sans le
    // verrou elle lirait la Structure encore présente, et sa mise à jour
    // finale mourrait sur une `P2025` de lecteur.
    let tierceVerrouillee = false
    const { transaction, liberer } = retenirTransaction(
      async (tx, liberation) => {
        await tx.$queryRawUnsafe(`SELECT id FROM "Category" FOR UPDATE`)
        tierceVerrouillee = true
        await liberation
        await tx.category.delete({ where: { id: category.id } })
      }
    )
    // Attendre que la tierce tienne le verrou avant de lancer la modification.
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

    // Les deux modifications visent le même slug : le verrou les sérialise, et
    // la seconde lit sous le verrou le slug committé par la première.
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

    // Une seule Structure porte le slug : l'autre est restée à son slug
    // d'origine — le verrou a sérialisé les deux, et la base n'en porte qu'un.
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

    // Nouvelle forme d'appel : les options métier sont en second rang avec
    // leur défaut, la couture d'effets reste en dernier — aucun `undefined`
    // pont n'est nécessaire pour appeler la suppression.
    await deleteCategory(category.id)

    await expect(
      prisma.category.findUnique({ where: { id: category.id } })
    ).resolves.toBeNull()
    // L'effet d'image par défaut part par la couture R2 — ici le mock de ce
    // fichier ; l'adaptateur réel est éprouvé, lui, dans
    // `admin-structure-image-stockage.test.ts`…
    expect(sendMock).toHaveBeenCalledOnce()
    // …et l'effet d'invalidation par défaut part aussi par sa couture.
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
    // L'enfant survit, sous une autre parente : c'est l'éditeur qui l'a voulu.
    await expect(
      prisma.category.findUniqueOrThrow({ where: { id: enfant.id } })
    ).resolves.toMatchObject({ parentId: accueil.id })
    // Un document indexé ne porte que la catégorie de son Produit : déplacer
    // une sous-catégorie ne réécrit donc aucun document, et n'appelle pas
    // Meilisearch.
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

    // Chaque effet relève l'état de la base par une connexion distincte de la
    // transaction : elle ne voit que des faits committés. Si un effet tournait
    // avant le commit, la Structure source existerait encore et le relevé le
    // dirait. L'assertion vit donc dans le callback — c'est lui qui prouve
    // l'ordre — mais son résultat est aussi relevé puis asserté à l'extérieur,
    // car `runEffect` avale les erreurs d'un effet.
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

    // Trois relevés identiques et dans l'ordre de la séquence : la Structure
    // source est déjà supprimée et le Produit déjà réaffecté quand le premier
    // effet part (ADR-0014).
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

    // Une transaction tierce insère un Produit fantôme sur la Structure
    // source et retient son commit : cette insertion non committée tient un
    // verrou `FOR KEY SHARE` sur la source, que le verrou grossier attend —
    // en première instruction qui verrouille, le `set_config` du délai n'en
    // prenant aucun.
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

    // Lancée sans l'attendre : la suppression part et se bloque sur le verrou
    // de clé étrangère que tient la transaction tierce.
    const suppression = deleteCategory(
      category.id,
      { reassignToCategoryId: target.id },
      effets
    )
    suppression.catch(() => {})
    await attendre(400)
    // La transaction tierce commit. La suppression reprend, lit sous READ
    // COMMITTED : le fantôme est visible, elle le réaffecte avec l'autre et
    // supprime la source. Le verrou a sérialisé les deux : plus aucune erreur,
    // et le Produit arrivé entre-temps ne s'est pas perdu.
    liberer()
    await expect(suppression).resolves.toBeUndefined()
    await transaction

    // Le fait ne s'est pas perdu : la source est retirée, les deux Produits
    // portent la cible, et la réindexation voit les deux.
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

    // Deux suppressions de la même Structure, parties ensemble. Le verrou
    // grossier les met en file : la seconde attend que la première ait
    // committé, puis lit une Structure qui n'existe plus et le dit. Sans le
    // verrou, les deux liraient la source encore présente et l'une des deux
    // mourrait sur une `P2025` de lecteur — l'entrelacement que la décision
    // ferme.
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

    // Une seule mutation a valu : une seule suppression d'image, une seule
    // invalidation, et rien pour celle qui s'est refusée.
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

    // Une transaction tierce tient un verrou de ligne sur un Produit de la
    // source : elle ne touche aucune Structure, donc le verrou grossier passe,
    // et c'est le déplacement des Produits qui attend. Le `lock_timeout` de la
    // transaction borne cette attente et la coupe.
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

    // Le perdant reçoit un refus, jamais une erreur de lecteur : c'est ce qui
    // fait que `adminFormAction` le rend au lieu de le relancer.
    expect(refus).toBeInstanceOf(CategoryBusyError)
    expect(refus).toBeInstanceOf(UserFacingError)
    expect(refus).not.toBeInstanceOf(Prisma.PrismaClientKnownRequestError)
    expect((refus as Error).message).toBe(
      "la Structure est en cours de modification, réessayez"
    )
    // Rien n'a été écrit : la source existe, le Produit n'a pas bougé, aucun
    // effet n'est parti.
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

    // La Tierce partie d'ADR-0027 : une écriture qui ne passe pas par cette
    // interface et ne prend donc pas le verrou. `session_replication_role`
    // éteint les déclencheurs de clé étrangère de la seule session — sans lui,
    // l'insertion prendrait sur la source le `FOR KEY SHARE` que le verrou
    // grossier attend, et la course n'existerait plus : c'est le seul moyen
    // qu'un Produit échappe au verrou.
    const superutilisateur = await prisma.$queryRawUnsafe<
      { superuser: boolean }[]
    >(`SELECT rolsuper AS superuser FROM pg_roles WHERE rolname = current_user`)
    expect(
      superutilisateur[0]?.superuser,
      "cette épreuve écrit sans déclencher la clé étrangère : la base de test doit appartenir à un superutilisateur, comme celle de docker-compose et de la CI"
    ).toBe(true)

    // La tierce tient aussi un verrou de ligne sur le Produit déplacé : la
    // suppression lit sa source sans voir le fantôme — il n'est pas committé —
    // puis s'arrête sur ce verrou, entre sa lecture et sa suppression finale.
    // La tierce committant à cet instant, le fantôme devient visible et la
    // suppression tombe sur `Product_categoryId_fkey`.
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
    // Le refus vient de la contrainte et non du délai de verrou : la tierce
    // libère bien avant lui, et une attente qui le dépasserait l'aurait fait
    // échouer. Les deux routes rendent le même refus — c'est voulu — donc seule
    // la mesure les distingue.
    expect(Date.now() - avantCommit).toBeLessThan(DELAI_VERROU_STRUCTURE_MS)
    await transaction
    // La transaction entière a été rétractée : réaffectation comprise, et
    // aucun effet n'est parti (ADR-0014).
    await expect(
      prisma.category.findUnique({ where: { id: category.id } })
    ).resolves.not.toBeNull()
    await expect(
      prisma.product.findUnique({ where: { id: product.id } })
    ).resolves.toMatchObject({ categoryId: category.id })
    expectNoEffects(effets)
  })

  it("laisse l'insertion d'un Produit mourir du côté Catalogue quand la suppression tient déjà le verrou", async () => {
    const category = await createCategory(
      makeCategoryInput({ slug: categorySlug("del-symetrique") })
    )

    // Le cas symétrique de celui d'au-dessus : ici la suppression tient le
    // verrou grossier la première. L'insertion attend, puis meurt sur
    // `Product_categoryId_fkey` — et cette erreur sort de `createProduct`,
    // jamais de `deleteCategory` : c'est le piège nommé d'ADR-0027, et le
    // Catalogue n'est pas dans la surface d'erreurs décidée ici. D'où
    // l'appel au vrai `createProduct` : c'est cette frontière que l'épreuve
    // montre, pas une requête brute qui la simulerait.
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

    // L'erreur reste celle du Catalogue : une erreur de lecteur, que la
    // Structure ne prend pas pour elle.
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

    // C'est l'attente que le verrou grossier lui-même imposait, celle qu'aucun
    // `lock_timeout` placé après ne pouvait couper. Elle doit donc se couper
    // dans le délai, comme les autres mutations de Structure — l'épreuve du
    // délai est partagée, la suppression n'y ajoute rien.
    await eprouverLeDelaiDeVerrou(() => deleteCategory(category.id, {}, effets))

    // Rien n'a été écrit, et la Structure est toujours là : c'est un refus de
    // contention, pas une suppression.
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

    // Une écriture du Catalogue prend le Produit avant la Structure :
    // `updateProduct` verrouille la ligne du Produit, puis la clé étrangère
    // prend la Structure. La suppression fait l'inverse — Structure d'abord —
    // et les deux ordres se croisent. Le cycle est tendu ici sans course :
    // la tierce tient le Produit, la suppression prend la Structure et
    // s'arrête sur le Produit, puis la tierce réclame la Structure.
    //
    // C'est le délai qui tranche, et non le détecteur d'interblocage :
    // PostgreSQL ne lève `40P01` qu'une seconde après la formation du cycle,
    // alors que l'attente de la suppression a commencé avant — mesuré contre
    // cette base, `55P03` à 1 021 ms. La traduction de `40P01` reste au
    // module pour le jour où `deadlock_timeout` serait plus court que le
    // délai ; elle n'est pas ce que cette épreuve éprouve.
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

    // Le perdant reçoit un refus, comme pour tout dépassement : le cycle
    // n'aboutit jamais à une exception de lecteur, et rien n'a été écrit.
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

    // La mutation committée fait foi : elle survit à la panne de l'effet, et
    // les effets suivants de la séquence sont malgré tout partis.
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
