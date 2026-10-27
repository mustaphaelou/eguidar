import { describe, expect, it } from "vitest"

import { estObjet, estTexteNonVide, messageDe } from "./valeur"

describe("les gardes de valeur partagées", () => {
  it.each([
    [{}, true],
    [{ cle: "valeur" }, true],
    [null, false],
    [[], false],
    ["texte", false],
    [42, false],
    [undefined, false],
  ])("reconnaît un objet non nul et non tableau : %j", (valeur, attendu) => {
    expect(estObjet(valeur)).toBe(attendu)
  })

  it.each([
    ["texte", true],
    ["  texte  ", true],
    ["", false],
    ["   ", false],
    [null, false],
    [42, false],
    [undefined, false],
  ])("reconnaît un texte non vide : %j", (valeur, attendu) => {
    expect(estTexteNonVide(valeur)).toBe(attendu)
  })

  it("rend le message d'une erreur, et le texte de toute autre valeur", () => {
    expect(messageDe(new Error("panne réseau"))).toBe("panne réseau")
    expect(messageDe("texte brut")).toBe("texte brut")
    expect(messageDe(42)).toBe("42")
    expect(messageDe(null)).toBe("null")
  })
})
