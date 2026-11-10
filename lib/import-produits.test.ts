import { describe, expect, it } from "vitest"

import {
  COLONNES_IMPORT,
  LIBELLES_STATUT_LIGNE_IMPORT,
  LIBELLES_STATUT_LOT_IMPORT,
  LIMITE_OCTETS_IMPORT,
  contenuDuModele,
  jugerLEnTete,
  lireLeTexte,
  messageDAvertissement,
  messageDuRefus,
  type AvertissementImport,
  type EnTeteImport,
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
