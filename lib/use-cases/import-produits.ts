import { createHash } from "node:crypto"

import { prisma } from "@/lib/db"
import {
  Prisma,
  type StatutLigneImport,
  type StatutLotImport,
} from "@/lib/generated/prisma/client"
import {
  LIMITE_OCTETS_IMPORT,
  MESSAGE_APPLIQUER_REFUS,
  MESSAGE_IMPORT_EN_COURS,
  MESSAGE_LOT_INTROUVABLE,
  PRODUITS_PAR_APPLICATION_IMPORT,
  analyserLesLignes,
  codeDAvertissement,
  grouperParProduit,
  jugerLEnTete,
  lireLeTexte,
  lireLesLignes,
  messageDAvertissement,
  messageDuRefus,
  peutAppliquer,
  peutVerifier,
  refusDepuisLeCode,
  type AvertissementImport,
  type CellulesImport,
  type ContexteRefusImport,
  type EchecProduitApplication,
  type EnregistrementImport,
  type LigneImport,
  type RefusImport,
} from "@/lib/import-produits"
import {
  normaliserTexteAlternatif,
  type EntreeImageProduit,
} from "@/lib/galerie-image-produit"
import { toIndexableProduct } from "@/lib/index-projection"
import {
  champRequisManquantDuProduit,
  planifierLeLot,
  type DiffProduitPlanImport,
  type InstantaneCatalogue,
  type PlanProduit,
} from "@/lib/plan-import-produits"
import { urlsImagesProduit } from "@/lib/product-metrics"
import {
  createProduct,
  defaultCatalogEffects,
  updateProduct,
  type CatalogEffects,
  type ProductInput,
} from "@/lib/use-cases/admin-catalog"
import { lireStructure } from "@/lib/use-cases/lecture-structure"
import {
  hasUniqueViolation,
  uniqueViolationIndex,
} from "@/lib/use-cases/unique-violation"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

/**
 * Le cas d'usage de l'import : il juge l'enveloppe, lit les Lignes, persiste le
 * Lot, puis le vérifie contre un instantané du Catalogue. C'est le seul module
 * de l'import qui parle Prisma. Aucun Produit, aucune Variante et aucune
 * Structure n'est écrit ici : le plan est pur et la Vérification se contente de
 * lire.
 */

export interface TeleversementImport {
  nomFichier: string
  octets: Uint8Array
  auteurId: string
}

export interface LotImportTeleverse {
  lotId: string
  statut: StatutLotImport
}

export interface LigneImportLue {
  id: string
  numero: number
  slug: string
  sku: string
  cellules: CellulesImport
  enregistrement: EnregistrementImport | null
  statut: StatutLigneImport | null
  codeRefus: string | null
  /** La raison de l'échec d'écriture d'un Produit, portée par ses Lignes. */
  motifEchec: string | null
  /** Le refus complet, rejoué depuis les cellules : le contexte n'est pas perdu. */
  refus: RefusImport | null
  avertissements: string[]
  /** Le diff avant → après du Produit, porté par chacune de ses Lignes. */
  diff: DiffProduitPlanImport | null
}

export interface LotImportLu {
  id: string
  auteurId: string | null
  auteur: { id: string; name: string; email: string } | null
  empreinte: string
  taille: number
  statut: StatutLotImport
  curseur: number
  produitsCrees: number
  produitsModifies: number
  produitsInchanges: number
  produitsRefuses: number
  ecrits: number
  indexes: number
  avertissements: string[]
  motifEchec: string | null
  createdAt: Date
  lignes: LigneImportLue[]
}

/**
 * Un Lot de l'historique : de quoi le reconnaître et décider de le relire,
 * sans charger ses Lignes.
 */
export interface LotImportListe {
  id: string
  auteur: { name: string; email: string } | null
  createdAt: Date
  statut: StatutLotImport
  produitsCrees: number
  produitsModifies: number
  produitsInchanges: number
  produitsRefuses: number
  ecrits: number
  indexes: number
}

/**
 * L'historique est borné : au-delà de cinquante Lots, la page cesserait d'être
 * un rapport pour devenir un journal. Seuls les plus récents sont lus.
 */
export const LIMITE_LOTS_HISTORIQUE_IMPORT = 50

export interface CompteursImport {
  produitsCrees: number
  produitsModifies: number
  produitsInchanges: number
  produitsRefuses: number
}

/**
 * Le Lot `en_cours`, résumé pour la page : l'index partiel en garantit au plus
 * un. La reprise n'a besoin que de son identifiant et de son avancement.
 */
export interface LotEnCoursImport {
  id: string
  createdAt: Date
  curseur: number
  ecrits: number
  indexes: number
}

export interface LigneVerifieeImport {
  numero: number
  statut: StatutLigneImport
  refus: RefusImport | null
}

