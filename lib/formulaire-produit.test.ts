import { describe, expect, expectTypeOf, it } from "vitest"

import {
  ecartPrixDepuisTexte,
  MESSAGE_FORMULAIRE_INVALIDE,
  MESSAGE_SPECIFICATIONS_INVALIDE,
  specificationsDepuisTexte,
  soumissionDepuisFormData,
  texteEcartPrix,
  texteSpecifications,
  type FaitsFormulaireProduit,
  type FaitsVarianteFormulaire,
  type SoumissionFormulaireProduit,
} from "@/lib/formulaire-produit"
import type {
  ProductInput,
  ProductVariantInput,
} from "@/lib/use-cases/admin-catalog"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

/**
 * Le langage du formulaire Produit, traversé par son interface.
 *
 * Suite pure : elle n'importe ni `@/lib/db`, ni Prisma, ni session — les faits
 * qu'un éditeur entre, le refus qu'il reçoit et la valeur que l'appelant
 * obtient sont la seule chose affirmée ici. Les deux moitiés du langage des
 * Spécifications sont éprouvées l'une par l'autre (aller-retour), la paire de
 * l'écart de prix avec sa chute à zéro, et **le transport** avec la soumission
 * que le module de rendu produit réellement. L'import de
 * `@/lib/use-cases/admin-catalog` est **de type seul** : il ne subsiste rien à
 * la compilation, et cette suite reste exécutable en Node sans base.
 */

/** Un record de spécifications dont aucune clé ni valeur ne contient de saut de ligne. */
const SPECS: Record<string, string> = {
  Écran: "6,1 pouces",
  Puce: "A17 Pro",
  Ports: "USB-C, USB-C, USB-C",
}

/** La Variante que le module de rendu inscrit par défaut dans le champ caché. */
const VARIANTE_STANDARD = {
  name: "Standard",
  sku: "SKU-1",
  priceDelta: 0,
  stock: 2,
}

/** Le refus que reçoit l'appelant, ou l'échec du test si la ligne est acceptée. */
function refusDe(texte: string): unknown {
  try {
    specificationsDepuisTexte(texte)
  } catch (erreur) {
    return erreur
  }
  throw new Error(`La ligne ${JSON.stringify(texte)} n'a pas été refusée`)
}

/** Ce que le module de rendu inscrit dans le formulaire, avant sérialisation. */
interface SoumissionRendue {
  nom?: string
  slug?: string
  marque?: string
  categorieId?: string
  description?: string
  /** Le prix de base, **en dirhams** : c'est une chaîne, pas des centimes. */
  prix?: string
  specsText?: string
  /** Le champ d'ordre, tel que tapé. */
  ordre?: string
  /** Les deux cases à cocher : `"on"` ou `""`, jamais `true`. */
  misEnAvant?: string
  livraisonOfferte?: string
  /** La galerie et les Variantes, déjà dans la forme du champ caché. */
  images?: unknown
  variantes?: unknown
  tentativeId?: string
  /** Le champ caché que le module de rendu n'écrit qu'en édition. */
  produitId?: string | null
}

/**
 * Le `FormData` **tel que `components/admin/product-form.tsx` le construit** :
 * mêmes noms de champs, même convention `"on"` / `""` pour les deux cases à
 * cocher, même sélecteur de catégorie devenu champ caché, même JSON caché pour
 * la galerie et les Variantes, même identifiant de tentative. Cette factory est
 * le miroir du module de rendu : si l'un des deux change sans l'autre, c'est
 * cette suite qui le dit — pas un éditeur devant son écran.
 *
 * On ne passe donc jamais un `FormData` forgé à la main là où le module de
 * rendu écrit un `JSON.stringify` : la sérialisation se fait ici, comme là.
 */
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
  // Le sélecteur de catégorie n'est pas un champ du formulaire : son état est
  // recopié dans un champ caché, comme les deux cases à cocher.
  donnees.append("categoryId", categorieId)
  donnees.append("isFeatured", misEnAvant)
  donnees.append("freeShipping", livraisonOfferte)
  // Les deux champs cachés JSON, puis l'identifiant de tentative.
  donnees.append("images", JSON.stringify(images))
  donnees.append("variants", JSON.stringify(variantes))
  donnees.append("tentativeId", tentativeId)
  if (produitId !== null) donnees.append("productId", produitId)
  return donnees
}

/** La soumission lue, par le transport, d'un formulaire rendu. */
function soumissionLue(
  rendue: SoumissionRendue = {}
): SoumissionFormulaireProduit {
  return soumissionDepuisFormData(formulaireSoumis(rendue))
}

/** Le refus que reçoit l'appelant, ou l'échec du test si la soumission passe. */
function refusDeSoumission(donnees: FormData): unknown {
  try {
    soumissionDepuisFormData(donnees)
  } catch (erreur) {
    return erreur
  }
  throw new Error("La soumission n'a pas été refusée")
}

