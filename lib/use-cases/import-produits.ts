import { createHash } from "node:crypto"

import { prisma } from "@/lib/db"
import {
  Prisma,
  type StatutLigneImport,
  type StatutLotImport,
} from "@/lib/generated/prisma/client"
import {
  LIMITE_OCTETS_IMPORT,
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

/**
 * Le cas d'usage du téléversement : il juge l'enveloppe, lit les Lignes et
 * persiste le Lot avec elles. C'est le seul module de l'import qui parle
 * Prisma. Aucun Produit, aucune Variante et aucune Structure n'est écrit ici.
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
  avertissements: string[]
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
        },
      },
    },
  })

  if (lot === null) return null

  return {
    ...lot,
    lignes: lot.lignes.map((ligne) => ({
      ...ligne,
      cellules: ligne.cellules as CellulesImport,
      enregistrement: ligne.enregistrement as EnregistrementImport | null,
    })),
  }
}
