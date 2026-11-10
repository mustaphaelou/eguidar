import { describe, expect, it } from "vitest"

import {
  COLONNES_IMPORT,
  lireLesLignes,
  type ColonneImport,
  type LigneImport,
} from "@/lib/import-produits"
import {
  planifierLeLot,
  type InstantaneCatalogue,
  type InstantaneProduit,
  type InstantaneStructure,
  type InstantaneVarianteProduit,
  type PlanProduit,
} from "@/lib/plan-import-produits"

const EN_TETE = COLONNES_IMPORT.join(",")

function celluleCsv(valeur: string): string {
  return /[",\r\n]/.test(valeur) ? `"${valeur.replaceAll('"', '""')}"` : valeur
}

function ligneCsv(valeurs: Partial<Record<ColonneImport, string>>): string {
  return COLONNES_IMPORT.map((colonne) =>
    celluleCsv(valeurs[colonne] ?? "")
  ).join(",")
}

/** Lit un fichier dont l'en-tête est canonique et rend ses Lignes analysées. */
function lignesDuFichier(
  ...valeurs: readonly Partial<Record<ColonneImport, string>>[]
): LigneImport[] {
  const texte = [EN_TETE, ...valeurs.map(ligneCsv)].join("\n")
  return [...lireLesLignes(texte)]
}

function structure(slug: string): InstantaneStructure {
  return { id: `structure-${slug}`, slug }
}

function variante(
  overrides: Partial<InstantaneVarianteProduit> & { sku: string }
): InstantaneVarianteProduit {
  return {
    id: `variante-${overrides.sku}`,
    name: `Variante ${overrides.sku}`,
    priceDelta: 0,
    stock: 0,
    ...overrides,
  }
}

function produit(
  overrides: Partial<InstantaneProduit> & { slug: string }
): InstantaneProduit {
  return {
    id: `produit-${overrides.slug}`,
    name: `Produit ${overrides.slug}`,
    brand: "Marque",
    description: "",
    categoryId: null,
    structureSlug: null,
    price: 0,
    variants: [],
    ...overrides,
  }
}

function instantane({
  produits = [],
  structures = [],
  noms,
}: {
  produits?: readonly InstantaneProduit[]
  structures?: readonly InstantaneStructure[]
  noms?: readonly { slug: string; name: string }[]
} = {}): InstantaneCatalogue {
  return {
    produitsParSlug: Object.fromEntries(
      produits.map((produit) => [produit.slug, produit])
    ),
    structuresParSlug: Object.fromEntries(
      structures.map((structure) => [structure.slug, structure])
    ),
    produitsParSku: Object.fromEntries(
      produits.flatMap((produit) =>
        produit.variants.map(
          (variante) => [variante.sku, produit.slug] as const
        )
      )
    ),
    nomsExistants: noms ?? produits.map(({ slug, name }) => ({ slug, name })),
  }
}

function planUnique(
  lignes: readonly LigneImport[],
  catalogue: InstantaneCatalogue
): PlanProduit {
  const plans = planifierLeLot(lignes, catalogue)
  expect(plans).toHaveLength(1)
  return plans[0]!
}

const CHAISE = {
  slug: "chaise",
  name: "Chaise",
  brand: "Maison",
  variant_sku: "CHAISE-01",
  variant_name: "Chaise en bois",
  variant_price: "12.50",
  variant_stock: "3",
} as const

describe("planifierLeLot — la création", () => {
  it("crée un Produit complet et calcule sa Variante", () => {
    const plan = planUnique(
      lignesDuFichier({ ...CHAISE, category: "maison", description: "Bois" }),
      instantane({ structures: [structure("maison")] })
    )

    expect(plan).toMatchObject({
      slug: "chaise",
      issue: "cree",
      codeRefus: null,
      refus: null,
      avertissements: [],
      diff: { produit: [], variantes: [] },
      statuts: [{ numero: 2, statut: "a_creer" }],
      etatDesire: {
        name: "Chaise",
        brand: "Maison",
        description: "Bois",
        categoryId: "structure-maison",
        price: 1250,
        variants: [
          {
            name: "Chaise en bois",
            sku: "CHAISE-01",
            priceDelta: 0,
            stock: 3,
          },
        ],
      },
    })
    expect(plan.lignes).toEqual([
      {
        numero: 2,
        statut: "a_creer",
        refus: null,
        avertissements: [],
      },
    ])
  })

  it("prend le prix minimum des Variantes et met le stock vide à zéro", () => {
    const plan = planUnique(
      lignesDuFichier(
        { ...CHAISE, variant_price: "12.50" },
        {
          ...CHAISE,
          variant_sku: "CHAISE-02",
          variant_name: "Chaise haute",
          variant_price: "10.00",
          variant_stock: "",
        }
      ),
      instantane()
    )

    expect(plan.etatDesire?.price).toBe(1000)
    expect(plan.etatDesire?.variants).toEqual([
      {
        name: "Chaise en bois",
        sku: "CHAISE-01",
        priceDelta: 250,
        stock: 3,
      },
      {
        name: "Chaise haute",
        sku: "CHAISE-02",
        priceDelta: 0,
        stock: 0,
      },
    ])
  })

  it("avertit un Produit sans Structure sans le refuser", () => {
    const plan = planUnique(lignesDuFichier({ ...CHAISE }), instantane())

    expect(plan.issue).toBe("cree")
    expect(plan.etatDesire?.categoryId).toBeNull()
    expect(plan.avertissements).toEqual([{ code: "produit_sans_structure" }])
    expect(plan.lignes[0]?.avertissements).toEqual([
      { code: "produit_sans_structure" },
    ])
  })

  it("refuse le Produit et toutes ses Lignes quand la Structure est inconnue", () => {
    const plan = planUnique(
      lignesDuFichier(
        { ...CHAISE, category: "inconnue" },
        { ...CHAISE, variant_sku: "CHAISE-02" }
      ),
      instantane({ structures: [structure("maison")] })
    )

    const refus = {
      code: "structure_inconnue",
      structure: "inconnue",
      portee: "produit",
    } as const

    expect(plan.issue).toBe("refuse")
    expect(plan.codeRefus).toBe("structure_inconnue")
    expect(plan.refus).toEqual(refus)
    expect(plan.etatDesire).toBeNull()
    expect(plan.statuts).toEqual([
      { numero: 2, statut: "refusee" },
      { numero: 3, statut: "refusee" },
    ])
    expect(plan.lignes.map((ligne) => ligne.refus)).toEqual([refus, refus])
  })

  it("refuse quand name et brand manquent sur toutes les Lignes", () => {
    const sansNom = planUnique(
      lignesDuFichier({ ...CHAISE, name: "" }),
      instantane()
    )
    const sansMarque = planUnique(
      lignesDuFichier({ ...CHAISE, brand: "" }),
      instantane()
    )

    expect(sansNom.refus).toEqual({
      code: "champ_requis_manquant",
      champ: "name",
      portee: "produit",
    })
    expect(sansMarque.refus).toEqual({
      code: "champ_requis_manquant",
      champ: "brand",
      portee: "produit",
    })
    expect(sansNom.issue).toBe("refuse")
    expect(sansMarque.issue).toBe("refuse")
  })

  it("accepte un name ou un brand porté par une seule Ligne du Produit", () => {
    const plan = planUnique(
      lignesDuFichier(
        { ...CHAISE, name: "", brand: "" },
        {
          ...CHAISE,
          variant_sku: "CHAISE-02",
          name: "Chaise",
          brand: "Maison",
        }
      ),
      instantane()
    )

    expect(plan.issue).toBe("cree")
    expect(plan.etatDesire?.name).toBe("Chaise")
    expect(plan.etatDesire?.brand).toBe("Maison")
  })

  it("refuse quand variant_name ou variant_price manque sur une Ligne", () => {
    const sansNomDeVariante = planUnique(
      lignesDuFichier({ ...CHAISE, variant_name: "" }),
      instantane()
    )
    const sansPrix = planUnique(
      lignesDuFichier({ ...CHAISE, variant_price: "" }),
      instantane()
    )

    expect(sansNomDeVariante.refus).toEqual({
      code: "champ_requis_manquant",
      champ: "variant_name",
      portee: "produit",
    })
    expect(sansPrix.refus).toEqual({
      code: "champ_requis_manquant",
      champ: "variant_price",
      portee: "produit",
    })
  })

  it("refuse un sku déjà possédé par un autre Produit", () => {
    const catalogue = instantane({
      produits: [
        produit({
          slug: "table",
          variants: [variante({ sku: "CHAISE-01" })],
        }),
      ],
    })

    const plan = planUnique(lignesDuFichier({ ...CHAISE }), catalogue)

    expect(plan.issue).toBe("refuse")
    expect(plan.refus).toEqual({
      code: "sku_deja_pris",
      sku: "CHAISE-01",
      portee: "produit",
    })
    expect(plan.etatDesire).toBeNull()
  })

  it("avertit un nom qui ressemble à un Produit existant sous un autre slug", () => {
    const catalogue = instantane({
      structures: [structure("maison")],
      noms: [{ slug: "chaise-blanche", name: "  Chaise   ÉLÉGANTE " }],
    })

    const plan = planUnique(
      lignesDuFichier({
        ...CHAISE,
        slug: "chaise-elegante",
        name: "Chaise elegante",
        category: "maison",
      }),
      catalogue
    )

    expect(plan.issue).toBe("cree")
    expect(plan.avertissements).toEqual([
      { code: "nom_ressemblant", slug: "chaise-blanche" },
    ])
  })
})

describe("planifierLeLot — la mise à jour légère", () => {
  const existante = produit({
    slug: "chaise",
    name: "Chaise",
    brand: "Maison",
    description: "Bois massif",
    categoryId: "structure-maison",
    structureSlug: "maison",
    price: 1250,
    variants: [
      variante({
        id: "variante-chaise",
        sku: "CHAISE-01",
        name: "Chaise en bois",
        priceDelta: 0,
        stock: 3,
      }),
    ],
  })
  const catalogue = instantane({
    produits: [existante],
    structures: [structure("maison")],
  })

  it("laisse le Produit inchangé quand les cellules de prix et de stock sont vides", () => {
    const plan = planUnique(
      lignesDuFichier({ slug: "chaise", variant_sku: "CHAISE-01" }),
      catalogue
    )

    expect(plan.issue).toBe("inchange")
    expect(plan.diff).toEqual({ produit: [], variantes: [] })
    expect(plan.etatDesire).toBeNull()
    expect(plan.statuts).toEqual([{ numero: 2, statut: "inchangee" }])
  })

  it("ne change que le stock et garde le nom, la marque, la description et la Structure", () => {
    const plan = planUnique(
      lignesDuFichier({
        slug: "chaise",
        variant_sku: "CHAISE-01",
        variant_stock: "5",
      }),
      catalogue
    )

    expect(plan.issue).toBe("modifie")
    expect(plan.avertissements).toEqual([])
    expect(plan.diff).toEqual({
      produit: [],
      variantes: [
        {
          sku: "CHAISE-01",
          changements: [{ champ: "stock", avant: 3, apres: 5 }],
        },
      ],
    })
    expect(plan.etatDesire).toEqual({
      name: "Chaise",
      brand: "Maison",
      description: "Bois massif",
      categoryId: "structure-maison",
      price: 1250,
      variants: [
        {
          id: "variante-chaise",
          name: "Chaise en bois",
          sku: "CHAISE-01",
          priceDelta: 0,
          stock: 5,
        },
      ],
    })
  })

  it("met à jour le prix absolu et le prix de base, en montrant l'avant → après", () => {
    const plan = planUnique(
      lignesDuFichier({
        slug: "chaise",
        variant_sku: "CHAISE-01",
        variant_price: "15.00",
      }),
      catalogue
    )

    expect(plan.issue).toBe("modifie")
    expect(plan.diff.produit).toEqual([
      { champ: "price", avant: 1250, apres: 1500 },
    ])
    expect(plan.diff.variantes).toEqual([
      {
        sku: "CHAISE-01",
        changements: [{ champ: "price", avant: 1250, apres: 1500 }],
      },
    ])
    expect(plan.etatDesire?.price).toBe(1500)
    expect(plan.etatDesire?.variants[0]?.priceDelta).toBe(0)
  })

  it("n'efface pas la Structure existante quand la cellule category est vide", () => {
    const plan = planUnique(
      lignesDuFichier({
        slug: "chaise",
        variant_sku: "CHAISE-01",
        variant_stock: "9",
      }),
      catalogue
    )

    expect(plan.etatDesire?.categoryId).toBe("structure-maison")
    expect(plan.avertissements).toEqual([])
  })

  it("avertit un Produit existant qui se retrouve sans Structure", () => {
    const sansStructure = produit({
      slug: "chaise",
      name: "Chaise",
      brand: "Maison",
      price: 1250,
      variants: [variante({ sku: "CHAISE-01", stock: 3 })],
    })

    const plan = planUnique(
      lignesDuFichier({
        slug: "chaise",
        variant_sku: "CHAISE-01",
        variant_stock: "4",
      }),
      instantane({ produits: [sansStructure] })
    )

    expect(plan.issue).toBe("modifie")
    expect(plan.avertissements).toEqual([{ code: "produit_sans_structure" }])
  })

  it("garde le nom de Variante quand sa cellule est vide", () => {
    const plan = planUnique(
      lignesDuFichier({
        slug: "chaise",
        variant_sku: "CHAISE-01",
        variant_name: "",
        variant_stock: "4",
      }),
      catalogue
    )

    expect(plan.etatDesire?.variants[0]?.name).toBe("Chaise en bois")
    expect(plan.diff.variantes).toHaveLength(1)
    expect(plan.diff.variantes[0]?.changements).not.toContainEqual(
      expect.objectContaining({ champ: "name" })
    )
  })

  it("ajoute une Variante inconnue au Produit existant", () => {
    const plan = planUnique(
      lignesDuFichier(
        { slug: "chaise", variant_sku: "CHAISE-01", variant_stock: "3" },
        {
          slug: "chaise",
          variant_sku: "CHAISE-02",
          variant_name: "Chaise haute",
          variant_price: "15.00",
        }
      ),
      catalogue
    )

    expect(plan.issue).toBe("modifie")
    expect(plan.etatDesire?.price).toBe(1250)
    expect(plan.etatDesire?.variants).toEqual([
      {
        id: "variante-chaise",
        name: "Chaise en bois",
        sku: "CHAISE-01",
        priceDelta: 0,
        stock: 3,
      },
      {
        name: "Chaise haute",
        sku: "CHAISE-02",
        priceDelta: 250,
        stock: 0,
      },
    ])
    expect(plan.diff.variantes).toEqual([
      {
        sku: "CHAISE-02",
        changements: [
          { champ: "name", avant: null, apres: "Chaise haute" },
          { champ: "price", avant: null, apres: 1500 },
          { champ: "stock", avant: null, apres: 0 },
        ],
      },
    ])
  })

  it("exige un nom et un prix pour une Variante inconnue", () => {
    const sansNom = planUnique(
      lignesDuFichier(
        { slug: "chaise", variant_sku: "CHAISE-01" },
        { slug: "chaise", variant_sku: "CHAISE-02", variant_price: "15.00" }
      ),
      catalogue
    )
    const sansPrix = planUnique(
      lignesDuFichier(
        { slug: "chaise", variant_sku: "CHAISE-01" },
        { slug: "chaise", variant_sku: "CHAISE-02", variant_name: "Haute" }
      ),
      catalogue
    )

    expect(sansNom.refus).toEqual({
      code: "champ_requis_manquant",
      champ: "variant_name",
      portee: "produit",
    })
    expect(sansPrix.refus).toEqual({
      code: "champ_requis_manquant",
      champ: "variant_price",
      portee: "produit",
    })
  })
})

describe("planifierLeLot — le prix de base et le réécartement", () => {
  it("réécarte les Variantes absentes du fichier sans déplacer leur prix affiché", () => {
    const existante = produit({
      slug: "chaise",
      name: "Chaise",
      brand: "Maison",
      price: 1000,
      variants: [
        variante({ sku: "CHAISE-01", name: "Basse", priceDelta: 0, stock: 3 }),
        variante({
          sku: "CHAISE-02",
          name: "Haute",
          priceDelta: 500,
          stock: 2,
        }),
      ],
    })

    const plan = planUnique(
      lignesDuFichier({
        slug: "chaise",
        variant_sku: "CHAISE-01",
        variant_price: "8.00",
      }),
      instantane({ produits: [existante] })
    )

    expect(plan.issue).toBe("modifie")
    expect(plan.etatDesire?.price).toBe(800)
    expect(plan.etatDesire?.variants).toEqual([
      {
        id: "variante-CHAISE-01",
        name: "Basse",
        sku: "CHAISE-01",
        priceDelta: 0,
        stock: 3,
      },
      {
        id: "variante-CHAISE-02",
        name: "Haute",
        sku: "CHAISE-02",
        priceDelta: 700,
        stock: 2,
      },
    ])

    const prixAffiches = (plan.etatDesire?.variants ?? []).map(
      (variante) => (plan.etatDesire?.price ?? 0) + variante.priceDelta
    )
    expect(prixAffiches).toEqual([800, 1500])

    expect(plan.diff.produit).toEqual([
      { champ: "price", avant: 1000, apres: 800 },
    ])
    expect(plan.diff.variantes).toEqual([
      {
        sku: "CHAISE-01",
        changements: [{ champ: "price", avant: 1000, apres: 800 }],
      },
    ])
  })

  it("garde le prix affiché des autres Variantes quand une baisse touche une seule Ligne", () => {
    const existante = produit({
      slug: "chaise",
      price: 2000,
      variants: [
        variante({ sku: "A", priceDelta: 0, stock: 1 }),
        variante({ sku: "B", priceDelta: 1000, stock: 1 }),
        variante({ sku: "C", priceDelta: 500, stock: 1 }),
      ],
    })

    const plan = planUnique(
      lignesDuFichier({
        slug: "chaise",
        variant_sku: "B",
        variant_price: "10.00",
      }),
      instantane({ produits: [existante] })
    )

    // B baisse de 3000 à 1000 ; la base devient 1000 ; A et C gardent 2000 et 2500.
    expect(plan.etatDesire?.price).toBe(1000)
    expect(
      (plan.etatDesire?.variants ?? []).map(
        (variante) => (plan.etatDesire?.price ?? 0) + variante.priceDelta
      )
    ).toEqual([2000, 1000, 2500])
    expect(plan.diff.variantes).toEqual([
      {
        sku: "B",
        changements: [{ champ: "price", avant: 3000, apres: 1000 }],
      },
    ])
  })

  it("reste inchangé quand le fichier répète les prix et les stocks", () => {
    const existante = produit({
      slug: "chaise",
      name: "Chaise",
      brand: "Maison",
      price: 1000,
      variants: [
        variante({
          sku: "CHAISE-01",
          name: "Basse",
          priceDelta: 0,
          stock: 3,
        }),
      ],
    })

    const plan = planUnique(
      lignesDuFichier({
        slug: "chaise",
        name: "Chaise",
        brand: "Maison",
        variant_sku: "CHAISE-01",
        variant_name: "Basse",
        variant_price: "10.00",
        variant_stock: "3",
      }),
      instantane({ produits: [existante] })
    )

    expect(plan.issue).toBe("inchange")
    expect(plan.etatDesire).toBeNull()
    expect(plan.statuts).toEqual([{ numero: 2, statut: "inchangee" }])
  })
})

describe("planifierLeLot — les refus déjà portés par les Lignes", () => {
  it("refuse le Produit entier et laisse chaque Ligne garder son propre code", () => {
    const lignes = lignesDuFichier(
      { ...CHAISE, variant_price: "abc" },
      { ...CHAISE, variant_sku: "CHAISE-02" }
    )

    const plan = planUnique(lignes, instantane())

    expect(plan.issue).toBe("refuse")
    expect(plan.codeRefus).toBe("prix_invalide")
    expect(plan.statuts).toEqual([
      { numero: 2, statut: "refusee" },
      { numero: 3, statut: "refusee" },
    ])
    expect(plan.lignes[0]?.refus).toEqual({ code: "prix_invalide" })
    expect(plan.lignes[1]?.refus).toEqual({ code: "prix_invalide" })
  })

  it("refuse un Produit en conflit et n'écrit rien", () => {
    const plan = planUnique(
      lignesDuFichier(
        { ...CHAISE, name: "Chaise" },
        { ...CHAISE, variant_sku: "CHAISE-02", name: "Table" }
      ),
      instantane()
    )

    expect(plan.issue).toBe("refuse")
    expect(plan.codeRefus).toBe("produit_en_conflit")
    expect(plan.refus).toEqual({ code: "produit_en_conflit", champ: "name" })
    expect(plan.etatDesire).toBeNull()
  })
})

describe("planifierLeLot — plusieurs Produits", () => {
  it("rend un plan par slug, dans l'ordre de première apparition", () => {
    const plans = planifierLeLot(
      lignesDuFichier(
        { ...CHAISE },
        {
          slug: "table",
          name: "Table",
          brand: "Maison",
          variant_sku: "TABLE-01",
          variant_name: "Table",
          variant_price: "20.00",
        }
      ),
      instantane()
    )

    expect(plans.map((plan) => [plan.slug, plan.issue])).toEqual([
      ["chaise", "cree"],
      ["table", "cree"],
    ])
  })
})
