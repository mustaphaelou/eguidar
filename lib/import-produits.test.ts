import { describe, expect, it } from "vitest"

import {
  COLONNES_IMPORT,
  LIBELLES_STATUT_LIGNE_IMPORT,
  LIBELLES_STATUT_LOT_IMPORT,
  LIMITE_OCTETS_IMPORT,
  contenuDuModele,
  grouperParProduit,
  jugerLEnTete,
  lireLeTexte,
  lireLesLignes,
  messageDAvertissement,
  messageDuRefus,
  ressembleÀDuHtml,
  type AvertissementImport,
  type ColonneImport,
  type EnTeteImport,
  type LigneImport,
  type RefusImport,
} from "@/lib/import-produits"

const EN_TETE_CANONIQUE = COLONNES_IMPORT.join(",")

function octets(texte: string): Uint8Array {
  return new TextEncoder().encode(texte)
}

function sansBom(texte: string): string {
  return texte.startsWith("\uFEFF") ? texte.slice(1) : texte
}

describe("les neuf colonnes du contrat", () => {
  it("porte exactement les colonnes attendues, dans l'ordre canonique", () => {
    expect(COLONNES_IMPORT).toEqual([
      "slug",
      "name",
      "brand",
      "category",
      "description",
      "variant_sku",
      "variant_name",
      "variant_price",
      "variant_stock",
    ])
  })

  it("borne le fichier à 5 Mo", () => {
    expect(LIMITE_OCTETS_IMPORT).toBe(5 * 1024 * 1024)
  })
})

describe("lireLeTexte", () => {
  it("décode l'UTF-8 et conserve les fins de ligne CRLF", () => {
    expect(lireLeTexte(octets("slug,name\r\nslug-de-test,Chaise\r\n"))).toBe(
      "slug,name\r\nslug-de-test,Chaise\r\n"
    )
  })

  it("décode les accents et les caractères non latins", () => {
    expect(lireLeTexte(octets("Été — 日本語"))).toBe("Été — 日本語")
  })

  it("retire un BOM initial", () => {
    const avecBom = new Uint8Array([0xef, 0xbb, 0xbf, ...octets("slug")])

    expect(lireLeTexte(avecBom)).toBe("slug")
  })

  it("rend une chaîne vide pour zéro octet", () => {
    expect(lireLeTexte(new Uint8Array())).toBe("")
  })

  it.each([
    ["un octet Latin-1", [0x63, 0x61, 0x66, 0xe9]],
    ["une séquence tronquée", [0x63, 0x61, 0x66, 0xc3]],
    ["un encodage surlong", [0xc0, 0xaf]],
    ["une UTF-16 BOM seule", [0xff, 0xfe]],
  ])("refuse %s", (_nom, contenu) => {
    expect(lireLeTexte(new Uint8Array(contenu))).toBeNull()
  })
})

interface CasEnTete {
  nom: string
  texte: string
  attendu: EnTeteImport
}

