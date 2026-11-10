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
  PRODUITS_PAR_APPLICATION_IMPORT,
  analyserLesLignes,
  estCodeRefusImport,
  grouperParProduit,
  jugerLEnTete,
  lireLeTexte,
  lireLesLignes,
  messageDAvertissement,
  messageDuRefus,
  type AvertissementImport,
  type CellulesImport,
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

export interface CompteursImport {
  produitsCrees: number
  produitsModifies: number
  produitsInchanges: number
  produitsRefuses: number
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

function donneesDeLaLigne(ligne: LigneImport) {
  const statut: StatutLigneImport | null =
    ligne.refus === null ? null : "refusee"

  return {
    numero: ligne.numero,
    slug: ligne.slug,
    sku: ligne.sku,
    cellules: ligne.cellules as unknown as Prisma.InputJsonValue,
    enregistrement:
      ligne.enregistrement === null
        ? Prisma.DbNull
        : (ligne.enregistrement as unknown as Prisma.InputJsonValue),
    codeRefus: ligne.refus?.code ?? null,
    avertissements: ligne.avertissements.map(
      (avertissement) => avertissement.code
    ),
    statut,
  }
}

/**
 * Crée un Lot pour tout fichier reçu : `brouillon` quand l'enveloppe est
 * acceptée — avec toutes ses Lignes lues dans la même écriture —, `echoue`
 * avec son motif sinon. Un Lot refusé ne porte aucune Ligne. L'empreinte est
 * celle des octets reçus, pas du texte décodé.
 */
export async function televerserLeFichier({
  octets,
  auteurId,
}: TeleversementImport): Promise<LotImportTeleverse> {
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
      ...(accepte ? { lignes: { create: lignes.map(donneesDeLaLigne) } } : {}),
    },
    select: { id: true, statut: true },
  })

  return { lotId: lot.id, statut: lot.statut }
}

/**
 * Rejoue l'analyse d'un Lot depuis les cellules persistées : le numéro et les
 * cellules sont la seule vérité, le code stocké n'est qu'un témoin. C'est ce
 * qui rend visibles le champ manquant, la forme du doublon et le champ du
 * conflit, que #983 n'avait pas conservés.
 */
function rejouerLesLignes(
  lignes: readonly { numero: number; cellules: CellulesImport }[]
): LigneImport[] {
  return [...analyserLesLignes(lignes)]
}

function valeursUniques(valeurs: readonly string[]): string[] {
  return [...new Set(valeurs.filter((valeur) => valeur !== ""))]
}

/**
 * Lit le Catalogue nécessaire au plan en trois lectures et une liste de noms :
 * les Produits du fichier, les Structures nommées, les skus déjà possédés, et
 * tous les noms pour l'avertissement de ressemblance. Aucune écriture.
 */
