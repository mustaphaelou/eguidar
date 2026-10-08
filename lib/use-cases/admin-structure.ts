import { z } from "zod"

import { prisma } from "@/lib/db"
import type { Category, Prisma } from "@/lib/generated/prisma/client"
import { toIndexableProduct } from "@/lib/index-projection"
import type { IndexableProduct } from "@/lib/index-projection"
import { indexProductDocuments } from "@/lib/meili"
import { stockageImageProduitR2 } from "@/lib/r2"
import { invalidateStructure } from "@/lib/use-cases/cache-invalidation"
import {
  avecSurcharges,
  leverConflitUnique,
  messageDeValidation,
  runEffect,
} from "@/lib/use-cases/mutation-squelette"
import { hasUniqueViolation } from "@/lib/use-cases/unique-violation"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

export interface CategoryInput {
  name: string
  slug: string
  parentId?: string | null
  image?: string | null
}

export interface StructureEffects {
  reindexProducts(products: IndexableProduct[]): Promise<void>
  revalidateCategories(): void
  /**
   * Supprime l'image de catégorie donnée, en best-effort.
   * Invariant : ne rejette jamais — un échec de suppression R2 ne doit pas
   * faire échouer la mutation (ADR-0004).
   */
  deleteImage(url: string): Promise<void>
}

const defaultStructureEffects: StructureEffects = {
  reindexProducts: indexProductDocuments,
  revalidateCategories() {
    invalidateStructure()
  },
  async deleteImage(url) {
    try {
      const resultat = await stockageImageProduitR2.supprimerImageCategorie(url)
      if (!resultat.ok) {
        console.warn(
          `[structure] suppression d'image R2 non effectuée pour ${url}`,
          resultat.erreur
        )
      }
    } catch (error) {
      console.warn(
        `[structure] suppression d'image R2 non effectuée pour ${url}`,
        error
      )
    }
  },
}

export class CategoryValidationError extends UserFacingError {
  constructor(issues: string[]) {
    super(messageDeValidation(issues))
    this.name = "CategoryValidationError"
  }
}

export class CategorySlugConflictError extends UserFacingError {
  constructor() {
    super("Une catégorie avec ce slug existe déjà")
    this.name = "CategorySlugConflictError"
  }
}

export class CategoryNotFoundError extends UserFacingError {
  constructor() {
    super("Catégorie introuvable")
    this.name = "CategoryNotFoundError"
  }
}

export class CategoryHasChildrenError extends UserFacingError {
  constructor() {
    super("Refus de la Structure : elle contient des sous-catégories")
    this.name = "CategoryHasChildrenError"
  }
}

export class CategoryHasProductsError extends UserFacingError {
  constructor(productCount: number) {
    const pluriel = productCount > 1
    super(
      `Refus de la Structure : ${productCount} Produit${pluriel ? "s" : ""} lui ${pluriel ? "sont" : "est"} rattaché${pluriel ? "s" : ""}`
    )
    this.name = "CategoryHasProductsError"
  }
}

/**
 * La Structure est en train de changer sous les pieds de l'éditeur : une autre
 * mutation la tient verrouillée, le délai de verrou a expiré, ou une écriture
 * a franchi le verrou et contredit ce que la transaction avait lu. Trois
 * routes, un seul refus — l'éditeur n'a qu'une chose à faire, réessayer.
 */
export class CategoryBusyError extends UserFacingError {
  constructor() {
    super("la Structure est en cours de modification, réessayez")
    this.name = "CategoryBusyError"
  }
}

/**
 * Le délai de la transaction a été dépassé avant que l'opération n'aboutisse —
 * `P2028`, que Prisma lève aussi bien sur une transaction interactive devenue
 * trop longue en cours de route que sur une transaction qui n'a pas obtenu de
 * connexion dans son délai d'attente.
 *
 * Ce n'est pas la contention, et le refus ne prend donc pas les mots de
 * `CategoryBusyError` : toutes les attentes de verrou sont déjà bornées par
 * `DELAI_VERROU_STRUCTURE_MS`, et leur dépassement comme la contradiction d'une
 * écriture concurrente rendent `CategoryBusyError`, qui dit « réessayez ».
 * Réessayer répare la contention ; ici rien ne le promet — la chaîne
 * d'ancêtres est lue en une requête, donc la profondeur n'est plus une cause,
 * et ce qui reste est une base qui n'a pas rendu la main à temps.
 *
 * Le refus appartient à la Structure comme les autres (ADR-0027) : sans lui,
 * `P2028` traversait `mapCourseDeStructure` sans être traduite, et
 * `adminFormAction` relançait une erreur de lecteur au lieu de la rendre à
 * l'éditeur.
 */
