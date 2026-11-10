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
  type ColonneImport,
} from "@/lib/import-produits"
import {
  LIMITE_LOTS_HISTORIQUE_IMPORT,
  listerLesLots,
  lireLeLot,
  televerserLeFichier,
  verifierLeLot,
} from "@/lib/use-cases/import-produits"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

const runId = randomUUID().slice(0, 8)
const AUTEUR_ID = `import-auteur-${runId}`
const AUTEUR_EMAIL = `import-${runId}@example.test`
const AUTEUR_NOM = `Auteur import ${runId}`

const EN_TETE = `${COLONNES_IMPORT.join(",")}\r\n`
const EN_TETE_AVEC_BOM = `\uFEFF${EN_TETE}`
const EMPREINTE_EN_TETE_AVEC_BOM =
  "3b9017f6d30ec743a1120e03217770709edc247a146bd6814f287a6bd06a877e"

// Dans l'ordre canonique : slug,name,brand,category,description,variant_sku,
// variant_name,variant_price,variant_stock.
const LIGNE_CHAISE = "chaise,Chaise,Maison,,,CHAISE-01,Chaise en bois,12.50,3"
const LIGNE_TABLE = "table,Table,Maison,,,TABLE-01,Table en bois,89.00,1"

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
  await prisma.product.deleteMany({
    where: { slug: { startsWith: `v-${runId}-` } },
  })
  await prisma.category.deleteMany({
    where: { slug: { startsWith: `v-${runId}-` } },
  })
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
  await prisma.product.deleteMany({
    where: { slug: { startsWith: `v-${runId}-` } },
  })
  await prisma.category.deleteMany({
    where: { slug: { startsWith: `v-${runId}-` } },
  })
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
    await televerser(`${EN_TETE}${LIGNE_CHAISE}\r\n${LIGNE_TABLE}\r\n`)

    expect(await compterLeCatalogue()).toEqual(avant)
  })
})