const UN_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

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
    // La levée se produit pendant la lecture de la soumission : l'enveloppe de
    // mutation partagée transforme n'importe quelle `Error` en
    // `{ error: <message> }`. Une `UserFacingError` ici changerait le chemin de
    // la levée. `user-facing-error.ts` n'importe rien, donc cette suite reste
    // exécutable en Node sans base.
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
    // L'encodage ne change pas : le champ caché `variants` transporte un
    // nombre, que le serveur relit par un `JSON.parse` direct.
    const cents = ecartPrixDepuisTexte("15,00")

    expect(typeof cents).toBe("number")
    expect(JSON.parse(JSON.stringify({ priceDelta: cents }))).toEqual({
      priceDelta: 1500,
    })
  })
})

describe("les faits du formulaire", () => {
  it("décrivent le même Produit que l'entrée de la mutation, à la galerie près", () => {
    // L'entrée de la mutation est atteinte **par type seulement** : rien de
    // `@/lib/use-cases/admin-catalog` ne subsiste à la compilation, donc
    // cette suite reste exécutable en Node sans base. La galerie est la seule
    // divergence voulue : le formulaire manipule des Images produit, la
    // mutation des URL.
    expectTypeOf<
      Omit<FaitsFormulaireProduit, "id" | "images" | "variants">
    >().toEqualTypeOf<Omit<ProductInput, "images" | "variants">>()
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
      misEnAvant: "on",
      livraisonOfferte: "on",
      images: [
        { kind: "persistee", url: "https://cdn.test/p/1.webp" },
        {
          kind: "brouillon",
          draftId: "draft-1",
          previewUrl: "https://cdn.test/brouillons/1.webp",
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
      champs: {
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
        { kind: "persistee", url: "https://cdn.test/p/1.webp" },
        {
          kind: "brouillon",
          draftId: "draft-1",
          previewUrl: "https://cdn.test/brouillons/1.webp",
        },
      ],
      tentativeId: "tentative-1",
    })
  })

  it("garde les deux encodages monétaires du formulaire : le prix en dirhams, les écarts déjà en centimes", () => {
    // Le prix de base traverse le formulaire comme une chaîne décimale et
    // arrive en centimes ; chaque écart de prix est déjà un nombre de
    // centimes dans le champ caché, que le serveur ne relit pas.
    const soumission = soumissionLue({
      prix: "1250,75",
      variantes: [{ name: "Pro", sku: "SKU-2", priceDelta: -1500, stock: 0 }],
    })

    expect(soumission.champs.price).toBe(125075)
    expect(soumission.champs.variants[0]?.priceDelta).toBe(-1500)
    expect(typeof soumission.champs.variants[0]?.priceDelta).toBe("number")
  })

  it("reconnaît les deux cases à cocher par la seule convention « on »", () => {
    // Le module de rendu n'écrit pas `checked` : il écrit `"on"` ou `""`.
    // Aucune autre valeur n'est vraie, et un champ absent ne l'est pas
    // davantage.
    const cochees = soumissionLue({ misEnAvant: "on", livraisonOfferte: "on" })
    const decochees = soumissionLue()

    expect(cochees.champs.isFeatured).toBe(true)
    expect(cochees.champs.freeShipping).toBe(true)
    expect(decochees.champs.isFeatured).toBe(false)
    expect(decochees.champs.freeShipping).toBe(false)
    expect(soumissionLue({ misEnAvant: "true" }).champs.isFeatured).toBe(false)
    expect(soumissionLue({ livraisonOfferte: "1" }).champs.freeShipping).toBe(
      false
    )

    const sansCases = formulaireSoumis()
    sansCases.delete("isFeatured")
    sansCases.delete("freeShipping")
    const sansCase = soumissionDepuisFormData(sansCases)
    expect(sansCase.champs.isFeatured).toBe(false)
    expect(sansCase.champs.freeShipping).toBe(false)
  })

  it("relit le champ Spécifications par son langage, sans le réécrire", () => {
    const soumission = soumissionLue({ specsText: texteSpecifications(SPECS) })

    expect(soumission.champs.specs).toEqual(SPECS)
  })

  it("valide la galerie soumise par le schéma de la galerie", () => {
    const soumission = soumissionLue({
      images: [{ kind: "persistee", url: "https://cdn.test/p/1.webp" }],
    })

    expect(soumission.images).toEqual([
      { kind: "persistee", url: "https://cdn.test/p/1.webp" },
    ])
  })

  it("ne valide pas les Variantes : il rend la main à la mutation", () => {
    // Une Variante sans nom ni SKU passe le transport telle quelle. C'est le
    // `productInputSchema` du Catalogue qui la refuse, avec son propre
    // message ; le valider ici changerait le refus qu'un éditeur reçoit.
    const soumission = soumissionLue({ variantes: [{ priceDelta: 1500 }] })

    expect(soumission.champs.variants).toEqual([{ priceDelta: 1500 }])
  })

  it("accepte un Produit sans Variante, comme le veut ADR-0026", () => {
    // Le prix minimal retombe alors sur le prix de base ; aucune validation de
    // Variante minimale n'apparaît par le transport.
    const soumission = soumissionLue({ variantes: [], prix: "99,99" })

    expect(soumission.champs.variants).toEqual([])
    expect(soumission.champs.price).toBe(9999)
  })

  it("retombe à zéro sur un ordre illisible et laisse le Catalogue refuser le reste", () => {
    // Le transport ne juge pas le champ d'ordre : il ne fait que le lire. Un
    // entier négatif ou fractionnaire traverse donc entier, et c'est le
    // `productInputSchema` du Catalogue — `featuredOrder` y est un entier
    // positif ou nul — qui le refuse.
    expect(soumissionLue({ ordre: "abc" }).champs.featuredOrder).toBe(0)
    expect(soumissionLue({ ordre: "" }).champs.featuredOrder).toBe(0)
    expect(soumissionLue({ ordre: "-3" }).champs.featuredOrder).toBe(-3)
    expect(soumissionLue({ ordre: "1.5" }).champs.featuredOrder).toBe(1.5)
  })

  it("lit l'identifiant de tentative, rogné comme aujourd'hui", () => {
    expect(soumissionLue({ tentativeId: "  tentative-1  " }).tentativeId).toBe(
      "tentative-1"
    )
  })

  it("invente un identifiant de tentative quand le champ est absent ou blanc", () => {
    const absente = formulaireSoumis()
    absente.delete("tentativeId")

    expect(soumissionDepuisFormData(absente).tentativeId).toMatch(UN_UUID)
    expect(soumissionLue({ tentativeId: "   " }).tentativeId).toMatch(UN_UUID)
  })

  it("ignore le productId caché : l'identification reste à l'action", () => {
    // Le module de rendu écrit ce champ en édition, mais le transport n'en
    // sait rien : `parseRequiredId` appartient à l'action, qui, seule, sait
    // qu'elle édite un Produit existant.
    const soumission = soumissionLue({ produitId: "produit-1" })

    expect(Object.keys(soumission)).toEqual(["champs", "images", "tentativeId"])
    expect(soumission.champs).not.toHaveProperty("productId")
  })

  it("donne à la mutation son entrée, à la galerie près", () => {
    // La forme de `champs` est l'entrée du Catalogue elle-même, sans
    // adaptateur : le module atteint son type par un import de type seul, et
    // la galerie en reste écartée parce que la mutation range des URL.
    const soumission = soumissionLue()

    expectTypeOf(soumission.champs).toEqualTypeOf<
      Omit<ProductInput, "images">
    >()
    expectTypeOf(soumission).toEqualTypeOf<SoumissionFormulaireProduit>()
  })
})