export class CategoryTransactionExpiredError extends UserFacingError {
  constructor() {
    super("Refus de la Structure : la transaction a dépassé son délai")
    this.name = "CategoryTransactionExpiredError"
  }
}

/**
 * La chaîne d'ancêtres que l'éditeur vise **porte déjà un cycle** — un import,
 * une reprise de données, une correction manuelle, ou rien qui vienne de
 * l'interface : le verrou d'ADR-0027 interdit d'en former un par ici, pas d'en
 * recevoir un.
 *
 * Le refus est donc le nôtre et non une saisie invalide, et il le dit en son
 * propre nom : `CategoryValidationError` afficherait « Données invalides : »
 * dans les trois premiers mots, ferait croire à l'éditeur qu'il a demandé
 * l'impossible, et l'apprendrait à réessayer un déplacement que réessayer ne
 * répare pas. Réessayer répare `CategoryBusyError` ; ceci, non (ADR-0027).
 */
export class CategoryAncestorCycleError extends UserFacingError {
  constructor() {
    super(
      "Refus de la Structure : la chaîne d'ancêtres choisie porte déjà un cycle"
    )
    this.name = "CategoryAncestorCycleError"
  }
}

/**
 * Le délai d'attente d'un verrou, en millisecondes. Plus court que le délai
 * d'une transaction interactive Prisma — 5 000 ms par défaut, qu'aucune
 * option de ce dépôt ne change : fail-fast vaut mieux qu'une transaction
 * pendante qui bloque tout le monde (ADR-0027).
 *
 * Exporté pour que l'épreuve de contention sache jusqu'où elle peut attendre
 * avant de conclure qu'un refus vient du verrou.
 */
export const DELAI_VERROU_STRUCTURE_MS = 1000

/** Le SQLSTATE `lock_not_available`, que PostgreSQL lève au dépassement. */
const SQLSTATE_VERROU_INDISPONIBLE = "55P03"

/** Le SQLSTATE `deadlock_detected`. */
const SQLSTATE_INTERBLOCAGE = "40P01"

/**
 * Les deux SQLSTATEs d'intégrité qu'une transaction de suppression peut
 * rencontrer : `23001` est ce que lève le déclencheur d'intégrité
 * référentielle sur un `ON DELETE RESTRICT` — `Product_categoryId_fkey` — et
 * `23503` la violation de clé étrangère elle-même. Les deux ont été relevés
 * sur un vrai PostgreSQL ; aucun autre n'est atteignable ici, la transaction
 * n'écrivant que des `parentId` et des `categoryId`.
 */
const SQLSTATE_INTEGRITE = /^(23001|23503)$/

/**
 * Le code Prisma de la transaction expirée. Il n'a pas de SQLSTATE à lire : ce
 * n'est pas PostgreSQL qui le lève mais Prisma, soit qu'une transaction
 * interactive ait dépassé son délai en cours de route, soit qu'elle n'ait pas
 * obtenu de connexion dans son délai d'attente. Relevé contre le PostgreSQL du
 * dépôt : les deux formes portent ce code, et la première n'a ni
 * `driverAdapterError` ni `originalCode` à offrir.
 */
const CODE_TRANSACTION_EXPIREE = "P2028"

/**
 * Le SQLSTATE de la base, lu dans la cause du lecteur d'adaptateur : la seule
 * voix qui ne dépende ni de la langue du serveur, ni du code que Prisma
 * choisit de revêtir — celui-ci a déjà varié d'un environnement à l'autre
 * (P2039 ici, P2003 ailleurs).
 *
 * La lecture est structurelle et non un `instanceof` : une version de Prisma
 * qui classerait l'erreur autrement laisserait le refus se cacher, et
 * l'appelant ne verrait qu'une erreur de lecteur.
 */