const CAS_EN_TETE: readonly CasEnTete[] = [
  {
    nom: "accepte l'en-tête canonique, sans avertissement",
    texte: EN_TETE_CANONIQUE,
    attendu: {
      colonnes: [...COLONNES_IMPORT],
      avertissements: [],
      refus: [],
    },
  },
  {
    nom: "accepte un ordre libre et rend les colonnes du fichier",
    texte: [
      "variant_sku",
      "slug",
      "name",
      "brand",
      "category",
      "description",
      "variant_name",
      "variant_price",
      "variant_stock",
    ].join(","),
    attendu: {
      colonnes: [
        "variant_sku",
        "slug",
        "name",
        "brand",
        "category",
        "description",
        "variant_name",
        "variant_price",
        "variant_stock",
      ],
      avertissements: [],
      refus: [],
    },
  },
  {
    nom: "tolère un BOM et des fins de ligne CRLF",
    texte: `\uFEFF${EN_TETE_CANONIQUE}\r\n`,
    attendu: {
      colonnes: [...COLONNES_IMPORT],
      avertissements: [],
      refus: [],
    },
  },
  {
    nom: "tolère un en-tête entre guillemets",
    texte: COLONNES_IMPORT.map((colonne) => `"${colonne}"`).join(","),
    attendu: {
      colonnes: [...COLONNES_IMPORT],
      avertissements: [],
      refus: [],
    },
  },
  {
    nom: "ignore les cellules vides de l'en-tête",
    texte:
      "slug,,name,brand,category,description,variant_sku,variant_name,variant_price,variant_stock",
    attendu: {
      colonnes: [
        "slug",
        "name",
        "brand",
        "category",
        "description",
        "variant_sku",
        "variant_name",
        "variant_price",
        "variant_stock",
      ],
      avertissements: [],
      refus: [],
    },
  },
  {
    nom: "refuse l'en-tête qui omet slug, en le nommant",
    texte: "name,brand,variant_sku",
    attendu: {
      colonnes: ["name", "brand", "variant_sku"],
      avertissements: [],
      refus: [{ code: "en_tete_incomplet", colonnes: ["slug"] }],
    },
  },
  {
    nom: "refuse l'en-tête qui omet variant_sku, en le nommant",
    texte: "slug,name,brand",
    attendu: {
      colonnes: ["slug", "name", "brand"],
      avertissements: [],
      refus: [{ code: "en_tete_incomplet", colonnes: ["variant_sku"] }],
    },
  },
  {
    nom: "refuse l'en-tête vide en nommant les deux colonnes requises",
    texte: "",
    attendu: {
      colonnes: [],
      avertissements: [],
      refus: [{ code: "en_tete_incomplet", colonnes: ["slug", "variant_sku"] }],
    },
  },
  {
    nom: "avertit d'une colonne inconnue sans refuser le fichier",
    texte: `${EN_TETE_CANONIQUE},notes`,
    attendu: {
      colonnes: [...COLONNES_IMPORT, "notes"],
      avertissements: [{ code: "colonne_inconnue", colonne: "notes" }],
      refus: [],
    },
  },
  {
    nom: "explique une colonne qui ne diffère que par la casse",
    texte: EN_TETE_CANONIQUE.replace("slug", "Slug"),
    attendu: {
      colonnes: ["Slug", ...COLONNES_IMPORT.slice(1)],
      avertissements: [
        {
          code: "colonne_inconnue",
          colonne: "Slug",
          colonneAttendue: "slug",
        },
      ],
      refus: [{ code: "en_tete_incomplet", colonnes: ["slug"] }],
    },
  },
  {
    nom: "explique une colonne qui ne diffère que par l'accent",
    texte: EN_TETE_CANONIQUE.replace("category", "catégory"),
    attendu: {
      colonnes: [
        "slug",
        "name",
        "brand",
        "catégory",
        "description",
        "variant_sku",
        "variant_name",
        "variant_price",
        "variant_stock",
      ],
      avertissements: [
        {
          code: "colonne_inconnue",
          colonne: "catégory",
          colonneAttendue: "category",
        },
      ],
      refus: [],
    },
  },
]

describe("jugerLEnTete", () => {
  for (const cas of CAS_EN_TETE) {
    it(cas.nom, () => {
      expect(jugerLEnTete(cas.texte)).toEqual(cas.attendu)
    })
  }
})

