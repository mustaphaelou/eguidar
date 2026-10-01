import { describe, expect, it } from "vitest"

import {
  clauseCompensation,
  compensationAdmise,
} from "@/lib/cycle-vie-image-produit"

const DRAFT = "brouillon-1"
const AUTRE_DRAFT = "brouillon-2"
const TENTATIVE = "tentative-1"
const TENTATIVE_RIVALE = "tentative-2"
const PRODUIT = "produit-1"

type Fait = string | null

/**
 * Une rangée du registre, réduite aux faits que la compensation regarde. La
 * suite l'écrit elle-même : c'est l'interface que la clause et la règle
 * partagent, et `tsc` la revérifie des deux côtés. L'index signature laisse la
 * comparaison de la clause se faire sur tous ses champs, sans que la suite
 * doive énumérer ceux qu'une clause ajoutée pourrait porter.
 */
type Ligne = {
  [fait: string]: Fait
  state: string
  tentativeId: Fait
  productId: Fait
}

/** Une Brouillon d'Image produit pris par la tentative, et ses voisines. */
const LIGNES: readonly Ligne[] = [
  { state: "revendiqué", tentativeId: TENTATIVE, productId: null },
  { state: "vivant", tentativeId: null, productId: null },
  { state: "vivant", tentativeId: TENTATIVE, productId: null },
  { state: "expiré", tentativeId: TENTATIVE, productId: null },
  { state: "libéré", tentativeId: TENTATIVE, productId: null },
  { state: "revendiqué", tentativeId: TENTATIVE_RIVALE, productId: null },
  { state: "revendiqué", tentativeId: TENTATIVE, productId: PRODUIT },
  { state: "état-inconnu", tentativeId: TENTATIVE, productId: null },
]

/**
 * Ce que la clause SQL retient d'une rangée, lu champ par champ dans la clause
 * telle qu'elle est construite. La comparaison est exhaustive sur les champs de
 * la clause : un champ ajouté s'applique, un champ retiré cesse de s'appliquer.
 * C'est ce qui rend l'épinglage capable de rate une clause qui diverge de la
 * règle, plutôt que de recopier la règle une troisième fois.
 *
 * `id` est la clé de la rangée cherchée, pas une condition : il est vérifié à
 * part, par la suite, et la règle ne le voit pas.
 */
function retient(clause: Record<string, Fait>, ligne: Ligne): boolean {
  const { id: _cle, ...conditions } = clause
  return Object.entries(conditions).every(
    ([fait, attendu]) => ligne[fait] === attendu
  )
}

describe("la compensation du registre durable reste la règle du module", () => {
  it("nomme le Brouillon que la compensation cherche", () => {
    expect(clauseCompensation({ id: DRAFT, tentativeId: TENTATIVE }).id).toBe(
      DRAFT
    )
  })

  it("retient exactement les rangées que la règle admet", () => {
    const clause = clauseCompensation({ id: DRAFT, tentativeId: TENTATIVE })

    for (const ligne of LIGNES) {
      expect(
        retient(clause, ligne),
        `clause=${JSON.stringify(clause)} ligne=${JSON.stringify(ligne)}`
      ).toBe(compensationAdmise(ligne, TENTATIVE))
    }
  })

  it("change de refus avec la tentative, comme la règle", () => {
    const clause = clauseCompensation({ id: DRAFT, tentativeId: TENTATIVE })
    const rivale = clauseCompensation({
      id: DRAFT,
      tentativeId: TENTATIVE_RIVALE,
    })
    const ligne = LIGNES[5]

    expect(compensationAdmise(ligne, TENTATIVE_RIVALE)).toBe(true)
    expect(retient(rivale, ligne)).toBe(true)
    expect(retient(clause, ligne)).toBe(false)
  })

  it("ne se confond pas avec un autre Brouillon du registre", () => {
    // La clause d'un Brouillon ne vaut pas pour son voisin : les deux portent
    // les mêmes faits, et seul l'identifiant les sépare.
    const ligne = {
      state: "revendiqué",
      tentativeId: TENTATIVE,
      productId: null,
    }

    expect(
      clauseCompensation({ id: AUTRE_DRAFT, tentativeId: TENTATIVE }).id
    ).toBe(AUTRE_DRAFT)
    expect(clauseCompensation({ id: DRAFT, tentativeId: TENTATIVE }).id).toBe(
      DRAFT
    )
    expect(compensationAdmise(ligne, TENTATIVE)).toBe(true)
  })
})