function sqlstateDeLErreur(error: unknown): string | undefined {
  const meta = (error as { meta?: unknown } | null)?.meta
  if (typeof meta !== "object" || meta === null) return undefined
  const lecteur = (meta as Record<string, unknown>).driverAdapterError as
    { cause?: { originalCode?: unknown } } | undefined
  const code = lecteur?.cause?.originalCode
  return typeof code === "string" ? code : undefined
}

/**
 * La traduction des courses (ADR-0027). Un dépassement de verrou, un
 * interblocage et une violation de clé étrangère sont trois refus de la
 * Structure, jamais des erreurs de lecteur : `adminFormAction` relance toute
 * erreur qu'elle ne reconnaît pas comme un `UserFacingError`, donc une erreur
 * brute sort de l'action serveur en exception non rattrapée.
 *
 * Le SQLSTATE décide ; le code Prisma ne départage que ce qu'il sait seul, `P2003`
 * étant réservé aux clés étrangères, `P2034` aux interblocages, et `P2028` à une
 * transaction expirée — ce dernier n'ayant aucun SQLSTATE, puisque c'est Prisma
 * qui le lève et non PostgreSQL. Une transaction expirée n'est pas la
 * contention : elle a son propre refus, `CategoryTransactionExpiredError`. Le
 * refus métier que la transaction a déjà levé passe avant tout, intact.
 *
 * L'interblocage est ici et non ailleurs : le verrou grossier prend les
 * Structures avant les Produits, quand toute écriture du Catalogue prend le
 * Produit avant la Structure. L'ordre inverse est un piège nommé d'ADR-0027,
 * et le perdant d'un tel cycle n'a lui aussi qu'une chose à faire.
 */
function mapCourseDeStructure(error: unknown): never {
  if (error instanceof UserFacingError) throw error
  const sqlstate = sqlstateDeLErreur(error)
  const code = (error as { code?: unknown } | null)?.code
  if (code === CODE_TRANSACTION_EXPIREE)
    throw new CategoryTransactionExpiredError()
  if (
    sqlstate === SQLSTATE_VERROU_INDISPONIBLE ||
    sqlstate === SQLSTATE_INTERBLOCAGE ||
    (sqlstate !== undefined && SQLSTATE_INTEGRITE.test(sqlstate)) ||
    code === "P2003" ||
    code === "P2034"
  ) {
    throw new CategoryBusyError()
  }
  throw error
}

/**
 * Le verrou grossier de la Structure (ADR-0027) : `SELECT … FROM "Category"
 * FOR UPDATE` prend toute la table, donc tout l'arbre. Verrouiller chaque
 * Structure plutôt que le nœud visé est ce qui ferme la course de cycle :
 * `assertAcyclicCategoryTree` parcourt une chaîne d'ancêtres qu'un verrou de
 * nœud ne protège pas. La décision l'exige de toute mutation de Structure,
 * création d'une Structure racine comprise : personne n'y échappe, pas même
 * elle.
 *
 * Le délai s'arme **avant** le verrou, et c'est l'inversion d'ADR-0027 qu'elle
 * corrige : pris après, il ne bornait que les verrous suivants et laissait
 * l'attente du verrou grossier — la plus longue, celle qui précède toutes les
 * autres — à la seule bonne volonté de Prisma. Armé avant, il borne celle-là
 * aussi, et le premier verrou pris reste le verrou grossier. Poser un réglage
 * ne prend aucun verrou : l'ordre ne coûte donc rien.
 *
 * `set_config(..., true)` *est* le `SET LOCAL` qu'ADR-0027 nomme ; il est écrit
 * ainsi parce que PostgreSQL n'accepte pas de paramètre dans un `SET`, et que
 * Prisma envoie toute requête `$queryRaw` préparée.
 */
async function verrouillerStructure(
  tx: Prisma.TransactionClient
): Promise<void> {
  await tx.$queryRaw`SELECT set_config('lock_timeout', ${`${DELAI_VERROU_STRUCTURE_MS}ms`}, true)`
  await tx.$queryRaw`SELECT id FROM "Category" FOR UPDATE`
}

const slugSchema = z
  .string()
  .min(1, "slug requis")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "slug invalide (minuscules, chiffres et tirets uniquement)"
  )

const categoryInputSchema = z.object({
  name: z.string().trim().min(1, "nom requis"),
  slug: slugSchema,
  parentId: z.string().min(1).nullable().optional(),
  image: z.string().nullable().optional(),
})

