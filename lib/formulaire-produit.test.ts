import { describe, expect, expectTypeOf, it } from "vitest"

import {
  caseACocherDepuisValeur,
  CHAMPS_FORMULAIRE_PRODUIT,
  ecartPrixDepuisTexte,
  galerieSoumiseHorsSuppressionsEnAttente,
  MESSAGE_FORMULAIRE_INVALIDE,
  MESSAGE_SPECIFICATIONS_INVALIDE,
  sectionsDerreurProduit,
  specificationsDepuisTexte,
  soumissionDepuisFormData,
  texteEcartPrix,
  texteSpecifications,
  valeurCaseACocher,
  type EntreeImageProduitFormulaire,
  type FaitsFormulaireProduit,
  type FaitsVarianteFormulaire,
  type SoumissionFormulaireProduit,
} from "@/lib/formulaire-produit"
import type { EntreeImageProduit } from "@/lib/galerie-image-produit"
import type {
  ProductInput,
  ProductVariantInput,
} from "@/lib/use-cases/admin-catalog"
import { lire } from "@/lib/use-cases/outils-frontiere"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

const SPECS: Record<string, string> = {
  Écran: "6,1 pouces",
  Puce: "A17 Pro",
  Ports: "USB-C, USB-C, USB-C",
}

const BASE_CDN = "https://cdn.eguidar.com"

const VARIANTE_STANDARD = {
  name: "Standard",
  sku: "SKU-1",
  priceDelta: 0,
  stock: 2,
}

function refusDe(texte: string): unknown {
  try {
    specificationsDepuisTexte(texte)
  } catch (erreur) {
    return erreur
  }
  throw new Error(`La ligne ${JSON.stringify(texte)} n'a pas été refusée`)
}

interface SoumissionRendue {
  nom?: string
  slug?: string
  marque?: string
  categorieId?: string
  description?: string
  prix?: string
  specsText?: string
  ordre?: string
  misEnAvant?: string
  livraisonOfferte?: string
  images?: unknown
  variantes?: unknown
  tentativeId?: string
  produitId?: string | null
}

function formulaireSoumis({
  nom = "Produit",
  slug = "produit",
  marque = "Marque",
  categorieId = "categorie-1",
  description = "Description",
  prix = "100",
  specsText = "",
  ordre = "0",
  misEnAvant = "",
  livraisonOfferte = "",
  images = [],
  variantes = [VARIANTE_STANDARD],
  tentativeId = "tentative-1",
  produitId = null,
}: SoumissionRendue = {}): FormData {
  const donnees = new FormData()
  donnees.append("name", nom)
  donnees.append("slug", slug)
  donnees.append("brand", marque)
  donnees.append("description", description)
  donnees.append("price", prix)
  donnees.append("specsText", specsText)
  donnees.append("featuredOrder", ordre)
  donnees.append("categoryId", categorieId)
  donnees.append("isFeatured", misEnAvant)
  donnees.append("freeShipping", livraisonOfferte)
  donnees.append("images", JSON.stringify(images))
  donnees.append("variants", JSON.stringify(variantes))
  donnees.append("tentativeId", tentativeId)
  if (produitId !== null) donnees.append("productId", produitId)
  return donnees
}

function soumissionLue(
  rendue: SoumissionRendue = {}
): SoumissionFormulaireProduit {
  return soumissionDepuisFormData(formulaireSoumis(rendue), BASE_CDN)
}

function refusDeSoumission(donnees: FormData): unknown {
  try {
    soumissionDepuisFormData(donnees, BASE_CDN)
  } catch (erreur) {
    return erreur
  }
  throw new Error("La soumission n'a pas été refusée")
}

describe("texteSpecifications", () => {
  it("écrit une ligne « Clé : valeur » par entrée, dans l'ordre du record", () => {
    expect(texteSpecifications(SPECS)).toBe(
      "Écran : 6,1 pouces\nPuce : A17 Pro\nPorts : USB-C, USB-C, USB-C"
    )
  })

  it("laisse le champ vide pour un record vide", () => {
    expect(texteSpecifications({})).toBe("")
  })
})

