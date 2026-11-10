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
  type EnregistrementImport,
  type LigneImport,
  type RefusImport,
} from "@/lib/import-produits"
import {
  champRequisManquantDuProduit,
  planifierLeLot,
  type DiffProduitPlanImport,
  type InstantaneCatalogue,
  type PlanProduit,
} from "@/lib/plan-import-produits"
import { lireStructure } from "@/lib/use-cases/lecture-structure"
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