function parseCategoryInput(input: CategoryInput): CategoryInput {
  const result = categoryInputSchema.safeParse(input)
  if (!result.success) {
    throw new CategoryValidationError(
      result.error.issues.map((issue) => issue.message)
    )
  }
  return result.data
}

function mapCategoryUniqueViolation(error: unknown): never {
  return leverConflitUnique(
    error,
    [{ champs: ["slug"], erreur: new CategorySlugConflictError() }],
    hasUniqueViolation
  )
}

/**
 * Le slug est-il déjà porté par une autre Structure ? Le client est celui de la
 * transaction, et il n'a pas de défaut : sous le verrou grossier, cette lecture
 * valide et écrit dans un seul engagement, et une lecture hors transaction
 * prendrait une seconde connexion pendant que la première tient le verrou.
 */
async function assertUniqueCategorySlug(
  slug: string,
  client: Prisma.TransactionClient,
  excludeCategoryId?: string
): Promise<void> {
  const existing = await client.category.findUnique({ where: { slug } })
  if (existing && existing.id !== excludeCategoryId)
    throw new CategorySlugConflictError()
}

/**
 * La catégorie cible existe-t-elle ? Le client partagé avec le chemin de
 * suppression y fait lire cette validation dans la même transaction que les
 * écritures : validation et écritures s'appuient sur un seul engagement.
 */
async function assertCategoryParent(
  parentId: string | null | undefined,
  client: Prisma.TransactionClient = prisma
): Promise<void> {
  if (!parentId) return
  const parent = await client.category.findUnique({
    where: { id: parentId },
    select: { id: true },
  })
  if (!parent) throw new CategoryValidationError(["catégorie parente inconnue"])
}

/**
 * La chaîne d'ancêtres d'une Structure, lue en **une** requête : la table des
 * liens `id → parentId` de tout ce qui se remonte depuis `parentId`.
 *
 * La marche d'acyclicité faisait un `findUnique` par maillon, et une chaîne
 * profonde et acyclique coûtait donc autant d'allers-retours séquentiels dans
 * une transaction interactive : c'est ce qui portait la transaction au-delà de
 * son délai, et rendait un `P2028` que rien ne traduisait (ADR-0027,
 * amendement de #541). Une requête récursive ramène la chaîne entière en un
 * aller-retour, et le nombre d'allers-retours cesse de dépendre de la
 * profondeur.
 *
 * `UNION` et non `UNION ALL` : la forme récursive écarte les lignes déjà
 * produites, donc un cycle en base arrête la récursion au lieu de la faire
 * tourner. C'est la seule borne de cette requête — aucune profondeur maximale
 * n'est une règle de ce dépôt (ADR-0027, ADR-0030) — et c'est ce qui laisse à
 * l'appelant le soin de dire ce qu'une revisite signifie.
 *
 * Rendre des liens plutôt que des maillons ordonnés est délibéré : c'est la
 * même forme qu'un `findUnique` rendait, si bien que la marche ci-dessous garde
 * son curseur, son ordre et ses trois refus, et ne change que sa source.
 */
async function lireChaineDesAncetres(
  parentId: string,
  client: Prisma.TransactionClient
): Promise<Map<string, string | null>> {
  const maillons = await client.$queryRaw<
    { id: string; parentId: string | null }[]
  >`
    WITH RECURSIVE ancetres AS (
      SELECT c.id, c."parentId"
      FROM "Category" c
      WHERE c.id = ${parentId}
      UNION
      SELECT p.id, p."parentId"
      FROM "Category" p
      JOIN ancetres a ON p.id = a."parentId"
    )
    SELECT id, "parentId" FROM ancetres
  `
  return new Map(maillons.map((maillon) => [maillon.id, maillon.parentId]))
}