describe("specificationsDepuisTexte", () => {
  it("relit le texte du champ en record", () => {
    expect(
      specificationsDepuisTexte("Écran : 6,1 pouces\nPuce : A17 Pro")
    ).toEqual({ Écran: "6,1 pouces", Puce: "A17 Pro" })
  })

  it("fait l'aller-retour pour des clés et valeurs sans saut de ligne", () => {
    expect(specificationsDepuisTexte(texteSpecifications(SPECS))).toEqual(SPECS)
  })

  it("conserve une valeur qui contient elle-même un deux-points", () => {
    const specs = { Connectique: "USB-C ; HDMI : 2.1" }

    const texte = texteSpecifications(specs)

    expect(texte).toBe("Connectique : USB-C ; HDMI : 2.1")
    expect(specificationsDepuisTexte(texte)).toEqual(specs)
  })

  it("saute les lignes vides", () => {
    expect(
      specificationsDepuisTexte(
        "\n  \nÉcran : 6,1 pouces\n\n\nPuce : A17 Pro\n"
      )
    ).toEqual({ Écran: "6,1 pouces", Puce: "A17 Pro" })
  })

  it("rogne les deux côtés de la ligne", () => {
    expect(specificationsDepuisTexte("   Écran   :    6,1 pouces   ")).toEqual({
      Écran: "6,1 pouces",
    })
  })

  it("refuse une ligne sans deux-points avec le message d'aujourd'hui", () => {
    const refus = refusDe("Écran 6,1 pouces")

    expect((refus as Error).message).toBe(
      "Format de spécifications invalide (clé : valeur par ligne)"
    )
  })

  it("refuse une clé vide, donc un deux-points en première position", () => {
    const refus = refusDe(" : 6,1 pouces")

    expect((refus as Error).message).toBe(
      "Format de spécifications invalide (clé : valeur par ligne)"
    )
  })

  it("refuse par une Error simple, pas une UserFacingError", () => {
    const refus = refusDe("Écran 6,1 pouces")

    expect(refus).toBeInstanceOf(Error)
    expect(refus).not.toBeInstanceOf(UserFacingError)
    expect((refus as Error).name).toBe("Error")
  })

  it("lit un record vide depuis un champ vide", () => {
    expect(specificationsDepuisTexte("")).toEqual({})
  })
})

describe("texteEcartPrix", () => {
  it("écrit des dirhams lisibles depuis des centimes", () => {
    expect(texteEcartPrix(0)).toBe("0.00")
    expect(texteEcartPrix(-1500)).toBe("-15.00")
    expect(texteEcartPrix(1500)).toBe("15.00")
  })
})

describe("ecartPrixDepuisTexte", () => {
  it("relit des dirhams en centimes", () => {
    expect(ecartPrixDepuisTexte("15.00")).toBe(1500)
    expect(ecartPrixDepuisTexte("15,00")).toBe(1500)
    expect(ecartPrixDepuisTexte("-15.00")).toBe(-1500)
  })

  it("fait l'aller-retour de l'écart de prix d'une Variante", () => {
    for (const cents of [0, 1, -1, 1500, -1500, 999999]) {
      expect(ecartPrixDepuisTexte(texteEcartPrix(cents))).toBe(cents)
    }
  })

  it("retombe à zéro sur une valeur qu'elle ne sait pas lire", () => {
    expect(ecartPrixDepuisTexte("")).toBe(0)
    expect(ecartPrixDepuisTexte("-")).toBe(0)
    expect(ecartPrixDepuisTexte("abc")).toBe(0)
  })

  it("garde un nombre JSON de centimes, jamais une chaîne", () => {
    const cents = ecartPrixDepuisTexte("15,00")

    expect(typeof cents).toBe("number")
    expect(JSON.parse(JSON.stringify({ priceDelta: cents }))).toEqual({
      priceDelta: 1500,
    })
  })
})