describe("les refus de la soumission", () => {
  // Les refus sont affirmés **contre le littéral**, pas contre la constante :
  // c'est le texte qu'un éditeur lit, et il doit rester ce texte-ci. La
  // constante est éprouvée séparément, plus bas.

  it("refuse un champ caché qui n'est pas du JSON, avec le message d'aujourd'hui", () => {
    // Le module de rendu n'enverrait jamais cela ; la robustesse se paie donc
    // par un refus, pas par une lecture à moitié faite.
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

  it("refuse un prix de base qu'il ne sait pas lire, avec le même message", () => {
    for (const prix of ["abc", "-", "12,5,5"]) {
      const refus = refusDeSoumission(formulaireSoumis({ prix }))

      expect((refus as Error).message).toBe("Formulaire invalide")
    }
  })

  it("laisse un champ prix vide passer à zéro, comme aujourd'hui", () => {
    // Le champ porte `required` dans le navigateur ; côté serveur, une chaîne
    // vide est un zéro pour l'aide d'argent partagée. Le transport n'ajoute
    // donc aucun refus que le formulaire ne fasse déjà.
    expect(soumissionLue({ prix: "" }).champs.price).toBe(0)
  })

  it("refuse par une Error simple, jamais par une UserFacingError", () => {
    // Les deux levées se produisent pendant la lecture de la soumission :
    // l'enveloppe de mutation partagée transforme alors n'importe quelle
    // `Error` en `{ error: <message> }`. Une `UserFacingError` changerait le
    // chemin de la levée.
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
    // L'ordre de lecture ne se voit pas quand un seul des deux champs est
    // fautif ; il se voit quand les deux le sont. Le prix était lu avant le
    // champ Spécifications, donc c'est son refus qui passe.
    const refus = refusDeSoumission(
      formulaireSoumis({ prix: "abc", specsText: "Écran 6,1 pouces" })
    )

    expect((refus as Error).message).toBe("Formulaire invalide")
  })
})

describe("les messages de refus du module", () => {
  it("épingle le message d'un formulaire illisible, au caractère près", () => {
    // Le littéral existe une seconde fois dans le mécanisme partagé de
    // mutation, qui est hors de portée de ce travail et garde le sien pour
    // `parseMoneyField`, `parseRequiredId` et le statut de la Commande. Les
    // deux chaînes sont le même mot : l'épingler ici rend une dérive — dans un
    // sens ou dans l'autre — impossible à laisser passer.
    expect(MESSAGE_FORMULAIRE_INVALIDE).toBe("Formulaire invalide")
  })

  it("épingle le message d'une ligne de Spécifications invalide", () => {
    expect(MESSAGE_SPECIFICATIONS_INVALIDE).toBe(
      "Format de spécifications invalide (clé : valeur par ligne)"
    )
  })
})