/**
 * La Structure `id` peut-elle se suspendre sous `parentId` ? La réponse se
 * lit en remontant la chaîne d'ancêtres, nœud par nœud, sous le verrou
 * grossier : c'est la seule question que la transaction est à même de poser,
 * et elle est posée avant l'écriture (ADR-0027).
 *
 * La marche garde les identifiants qu'elle a visités, et **toute** revisite
 * l'arrête — c'est ce qui la borne, là où le verrou ne la protégeait que de la
 * formation d'un cycle. Deux faits se cachent derrière une revisite, et ils ne
 * partagent pas un refus :
 *
 * - la marche revient sur `id` : l'éditeur demande de suspendre une Structure
 *   sous sa propre descendante, et le refus le dit en ces mots ;
 * - la marche revient sur un autre nœud : la chaîne visée est **déjà**
 *   cyclique, et le déplacement n'y est pour rien. C'est une donnée corrompue,
 *   pas une demande invalide — `CategoryAncestorCycleError`.
 *
 * Sans ce jeu, un cycle déjà en base — que rien de cette interface ne peut
 * former — faisait tourner la marche jusqu'au délai de transaction de Prisma
 * (5 000 ms) et rendait un `P2028`, que `mapCourseDeStructure` ne traduisait
 * alors pas : l'action serveur la relançait donc en exception non rattrapée
 * (ADR-0027, amendement de #490). Le refus nommé est depuis le fait du jeu de
 * structures visitées ; `P2028` a sa propre traduction, et la marche ne lit
 * plus qu'une fois (amendement de #541).
 *
 * La garde rejette les revisites, pas la longueur : une chaîne profonde et
 * acyclique passe, et aucune profondeur maximale n'est une règle de ce dépôt.
 */
async function assertAcyclicCategoryTree(
  id: string,
  parentId: string | null | undefined,
  client: Prisma.TransactionClient = prisma
): Promise<void> {
  if (!parentId) return
  if (parentId === id) {
    throw new CategoryValidationError([
      "une catégorie ne peut pas être sa propre parente",
    ])
  }
  const liens = await lireChaineDesAncetres(parentId, client)
  const vus = new Set<string>()
  let cursor: string | null = parentId
  while (cursor) {
    if (cursor === id) {
      throw new CategoryValidationError([
        "une catégorie ne peut pas être déplacée sous l'une de ses propres descendantes",
      ])
    }
    // Déjà remontée, donc la chaîne se referme sur elle-même : c'est un cycle
    // en base, et il faut s'arrêter avant de le boucler.
    if (vus.has(cursor)) throw new CategoryAncestorCycleError()
    vus.add(cursor)
    // Un maillon absent de la table est un parent qui n'existe pas en base :
    // c'est ce que rendait un `findUnique` sans ligne.
    if (!liens.has(cursor)) {
      throw new CategoryValidationError(["catégorie parente inconnue"])
    }
    cursor = liens.get(cursor) ?? null
  }
}

async function readIndexableCategoryProducts(
  categoryId: string
): Promise<IndexableProduct[]> {
  const products = await prisma.product.findMany({
    where: { categoryId },
    include: { variants: true, category: true },
  })
  return products.map(toIndexableProduct)
}

export async function createCategory(
  input: CategoryInput,
  overrides?: Partial<StructureEffects>
) {
  const effects = avecSurcharges(defaultStructureEffects, overrides)
  const data = parseCategoryInput(input)

  // Une seule mutation atomique et sérialisée, comme les deux autres : la
  // transaction prend le délai puis le verrou grossier en première instruction
  // qui verrouille, avant la lecture du slug, celle du parent et l'écriture,
  // qui partagent un seul engagement. Une insertion de racine ne pose aucune
  // référence de clé étrangère, donc rien à verrouiller d'elle-même : le verrou
  // ne protège pas sa propre course — deux racines concurrentes se committent
  // toutes deux tant que la gagnante engage moins que le délai — il tient la
  // promesse que deux mutations de Structure ne s'entrelacent jamais
  // (ADR-0027).
  let category: Category
  try {
    category = await prisma.$transaction(async (tx) => {
      await verrouillerStructure(tx)

      await assertUniqueCategorySlug(data.slug, tx)
      await assertCategoryParent(data.parentId, tx)

      try {
        return await tx.category.create({
          data: {
            name: data.name,
            slug: data.slug,
            parentId: data.parentId ?? null,
            image: data.image ?? null,
          },
        })
      } catch (error) {
        mapCategoryUniqueViolation(error)
      }
    })
  } catch (error) {
    mapCourseDeStructure(error)
  }

  await runEffect(
    "[structure] invalidation du cache non effectuée pour la création de catégorie",
    () => effects.revalidateCategories()
  )
  return category
}