describe("la convention de case à cocher", () => {
  it("écrit la valeur de la convention à la main, « on » pour une bascule cochée, une chaîne vide pour une bascule non cochée", () => {
    expect(valeurCaseACocher(true)).toBe("on")
    expect(valeurCaseACocher(false)).toBe("")
  })

  it("écrit une bascule cochée, et la relit cochée", () => {
    expect(caseACocherDepuisValeur(valeurCaseACocher(true))).toBe(true)

    const soumission = soumissionLue({
      misEnAvant: valeurCaseACocher(true),
      livraisonOfferte: valeurCaseACocher(true),
    })

    expect(soumission.champsCatalogue.isFeatured).toBe(true)
    expect(soumission.champsCatalogue.freeShipping).toBe(true)
  })

  it("écrit une bascule non cochée, et la relit non cochée", () => {
    expect(caseACocherDepuisValeur(valeurCaseACocher(false))).toBe(false)

    const soumission = soumissionLue({
      misEnAvant: valeurCaseACocher(false),
      livraisonOfferte: valeurCaseACocher(false),
    })

    expect(soumission.champsCatalogue.isFeatured).toBe(false)
    expect(soumission.champsCatalogue.freeShipping).toBe(false)
  })

  it("relit toute autre valeur comme une bascule non cochée", () => {
    for (const valeur of ["", "true", "1", "oui", "ON"]) {
      expect(caseACocherDepuisValeur(valeur)).toBe(false)
      expect(
        soumissionLue({ misEnAvant: valeur }).champsCatalogue.isFeatured
      ).toBe(false)
      expect(
        soumissionLue({ livraisonOfferte: valeur }).champsCatalogue.freeShipping
      ).toBe(false)
    }
  })

  it("relit une bascule absente des données soumises comme non cochée", () => {
    const donnees = formulaireSoumis()
    donnees.delete(CHAMPS_FORMULAIRE_PRODUIT.miseEnAvant)
    donnees.delete(CHAMPS_FORMULAIRE_PRODUIT.livraisonOfferte)

    const soumission = soumissionDepuisFormData(donnees, BASE_CDN)

    expect(soumission.champsCatalogue.isFeatured).toBe(false)
    expect(soumission.champsCatalogue.freeShipping).toBe(false)
  })
})

describe("les faits du formulaire", () => {
  it("décrivent le même Produit que l'entrée de la mutation, à la galerie et à la Structure près", () => {
    expectTypeOf<
      Omit<FaitsFormulaireProduit, "id" | "images" | "variants" | "categoryId">
    >().toEqualTypeOf<
      Omit<
        ProductInput,
        "images" | "variants" | "categoryId" | "tentativeId" | "ownerId"
      >
    >()

    expectTypeOf<FaitsFormulaireProduit["categoryId"]>().toEqualTypeOf<
      string | null
    >()
    expectTypeOf<ProductInput["categoryId"]>().toEqualTypeOf<string>()
  })

  it("décrivent la même Variante que l'entrée de la mutation", () => {
    expectTypeOf<FaitsVarianteFormulaire>().toEqualTypeOf<ProductVariantInput>()
  })
})