async function lireLInstantane(
  lignes: readonly LigneImport[]
): Promise<InstantaneCatalogue> {
  const slugs = valeursUniques(lignes.map((ligne) => ligne.slug))
  const categories = valeursUniques(
    lignes.map((ligne) => ligne.cellules.category ?? "")
  )
  const skus = valeursUniques(lignes.map((ligne) => ligne.sku))

  const [produits, structures, variantes, noms] = await Promise.all([
    prisma.product.findMany({
      where: { slug: { in: slugs } },
      include: {
        category: { select: { slug: true } },
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
    prisma.category.findMany({
      where: { slug: { in: categories } },
      select: { id: true, slug: true },
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
          structureSlug: produit.category?.slug ?? null,
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
      structures.map((structure) => [
        structure.slug,
        { id: structure.id, slug: structure.slug },
      ])
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
        select: { numero: true, cellules: true },
      },
    },
  })

  if (lot === null) {
    throw new UserFacingError("Ce Lot d'import est introuvable.")
  }
  if (lot.statut !== "brouillon" && lot.statut !== "verifie") {
    throw new UserFacingError(messageDuStatutNonVerifiable(lot.statut))
  }

  const lignes = rejouerLesLignes(
    lot.lignes.map((ligne) => ({
      numero: ligne.numero,
      cellules: ligne.cellules as CellulesImport,
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
        numero: ligne.numero,
        slug: ligne.slug,
        sku: ligne.sku,
        cellules: ligne.cellules as unknown as Prisma.InputJsonValue,
        enregistrement:
          ligne.enregistrement === null
            ? Prisma.DbNull
            : (ligne.enregistrement as unknown as Prisma.InputJsonValue),
        codeRefus: lignePlanifiee.refus?.code ?? null,
        avertissements: lignePlanifiee.avertissements.map(
          (avertissement) => avertissement.code
        ),
        diff:
          diff === null
            ? Prisma.DbNull
            : (diff as unknown as Prisma.InputJsonValue),
        statut: lignePlanifiee.statut,
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

function motifDeLEchec(error: unknown): string {
  if (error instanceof UserFacingError) return error.message
  const message = error instanceof Error ? error.message : String(error)
  return `L'écriture du Produit a échoué : ${message}`
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
      category: { select: { id: true, slug: true, name: true } },
    },
  })
  const parSlug = new Map(produits.map((produit) => [produit.slug, produit]))
  const documents = slugs.flatMap((slugProduit) => {
    const produit = parSlug.get(slugProduit)
    return produit === undefined ? [] : [toIndexableProduct(produit)]
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
        },
      },
    },
  })

  if (lot === null) {
    throw new UserFacingError("Ce Lot d'import est introuvable.")
  }
  if (lot.statut !== "verifie" && lot.statut !== "en_cours") {
    throw new UserFacingError(messageDuStatutNonApplicable(lot.statut))
  }
  if (!Number.isInteger(curseur) || curseur < 0) {
    throw new UserFacingError("Le curseur d'application est invalide.")
  }
  if (lot.lignes.some((ligne) => ligne.statut === "refusee")) {
    throw new UserFacingError(MESSAGE_APPLIQUER_REFUS)
  }

  const lignesRejouees = rejouerLesLignes(
    lot.lignes.map((ligne) => ({
      numero: ligne.numero,
      cellules: ligne.cellules as unknown as CellulesImport,
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
        motif = motifDeLEchec(error)
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
 * Le refus d'une Ligne dont le code a été persisté mais dont le plan n'a pas
 * laissé de trace en clair : le contexte est reconstruit depuis les cellules,
 * quand il l'est, et la portée produit est dite.
 */

function refusDepuisLeCode(
  codeRefus: string | null,
  ligne: LigneImportLue,
  groupe: readonly LigneImportLue[]
): RefusImport | null {
  if (codeRefus === null || !estCodeRefusImport(codeRefus)) return null

  switch (codeRefus) {
    case "structure_inconnue": {
      const structure = groupe
        .map((membre) => membre.cellules.category)
        .find((valeur) => valeur !== undefined && valeur !== "")
      return {
        code: codeRefus,
        ...(structure === undefined ? {} : { structure }),
        portee: "produit",
      }
    }
    case "sku_deja_pris":
      return { code: codeRefus, sku: ligne.sku, portee: "produit" }
    case "champ_requis_manquant": {
      const champ = champRequisManquantDuProduit(
        groupe.map((membre) => ({ cellules: membre.cellules }))
      )
      return {
        code: codeRefus,
        ...(champ === null ? {} : { champ }),
        portee: "produit",
      }
    }
    default:
      return { code: codeRefus }
  }
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

  const analyses = analyserLesLignes(
    lignes.map((ligne) => ({ numero: ligne.numero, cellules: ligne.cellules }))
  )
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
              ligne,
              groupes.get(ligne.slug) ?? [ligne]
            ))

      return {
        ...ligne,
        enregistrement: analysee?.enregistrement ?? null,
        refus,
      }
    }),
  }
}