describe("televerserLeFichier — les Lignes lues", () => {
  it("persiste chaque Ligne avec ses cellules brutes et son enregistrement normalisé", async () => {
    const resultat = await televerser(
      `${EN_TETE}${LIGNE_CHAISE}\r\n${LIGNE_TABLE}\r\n`
    )
    const lot = await lireLeLot(resultat.lotId)

    expect(lot?.statut).toBe("brouillon")
    expect(lot?.lignes).toHaveLength(2)
    expect(lot?.lignes[0]).toMatchObject({
      numero: 2,
      slug: "chaise",
      sku: "CHAISE-01",
      statut: null,
      codeRefus: null,
      avertissements: [],
      cellules: {
        slug: "chaise",
        name: "Chaise",
        brand: "Maison",
        category: "",
        description: "",
        variant_sku: "CHAISE-01",
        variant_name: "Chaise en bois",
        variant_price: "12.50",
        variant_stock: "3",
      },
      enregistrement: {
        produit: {
          slug: "chaise",
          name: "Chaise",
          brand: "Maison",
          category: null,
          description: null,
        },
        variante: {
          sku: "CHAISE-01",
          name: "Chaise en bois",
          prix: 1250,
          stock: 3,
        },
      },
    })
    expect(lot?.lignes[1]).toMatchObject({
      numero: 3,
      slug: "table",
      sku: "TABLE-01",
      statut: null,
    })
  })

  it("persiste une Ligne refusée avec le statut refusee et son code", async () => {
    const resultat = await televerser(
      `${EN_TETE}chaise,Chaise,Maison,,,CHAISE-01,,abc,3\r\n${LIGNE_TABLE}\r\n`
    )
    const lot = await lireLeLot(resultat.lotId)

    expect(lot?.statut).toBe("brouillon")
    expect(lot?.lignes[0]).toMatchObject({
      numero: 2,
      slug: "chaise",
      sku: "CHAISE-01",
      statut: "refusee",
      codeRefus: "prix_invalide",
    })
    expect(lot?.lignes[1]).toMatchObject({
      numero: 3,
      slug: "table",
      statut: null,
      codeRefus: null,
    })
  })

  it("persiste les codes d'avertissement d'une Ligne sans la refuser", async () => {
    const resultat = await televerser(
      `${EN_TETE}chaise,Chaise,Maison,,"<b>Bois massif</b>",CHAISE-01,,4.00,3\r\n`
    )
    const lot = await lireLeLot(resultat.lotId)

    expect(lot?.lignes[0]).toMatchObject({
      statut: null,
      codeRefus: null,
      avertissements: ["description_html"],
    })
  })

  it("garde le Lot brouillon et ses Lignes lisibles quand une Ligne est mal formée", async () => {
    const resultat = await televerser(
      `${EN_TETE}${LIGNE_CHAISE}\r\ntrop,peu\r\n${LIGNE_TABLE}\r\n`
    )
    const lot = await lireLeLot(resultat.lotId)

    expect(lot?.statut).toBe("brouillon")
    expect(
      lot?.lignes.map((ligne) => [
        ligne.numero,
        ligne.codeRefus,
        ligne.statut,
        ligne.slug,
      ])
    ).toEqual([
      [2, null, null, "chaise"],
      [3, "ligne_mal_formee", "refusee", ""],
      [4, null, null, "table"],
    ])
  })

  it("persiste le doublon et le conflit sur toutes leurs occurrences", async () => {
    const resultat = await televerser(
      `${EN_TETE}chaise,Chaise,Maison,,,SKU-1,,10.00,1\r\n` +
        `chaise,Table,Maison,,,SKU-2,,10.00,1\r\n` +
        `banc,Banc,Maison,,,SKU-2,,10.00,1\r\n`
    )
    const lot = await lireLeLot(resultat.lotId)

    expect(lot?.lignes.map((ligne) => [ligne.codeRefus, ligne.statut])).toEqual(
      [
        ["produit_en_conflit", "refusee"],
        ["doublon_fichier", "refusee"],
        ["doublon_fichier", "refusee"],
      ]
    )
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

  it("re-derive le contexte d'un champ requis manquant depuis les cellules", async () => {
    const resultat = await televerser(
      `${EN_TETE}chaise,Chaise,Maison,,,,Chaise,10.00,3\r\n`
    )
    const lot = await lireLeLot(resultat.lotId)

    expect(lot?.lignes[0]?.codeRefus).toBe("champ_requis_manquant")
    expect(lot?.lignes[0]?.refus).toEqual({
      code: "champ_requis_manquant",
      champ: "variant_sku",
    })
  })

  it("re-derive le champ d'un conflit de Produit depuis les cellules", async () => {
    const resultat = await televerser(
      `${EN_TETE}chaise,Chaise,Maison,,,CHAISE-01,Chaise,10.00,1\r\n` +
        `chaise,Autre,Maison,,,CHAISE-02,Table,10.00,1\r\n`
    )
    const lot = await lireLeLot(resultat.lotId)

    expect(lot?.lignes.map((ligne) => ligne.refus)).toEqual([
      { code: "produit_en_conflit", champ: "name" },
      { code: "produit_en_conflit", champ: "name" },
    ])
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

describe("listerLesLots", () => {
  it("liste les Lots du plus récent au plus ancien, avec auteur, date, statut et compteurs", async () => {
    const ancien = await prisma.lotImport.create({
      data: {
        auteurId: AUTEUR_ID,
        empreinte: "1".repeat(64),
        taille: 10,
        statut: "termine",
        produitsCrees: 2,
        produitsModifies: 1,
        produitsInchanges: 0,
        produitsRefuses: 1,
        ecrits: 3,
        indexes: 2,
        createdAt: new Date("2026-01-01T10:00:00.000Z"),
      },
    })
    const recent = await prisma.lotImport.create({
      data: {
        auteurId: AUTEUR_ID,
        empreinte: "2".repeat(64),
        taille: 20,
        statut: "brouillon",
        produitsCrees: 0,
        produitsModifies: 0,
        produitsInchanges: 0,
        produitsRefuses: 0,
        ecrits: 0,
        indexes: 0,
        createdAt: new Date("2026-02-01T10:00:00.000Z"),
      },
    })

    const lots = await listerLesLots()

    expect(lots.map((lot) => lot.id)).toEqual([recent.id, ancien.id])
    expect(lots[0]).toMatchObject({
      auteur: { name: AUTEUR_NOM, email: AUTEUR_EMAIL },
      statut: "brouillon",
      produitsCrees: 0,
      produitsModifies: 0,
      produitsInchanges: 0,
      produitsRefuses: 0,
      ecrits: 0,
      indexes: 0,
    })
    expect(lots[1]).toMatchObject({
      auteur: { name: AUTEUR_NOM, email: AUTEUR_EMAIL },
      statut: "termine",
      produitsCrees: 2,
      produitsModifies: 1,
      produitsInchanges: 0,
      produitsRefuses: 1,
      ecrits: 3,
      indexes: 2,
    })
    expect(lots[0]?.createdAt).toBeInstanceOf(Date)
  })

  it("borne l'historique aux cinquante Lots les plus récents", async () => {
    const total = LIMITE_LOTS_HISTORIQUE_IMPORT + 2
    await prisma.lotImport.createMany({
      data: Array.from({ length: total }, (_, index) => ({
        auteurId: AUTEUR_ID,
        empreinte: `${index}`.padStart(64, "3"),
        taille: index,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
      })),
    })

    const lots = await listerLesLots()
    const tous = await prisma.lotImport.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true },
    })

    expect(tous).toHaveLength(total)
    expect(lots.map((lot) => lot.id)).toEqual(
      tous.slice(0, LIMITE_LOTS_HISTORIQUE_IMPORT).map((lot) => lot.id)
    )
  })
})

describe("verifierLeLot — le jugement contre le Catalogue", () => {
  const STRUCTURE_SLUG = `v-${runId}-maison`
  const SLUG_CHAISE = `v-${runId}-chaise`
  const SLUG_BANC = `v-${runId}-banc`
  const SLUG_TABLE = `v-${runId}-table`
  const SKU_CHAISE = `${runId}-CHAISE-01`
  const SKU_BANC = `${runId}-BANC-01`
  const SKU_TABLE = `${runId}-TABLE-01`

  function celluleCsv(valeur: string): string {
    return /[",\r\n]/.test(valeur)
      ? `"${valeur.replaceAll('"', '""')}"`
      : valeur
  }

  function ligneCsv(valeurs: Partial<Record<ColonneImport, string>>): string {
    return COLONNES_IMPORT.map((colonne) =>
      celluleCsv(valeurs[colonne] ?? "")
    ).join(",")
  }

  function fichierCsv(...lignes: string[]): string {
    return [EN_TETE.replace(/\r\n$/, ""), ...lignes].join("\r\n") + "\r\n"
  }

  async function creerLaStructure(
    slug = STRUCTURE_SLUG,
    name = "Maison"
  ): Promise<string> {
    const structure = await prisma.category.create({ data: { name, slug } })
    return structure.id
  }

  async function creerLaChaise(categoryId: string) {
    return prisma.product.create({
      data: {
        slug: SLUG_CHAISE,
        name: "Chaise",
        brand: "Maison",
        description: "Bois massif",
        categoryId,
        price: 1250,
        specs: {},
        images: [],
        variants: {
          create: [
            {
              name: "Chaise en bois",
              sku: SKU_CHAISE,
              priceDelta: 0,
              stock: 3,
            },
          ],
        },
      },
      include: { variants: true },
    })
  }

  async function creerLeBanc(categoryId: string) {
    return prisma.product.create({
      data: {
        slug: SLUG_BANC,
        name: "Banc",
        brand: "Maison",
        description: "Bois massif",
        categoryId,
        price: 5000,
        specs: {},
        images: [],
        variants: {
          create: [{ name: "Banc", sku: SKU_BANC, priceDelta: 0, stock: 1 }],
        },
      },
      include: { variants: true },
    })
  }

  it("juge les quatre issues, persiste compteurs, statuts et diff, et passe le Lot à vérifié", async () => {
    const categoryId = await creerLaStructure()
    await creerLaChaise(categoryId)
    await creerLeBanc(categoryId)
    const avant = await compterLeCatalogue()

    const contenu = fichierCsv(
      ligneCsv({
        slug: SLUG_TABLE,
        name: "Table",
        brand: "Maison",
        category: STRUCTURE_SLUG,
        description: "Bois massif",
        variant_sku: SKU_TABLE,
        variant_name: "Table en bois",
        variant_price: "20.00",
        variant_stock: "2",
      }),
      ligneCsv({
        slug: SLUG_CHAISE,
        variant_sku: SKU_CHAISE,
        variant_stock: "5",
      }),
      ligneCsv({ slug: SLUG_BANC, variant_sku: SKU_BANC }),
      ligneCsv({
        slug: `v-${runId}-etagere`,
        name: "Étagère",
        brand: "Maison",
        category: `v-${runId}-inconnue`,
        variant_sku: `${runId}-ETAGERE-01`,
        variant_name: "Étagère",
        variant_price: "30.00",
      })
    )

    const televerse = await televerser(contenu)
    const rapport = await verifierLeLot(televerse.lotId)
    const lot = await lireLeLot(televerse.lotId)

    expect(rapport).toMatchObject({
      lotId: televerse.lotId,
      statut: "verifie",
      compteurs: {
        produitsCrees: 1,
        produitsModifies: 1,
        produitsInchanges: 1,
        produitsRefuses: 1,
      },
      peutAppliquer: false,
    })
    expect(
      rapport.lignes.map((ligne) => [
        ligne.numero,
        ligne.statut,
        ligne.refus?.code ?? null,
      ])
    ).toEqual([
      [2, "a_creer", null],
      [3, "a_modifier", null],
      [4, "inchangee", null],
      [5, "refusee", "structure_inconnue"],
    ])

    expect(lot).toMatchObject({
      statut: "verifie",
      produitsCrees: 1,
      produitsModifies: 1,
      produitsInchanges: 1,
      produitsRefuses: 1,
    })
    expect(lot?.lignes.map((ligne) => ligne.statut)).toEqual([
      "a_creer",
      "a_modifier",
      "inchangee",
      "refusee",
    ])

    const refusee = lot?.lignes.find((ligne) => ligne.numero === 5)
    expect(refusee?.refus).toEqual({
      code: "structure_inconnue",
      structure: `v-${runId}-inconnue`,
      portee: "produit",
    })

    const modifiee = lot?.lignes.find((ligne) => ligne.numero === 3)
    expect(modifiee?.refus).toBeNull()
    expect(modifiee?.diff).toEqual({
      produit: [],
      variantes: [
        {
          sku: SKU_CHAISE,
          changements: [{ champ: "stock", avant: 3, apres: 5 }],
        },
      ],
    })

    expect(await compterLeCatalogue()).toEqual(avant)
  })

  it("rejoue la même vérification sans doubler les Lignes ni changer les compteurs", async () => {
    const categoryId = await creerLaStructure()
    await creerLaChaise(categoryId)

    const contenu = fichierCsv(
      ligneCsv({
        slug: SLUG_CHAISE,
        variant_sku: SKU_CHAISE,
        variant_stock: "7",
      })
    )
    const televerse = await televerser(contenu)
    const premier = await verifierLeLot(televerse.lotId)
    const premierLot = await lireLeLot(televerse.lotId)

    const second = await verifierLeLot(televerse.lotId)
    const secondLot = await lireLeLot(televerse.lotId)

    expect(second.compteurs).toEqual(premier.compteurs)
    expect(second.lignes.map((ligne) => ligne.statut)).toEqual(
      premier.lignes.map((ligne) => ligne.statut)
    )
    expect(secondLot?.lignes).toHaveLength(premierLot?.lignes.length ?? 0)
    expect(secondLot?.lignes.map((ligne) => ligne.numero)).toEqual(
      premierLot?.lignes.map((ligne) => ligne.numero)
    )
    expect(secondLot?.statut).toBe("verifie")
  })

  it("accepte un Lot brouillon ou vérifié et refuse les autres statuts", async () => {
    const statuts = [
      ["en_cours", /en cours/i],
      ["partiel", /partiel/i],
      ["termine", /appliqué/i],
      ["echoue", /échoué/i],
    ] as const

    for (const [statut, motif] of statuts) {
      const lot = await prisma.lotImport.create({
        data: {
          auteurId: AUTEUR_ID,
          empreinte: "a".repeat(64),
          taille: 42,
          statut,
        },
      })

      await expect(verifierLeLot(lot.id)).rejects.toMatchObject({
        name: "UserFacingError",
        message: expect.stringMatching(motif),
      })
    }

    const brouillon = await prisma.lotImport.create({
      data: {
        auteurId: AUTEUR_ID,
        empreinte: "b".repeat(64),
        taille: 42,
        statut: "brouillon",
      },
    })
    await expect(verifierLeLot(brouillon.id)).resolves.toMatchObject({
      statut: "verifie",
    })
  })

  it("refuse une vérification pour un Lot inconnu", async () => {
    await expect(verifierLeLot("lot-inconnu")).rejects.toBeInstanceOf(
      UserFacingError
    )
    await expect(verifierLeLot("lot-inconnu")).rejects.toThrow(/introuvable/)
  })

  it("revalide une Ligne refusée quand la Structure manquante est créée", async () => {
    const contenu = fichierCsv(
      ligneCsv({
        slug: SLUG_TABLE,
        name: "Table",
        brand: "Maison",
        category: `v-${runId}-tardive`,
        variant_sku: SKU_TABLE,
        variant_name: "Table",
        variant_price: "20.00",
      })
    )
    const televerse = await televerser(contenu)

    const premier = await verifierLeLot(televerse.lotId)
    expect(premier.lignes[0]).toMatchObject({
      statut: "refusee",
      refus: { code: "structure_inconnue" },
    })
    expect(premier.peutAppliquer).toBe(false)

    await creerLaStructure(`v-${runId}-tardive`, "Tardive")

    const second = await verifierLeLot(televerse.lotId)
    expect(second.lignes[0]).toMatchObject({ statut: "a_creer", refus: null })
    expect(second.compteurs.produitsRefuses).toBe(0)
    expect(second.compteurs.produitsCrees).toBe(1)
    expect(second.peutAppliquer).toBe(true)
  })

  it("refuse un sku possédé par un autre Produit, avec son numéro de Ligne", async () => {
    const categoryId = await creerLaStructure()
    await prisma.product.create({
      data: {
        slug: SLUG_TABLE,
        name: "Table",
        brand: "Maison",
        description: "",
        categoryId,
        price: 2000,
        specs: {},
        images: [],
        variants: {
          create: [{ name: "Table", sku: SKU_TABLE, priceDelta: 0, stock: 4 }],
        },
      },
    })
    const avant = await compterLeCatalogue()

    const contenu = fichierCsv(
      ligneCsv({
        slug: `v-${runId}-nouvelle`,
        name: "Nouvelle",
        brand: "Maison",
        variant_sku: SKU_TABLE,
        variant_name: "Nouvelle",
        variant_price: "10.00",
      })
    )
    const televerse = await televerser(contenu)
    const rapport = await verifierLeLot(televerse.lotId)

    expect(rapport.lignes[0]).toMatchObject({
      numero: 2,
      statut: "refusee",
      refus: { code: "sku_deja_pris", sku: SKU_TABLE },
    })
    expect(rapport.compteurs).toEqual({
      produitsCrees: 0,
      produitsModifies: 0,
      produitsInchanges: 0,
      produitsRefuses: 1,
    })
    expect(await compterLeCatalogue()).toEqual(avant)
  })

  it("persiste l'avertissement de nom ressemblant sans refuser le Lot", async () => {
    await prisma.product.create({
      data: {
        slug: `v-${runId}-existante`,
        name: "Chaise Longue",
        brand: "Maison",
        description: "",
        price: 1000,
        specs: {},
        images: [],
        variants: {
          create: [
            {
              name: "Existante",
              sku: `${runId}-EXISTANTE-01`,
              priceDelta: 0,
              stock: 1,
            },
          ],
        },
      },
    })

    const contenu = fichierCsv(
      ligneCsv({
        slug: `v-${runId}-nouvelle`,
        name: "chaise longue",
        brand: "Maison",
        variant_sku: `${runId}-NOUVELLE-01`,
        variant_name: "Nouvelle",
        variant_price: "10.00",
      })
    )
    const televerse = await televerser(contenu)
    const rapport = await verifierLeLot(televerse.lotId)
    const lot = await lireLeLot(televerse.lotId)

    expect(rapport.compteurs.produitsCrees).toBe(1)
    expect(rapport.compteurs.produitsRefuses).toBe(0)
    expect(rapport.peutAppliquer).toBe(true)
    expect(lot?.lignes[0]?.avertissements).toContain("nom_ressemblant")
    expect(lot?.lignes[0]?.avertissements).toContain("produit_sans_structure")
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