describe("soumissionDepuisFormData", () => {
  it("fait de la soumission du module de rendu l'entrée de la mutation", () => {
    const soumission = soumissionLue({
      nom: "Téléphone",
      slug: "telephone",
      marque: "Marque",
      categorieId: "categorie-42",
      description: "Un téléphone",
      prix: "1250,75",
      specsText: texteSpecifications(SPECS),
      ordre: "3",
      misEnAvant: valeurCaseACocher(true),
      livraisonOfferte: valeurCaseACocher(true),
      images: [
        { kind: "persistee", url: "https://cdn.eguidar.com/products/1.webp" },
        {
          kind: "brouillon",
          draftId: "draft-1",
          previewUrl: "https://cdn.eguidar.com/products/brouillons/1.webp",
        },
      ],
      variantes: [
        { name: "Standard", sku: "SKU-1", priceDelta: 0, stock: 4 },
        {
          id: "variante-2",
          name: "Pro",
          sku: "SKU-2",
          priceDelta: -1500,
          stock: 1,
        },
      ],
      tentativeId: "tentative-1",
    })

    expect(soumission).toEqual({
      champsCatalogue: {
        name: "Téléphone",
        slug: "telephone",
        brand: "Marque",
        categoryId: "categorie-42",
        description: "Un téléphone",
        price: 125075,
        isFeatured: true,
        featuredOrder: 3,
        freeShipping: true,
        specs: SPECS,
        variants: [
          { name: "Standard", sku: "SKU-1", priceDelta: 0, stock: 4 },
          {
            id: "variante-2",
            name: "Pro",
            sku: "SKU-2",
            priceDelta: -1500,
            stock: 1,
          },
        ],
      },
      images: [
        { kind: "persistee", url: "https://cdn.eguidar.com/products/1.webp" },
        {
          kind: "brouillon",
          draftId: "draft-1",
          previewUrl: "https://cdn.eguidar.com/products/brouillons/1.webp",
        },
      ],
      tentativeId: "tentative-1",
    })
  })

  it("garde les deux encodages monétaires du formulaire : le prix en dirhams, les écarts déjà en centimes", () => {
    const soumission = soumissionLue({
      prix: "1250,75",
      variantes: [{ name: "Pro", sku: "SKU-2", priceDelta: -1500, stock: 0 }],
    })

    expect(soumission.champsCatalogue.price).toBe(125075)
    expect(soumission.champsCatalogue.variants[0]?.priceDelta).toBe(-1500)
    expect(typeof soumission.champsCatalogue.variants[0]?.priceDelta).toBe(
      "number"
    )
  })

  it("reconnaît les deux cases à cocher par la seule convention du module neutre", () => {
    const cochees = soumissionLue({
      misEnAvant: valeurCaseACocher(true),
      livraisonOfferte: valeurCaseACocher(true),
    })
    const decochees = soumissionLue()

    expect(cochees.champsCatalogue.isFeatured).toBe(true)
    expect(cochees.champsCatalogue.freeShipping).toBe(true)
    expect(decochees.champsCatalogue.isFeatured).toBe(false)
    expect(decochees.champsCatalogue.freeShipping).toBe(false)
    expect(
      soumissionLue({ misEnAvant: "true" }).champsCatalogue.isFeatured
    ).toBe(false)
    expect(
      soumissionLue({ livraisonOfferte: "1" }).champsCatalogue.freeShipping
    ).toBe(false)

    const sansCases = formulaireSoumis()
    sansCases.delete(CHAMPS_FORMULAIRE_PRODUIT.miseEnAvant)
    sansCases.delete(CHAMPS_FORMULAIRE_PRODUIT.livraisonOfferte)
    const sansCase = soumissionDepuisFormData(sansCases, BASE_CDN)
    expect(sansCase.champsCatalogue.isFeatured).toBe(false)
    expect(sansCase.champsCatalogue.freeShipping).toBe(false)
  })

  it("relit le champ Spécifications par son langage, sans le réécrire", () => {
    const soumission = soumissionLue({ specsText: texteSpecifications(SPECS) })

    expect(soumission.champsCatalogue.specs).toEqual(SPECS)
  })

  it("valide la galerie soumise par le schéma de la galerie", () => {
    const soumission = soumissionLue({
      images: [
        { kind: "persistee", url: "https://cdn.eguidar.com/products/1.webp" },
      ],
    })

    expect(soumission.images).toEqual([
      { kind: "persistee", url: "https://cdn.eguidar.com/products/1.webp" },
    ])
  })

  it("ne valide pas les Variantes : il rend la main à la mutation", () => {
    const soumission = soumissionLue({ variantes: [{ priceDelta: 1500 }] })

    expect(soumission.champsCatalogue.variants).toEqual([{ priceDelta: 1500 }])
  })

  it("accepte un Produit sans Variante, comme le veut ADR-0026", () => {
    const soumission = soumissionLue({ variantes: [], prix: "99,99" })

    expect(soumission.champsCatalogue.variants).toEqual([])
    expect(soumission.champsCatalogue.price).toBe(9999)
  })

  it("retombe à zéro sur un ordre illisible et laisse le Catalogue refuser le reste", () => {
    expect(soumissionLue({ ordre: "abc" }).champsCatalogue.featuredOrder).toBe(
      0
    )
    expect(soumissionLue({ ordre: "" }).champsCatalogue.featuredOrder).toBe(0)
    expect(soumissionLue({ ordre: "-3" }).champsCatalogue.featuredOrder).toBe(
      -3
    )
    expect(soumissionLue({ ordre: "1.5" }).champsCatalogue.featuredOrder).toBe(
      1.5
    )
  })

  it("lit l'identifiant de tentative, rogné comme aujourd'hui", () => {
    expect(soumissionLue({ tentativeId: "  tentative-1  " }).tentativeId).toBe(
      "tentative-1"
    )
  })

  it("ne fabrique pas d'identifiant de tentative quand le champ est absent ou blanc", () => {
    const absente = formulaireSoumis()
    absente.delete("tentativeId")

    expect(soumissionDepuisFormData(absente, BASE_CDN).tentativeId).toBe("")
    expect(soumissionLue({ tentativeId: "   " }).tentativeId).toBe("")
  })

  it("ne tire aucune identité d'une valeur qui n'est pas une chaîne", () => {
    const donnees = formulaireSoumis()
    donnees.set("tentativeId", new File(["tentative-1"], "tentativeId"))

    expect(soumissionDepuisFormData(donnees, BASE_CDN).tentativeId).toBe("")
  })

  it("ignore le productId caché : l'identification reste à l'action", () => {
    const soumission = soumissionLue({ produitId: "produit-1" })

    expect(Object.keys(soumission)).toEqual([
      "champsCatalogue",
      "images",
      "tentativeId",
    ])
    expect(soumission.champsCatalogue).not.toHaveProperty("productId")
  })

  it("donne à la mutation son entrée, à la galerie près", () => {
    const soumission = soumissionLue()

    expectTypeOf(soumission.champsCatalogue).toEqualTypeOf<
      Omit<ProductInput, "images">
    >()
    expectTypeOf(soumission).toEqualTypeOf<SoumissionFormulaireProduit>()
  })
})