export async function updateCategory(
  id: string,
  input: CategoryInput,
  overrides?: Partial<StructureEffects>
) {
  const effects = avecSurcharges(defaultStructureEffects, overrides)
  const data = parseCategoryInput(input)

  // Une seule mutation atomique et sérialisée, comme la suppression : le délai
  // de verrou s'arme, puis le verrou grossier prend tout l'arbre en première
  // instruction qui verrouille, avant la lecture de la Structure, la marche
  // d'acyclicité et l'écriture, qui partagent une même transaction — la
  // vérification d'acyclicité lit et écrit dans un seul engagement, et deux
  // modifications de Structure ne s'entrelacent jamais (ADR-0027).
  let resultat: { category: Category; image: string | null }
  try {
    resultat = await prisma.$transaction(async (tx) => {
      await verrouillerStructure(tx)

      const existing = await tx.category.findUnique({ where: { id } })
      if (!existing) throw new CategoryNotFoundError()

      await assertUniqueCategorySlug(data.slug, tx, id)
      await assertAcyclicCategoryTree(id, data.parentId, tx)

      try {
        const category = await tx.category.update({
          where: { id },
          data: {
            name: data.name,
            slug: data.slug,
            parentId: data.parentId ?? null,
            image: data.image ?? null,
          },
        })
        return { category, image: existing.image }
      } catch (error) {
        mapCategoryUniqueViolation(error)
      }
    })
  } catch (error) {
    mapCourseDeStructure(error)
  }
  const { category, image: imagePrecedente } = resultat

  const nextImage = data.image ?? null
  if (imagePrecedente && imagePrecedente !== nextImage) {
    await runEffect(
      `[structure] suppression d'image R2 non effectuée pour ${imagePrecedente}`,
      () => effects.deleteImage(imagePrecedente!)
    )
  }
  const products = await readIndexableCategoryProducts(id)
  if (products.length > 0) {
    await runEffect(
      `[structure] réindexation meilisearch non effectuée pour ${id}`,
      () => effects.reindexProducts(products)
    )
  }
  await runEffect(
    `[structure] invalidation du cache non effectuée pour ${id}`,
    () => effects.revalidateCategories()
  )
  return category
}

/**
 * Les options métier précèdent la surcharge d'effets : l'appelant de
 * production exprime sa réaffectation sans `undefined` pont, et la couture
 * d'effets reste le paramètre optionnel de dernier rang (ADR-0014).
 *
 * `reparentChildrenToCategoryId` est la Structure que l'éditeur a choisie pour
 * accueillir les sous-catégories : sans elle, la Structure qui a des enfants
 * reste refusée. La règle ne s'assouplit pas — elle devient saisissable.
 *
 * `orphanProducts` répond à la même question, posée aux Produits (ADR-0029) :
 * sans elle et sans `reassignToCategoryId`, la Structure qui a des Produits
 * reste refusée. Comme pour les sous-catégories, la règle ne s'assouplit pas,
 * elle devient saisissable.
 */
