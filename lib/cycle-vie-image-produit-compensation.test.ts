import { describe, expect, it } from "vitest"

import { compensationAdmise } from "@/lib/cycle-vie-image-produit"

const TENTATIVE = "tentative-1"
const TENTATIVE_RIVALE = "tentative-2"
const PRODUIT = "produit-1"

/**
 * Les trois seuls faits dont la compensation se décide. La suite les écrit
 * elle-même plutôt que d'importer un type du module propriétaire : c'est
 * l'interface que la fonction doit attendre, et `tsc` la revérifie à chaque
 * compilation des deux côtés.
 */
type Ligne = {
  state: string
  tentativeId: string | null
  productId: string | null
}

/** Un Brouillon d'Image produit dans l'état que la règle conteste. */
function brouillon(faits: Partial<Ligne> & { state: string }): Ligne {
  return { tentativeId: null, productId: null, ...faits }
}

describe("précondition de compensation d'une revendication échouée", () => {
  it("rend à l'éditeur le Brouillon que cette même tentative avait pris", () => {
    expect(
      compensationAdmise(
        brouillon({ state: "revendiqué", tentativeId: TENTATIVE }),
        TENTATIVE
      )
    ).toBe(true)
  })

  it("ne rend pas un Brouillon encore vivant", () => {
    // La tentative est encore portée par la ligne : c'est bien l'état qui la
    // distingue d'un Brouillon repris, et non la seule présence de la tentative.
    expect(
      compensationAdmise(
        brouillon({ state: "vivant", tentativeId: TENTATIVE }),
        TENTATIVE
      )
    ).toBe(false)
  })

  it("ne rend pas un Brouillon déjà lié à un Produit", () => {
    // Il est devenu une Image produit persistée : sa suppression n'intervient
    // qu'après un enregistrement réussi, jamais par une compensation.
    expect(
      compensationAdmise(
        brouillon({
          state: "revendiqué",
          tentativeId: TENTATIVE,
          productId: PRODUIT,
        }),
        TENTATIVE
      )
    ).toBe(false)
  })

  it("ne ressuscite pas un Brouillon expiré", () => {
    // La rétention est échue : son objet a pu être supprimé par la règle de
    // cycle de vie R2, le rendre `vivant` le rendrait revendicable par une
    // tentative alors qu'il n'y a plus rien à promouvoir.
    expect(
      compensationAdmise(
        brouillon({ state: "expiré", tentativeId: TENTATIVE }),
        TENTATIVE
      )
    ).toBe(false)
  })

  it("ne rend pas un Brouillon libéré", () => {
    // La libération est terminale : l'éditeur a été prévenu et l'objet
    // supprimé, un second rendu n'aurait rien à lui rendre.
    expect(
      compensationAdmise(
        brouillon({ state: "libéré", tentativeId: TENTATIVE }),
        TENTATIVE
      )
    ).toBe(false)
  })

  it("ne rend pas à une tentative rivale un Brouillon pris par une autre", () => {
    expect(
      compensationAdmise(
        brouillon({ state: "revendiqué", tentativeId: TENTATIVE_RIVALE }),
        TENTATIVE
      )
    ).toBe(false)
  })

  it("ne rend rien quand il n'y a pas de Brouillon à rendre", () => {
    // Une compensation qui ne trouve rien n'est pas un échec : le port rend
    // toujours `void`, et l'imiter est ce qui permet à l'appelant de ne rien
    // rattraper.
    expect(compensationAdmise(null, TENTATIVE)).toBe(false)
    expect(compensationAdmise(undefined, TENTATIVE)).toBe(false)
  })

  it("classe un état que le registre ne connaît pas comme un Brouillon à ne pas rendre", () => {
    // La colonne `state` du registre durable est une chaîne, pas une énumération :
    // une valeur inattendue doit se classer, et non faire lever la compensation.
    expect(
      compensationAdmise(
        brouillon({ state: "état-inconnu", tentativeId: TENTATIVE }),
        TENTATIVE
      )
    ).toBe(false)
  })
})
