import { createHash } from "node:crypto"

import { prisma } from "@/lib/db"
import type {
  StatutLigneImport,
  StatutLotImport,
} from "@/lib/generated/prisma/client"
import {
  LIMITE_OCTETS_IMPORT,
  jugerLEnTete,
  lireLeTexte,
  messageDAvertissement,
  messageDuRefus,
  type AvertissementImport,
  type RefusImport,
} from "@/lib/import-produits"

/**
 * Le cas d'usage du téléversement : il juge l'enveloppe et persiste le Lot.
 * C'est le seul module de l'import qui parle Prisma. Aucun Produit, aucune
 * Variante et aucune Structure n'est écrit ici.
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
  refus: RefusImport[]
  avertissements: AvertissementImport[]
}

function jugerLEnveloppe(octets: Uint8Array): EnveloppeJugee {
  if (octets.byteLength > LIMITE_OCTETS_IMPORT) {
    return { refus: [{ code: "fichier_trop_gros" }], avertissements: [] }
  }

  const texte = lireLeTexte(octets)
  if (texte === null) {
    return { refus: [{ code: "encodage_invalide" }], avertissements: [] }
  }

  const enTete = jugerLEnTete(texte)
  return {
    refus: [...enTete.refus],
    avertissements: [...enTete.avertissements],
  }
}

/**
 * Crée un Lot pour tout fichier reçu : `brouillon` quand l'enveloppe est
 * acceptée, `echoue` avec son motif sinon. Un Lot refusé ne porte aucune
 * Ligne. L'empreinte est celle des octets reçus, pas du texte décodé.
 */
export async function televerserLeFichier({
  octets,
  auteurId,
}: TeleversementImport): Promise<LotImportTeleverse> {
  const empreinte = createHash("sha256").update(octets).digest("hex")
  const enveloppe = jugerLEnveloppe(octets)
  const accepte = enveloppe.refus.length === 0

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
    },
    select: { id: true, statut: true },
  })

  return { lotId: lot.id, statut: lot.statut }
}

/** Le Lot et ses Lignes, pour la page et les tickets suivants. */
export async function lireLeLot(id: string): Promise<LotImportLu | null> {
  return prisma.lotImport.findUnique({
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
          statut: true,
          codeRefus: true,
          avertissements: true,
        },
      },
    },
  })
}