export async function deleteCategory(
  id: string,
  options: {
    reassignToCategoryId?: string
    reparentChildrenToCategoryId?: string
    orphanProducts?: boolean
  } = {},
  overrides?: Partial<StructureEffects>
): Promise<void> {
  const effects = avecSurcharges(defaultStructureEffects, overrides)
  const reassignToCategoryId = options.reassignToCategoryId
  const reparentChildrenToCategoryId = options.reparentChildrenToCategoryId
  // La réaffectation l'emporte sur l'orphelinat : les deux ensemble est un choix
  // contradictoire, et c'est la réaffectation qui s'applique. Un Produit qui garde
  // une Structure reste dans une page de catégorie et dans un décompte ; un
  // Produit sans Structure n'est dans aucun des deux.
  const laisseSansStructure =
    options.orphanProducts === true && !reassignToCategoryId

  // Une seule mutation atomique et sérialisée : le délai de verrou s'arme,
  // puis le verrou grossier prend tout l'arbre en première instruction qui
  // verrouille, avant la lecture propre à la suppression, les validations de
  // réaffectation, le déplacement des Produits, le réattribut des
  // sous-catégories, leur projeté indexable et la suppression de la Structure
  // source — tout cela dans une même transaction. Un échec de la suppression
  // finale annule donc la réaffectation — la base fait foi (ADR-0014) — et deux
  // suppressions ne s'entrelacent jamais (ADR-0027).
  let resultat: { image: string | null; movedProducts: IndexableProduct[] }
  try {
    resultat = await prisma.$transaction(async (tx) => {
      await verrouillerStructure(tx)

      const category = await tx.category.findUnique({
        where: { id },
        include: {
          children: { select: { id: true } },
          products: { select: { id: true } },
        },
      })
      if (!category) throw new CategoryNotFoundError()

      // Le réattribut précède la suppression : `Category_parentId_fkey` est en
      // `ON DELETE SET NULL`, et sans cette écriture les enfants remonte-
      // raient silencieusement au rang racine. L'ordre est donc le refus, puis
      // l'écriture.
      if (category.children.length > 0) {
        if (!reparentChildrenToCategoryId) throw new CategoryHasChildrenError()
        await assertCategoryParent(reparentChildrenToCategoryId, tx)
        // Rattacher à elle-même ou à l'une de ses descendantes refermerait la
        // boucle : la même marche que celle de la modification, mais sur le
        // client de la transaction, pour ne lire que des faits engagés.
        await assertAcyclicCategoryTree(id, reparentChildrenToCategoryId, tx)
        await tx.category.updateMany({
          where: { parentId: id },
          data: { parentId: reparentChildrenToCategoryId },
        })
      }

      // La cible de réaffectation se valide **dès qu'elle est choisie**, et non
      // seulement quand la Structure porte des Produits : une cible inconnue ou
      // égale à la source est un Refus de la Structure, et il le reste sur une
      // Structure vide. La valider plus tard laisserait le serveur ignorer une
      // cible qu'il a pourtant lue — l'éditeur verrait sa Structure supprimée
      // sans que rien ne lui dise que sa cible n'existait pas (GLOSSARY.md,
      // « Refus de la Structure » : une mutation de Structure ne produit
      // jamais d'autre issue).
      if (reassignToCategoryId) {
        if (reassignToCategoryId === id) {
          throw new CategoryValidationError([
            "une catégorie ne peut pas être réassignée vers elle-même",
          ])
        }
        await assertCategoryParent(reassignToCategoryId, tx)
      }

      // Les Produits sortent de la Structure source par l'unique voie qui les
      // y laisse : une écriture de `categoryId` dans cette transaction, sous le
      // même verrou. `RESTRICT` ne peut donc pas refuser la suppression pour
      // eux — la colonne est vide quand la contrainte est rencontrée (ADR-0029).
      let moved: IndexableProduct[] = []
      if (category.products.length > 0) {
        if (reassignToCategoryId) {
          await tx.product.updateMany({
            where: { categoryId: id },
            data: { categoryId: reassignToCategoryId },
          })
        } else if (!laisseSansStructure) {
          // Le refus reste le défaut : ni cible choisie, ni orphelinat choisi.
          throw new CategoryHasProductsError(category.products.length)
        } else {
          // Le Produit sans Structure (ADR-0029). Il reste vendable et reste
          // indexable : son `categorySlug` devient la valeur réservée, ce qui
          // est justement pourquoi il est réindexé avec les autres.
          await tx.product.updateMany({
            where: { categoryId: id },
            data: { categoryId: null },
          })
        }
        const movedRows = await tx.product.findMany({
          where: { id: { in: category.products.map((product) => product.id) } },
          include: { variants: true, category: true },
        })
        moved = movedRows.map(toIndexableProduct)
      }

      await tx.category.delete({ where: { id } })
      return { image: category.image, movedProducts: moved }
    })
  } catch (error) {
    mapCourseDeStructure(error)
  }
  const { image, movedProducts } = resultat

  // Les effets auxiliaires n'attendent que le commit : les faits qu'ils
  // reçoivent sont committés et leur échec reste best-effort (ADR-0014).
  if (movedProducts.length > 0) {
    await runEffect(
      `[structure] réindexation meilisearch non effectuée pour ${id}`,
      () => effects.reindexProducts(movedProducts)
    )
  }
  if (image) {
    await runEffect(
      `[structure] suppression d'image R2 non effectuée pour ${image}`,
      () => effects.deleteImage(image!)
    )
  }
  await runEffect(
    `[structure] invalidation du cache non effectuée pour ${id}`,
    () => effects.revalidateCategories()
  )
}
