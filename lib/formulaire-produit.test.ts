import { describe, expect, expectTypeOf, it } from "vitest"

import {
  ecartPrixDepuisTexte,
  specificationsDepuisTexte,
  texteEcartPrix,
  texteSpecifications,
  type FaitsFormulaireProduit,
  type FaitsVarianteFormulaire,
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
 * qu'un éditeur entre et la valeur que l'appelant reçoit sont la seule chose
 * affirmée ici. Les deux moitiés du langage des Spécifications sont éprouvées
 * l'une par l'autre (aller-retour), et la paire de l'écart de prix avec sa
 * chute à zéro. L'import de `@/lib/use-cases/admin-catalog` plus bas est **de
 * type seul** : il ne subsiste rien à la compilation, et cette suite reste
 * exécutable en Node sans base.
 */

/** Un record de spécifications dont aucune clé ni valeur ne contient de saut de ligne. */
const SPECS: Record<string, string> = {
  Écran: "6,1 pouces",
  Puce: "A17 Pro",
  Ports: "USB-C, USB-C, USB-C",
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