describe("les refus de la soumission", () => {
  it("refuse un champ caché qui n'est pas du JSON, avec le message d'aujourd'hui", () => {
    const imagesIllisibles = formulaireSoumis()
    imagesIllisibles.set("images", "{ceci n'est pas du json")
    const variantesIllisibles = formulaireSoumis()
    variantesIllisibles.set("variants", "pas du json non plus")

    expect((refusDeSoumission(imagesIllisibles) as Error).message).toBe(
      "Formulaire invalide"
    )
    expect((refusDeSoumission(variantesIllisibles) as Error).message).toBe(
      "Formulaire invalide"
    )
  })

  it("refuse une galerie qui n'en est pas une, avec le même message", () => {
    const donnees = formulaireSoumis({ images: [{ kind: "inexistant" }] })

    expect((refusDeSoumission(donnees) as Error).message).toBe(
      "Formulaire invalide"
    )
  })

  it("refuse une Image produit persistée servie hors de l'espace du CDN de la boutique", () => {
    for (const url of [
      "https://ailleurs.example.test/products/image-1.webp",
      "https://cdn.eguidar.com.ailleurs.example.test/products/image-1.webp",
      "https://cdn.eguidar.com/categories/image-1.webp",
      "https://cdn.eguidar.com/products/brouillons/brouillon-1.webp",
    ]) {
      const refus = refusDeSoumission(
        formulaireSoumis({ images: [{ kind: "persistee", url }] })
      )

      expect((refus as Error).message, url).toBe(MESSAGE_FORMULAIRE_INVALIDE)
    }
  })

  it("accepte une Image produit promue sous le CDN, à l'octet près", () => {
    const url = "https://cdn.eguidar.com/products/image-promue.webp"

    expect(
      soumissionLue({ images: [{ kind: "persistee", url }] }).images
    ).toEqual([{ kind: "persistee", url }])
  })

  it("garde un Brouillon d'Image produit quel que soit l'hôte de son aperçu", () => {
    const brouillon = {
      kind: "brouillon",
      draftId: "brouillon-1",
      previewUrl: "https://ailleurs.example.test/apercu.webp",
    }

    expect(soumissionLue({ images: [brouillon] }).images).toEqual([brouillon])
  })

  it("refuse un prix de base qu'il ne sait pas lire, avec le même message", () => {
    for (const prix of ["abc", "-", "12,5,5"]) {
      const refus = refusDeSoumission(formulaireSoumis({ prix }))

      expect((refus as Error).message).toBe("Formulaire invalide")
    }
  })

  it("laisse un champ prix vide passer à zéro, comme aujourd'hui", () => {
    expect(soumissionLue({ prix: "" }).champsCatalogue.price).toBe(0)
  })

  it("refuse par une Error simple, jamais par une UserFacingError", () => {
    const donnees = formulaireSoumis()
    donnees.set("images", "{ceci n'est pas du json")
    const refus = refusDeSoumission(donnees)

    expect(refus).toBeInstanceOf(Error)
    expect(refus).not.toBeInstanceOf(UserFacingError)
    expect((refus as Error).name).toBe("Error")
  })

  it("refuse une ligne de Spécifications sans deux-points avec le message du champ", () => {
    const refus = refusDeSoumission(
      formulaireSoumis({ specsText: "Écran 6,1 pouces" })
    )

    expect((refus as Error).message).toBe(
      "Format de spécifications invalide (clé : valeur par ligne)"
    )
  })

  it("lit le prix de base avant les Spécifications, comme aujourd'hui", () => {
    const refus = refusDeSoumission(
      formulaireSoumis({ prix: "abc", specsText: "Écran 6,1 pouces" })
    )

    expect((refus as Error).message).toBe("Formulaire invalide")
  })
})