export interface VerificationLotImport {
  lotId: string
  statut: StatutLotImport
  compteurs: CompteursImport
  lignes: readonly LigneVerifieeImport[]
  plans: readonly PlanProduit[]
  peutAppliquer: boolean
  /** Ce que le bouton Appliquer doit dire quand il est indisponible. */
  motifApplicationIndisponible: string | null
}

interface EnveloppeJugee {
  /** Le texte décodé, quand l'enveloppe peut être lue ; `null` sinon. */
  texte: string | null
  refus: RefusImport[]
  avertissements: AvertissementImport[]
}

function jugerLEnveloppe(octets: Uint8Array): EnveloppeJugee {
  if (octets.byteLength > LIMITE_OCTETS_IMPORT) {
    return {
      texte: null,
      refus: [{ code: "fichier_trop_gros" }],
      avertissements: [],
    }
  }

  const texte = lireLeTexte(octets)
  if (texte === null) {
    return {
      texte: null,
      refus: [{ code: "encodage_invalide" }],
      avertissements: [],
    }
  }

  const enTete = jugerLEnTete(texte)
  return {
    texte,
    refus: [...enTete.refus],
    avertissements: [...enTete.avertissements],
  }
}

interface ChoixDeLaLigne {
  refus: RefusImport | null
  avertissements: readonly AvertissementImport[]
  statut: StatutLigneImport | null
  diff?: DiffProduitPlanImport | null
}

/**
 * La seule construction d'une ligne `LigneImport` persistée : le téléversement
 * l'écrit avec son refus local ; la Vérification l'écrit avec le jugement du
 * plan et son diff avant → après. Le `diff` vaut `DbNull` quand il n'y en a pas.
 */
function donneesDeLaLigne(
  ligne: LigneImport,
  { refus, avertissements, statut, diff = null }: ChoixDeLaLigne
) {
  return {
    numero: ligne.numero,
    slug: ligne.slug,
    sku: ligne.sku,
    cellules: ligne.cellules as unknown as Prisma.InputJsonValue,
    enregistrement:
      ligne.enregistrement === null
        ? Prisma.DbNull
        : (ligne.enregistrement as unknown as Prisma.InputJsonValue),
    codeRefus: refus?.code ?? null,
    avertissements: avertissements.map(codeDAvertissement),
    diff:
      diff === null
        ? Prisma.DbNull
        : (diff as unknown as Prisma.InputJsonValue),
    statut,
  }
}

/**
 * Crée un Lot pour tout fichier reçu : `brouillon` quand l'enveloppe est
 * acceptée — avec toutes ses Lignes lues dans la même écriture —, `echoue`
 * avec son motif sinon. Un Lot refusé ne porte aucune Ligne. L'empreinte est
 * celle des octets reçus, pas du texte décodé.
 *
 * Un second téléversement est refusé tant qu'un Lot est `en_cours` : la
 * reprise du Lot en cours passe avant, et rien n'est mis en file.
 */
export async function televerserLeFichier({
  octets,
  auteurId,
}: TeleversementImport): Promise<LotImportTeleverse> {
  const enCours = await prisma.lotImport.findFirst({
    where: { statut: "en_cours" },
    select: { id: true },
  })
  if (enCours !== null) {
    throw new UserFacingError(MESSAGE_IMPORT_EN_COURS)
  }

  const empreinte = createHash("sha256").update(octets).digest("hex")
  const enveloppe = jugerLEnveloppe(octets)
  const accepte = enveloppe.refus.length === 0
  const lignes =
    accepte && enveloppe.texte !== null ? lireLesLignes(enveloppe.texte) : []

  const lot = await prisma.lotImport.create({
    data: {
      auteurId,
      empreinte,
      taille: octets.byteLength,
      statut: accepte ? "brouillon" : "echoue",
      motifEchec: accepte
        ? null
        : enveloppe.refus.map((refus) => messageDuRefus(refus)).join(" "),
      avertissements: enveloppe.avertissements.map((avertissement) =>
        messageDAvertissement(avertissement)
      ),
      ...(accepte
        ? {
            lignes: {
              create: lignes.map((ligne) =>
                donneesDeLaLigne(ligne, {
                  refus: ligne.refus,
                  avertissements: ligne.avertissements,
                  statut: ligne.refus === null ? null : "refusee",
                })
              ),
            },
          }
        : {}),
    },
    select: { id: true, statut: true },
  })

  return { lotId: lot.id, statut: lot.statut }
}

/**
 * Rejoue l'analyse d'un Lot depuis les cellules persistées : le numéro et les
 * cellules sont la seule vérité, et le code stocké n'est qu'un témoin — sauf
 * `ligne_mal_formee`, la seule trace de la forme que les cellules brutes ne
 * disent plus. C'est ce qui rend visibles le champ manquant, la forme du
 * doublon et le champ du conflit, que #983 n'avait pas conservés.
 */