describe("messageDuRefus", () => {
  it("dit de découper un fichier de plus de 5 Mo", () => {
    const message = messageDuRefus({ code: "fichier_trop_gros" })

    expect(message).toContain("5 Mo")
    expect(message).toMatch(/découp/i)
  })

  it("nomme l'UTF-8 quand l'encodage est invalide", () => {
    expect(messageDuRefus({ code: "encodage_invalide" })).toContain("UTF-8")
  })

  it("nomme la colonne requise absente", () => {
    const refus: RefusImport = {
      code: "en_tete_incomplet",
      colonnes: ["slug"],
    }

    expect(messageDuRefus(refus)).toContain("« slug »")
    expect(messageDuRefus(refus)).toContain("colonne requise")
  })

  it("nomme les deux colonnes requises absentes", () => {
    const message = messageDuRefus({
      code: "en_tete_incomplet",
      colonnes: ["slug", "variant_sku"],
    })

    expect(message).toContain("« slug » et « variant_sku »")
  })

  it("dit qu'une Ligne mal formée n'est pas un enregistrement CSV valide", () => {
    const message = messageDuRefus({ code: "ligne_mal_formee" })

    expect(message).toContain("CSV")
    expect(message).toMatch(/guillemet/)
  })

  it("nomme le slug hors grammaire", () => {
    const message = messageDuRefus({
      code: "slug_invalide",
      slug: "Chaise",
    })

    expect(message).toContain("« Chaise »")
    expect(message).toContain("minuscules")
  })

  it("nomme le champ requis vide", () => {
    const message = messageDuRefus({
      code: "champ_requis_manquant",
      champ: "variant_sku",
    })

    expect(message).toContain("« variant_sku »")
  })

  it("explique le format attendu d'un prix", () => {
    const message = messageDuRefus({ code: "prix_invalide" })

    expect(message).toContain("prix")
    expect(message).toContain("point décimal")
  })

  it("explique le format attendu d'un stock", () => {
    const message = messageDuRefus({ code: "stock_invalide" })

    expect(message).toContain("stock")
    expect(message).toContain("entier")
  })

  it("nomme le sku répété et dit que toutes ses occurrences sont refusées", () => {
    const message = messageDuRefus({
      code: "doublon_fichier",
      doublon: "sku",
      sku: "SKU-1",
      slug: "chaise",
    })

    expect(message).toContain("« SKU-1 »")
    expect(message).toContain("« chaise »")
    expect(message).toMatch(/plusieurs fois/)
  })

  it("distingue le couple slug + sku répété", () => {
    const message = messageDuRefus({
      code: "doublon_fichier",
      doublon: "couple",
      sku: "SKU-1",
      slug: "chaise",
    })

    expect(message).toContain("couple")
    expect(message).toContain("« chaise »")
    expect(message).toContain("« SKU-1 »")
  })

  it("nomme le champ de Produit en conflit", () => {
    const message = messageDuRefus({
      code: "produit_en_conflit",
      champ: "name",
    })

    expect(message).toContain("« name »")
    expect(message).toMatch(/différentes/)
  })
})

describe("messageDAvertissement", () => {
  it("nomme la colonne inconnue ignorée", () => {
    const avertissement: AvertissementImport = {
      code: "colonne_inconnue",
      colonne: "notes",
    }

    expect(messageDAvertissement(avertissement)).toContain("« notes »")
  })

  it("explique la casse et l'accent quand une colonne connue ressemble", () => {
    const message = messageDAvertissement({
      code: "colonne_inconnue",
      colonne: "Slug",
      colonneAttendue: "slug",
    })

    expect(message).toContain("casse")
    expect(message).toContain("accents")
    expect(message).toContain("« slug »")
  })

  it("annonce qu'une description HTML s'affichera comme du texte", () => {
    const message = messageDAvertissement({ code: "description_html" })

    expect(message).toContain("HTML")
    expect(message).toContain("texte")
  })
})

describe("contenuDuModele", () => {
  it("rend exactement une ligne d'en-tête, dans l'ordre canonique", () => {
    expect(contenuDuModele()).toBe(
      "\uFEFFslug,name,brand,category,description,variant_sku,variant_name,variant_price,variant_stock\r\n"
    )
  })

  it("ne porte aucune ligne de données", () => {
    const lignes = sansBom(contenuDuModele()).split("\r\n").filter(Boolean)

    expect(lignes).toHaveLength(1)
    expect(lignes[0]?.split(",")).toEqual([...COLONNES_IMPORT])
  })
})

describe("les libellés français des statuts", () => {
  it("traduit les six statuts du Lot", () => {
    expect(LIBELLES_STATUT_LOT_IMPORT).toEqual({
      brouillon: "Brouillon",
      verifie: "Vérifié",
      en_cours: "En cours",
      partiel: "Partiel",
      termine: "Terminé",
      echoue: "Échoué",
    })
  })

  it("traduit les six statuts de la Ligne", () => {
    expect(LIBELLES_STATUT_LIGNE_IMPORT).toEqual({
      a_creer: "À créer",
      a_modifier: "À modifier",
      inchangee: "Inchangée",
      refusee: "Refusée",
      ecrite: "Écrite",
      echouee: "Échouée",
    })
  })
})

