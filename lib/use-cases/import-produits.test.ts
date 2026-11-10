import { randomUUID } from "node:crypto"

import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"
import {
  StatutLigneImport as STATUT_LIGNE_IMPORT_PRISMA,
  StatutLotImport as STATUT_LOT_IMPORT_PRISMA,
} from "@/lib/generated/prisma/client"
import {
  COLONNES_IMPORT,
  LIMITE_OCTETS_IMPORT,
  STATUTS_LIGNE_IMPORT,
  STATUTS_LOT_IMPORT,
  messageDAvertissement,
} from "@/lib/import-produits"
import { lireLeLot, televerserLeFichier } from "@/lib/use-cases/import-produits"

const runId = randomUUID().slice(0, 8)
const AUTEUR_ID = `import-auteur-${runId}`
const AUTEUR_EMAIL = `import-${runId}@example.test`
const AUTEUR_NOM = `Auteur import ${runId}`

const EN_TETE = `${COLONNES_IMPORT.join(",")}\r\n`
const EN_TETE_AVEC_BOM = `\uFEFF${EN_TETE}`
const EMPREINTE_EN_TETE_AVEC_BOM =
  "3b9017f6d30ec743a1120e03217770709edc247a146bd6814f287a6bd06a877e"

function octets(texte: string): Uint8Array {
  return new TextEncoder().encode(texte)
}

function televerser(contenu: string | Uint8Array) {
  const contenuOctets = typeof contenu === "string" ? octets(contenu) : contenu
  return televerserLeFichier({
    nomFichier: "catalogue.csv",
    octets: contenuOctets,
    auteurId: AUTEUR_ID,
  })
}

async function compterLeCatalogue() {
  const [structures, produits, variantes] = await Promise.all([
    prisma.category.count(),
    prisma.product.count(),
    prisma.productVariant.count(),
  ])
  return { structures, produits, variantes }
}

beforeEach(async () => {
  await prisma.ligneImport.deleteMany()
  await prisma.lotImport.deleteMany()
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
  await prisma.user.deleteMany({ where: { id: AUTEUR_ID } })
  await prisma.$disconnect()
})

describe("televerserLeFichier — l'enveloppe acceptée", () => {
  it("crée un brouillon avec auteur, instant, empreinte et taille", async () => {
    const avant = new Date()

    const resultat = await televerser(EN_TETE_AVEC_BOM)
    const lot = await lireLeLot(resultat.lotId)

    expect(lot).toMatchObject({
      auteurId: AUTEUR_ID,
      auteur: { id: AUTEUR_ID, name: AUTEUR_NOM, email: AUTEUR_EMAIL },
      empreinte: EMPREINTE_EN_TETE_AVEC_BOM,
      taille: octets(EN_TETE_AVEC_BOM).byteLength,
      statut: "brouillon",
      motifEchec: null,
      avertissements: [],
      lignes: [],
    })
    expect(lot?.createdAt).toBeInstanceOf(Date)
    expect(lot?.createdAt.getTime()).toBeGreaterThanOrEqual(avant.getTime())
  })

  it("attache l'avertissement d'une colonne inconnue au Lot, relisible", async () => {
    const resultat = await televerser(`${COLONNES_IMPORT.join(",")},notes\r\n`)
    const lot = await lireLeLot(resultat.lotId)

    expect(lot?.statut).toBe("brouillon")
    expect(lot?.avertissements).toEqual([
      messageDAvertissement({ code: "colonne_inconnue", colonne: "notes" }),
    ])
  })

  it("n'écrit aucun Produit, aucune Variante et aucune Structure", async () => {
    const avant = await compterLeCatalogue()

    await televerser(EN_TETE)
    await televerser("name,brand,variant_sku\r\n")

    expect(await compterLeCatalogue()).toEqual(avant)
  })
})