describe("le vocabulaire des champs du formulaire Produit", () => {
  it("nomme chaque champ par le terme du glossaire, et le lit comme le fil l'écrit", () => {
    expect(CHAMPS_FORMULAIRE_PRODUIT).toEqual({
      nom: "name",
      slug: "slug",
      marque: "brand",
      structure: "categoryId",
      description: "description",
      prix: "price",
      specifications: "specsText",
      miseEnAvant: "isFeatured",
      livraisonOfferte: "freeShipping",
      ordre: "featuredOrder",
      galerie: "images",
      variantes: "variants",
      tentative: "tentativeId",
      produit: "productId",
    })
  })

  it("couvre exactement les quatorze champs du formulaire, ni plus ni moins", () => {
    expect(Object.keys(CHAMPS_FORMULAIRE_PRODUIT)).toHaveLength(14)
    expect(Object.keys(CHAMPS_FORMULAIRE_PRODUIT).sort()).toEqual([
      "description",
      "galerie",
      "livraisonOfferte",
      "marque",
      "miseEnAvant",
      "nom",
      "ordre",
      "prix",
      "produit",
      "slug",
      "specifications",
      "structure",
      "tentative",
      "variantes",
    ])
  })
})

describe("les messages de refus du module", () => {
  it("épingle le message d'un formulaire illisible, au caractère près", () => {
    expect(MESSAGE_FORMULAIRE_INVALIDE).toBe("Formulaire invalide")
  })

  it("garde le même mot, au caractère près, que le refus du mécanisme partagé", () => {
    const mecanisme = lire(import.meta.url, "./use-cases/mutation-actions.ts")

    expect(mecanisme).toContain(
      `export const INVALID_FORM_MESSAGE = ${JSON.stringify(
        MESSAGE_FORMULAIRE_INVALIDE
      )}`
    )
  })

  it("épingle le message d'une ligne de Spécifications invalide", () => {
    expect(MESSAGE_SPECIFICATIONS_INVALIDE).toBe(
      "Format de spécifications invalide (clé : valeur par ligne)"
    )
  })
})

describe("la galerie soumise hors suppressions en attente", () => {
  it("écarte l'Image produit marquée pour une suppression en attente", () => {
    const soumise = galerieSoumiseHorsSuppressionsEnAttente([
      {
        kind: "persistee",
        url: "https://cdn.eguidar.com/products/1.webp",
        suppressionEnAttente: true,
      },
    ])

    expect(soumise).toEqual([])
  })

  it("garde l'Image produit qui n'est pas marquée pour une suppression en attente", () => {
    const soumise = galerieSoumiseHorsSuppressionsEnAttente([
      {
        kind: "persistee",
        url: "https://cdn.eguidar.com/products/1.webp",
      },
    ])

    expect(soumise).toEqual([
      {
        kind: "persistee",
        url: "https://cdn.eguidar.com/products/1.webp",
      },
    ])
  })

  it("garde le Brouillon d'Image produit", () => {
    const soumise = galerieSoumiseHorsSuppressionsEnAttente([
      {
        kind: "brouillon",
        draftId: "draft-1",
        previewUrl: "https://cdn.eguidar.com/products/brouillons/1.webp",
      },
    ])

    expect(soumise).toEqual([
      {
        kind: "brouillon",
        draftId: "draft-1",
        previewUrl: "https://cdn.eguidar.com/products/brouillons/1.webp",
      },
    ])
  })

  it("garde l'ordre que l'éditeur a donné à la galerie", () => {
    const soumise = galerieSoumiseHorsSuppressionsEnAttente([
      {
        kind: "persistee",
        url: "https://cdn.eguidar.com/products/1.webp",
      },
      {
        kind: "brouillon",
        draftId: "draft-2",
        previewUrl: "https://cdn.eguidar.com/products/brouillons/2.webp",
      },
      {
        kind: "persistee",
        url: "https://cdn.eguidar.com/products/3.webp",
        suppressionEnAttente: true,
      },
      {
        kind: "persistee",
        url: "https://cdn.eguidar.com/products/4.webp",
      },
    ])

    expect(soumise).toEqual([
      {
        kind: "persistee",
        url: "https://cdn.eguidar.com/products/1.webp",
      },
      {
        kind: "brouillon",
        draftId: "draft-2",
        previewUrl: "https://cdn.eguidar.com/products/brouillons/2.webp",
      },
      {
        kind: "persistee",
        url: "https://cdn.eguidar.com/products/4.webp",
      },
    ])
  })

  it("porte le Texte alternatif rogné, et n'invente rien quand il est vide", () => {
    const soumise = galerieSoumiseHorsSuppressionsEnAttente([
      {
        kind: "persistee",
        url: "https://cdn.eguidar.com/products/1.webp",
        alt: "  Visuel principal  ",
      },
      {
        kind: "brouillon",
        draftId: "draft-2",
        previewUrl: "https://cdn.eguidar.com/products/brouillons/2.webp",
        alt: "   ",
      },
    ])

    expect(soumise).toEqual([
      {
        kind: "persistee",
        url: "https://cdn.eguidar.com/products/1.webp",
        alt: "Visuel principal",
      },
      {
        kind: "brouillon",
        draftId: "draft-2",
        previewUrl: "https://cdn.eguidar.com/products/brouillons/2.webp",
      },
    ])
  })

  it("lit une galerie qui porte le drapeau de suppression en attente, et rend une galerie qui ne le porte plus", () => {
    expectTypeOf<
      Parameters<typeof galerieSoumiseHorsSuppressionsEnAttente>[0]
    >().toEqualTypeOf<readonly EntreeImageProduitFormulaire[]>()

    expectTypeOf(
      galerieSoumiseHorsSuppressionsEnAttente([
        {
          kind: "persistee",
          url: "https://cdn.eguidar.com/products/1.webp",
          suppressionEnAttente: true,
        },
      ])
    ).toEqualTypeOf<EntreeImageProduit[]>()
  })
})