function rejouerLesLignes(
  lignes: readonly {
    numero: number
    cellules: CellulesImport
    codeRefus?: string | null
  }[]
): LigneImport[] {
  return [
    ...analyserLesLignes(
      lignes.map((ligne) => ({
        numero: ligne.numero,
        cellules: ligne.cellules,
        ...(ligne.codeRefus === "ligne_mal_formee" ? { malFormee: true } : {}),
      }))
    ),
  ]
}

function valeursUniques(valeurs: readonly string[]): string[] {
  return [...new Set(valeurs.filter((valeur) => valeur !== ""))]
}

/**
 * Lit le Catalogue nécessaire au plan en trois lectures et une liste de noms :
 * les Produits du fichier, les skus déjà possédés, tous les noms pour
 * l'avertissement de ressemblance, et les Structures par la porte de la Lecture
 * de la Structure. Aucune écriture.
 */
async function lireLInstantane(
  lignes: readonly LigneImport[]
): Promise<InstantaneCatalogue> {
  const slugs = valeursUniques(lignes.map((ligne) => ligne.slug))
  const categories = valeursUniques(
    lignes.map((ligne) => ligne.cellules.category ?? "")
  )
  const skus = valeursUniques(lignes.map((ligne) => ligne.sku))

  const [produits, variantes, noms, lectureDesStructures] = await Promise.all([
    prisma.product.findMany({
      where: { slug: { in: slugs } },
      include: {
        variants: {
          select: {
            id: true,
            name: true,
            sku: true,
            priceDelta: true,
            stock: true,
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
      },
      orderBy: { slug: "asc" },
    }),
    prisma.productVariant.findMany({
      where: { sku: { in: skus } },
      select: { sku: true, product: { select: { slug: true } } },
    }),
    prisma.product.findMany({
      select: { slug: true, name: true },
      orderBy: { slug: "asc" },
    }),
    lireStructure(),
  ])

  return {
    produitsParSlug: Object.fromEntries(
      produits.map((produit) => [
        produit.slug,
        {
          id: produit.id,
          slug: produit.slug,
          name: produit.name,
          brand: produit.brand,
          description: produit.description,
          categoryId: produit.categoryId,
          structureSlug:
            produit.categoryId === null
              ? null
              : (lectureDesStructures.structure(produit.categoryId)?.slug ??
                null),
          price: produit.price,
          variants: produit.variants.map((variante) => ({
            id: variante.id,
            name: variante.name,
            sku: variante.sku,
            priceDelta: variante.priceDelta,
            stock: variante.stock,
          })),
        },
      ])
    ),
    structuresParSlug: Object.fromEntries(
      categories.flatMap((slug) => {
        const structure = lectureDesStructures.structureParSlug(slug)
        return structure === null
          ? []
          : [[structure.slug, { id: structure.id, slug: structure.slug }]]
      })
    ),
    produitsParSku: Object.fromEntries(
      variantes.map((variante) => [variante.sku, variante.product.slug])
    ),
    nomsExistants: noms,
  }
}

function compterLesProduits(plans: readonly PlanProduit[]): CompteursImport {
  // Une Ligne mal formée n'identifie aucun Produit : elle bloque
  // l'application, mais elle n'entre pas dans le décompte des Produits.
  const produits = plans.filter((plan) => plan.slug !== "")
  return {
    produitsCrees: produits.filter((plan) => plan.issue === "cree").length,
    produitsModifies: produits.filter((plan) => plan.issue === "modifie")
      .length,
    produitsInchanges: produits.filter((plan) => plan.issue === "inchange")
      .length,
    produitsRefuses: produits.filter((plan) => plan.issue === "refuse").length,
  }
}

function messageDuStatutNonVerifiable(statut: StatutLotImport): string {
  switch (statut) {
    case "en_cours":
      return "Ce Lot est en cours d'application : la Vérification ne peut pas le rejuger tant qu'elle n'est pas terminée. Attendez la fin, puis vérifiez-le de nouveau."
    case "partiel":
      return "Ce Lot a été partiellement appliqué : la Vérification ne peut plus le rejuger. Téléversez de nouveau le fichier pour le rejouer."
    case "termine":
      return "Ce Lot est déjà appliqué : la Vérification ne peut plus le rejuger. Téléversez de nouveau le fichier pour le rejouer."
    case "echoue":
      return "Ce Lot a échoué au téléversement : il n'a aucune Ligne à vérifier. Corrigez le fichier, puis téléversez-le de nouveau."
    case "brouillon":
    case "verifie":
      return ""
  }
}

/**
 * Juge un Lot contre le Catalogue et persiste le jugement : les compteurs, le
 * statut de chaque Ligne, son refus rejoué et le diff avant → après du Produit.
 * La vérification est rejouable : chaque passage remplace les Lignes du Lot,
 * sans les doubler, et ne touche jamais au Catalogue.
 */
export async function verifierLeLot(
  lotId: string
): Promise<VerificationLotImport> {
  const lot = await prisma.lotImport.findUnique({
    where: { id: lotId },
    select: {
      id: true,
      statut: true,
      lignes: {
        orderBy: { numero: "asc" },
        select: { numero: true, cellules: true, codeRefus: true },
      },
    },
  })

  if (lot === null) {
    throw new UserFacingError(MESSAGE_LOT_INTROUVABLE)
  }
  if (!peutVerifier(lot.statut)) {
    throw new UserFacingError(messageDuStatutNonVerifiable(lot.statut))
  }

  const lignes = rejouerLesLignes(
    lot.lignes.map((ligne) => ({
      numero: ligne.numero,
      cellules: ligne.cellules as CellulesImport,
      codeRefus: ligne.codeRefus,
    }))
  )
  const instantane = await lireLInstantane(lignes)
  const plans = planifierLeLot(lignes, instantane)
  const compteurs = compterLesProduits(plans)

  const lignesParNumero = new Map(lignes.map((ligne) => [ligne.numero, ligne]))
  const donnees: Prisma.LigneImportCreateManyInput[] = []
  for (const plan of plans) {
    const diff: DiffProduitPlanImport | null =
      plan.diff.produit.length === 0 && plan.diff.variantes.length === 0
        ? null
        : plan.diff

    for (const lignePlanifiee of plan.lignes) {
      const ligne = lignesParNumero.get(lignePlanifiee.numero)
      if (ligne === undefined) continue
      donnees.push({
        lotId,
        ...donneesDeLaLigne(ligne, {
          refus: lignePlanifiee.refus,
          avertissements: lignePlanifiee.avertissements,
          statut: lignePlanifiee.statut,
          diff,
        }),
      })
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.ligneImport.deleteMany({ where: { lotId } })
    if (donnees.length > 0) {
      await tx.ligneImport.createMany({ data: donnees })
    }
    await tx.lotImport.update({
      where: { id: lotId },
      data: {
        statut: "verifie",
        produitsCrees: compteurs.produitsCrees,
        produitsModifies: compteurs.produitsModifies,
        produitsInchanges: compteurs.produitsInchanges,
        produitsRefuses: compteurs.produitsRefuses,
      },
    })
  })

  const peutAppliquer = plans.every((plan) => plan.issue !== "refuse")

  return {
    lotId,
    statut: "verifie",
    compteurs,
    lignes: plans.flatMap((plan) =>
      plan.lignes.map((ligne) => ({
        numero: ligne.numero,
        statut: ligne.statut,
        refus: ligne.refus,
      }))
    ),
    plans,
    peutAppliquer,
    motifApplicationIndisponible: peutAppliquer
      ? null
      : MESSAGE_APPLIQUER_REFUS,
  }
}

export interface ApplicationLotImport {
  lotId: string
  /** Les Produits traités pendant cet appel (écrits, inchangés ou en échec). */
  traites: number
  /** Les Produits que le curseur n'a pas encore atteints. */
  reste: number
  curseurSuivant: number
  /** Les Produits écrits depuis le début du Lot. */
  ecrits: number
  /** Les Produits dont la réindexation a réussi depuis le début du Lot. */
  indexes: number
  echecs: EchecProduitApplication[]
  indexationEnAttente: boolean
  statut: StatutLotImport
}

interface ChampsPreservesProduitImport {
  specs: Record<string, string>
  images: EntreeImageProduit[]
  isFeatured: boolean
  featuredOrder: number
  freeShipping: boolean
}

function messageDuStatutNonApplicable(statut: StatutLotImport): string {
  switch (statut) {
    case "brouillon":
      return "Ce Lot n'est pas encore vérifié : lancez la Vérification avant de l'appliquer."
    case "partiel":
      return "Ce Lot a déjà été appliqué partiellement : il ne peut pas être repris. Téléversez de nouveau le fichier pour le réappliquer."
    case "termine":
      return "Ce Lot est déjà appliqué : il ne peut pas l'être une seconde fois."
    case "echoue":
      return "Ce Lot a échoué au téléversement : il n'a aucun Produit à appliquer. Corrigez le fichier, puis téléversez-le de nouveau."
    case "en_cours":
    case "verifie":
      return ""
  }
}

function produitsEcrits(statut: StatutLigneImport | null): boolean {
  return statut === "ecrite" || statut === "echouee"
}

/** Le nom de l'index partiel créé par la migration de #986. */
const INDEX_LOT_EN_COURS = "LotImport_un_seul_en_cours"

/**
 * L'index partiel de la base est le seul arbitre : il nomme la contrainte
 * violée, ou — selon la version de l'adaptateur — ses champs.
 */
function estViolationDuLotEnCours(error: unknown): boolean {
  return (
    uniqueViolationIndex(error) === INDEX_LOT_EN_COURS ||
    hasUniqueViolation(error, ["statut"])
  )
}

/**
 * Passe le Lot à `en_cours` en une seule écriture conditionnelle. C'est la
 * première écriture de l'application : si un autre Lot est déjà en cours,
 * l'index partiel refuse celle-ci et rien du Catalogue n'a été touché.
 */
async function demarrerLApplication(lotId: string): Promise<void> {
  try {
    const transition = await prisma.lotImport.updateMany({
      where: { id: lotId, statut: "verifie" },
      data: { statut: "en_cours" },
    })
    if (transition.count === 0) {
      throw new UserFacingError(
        "Ce Lot a déjà été pris par un autre appel : rechargez la page avant de reprendre."
      )
    }
  } catch (error) {
    if (error instanceof UserFacingError) throw error
    if (estViolationDuLotEnCours(error)) {
      throw new UserFacingError(MESSAGE_IMPORT_EN_COURS)
    }
    throw error
  }
}

const MESSAGE_ECHEC_WRITE_UNIQUE =
  "L'écriture du Produit a échoué : son slug ou son sku est déjà pris dans le Catalogue. Corrigez le fichier, puis réessayez."

const MESSAGE_ECHEC_WRITE =
  "L'écriture du Produit a échoué : corrigez le fichier, puis réessayez."

/**
 * Le motif montré à l'administrateur, jamais le texte brut de la base : un
 * `UserFacingError` garde sa copie française, une violation d'unicité dit que
 * le slug ou le sku est déjà pris, et tout le reste renvoie à la correction du
 * fichier. L'erreur brute part au journal de l'opérateur, pas en base.
 */
function motifDeLEchec(error: unknown, slug: string): string {
  if (error instanceof UserFacingError) return error.message

  console.warn(
    `[import-produits] écriture du Produit ${slug} impossible`,
    error
  )

  if (hasUniqueViolation(error, ["slug", "sku"])) {
    return MESSAGE_ECHEC_WRITE_UNIQUE
  }
  return MESSAGE_ECHEC_WRITE
}

/**
 * Les champs que l'import ne possède pas sont relus sur la ligne du Produit et
 * renvoyés tels quels : les images avec leur texte alternatif, les
 * spécifications **brutes** (le lecteur `specificationsProduit` est
 * tout-ou-rien) et les trois drapeaux. C'est ce qui empêche le premier import
 * d'effacer les galeries et de réinitialiser les mises en avant.
 */
async function lireLesChampsPreserves(
  produitId: string
): Promise<ChampsPreservesProduitImport> {
  const produit = await prisma.product.findUniqueOrThrow({
    where: { id: produitId },
    select: {
      specs: true,
      images: true,
      isFeatured: true,
      featuredOrder: true,
      freeShipping: true,
    },
  })

  const urls = urlsImagesProduit(produit.images)
  const registre =
    urls.length === 0
      ? []
      : await prisma.imageProduit.findMany({
          where: { publicUrl: { in: urls } },
          select: { publicUrl: true, alt: true },
        })
  const altParUrl = new Map(
    registre.map((ligne) => [ligne.publicUrl, ligne.alt])
  )

  return {
    specs: produit.specs as unknown as Record<string, string>,
    images: urls.map((url) => {
      const alt = normaliserTexteAlternatif(altParUrl.get(url))
      return alt === null
        ? { kind: "persistee" as const, url }
        : { kind: "persistee" as const, url, alt }
    }),
    isFeatured: produit.isFeatured,
    featuredOrder: produit.featuredOrder,
    freeShipping: produit.freeShipping,
  }
}

/**
 * L'état désiré complet : les champs du plan, l'union des Variantes existantes
 * et des Lignes (le writer ne supprime donc rien), et les champs préservés.
 * Aucun `tentativeId`, aucun `ownerId` : l'import n'est pas une reprise de
 * Brouillon et ne change pas le propriétaire.
 */
function donneesDuProduitImport(
  plan: PlanProduit,
  champs: ChampsPreservesProduitImport
): ProductInput {
  if (plan.etatDesire === null) {
    throw new Error(`Le Produit ${plan.slug} n'a pas d'état désiré à écrire`)
  }
  const etat = plan.etatDesire
  return {
    name: etat.name,
    slug: plan.slug,
    description: etat.description,
    brand: etat.brand,
    categoryId: etat.categoryId,
    price: etat.price,
    specs: champs.specs,
    images: champs.images,
    isFeatured: champs.isFeatured,
    featuredOrder: champs.featuredOrder,
    freeShipping: champs.freeShipping,
    variants: etat.variants.map((variante) => ({
      ...(variante.id === undefined ? {} : { id: variante.id }),
      name: variante.name,
      sku: variante.sku,
      priceDelta: variante.priceDelta,
      stock: variante.stock,
    })),
  }
}

/**
 * Enveloppe la réindexation pour observer son issue : `runEffect` avale
 * l'exception, donc le marqueur est la seule trace d'un échec d'indexation
 * après un commit réussi.
 */
function effetsAvecIndexation(
  overrides: Partial<CatalogEffects> | undefined,
  marqueur: { indexe: boolean }
): Partial<CatalogEffects> {
  const indexation =
    overrides?.reindexProducts ??
    defaultCatalogEffects("import-produits").reindexProducts
  return {
    ...overrides,
    async reindexProducts(produits) {
      try {
        await indexation(produits)
        marqueur.indexe = true
      } catch (error) {
        marqueur.indexe = false
        throw error
      }
    },
  }
}

/**
 * Rattrape l'indexation des Produits déjà écrits, par paquets bornés. Un paquet
 * en échec est rejoué Produit par Produit pour ne compter que les
 * réindexations réellement réussies.
 */
async function reindexerLesProduitsEcrits(
  lotId: string,
  overrides: Partial<CatalogEffects> | undefined
): Promise<number> {
  const lignes = await prisma.ligneImport.findMany({
    where: { lotId, statut: "ecrite" },
    orderBy: { numero: "asc" },
    select: { slug: true },
  })
  const slugs = [...new Set(lignes.map((ligne) => ligne.slug))]
  if (slugs.length === 0) return 0

  const produits = await prisma.product.findMany({
    where: { slug: { in: slugs } },
    include: {
      variants: {
        select: { name: true, sku: true, priceDelta: true, stock: true },
      },
    },
  })
  const parSlug = new Map(produits.map((produit) => [produit.slug, produit]))
  // La Structure se lit par sa porte unique, jamais par une relation Prisma.
  const structures = await lireStructure()
  const documents = slugs.flatMap((slugProduit) => {
    const produit = parSlug.get(slugProduit)
    if (produit === undefined) return []
    const structure =
      produit.categoryId === null
        ? null
        : structures.structure(produit.categoryId)
    return [
      toIndexableProduct({
        ...produit,
        category:
          structure === null
            ? null
            : { id: structure.id, slug: structure.slug, name: structure.name },
      }),
    ]
  })

  const indexation =
    overrides?.reindexProducts ??
    defaultCatalogEffects("import-produits").reindexProducts
  let indexes = 0
  for (
    let debut = 0;
    debut < documents.length;
    debut += PRODUITS_PAR_APPLICATION_IMPORT
  ) {
    const paquet = documents.slice(
      debut,
      debut + PRODUITS_PAR_APPLICATION_IMPORT
    )
    try {
      await indexation(paquet)
      indexes += paquet.length
    } catch {
      for (const document of paquet) {
        try {
          await indexation([document])
          indexes += 1
        } catch {
          // Ce Produit reste non indexé : un appel suivant le retentera.
        }
      }
    }
  }
  return indexes
}

/**
 * Applique un Lot vérifié : les Produits du fichier, dans l'ordre de première
 * apparition, 25 au plus par appel. Chaque Produit rejoue la Vérification avec
 * un instantané frais, puis son écriture passe par l'écrivain du Catalogue —
 * une transaction par Produit, une seconde pour ses Lignes et le curseur. Un
 * Produit en échec n'arrête pas les autres : ses Lignes portent le motif.
 *
 * L'indexation est un effet après commit, non bloquant : `ecrits` compte les
 * Produits écrits, `indexes` les réindexés. Tant qu'ils diffèrent, le Lot reste
 * `en_cours` et un appel suivant rattrape l'indexation.
 */
export async function appliquerLeLot(
  lotId: string,
  curseur: number,
  overrides?: Partial<CatalogEffects>
): Promise<ApplicationLotImport> {
  const lot = await prisma.lotImport.findUnique({
    where: { id: lotId },
    select: {
      id: true,
      statut: true,
      ecrits: true,
      indexes: true,
      lignes: {
        orderBy: { numero: "asc" },
        select: {
          numero: true,
          slug: true,
          statut: true,
          cellules: true,
          codeRefus: true,
        },
      },
    },
  })

  if (lot === null) {
    throw new UserFacingError(MESSAGE_LOT_INTROUVABLE)
  }
  if (!peutAppliquer(lot.statut)) {
    throw new UserFacingError(messageDuStatutNonApplicable(lot.statut))
  }
  if (!Number.isInteger(curseur) || curseur < 0) {
    throw new UserFacingError("Le curseur d'application est invalide.")
  }
  if (lot.lignes.some((ligne) => ligne.statut === "refusee")) {
    throw new UserFacingError(MESSAGE_APPLIQUER_REFUS)
  }

  // Le passage à `en_cours` est la première écriture, avant tout Produit : la
  // perdante d'une course est refusée sans avoir rien écrit. Un Lot déjà
  // `en_cours` est une reprise : il ne repasse pas par la transition.
  if (lot.statut === "verifie") {
    await demarrerLApplication(lotId)
  }

  const lignesRejouees = rejouerLesLignes(
    lot.lignes.map((ligne) => ({
      numero: ligne.numero,
      cellules: ligne.cellules as unknown as CellulesImport,
      codeRefus: ligne.codeRefus,
    }))
  )
  const rejoueeParNumero = new Map(
    lignesRejouees.map((ligne) => [ligne.numero, ligne])
  )
  const groupes = grouperParProduit(lot.lignes)

  // Le curseur donne l'index du prochain Produit ; un Produit déjà écrit ou en
  // échec est sauté pour qu'une reprise ne le réécrive jamais.
  let index = Math.min(curseur, groupes.length)
  let traites = 0
  const aTraiter: {
    position: number
    slug: string
    lignesRejouees: LigneImport[]
  }[] = []
  while (index < groupes.length && traites < PRODUITS_PAR_APPLICATION_IMPORT) {
    const groupe = groupes[index]!
    if (!groupe.lignes.every((ligne) => produitsEcrits(ligne.statut))) {
      const lignesDuGroupe = groupe.lignes.flatMap((ligne) => {
        const rejouee = rejoueeParNumero.get(ligne.numero)
        return rejouee === undefined ? [] : [rejouee]
      })
      aTraiter.push({
        position: index,
        slug: groupe.slug,
        lignesRejouees: lignesDuGroupe,
      })
      traites += 1
    }
    index += 1
  }
  const curseurSuivant = index
  const reste = groupes.length - curseurSuivant

  const lignesDuLot = aTraiter.flatMap((produit) => produit.lignesRejouees)
  const instantane =
    lignesDuLot.length === 0 ? null : await lireLInstantane(lignesDuLot)
  const plans =
    instantane === null ? [] : planifierLeLot(lignesDuLot, instantane)
  const planParSlug = new Map(plans.map((plan) => [plan.slug, plan]))

  let ecrits = lot.ecrits
  let indexes = Math.min(lot.indexes, lot.ecrits)
  const echecs: EchecProduitApplication[] = []

  for (const produit of aTraiter) {
    const plan = planParSlug.get(produit.slug)
    if (plan === undefined) {
      throw new Error(
        `Le plan du Produit ${produit.slug} manque à l'application du Lot`
      )
    }

    if (plan.issue === "inchange") {
      await prisma.lotImport.update({
        where: { id: lotId },
        data: { curseur: produit.position + 1, statut: "en_cours" },
      })
      continue
    }

    let statutLignes: StatutLigneImport = "echouee"
    let motif: string | null = null
    let ecrit = false
    let indexe = false

    if (plan.issue === "refuse") {
      motif =
        plan.refus === null
          ? "Le Produit a été refusé par la Vérification."
          : messageDuRefus(plan.refus)
      echecs.push({ slug: produit.slug, motif })
    } else {
      try {
        const existant = instantane?.produitsParSlug[produit.slug] ?? null
        const champs =
          existant === null
            ? {
                specs: {},
                images: [],
                isFeatured: false,
                featuredOrder: 0,
                freeShipping: false,
              }
            : await lireLesChampsPreserves(existant.id)
        const donnees = donneesDuProduitImport(plan, champs)
        const marqueur = { indexe: false }
        const effets = effetsAvecIndexation(overrides, marqueur)

        if (existant === null) {
          await createProduct(donnees, effets)
        } else {
          await updateProduct(existant.id, donnees, effets)
        }

        statutLignes = "ecrite"
        ecrit = true
        indexe = marqueur.indexe
      } catch (error) {
        motif = motifDeLEchec(error, produit.slug)
        echecs.push({ slug: produit.slug, motif })
      }
    }

    if (ecrit) {
      ecrits += 1
      if (indexe) indexes = Math.min(indexes + 1, ecrits)
    }

    await prisma.$transaction([
      prisma.ligneImport.updateMany({
        where: { lotId, slug: produit.slug },
        data: { statut: statutLignes, motifEchec: motif },
      }),
      prisma.lotImport.update({
        where: { id: lotId },
        data: {
          curseur: produit.position + 1,
          statut: "en_cours",
          ecrits,
          indexes: Math.min(indexes, ecrits),
        },
      }),
    ])
  }

  let statut: StatutLotImport
  let indexesFinaux = Math.min(indexes, ecrits)
  let indexationEnAttente = false

  if (reste > 0) {
    statut = "en_cours"
    indexationEnAttente = indexesFinaux < ecrits
  } else {
    const echecsDuLot =
      (await prisma.ligneImport.count({
        where: { lotId, statut: "echouee" },
      })) > 0
    if (echecsDuLot) {
      statut = "partiel"
    } else if (indexesFinaux < ecrits) {
      indexesFinaux = Math.min(
        await reindexerLesProduitsEcrits(lotId, overrides),
        ecrits
      )
      if (indexesFinaux < ecrits) {
        statut = "en_cours"
        indexationEnAttente = true
      } else {
        statut = "termine"
      }
    } else {
      statut = "termine"
    }
  }

  await prisma.lotImport.update({
    where: { id: lotId },
    data: {
      statut,
      curseur: curseurSuivant,
      ecrits,
      indexes: indexesFinaux,
    },
  })

  return {
    lotId,
    traites,
    reste,
    curseurSuivant,
    ecrits,
    indexes: indexesFinaux,
    echecs,
    indexationEnAttente,
    statut,
  }
}

/**
 * Le contexte qu'un refus relu retrouve dans les cellules persistées : le sku
 * de la Ligne, la Structure nommée par le groupe et le champ requis manquant du
 * Produit. Le décodeur du contrat décide seul quels codes s'en servent.
 */
function contexteDuRefus(
  ligne: LigneImportLue,
  groupe: readonly LigneImportLue[]
): ContexteRefusImport {
  const structure = groupe
    .map((membre) => membre.cellules.category)
    .find((valeur) => valeur !== undefined && valeur !== "")
  const champ = champRequisManquantDuProduit(
    groupe.map((membre) => ({ cellules: membre.cellules }))
  )

  return {
    sku: ligne.sku,
    ...(structure === undefined ? {} : { structure }),
    ...(champ === null ? {} : { champ }),
  }
}

/** Les Lots passés, du plus récent au plus ancien, sans leurs Lignes. */
export async function listerLesLots(): Promise<LotImportListe[]> {
  return prisma.lotImport.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: LIMITE_LOTS_HISTORIQUE_IMPORT,
    select: {
      id: true,
      createdAt: true,
      statut: true,
      produitsCrees: true,
      produitsModifies: true,
      produitsInchanges: true,
      produitsRefuses: true,
      ecrits: true,
      indexes: true,
      auteur: { select: { name: true, email: true } },
    },
  })
}