/** Une cellule écrite comme le ferait un tableur : citée si elle en a besoin. */
function celluleCsv(valeur: string): string {
  return /[",\r\n]/.test(valeur) ? `"${valeur.replaceAll('"', '""')}"` : valeur
}

/** Une ligne de données dans l'ordre canonique des neuf colonnes. */
function ligneCsv(
  valeurs: Readonly<Partial<Record<ColonneImport, string>>>
): string {
  return COLONNES_IMPORT.map((colonne) =>
    celluleCsv(valeurs[colonne] ?? "")
  ).join(",")
}

function csvFichier(...lignes: readonly string[]): string {
  return lignes.join("\n")
}

function resumesDuFichier(texte: string) {
  return lireLesLignes(texte).map(({ numero, cellules }) => ({
    numero,
    cellules,
  }))
}

describe("lireLesLignes — le parseur RFC 4180 minimal", () => {
  it("lit une ligne de données et garde le numéro physique de la ligne 2", () => {
    const texte = csvFichier(
      EN_TETE_CANONIQUE,
      ligneCsv({
        slug: "chaise",
        name: "Chaise",
        brand: "Maison",
        category: "salon",
        description: "Bois clair",
        variant_sku: "CHAISE-01",
        variant_name: "Chaise en bois",
        variant_price: "12.50",
        variant_stock: "3",
      })
    )

    expect(resumesDuFichier(texte)).toEqual([
      {
        numero: 2,
        cellules: {
          slug: "chaise",
          name: "Chaise",
          brand: "Maison",
          category: "salon",
          description: "Bois clair",
          variant_sku: "CHAISE-01",
          variant_name: "Chaise en bois",
          variant_price: "12.50",
          variant_stock: "3",
        },
      },
    ])
  })

  it("retire les espaces autour de chaque cellule", () => {
    const texte = csvFichier(
      EN_TETE_CANONIQUE,
      ligneCsv({
        slug: "  chaise  ",
        name: "  Chaise  ",
        variant_sku: " CHAISE-01 ",
      })
    )

    expect(resumesDuFichier(texte)[0]?.cellules).toMatchObject({
      slug: "chaise",
      name: "Chaise",
      variant_sku: "CHAISE-01",
    })
  })

  it("lit une cellule citée qui contient une virgule", () => {
    const texte = csvFichier(
      EN_TETE_CANONIQUE,
      `chaise,"Chaise, grande",Maison,,,CHAISE-01,,,`
    )

    expect(resumesDuFichier(texte)[0]?.cellules.name).toBe("Chaise, grande")
  })

  it("décode deux guillemets consécutifs en un guillemet littéral", () => {
    const texte = csvFichier(
      EN_TETE_CANONIQUE,
      `chaise,"Chaise ""confort""",Maison,,,CHAISE-01,,,`
    )

    expect(resumesDuFichier(texte)[0]?.cellules.name).toBe('Chaise "confort"')
  })

  it("garde un retour à la ligne cité dans la cellule et renumérote la Ligne suivante", () => {
    const texte = csvFichier(
      EN_TETE_CANONIQUE,
      `chaise,"Une description\nsur deux lignes",Maison,,,CHAISE-01,,,`,
      `table,Table,Maison,,,TABLE-01,,,`
    )

    expect(resumesDuFichier(texte)).toMatchObject([
      {
        numero: 2,
        cellules: { name: "Une description\nsur deux lignes" },
      },
      { numero: 4, cellules: { slug: "table" } },
    ])
  })

  it("accepte les fins de ligne CRLF et garde le CRLF cité", () => {
    const texte = [
      EN_TETE_CANONIQUE,
      `chaise,"Une description\r\nsur deux lignes",Maison,,,CHAISE-01,,,`,
      `table,Table,Maison,,,TABLE-01,,,`,
    ].join("\r\n")

    expect(resumesDuFichier(texte)).toMatchObject([
      {
        numero: 2,
        cellules: { name: "Une description\r\nsur deux lignes" },
      },
      { numero: 4, cellules: { slug: "table" } },
    ])
  })

  it("retire un BOM initial", () => {
    const texte = `\uFEFF${csvFichier(
      EN_TETE_CANONIQUE,
      `chaise,Chaise,Maison,,,CHAISE-01,,,`
    )}`

    expect(resumesDuFichier(texte)).toMatchObject([
      { numero: 2, cellules: { slug: "chaise" } },
    ])
  })

  it("ignore les lignes vides et ne crée pas de Ligne après le saut final", () => {
    const texte = `${EN_TETE_CANONIQUE}\n\nchaise,Chaise,Maison,,,CHAISE-01,,,\n\ntable,Table,Maison,,,TABLE-01,,,\n`

    expect(resumesDuFichier(texte)).toEqual([
      {
        numero: 3,
        cellules: {
          slug: "chaise",
          name: "Chaise",
          brand: "Maison",
          category: "",
          description: "",
          variant_sku: "CHAISE-01",
          variant_name: "",
          variant_price: "",
          variant_stock: "",
        },
      },
      {
        numero: 5,
        cellules: {
          slug: "table",
          name: "Table",
          brand: "Maison",
          category: "",
          description: "",
          variant_sku: "TABLE-01",
          variant_name: "",
          variant_price: "",
          variant_stock: "",
        },
      },
    ])
  })

  it("lit les colonnes par leur nom dans un ordre libre et ignore les colonnes inconnues", () => {
    const texte = [
      "variant_sku,name,slug,notes",
      "CHAISE-01,Chaise,chaise,à ignorer",
    ].join("\n")

    expect(resumesDuFichier(texte)).toEqual([
      {
        numero: 2,
        cellules: {
          variant_sku: "CHAISE-01",
          name: "Chaise",
          slug: "chaise",
        },
      },
    ])
  })

  it("laisse absente une colonne connue qui n'est pas dans l'en-tête", () => {
    const texte = ["slug,name,variant_sku", "chaise,Chaise,CHAISE-01"].join(
      "\n"
    )

    expect(resumesDuFichier(texte)[0]?.cellules).toEqual({
      slug: "chaise",
      name: "Chaise",
      variant_sku: "CHAISE-01",
    })
  })
})

describe("lireLesLignes — les Lignes mal formées", () => {
  it.each([
    ["un guillemet jamais fermé", `chaise,"Chaise,Maison,,,CHAISE-01,,,`],
    [
      "des caractères entre le guillemet fermant et la virgule",
      `chaise,"Chaise"x,Maison,,,CHAISE-01,,,`,
    ],
    [
      "un guillemet au milieu d'une cellule non citée",
      `chaise,Cha"ise,Maison,,,CHAISE-01,,,`,
    ],
  ])("refuse %s", (_nom, ligne) => {
    const lignes = lireLesLignes(csvFichier(EN_TETE_CANONIQUE, ligne))

    expect(lignes).toHaveLength(1)
    expect(lignes[0]).toMatchObject({
      numero: 2,
      slug: "",
      sku: "",
      cellules: {},
      enregistrement: null,
      refus: { code: "ligne_mal_formee" },
    })
  })

  it("refuse une Ligne dont le nombre de cellules diffère de l'en-tête", () => {
    const lignes = lireLesLignes(
      csvFichier(EN_TETE_CANONIQUE, `chaise,Chaise,Maison`)
    )

    expect(lignes).toMatchObject([
      { numero: 2, refus: { code: "ligne_mal_formee" } },
    ])
  })

  it("ne cache pas les Lignes lisibles qui entourent une Ligne mal formée", () => {
    const lignes = lireLesLignes(
      csvFichier(
        EN_TETE_CANONIQUE,
        ligneCsv({ slug: "chaise", variant_sku: "CHAISE-01" }),
        "trop,peu",
        ligneCsv({ slug: "table", variant_sku: "TABLE-01" })
      )
    )

    expect(
      lignes.map((ligne) => [ligne.numero, ligne.refus?.code ?? null])
    ).toEqual([
      [2, null],
      [3, "ligne_mal_formee"],
      [4, null],
    ])
  })
})

function ligneDe(
  valeurs: Readonly<Partial<Record<ColonneImport, string>>>
): LigneImport {
  const [ligne] = lireLesLignes(
    csvFichier(EN_TETE_CANONIQUE, ligneCsv(valeurs))
  )
  if (ligne === undefined) throw new Error("aucune Ligne lue")
  return ligne
}

describe("lireLesLignes — l'enregistrement normalisé", () => {
  it("rend le Produit et sa Variante, prix en centimes et stock entier", () => {
    const ligne = ligneDe({
      slug: "chaise",
      name: "Chaise",
      brand: "Maison",
      category: "salon",
      description: "Bois clair",
      variant_sku: "CHAISE-01",
      variant_name: "Chaise en bois",
      variant_price: "12.50",
      variant_stock: "3",
    })

    expect(ligne.refus).toBeNull()
    expect(ligne.enregistrement).toEqual({
      produit: {
        slug: "chaise",
        name: "Chaise",
        brand: "Maison",
        category: "salon",
        description: "Bois clair",
      },
      variante: {
        sku: "CHAISE-01",
        name: "Chaise en bois",
        prix: 1250,
        stock: 3,
      },
    })
  })

  it("rend null pour chaque cellule absente, jamais une chaîne vide ni zéro", () => {
    const ligne = ligneDe({ slug: "chaise", variant_sku: "CHAISE-01" })

    expect(ligne.enregistrement).toEqual({
      produit: {
        slug: "chaise",
        name: null,
        brand: null,
        category: null,
        description: null,
      },
      variante: {
        sku: "CHAISE-01",
        name: null,
        prix: null,
        stock: null,
      },
    })
  })

  it.each([
    ["0", 0],
    ["12", 1200],
    ["12.5", 1250],
    ["12.50", 1250],
    ["0.99", 99],
    ["100.01", 10001],
    ["  7.25  ", 725],
  ])("lit le prix %j en centimes", (prix, attendu) => {
    const ligne = ligneDe({
      slug: "chaise",
      variant_sku: "CHAISE-01",
      variant_price: prix,
    })

    expect(ligne.enregistrement?.variante.prix).toBe(attendu)
    expect(ligne.refus).toBeNull()
  })

  it.each([
    "12,5",
    "-1",
    "+1",
    "1e3",
    "0x10",
    "1 000",
    "12.345",
    ".5",
    "12.",
    "abc",
  ])("refuse le prix %j", (prix) => {
    const ligne = ligneDe({
      slug: "chaise",
      variant_sku: "CHAISE-01",
      variant_price: prix,
    })

    expect(ligne.refus).toEqual({ code: "prix_invalide" })
  })

  it("garde une cellule de prix vide comme une absence, jamais zéro", () => {
    const ligne = ligneDe({
      slug: "chaise",
      variant_sku: "CHAISE-01",
      variant_price: "",
    })

    expect(ligne.refus).toBeNull()
    expect(ligne.enregistrement?.variante.prix).toBeNull()
  })

  it.each([
    ["0", 0],
    ["3", 3],
    ["120", 120],
  ])("lit le stock %j comme un entier", (stock, attendu) => {
    const ligne = ligneDe({
      slug: "chaise",
      variant_sku: "CHAISE-01",
      variant_stock: stock,
    })

    expect(ligne.enregistrement?.variante.stock).toBe(attendu)
    expect(ligne.refus).toBeNull()
  })

  it.each(["-1", "1.5", "+1", "1e3", "abc", "1 000"])(
    "refuse le stock %j",
    (stock) => {
      const ligne = ligneDe({
        slug: "chaise",
        variant_sku: "CHAISE-01",
        variant_stock: stock,
      })

      expect(ligne.refus).toEqual({ code: "stock_invalide" })
    }
  )

  it("garde une cellule de stock vide comme une absence, jamais zéro", () => {
    const ligne = ligneDe({
      slug: "chaise",
      variant_sku: "CHAISE-01",
      variant_stock: "",
    })

    expect(ligne.refus).toBeNull()
    expect(ligne.enregistrement?.variante.stock).toBeNull()
  })
})

describe("lireLesLignes — le slug et le sku", () => {
  it.each(["chaise", "chaise-longue", "a1", "0-9", "table-2-bois"])(
    "accepte le slug %j",
    (slug) => {
      expect(ligneDe({ slug, variant_sku: "SKU-1" }).refus).toBeNull()
    }
  )

  it.each([
    "",
    "Chaise",
    "chaise_longue",
    "-chaise",
    "chaise-",
    "chaise--longue",
    "café",
    "chaise longue",
  ])("refuse le slug %j hors grammaire", (slug) => {
    expect(ligneDe({ slug, variant_sku: "SKU-1" }).refus).toEqual({
      code: "slug_invalide",
      slug,
    })
  })

  it("refuse une Ligne dont le variant_sku est vide", () => {
    expect(ligneDe({ slug: "chaise", variant_sku: "" }).refus).toEqual({
      code: "champ_requis_manquant",
      champ: "variant_sku",
    })
  })

  it("ne confond pas un sku fait d'espaces avec un sku présent", () => {
    expect(ligneDe({ slug: "chaise", variant_sku: "   " }).refus).toEqual({
      code: "champ_requis_manquant",
      champ: "variant_sku",
    })
  })
})

describe("lireLesLignes — un seul refus par Ligne, dans l'ordre de priorité", () => {
  it.each([
    [
      "le slug invalide prime sur le prix invalide",
      { slug: "Chaise", variant_sku: "SKU-1", variant_price: "abc" },
      { code: "slug_invalide", slug: "Chaise" },
    ],
    [
      "le sku manquant prime sur le prix invalide",
      { slug: "chaise", variant_sku: "", variant_price: "abc" },
      { code: "champ_requis_manquant", champ: "variant_sku" },
    ],
    [
      "le prix invalide prime sur le stock invalide",
      {
        slug: "chaise",
        variant_sku: "SKU-1",
        variant_price: "abc",
        variant_stock: "-1",
      },
      { code: "prix_invalide" },
    ],
  ] as const)("%s", (_nom, valeurs, attendu) => {
    expect(ligneDe(valeurs).refus).toEqual(attendu)
  })
})

describe("lireLesLignes — les doublons du fichier", () => {
  it("refuse toutes les occurrences d'un sku répété sous deux slugs", () => {
    const lignes = lireLesLignes(
      csvFichier(
        EN_TETE_CANONIQUE,
        ligneCsv({ slug: "chaise", variant_sku: "SKU-1" }),
        ligneCsv({ slug: "table", variant_sku: "SKU-1" })
      )
    )

    expect(lignes.map((ligne) => ligne.refus)).toEqual([
      {
        code: "doublon_fichier",
        doublon: "sku",
        sku: "SKU-1",
        slug: "chaise",
      },
      {
        code: "doublon_fichier",
        doublon: "sku",
        sku: "SKU-1",
        slug: "table",
      },
    ])
  })

  it("refuse toutes les occurrences d'un couple slug + sku répété", () => {
    const lignes = lireLesLignes(
      csvFichier(
        EN_TETE_CANONIQUE,
        ligneCsv({ slug: "chaise", variant_sku: "SKU-1" }),
        ligneCsv({ slug: "chaise", variant_sku: "SKU-1" })
      )
    )

    expect(lignes.map((ligne) => ligne.refus)).toEqual([
      {
        code: "doublon_fichier",
        doublon: "couple",
        sku: "SKU-1",
        slug: "chaise",
      },
      {
        code: "doublon_fichier",
        doublon: "couple",
        sku: "SKU-1",
        slug: "chaise",
      },
    ])
  })

  it("refuse un sku présent trois fois", () => {
    const lignes = lireLesLignes(
      csvFichier(
        EN_TETE_CANONIQUE,
        ligneCsv({ slug: "chaise", variant_sku: "SKU-1" }),
        ligneCsv({ slug: "table", variant_sku: "SKU-1" }),
        ligneCsv({ slug: "banc", variant_sku: "SKU-1" })
      )
    )

    expect(lignes.map((ligne) => ligne.refus?.code)).toEqual([
      "doublon_fichier",
      "doublon_fichier",
      "doublon_fichier",
    ])
  })

  it("ne voit pas de doublon entre deux skus différents", () => {
    const lignes = lireLesLignes(
      csvFichier(
        EN_TETE_CANONIQUE,
        ligneCsv({ slug: "chaise", variant_sku: "SKU-1" }),
        ligneCsv({ slug: "table", variant_sku: "SKU-2" })
      )
    )

    expect(lignes.map((ligne) => ligne.refus)).toEqual([null, null])
  })

  it("garde le refus local prioritaire sur le doublon", () => {
    const lignes = lireLesLignes(
      csvFichier(
        EN_TETE_CANONIQUE,
        ligneCsv({
          slug: "chaise",
          variant_sku: "SKU-1",
          variant_price: "abc",
        }),
        ligneCsv({ slug: "table", variant_sku: "SKU-1" })
      )
    )

    expect(lignes[0]?.refus).toEqual({ code: "prix_invalide" })
    expect(lignes[1]?.refus).toEqual({
      code: "doublon_fichier",
      doublon: "sku",
      sku: "SKU-1",
      slug: "table",
    })
  })
})

describe("lireLesLignes — le conflit de Produit", () => {
  it.each(["name", "brand", "category", "description"] as const)(
    "refuse toutes les Lignes d'un Produit dont le champ %s diverge",
    (champ) => {
      const lignes = lireLesLignes(
        csvFichier(
          EN_TETE_CANONIQUE,
          ligneCsv({
            slug: "chaise",
            variant_sku: "SKU-1",
            [champ]: "Première",
          }),
          ligneCsv({
            slug: "chaise",
            variant_sku: "SKU-2",
            [champ]: "Seconde",
          }),
          ligneCsv({ slug: "table", variant_sku: "SKU-3", [champ]: "Première" })
        )
      )

      expect(lignes.slice(0, 2).map((ligne) => ligne.refus)).toEqual([
        { code: "produit_en_conflit", champ },
        { code: "produit_en_conflit", champ },
      ])
      expect(lignes[2]?.refus).toBeNull()
    }
  )

  it("ne voit pas de conflit quand une valeur est vide ou identique", () => {
    const lignes = lireLesLignes(
      csvFichier(
        EN_TETE_CANONIQUE,
        ligneCsv({ slug: "chaise", variant_sku: "SKU-1", name: "Chaise" }),
        ligneCsv({ slug: "chaise", variant_sku: "SKU-2", name: "" }),
        ligneCsv({ slug: "chaise", variant_sku: "SKU-3", name: "Chaise" })
      )
    )

    expect(lignes.map((ligne) => ligne.refus)).toEqual([null, null, null])
  })

  it("nomme le premier champ en conflit dans l'ordre du contrat", () => {
    const lignes = lireLesLignes(
      csvFichier(
        EN_TETE_CANONIQUE,
        ligneCsv({
          slug: "chaise",
          variant_sku: "SKU-1",
          name: "Chaise",
          brand: "Maison",
        }),
        ligneCsv({
          slug: "chaise",
          variant_sku: "SKU-2",
          name: "Table",
          brand: "Atelier",
        })
      )
    )

    expect(lignes[0]?.refus).toEqual({
      code: "produit_en_conflit",
      champ: "name",
    })
  })

  it("garde le doublon prioritaire sur le conflit", () => {
    const lignes = lireLesLignes(
      csvFichier(
        EN_TETE_CANONIQUE,
        ligneCsv({
          slug: "chaise",
          variant_sku: "SKU-1",
          name: "Chaise",
        }),
        ligneCsv({
          slug: "chaise",
          variant_sku: "SKU-1",
          name: "Table",
        })
      )
    )

    expect(lignes.map((ligne) => ligne.refus?.code)).toEqual([
      "doublon_fichier",
      "doublon_fichier",
    ])
  })
})

describe("ressembleÀDuHtml", () => {
  it.each([
    ["<b>gras</b>", true],
    ['<p class="x">texte</p>', true],
    ["Une <em>emphase</em>", true],
    ["<script>alert(1)</script>", true],
    ["Prix < 10", false],
    ["3 < 4 et 5 > 2", false],
    ["du texte simple", false],
    ["", false],
  ])("reconnaît %j : %s", (texte, attendu) => {
    expect(ressembleÀDuHtml(texte)).toBe(attendu)
  })
})

describe("lireLesLignes — l'avertissement de description HTML", () => {
  it("avertit sans refuser une description qui ressemble à du HTML", () => {
    const ligne = ligneDe({
      slug: "chaise",
      variant_sku: "SKU-1",
      description: "<b>Bois massif</b>",
    })

    expect(ligne.refus).toBeNull()
    expect(ligne.avertissements).toEqual([{ code: "description_html" }])
  })

  it("n'avertit pas une description en texte brut", () => {
    const ligne = ligneDe({
      slug: "chaise",
      variant_sku: "SKU-1",
      description: "Bois massif, finition huilée",
    })

    expect(ligne.avertissements).toEqual([])
  })

  it("avertit chaque Ligne qui porte la description, et elle seule", () => {
    const lignes = lireLesLignes(
      csvFichier(
        EN_TETE_CANONIQUE,
        ligneCsv({
          slug: "chaise",
          variant_sku: "SKU-1",
          description: "<b>Bois massif</b>",
        }),
        ligneCsv({ slug: "chaise", variant_sku: "SKU-2" })
      )
    )

    expect(lignes.map((ligne) => ligne.avertissements)).toEqual([
      [{ code: "description_html" }],
      [],
    ])
  })
})

describe("grouperParProduit", () => {
  it("groupe par slug dans l'ordre de première apparition", () => {
    const lignes = lireLesLignes(
      csvFichier(
        EN_TETE_CANONIQUE,
        ligneCsv({ slug: "chaise", variant_sku: "SKU-1" }),
        ligneCsv({ slug: "table", variant_sku: "SKU-2" }),
        ligneCsv({ slug: "chaise", variant_sku: "SKU-3" })
      )
    )

    expect(
      grouperParProduit(lignes).map((groupe) => [
        groupe.slug,
        groupe.lignes.map((ligne) => ligne.numero),
      ])
    ).toEqual([
      ["chaise", [2, 4]],
      ["table", [3]],
    ])
  })
})