describe("la carte des sections en erreur d'un refus du Catalogue", () => {
  it("nomme la section Structure quand la Structure manque", () => {
    expect(
      sectionsDerreurProduit("Données invalides : catégorie requise")
    ).toEqual({ structure: "catégorie requise" })
  })

  it("nomme Informations pour le nom, le slug, la marque, le prix ou les spécifications", () => {
    for (const probleme of [
      "nom requis",
      "slug invalide (minuscules, chiffres et tirets uniquement)",
      "marque requise",
      "le prix doit être positif ou nul",
      "Format de spécifications invalide (clé : valeur par ligne)",
    ]) {
      expect(sectionsDerreurProduit(`Données invalides : ${probleme}`)).toEqual(
        {
          informations: probleme,
        }
      )
    }
  })

  it("nomme Variantes pour une Variante ou un SKU, sans confondre le prix final avec le prix de base", () => {
    expect(
      sectionsDerreurProduit(
        "Données invalides : prix final négatif pour le SKU SKU-1"
      )
    ).toEqual({ variantes: "prix final négatif pour le SKU SKU-1" })

    expect(
      sectionsDerreurProduit("Données invalides : nom de variante requis")
    ).toEqual({ variantes: "nom de variante requis" })
  })

  it("nomme Images pour une Image produit ou un Brouillon", () => {
    for (const probleme of [
      "une entrée de Galerie ne peut pas nommer une Image produit qui appartient à un autre Produit",
      "Les Brouillons ne sont pas tous liés à la même tentative",
    ]) {
      expect(sectionsDerreurProduit(`Données invalides : ${probleme}`)).toEqual(
        {
          images: probleme,
        }
      )
    }
  })

  it("répartit plusieurs problèmes entre leurs sections et garde l'ordre", () => {
    expect(
      sectionsDerreurProduit(
        "Données invalides : nom requis ; catégorie requise ; nom de variante requis"
      )
    ).toEqual({
      informations: "nom requis",
      structure: "catégorie requise",
      variantes: "nom de variante requis",
    })
  })

  it("laisse un refus inclassable hors des sections, pour qu'il reste un message global", () => {
    for (const message of [
      "L'enregistrement du Catalogue a échoué",
      "Produit introuvable",
      "Un produit avec ce slug existe déjà",
    ]) {
      const sections = sectionsDerreurProduit(message)
      if (message === "Un produit avec ce slug existe déjà") {
        expect(sections).toEqual({ informations: message })
      } else {
        expect(sections).toEqual({})
      }
    }
  })
})