/** Le Lot et ses Lignes, pour la page et les tickets suivants. */
export async function lireLeLot(id: string): Promise<LotImportLu | null> {
  const lot = await prisma.lotImport.findUnique({
    where: { id },
    select: {
      id: true,
      auteurId: true,
      auteur: { select: { id: true, name: true, email: true } },
      empreinte: true,
      taille: true,
      statut: true,
      curseur: true,
      produitsCrees: true,
      produitsModifies: true,
      produitsInchanges: true,
      produitsRefuses: true,
      ecrits: true,
      indexes: true,
      avertissements: true,
      motifEchec: true,
      createdAt: true,
      lignes: {
        orderBy: { numero: "asc" },
        select: {
          id: true,
          numero: true,
          slug: true,
          sku: true,
          cellules: true,
          enregistrement: true,
          statut: true,
          codeRefus: true,
          motifEchec: true,
          avertissements: true,
          diff: true,
        },
      },
    },
  })

  if (lot === null) return null

  const lignes: LigneImportLue[] = lot.lignes.map((ligne) => ({
    ...ligne,
    cellules: ligne.cellules as CellulesImport,
    enregistrement: ligne.enregistrement as EnregistrementImport | null,
    refus: null,
    diff: ligne.diff as DiffProduitPlanImport | null,
  }))

  const analyses = rejouerLesLignes(lignes)
  const analyseParNumero = new Map(
    analyses.map((ligne) => [ligne.numero, ligne])
  )
  const groupes = new Map(
    grouperParProduit(lignes).map((groupe) => [groupe.slug, groupe.lignes])
  )

  return {
    ...lot,
    lignes: lignes.map((ligne) => {
      const analysee = analyseParNumero.get(ligne.numero)
      const refusRejoue =
        analysee !== undefined &&
        analysee.refus !== null &&
        analysee.refus.code === ligne.codeRefus
          ? analysee.refus
          : null
      const refus =
        ligne.codeRefus === null
          ? null
          : (refusRejoue ??
            refusDepuisLeCode(
              ligne.codeRefus,
              contexteDuRefus(ligne, groupes.get(ligne.slug) ?? [ligne])
            ))

      return {
        ...ligne,
        enregistrement: analysee?.enregistrement ?? null,
        refus,
      }
    }),
  }
}

/**
 * Le Lot `en_cours`, le plus récent : la page le retrouve après un onglet
 * fermé et propose de reprendre. L'index partiel garantit qu'il y en a au plus
 * un ; le tri par date n'est qu'un départage déterministe.
 */
export async function lireLotEnCours(): Promise<LotEnCoursImport | null> {
  return prisma.lotImport.findFirst({
    where: { statut: "en_cours" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      createdAt: true,
      curseur: true,
      ecrits: true,
      indexes: true,
    },
  })
}