describe("televerserLeFichier — l'enveloppe refusée", () => {
  it("refuse un fichier de plus de 5 Mo en disant de le découper, sans Ligne", async () => {
    const tropGros = new Uint8Array(LIMITE_OCTETS_IMPORT + 1).fill(0x61)

    const resultat = await televerser(tropGros)
    const lot = await lireLeLot(resultat.lotId)

    expect(lot).toMatchObject({
      statut: "echoue",
      taille: LIMITE_OCTETS_IMPORT + 1,
      avertissements: [],
      lignes: [],
    })
    expect(lot?.motifEchec).toContain("5 Mo")
    expect(lot?.motifEchec).toMatch(/découp/i)
    expect(lot?.empreinte).toMatch(/^[0-9a-f]{64}$/)
  })

  it("refuse un fichier qui n'est pas en UTF-8 strict, sans Ligne", async () => {
    const latin1 = new Uint8Array([0x73, 0x6c, 0x75, 0x67, 0x2c, 0xe9])

    const resultat = await televerser(latin1)
    const lot = await lireLeLot(resultat.lotId)

    expect(lot?.statut).toBe("echoue")
    expect(lot?.motifEchec).toContain("UTF-8")
    expect(lot?.lignes).toEqual([])
  })

  it("refuse un en-tête qui omet slug en nommant la colonne, sans Ligne", async () => {
    const resultat = await televerser("name,brand,variant_sku\r\n")
    const lot = await lireLeLot(resultat.lotId)

    expect(lot?.statut).toBe("echoue")
    expect(lot?.motifEchec).toContain("« slug »")
    expect(lot?.lignes).toEqual([])
  })

  it("refuse un en-tête qui omet variant_sku en nommant la colonne, sans Ligne", async () => {
    const resultat = await televerser("slug,name,brand\r\n")
    const lot = await lireLeLot(resultat.lotId)

    expect(lot?.statut).toBe("echoue")
    expect(lot?.motifEchec).toContain("« variant_sku »")
    expect(lot?.lignes).toEqual([])
  })
})

describe("lireLeLot", () => {
  it("rend null pour un Lot inconnu", async () => {
    await expect(lireLeLot("lot-inexistant")).resolves.toBeNull()
  })

  it("relit les Lignes d'un Lot dans l'ordre de leur numéro", async () => {
    const lot = await prisma.lotImport.create({
      data: {
        auteurId: AUTEUR_ID,
        empreinte: "a".repeat(64),
        taille: 42,
      },
    })
    await prisma.ligneImport.createMany({
      data: [
        {
          lotId: lot.id,
          numero: 2,
          slug: "chaise",
          sku: "SKU-2",
          cellules: { slug: "chaise" },
          statut: "a_creer",
        },
        {
          lotId: lot.id,
          numero: 1,
          slug: "table",
          sku: "SKU-1",
          cellules: { slug: "table" },
          codeRefus: "prix_invalide",
          avertissements: ["colonne_inconnue"],
        },
      ],
    })

    const lu = await lireLeLot(lot.id)

    expect(lu?.lignes.map((ligne) => ligne.numero)).toEqual([1, 2])
    expect(lu?.lignes[0]).toMatchObject({
      slug: "table",
      sku: "SKU-1",
      codeRefus: "prix_invalide",
      avertissements: ["colonne_inconnue"],
      statut: null,
    })
    expect(lu?.lignes[1]).toMatchObject({
      slug: "chaise",
      statut: "a_creer",
    })
  })
})

describe("les énumérations Prisma portent le vocabulaire du contrat", () => {
  it("garde les mêmes statuts de Lot", () => {
    expect(Object.values(STATUT_LOT_IMPORT_PRISMA)).toEqual([
      ...STATUTS_LOT_IMPORT,
    ])
  })

  it("garde les mêmes statuts de Ligne", () => {
    expect(Object.values(STATUT_LIGNE_IMPORT_PRISMA)).toEqual([
      ...STATUTS_LIGNE_IMPORT,
    ])
  })
})
