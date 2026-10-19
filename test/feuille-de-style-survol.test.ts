import { beforeAll, describe, expect, it } from "vitest"
import type { AtRule, Node, Rule } from "postcss"

import {
  compilerLaFeuilleDeStyle,
  type FeuilleDeStyleCompilee,
} from "./feuille-de-style"

const REQUETE_SURVOL = "[@media(hover:hover)]"
const REQUETE_POINTEUR_FIN = "[@media(hover:hover)_and_(pointer:fine)]"
const SURVOL_SOULIGNE = "group-hover" + ":underline"

const DEMI_REQUETE = `${REQUETE_SURVOL}:${SURVOL_SOULIGNE}`
const REQUETE_COMPLETE = `${REQUETE_POINTEUR_FIN}:${SURVOL_SOULIGNE}`

function selecteurs(feuille: FeuilleDeStyleCompilee): string[] {
  const liste: string[] = []

  feuille.racine.walkRules((regle) => {
    liste.push(regle.selector)
  })

  return liste
}

function sansEchappement(selecteur: string): string {
  return selecteur.replaceAll("\\", "")
}

function dansLaRequeteDuPointeurFin(regle: Rule): boolean {
  let parent: Node | undefined = regle.parent

  while (parent) {
    if (parent.type === "atrule") {
      const requete = parent as AtRule
      if (
        requete.name === "media" &&
        requete.params.includes("(pointer:fine)")
      ) {
        return true
      }
    }

    parent = parent.parent
  }

  return false
}

function reglesDuSurvolSouligne(feuille: FeuilleDeStyleCompilee): Rule[] {
  const regles: Rule[] = []

  feuille.racine.walkRules((regle) => {
    if (!sansEchappement(regle.selector).includes(SURVOL_SOULIGNE)) {
      return
    }

    if (!regle.selector.includes("@media")) {
      return
    }

    regles.push(regle)
  })

  return regles
}

describe("la famille du survol dans la feuille de style compilée", () => {
  let feuille: FeuilleDeStyleCompilee

  beforeAll(async () => {
    feuille = await compilerLaFeuilleDeStyle()
  })

  it("continue d'émettre le survol simple, le survol de groupe et le survol de groupe nommé", () => {
    const liste = selecteurs(feuille).map(sansEchappement)

    expect(liste.some((selecteur) => selecteur.startsWith(".hover:"))).toBe(
      true
    )
    expect(
      liste.some((selecteur) => selecteur.startsWith(".group-hover:"))
    ).toBe(true)
    expect(
      liste.some((selecteur) => selecteur.startsWith(".group-hover/lien:"))
    ).toBe(true)
    expect(
      liste.some((selecteur) => selecteur.startsWith(".group-hover/categorie:"))
    ).toBe(true)
  })

  it("expose la requête du pointeur fin que la convention emploie site par site", () => {
    const requetes: string[] = []

    feuille.racine.walkAtRules("media", (regle) => {
      requetes.push(regle.params)
    })

    expect(
      requetes.some(
        (requete) =>
          requete.includes("(hover:hover)") &&
          requete.includes("(pointer:fine)")
      )
    ).toBe(true)
  })

  it("garde le soulignement du lien du Panneau et des catégories de la Bande", () => {
    const liste = selecteurs(feuille).map(sansEchappement)

    expect(
      liste.some((selecteur) =>
        selecteur.startsWith(".group-hover/lien:underline")
      )
    ).toBe(true)
    expect(
      liste.some((selecteur) =>
        selecteur.startsWith(".group-hover/categorie:underline")
      )
    ).toBe(true)

    let panneau: Rule | undefined
    let bande: Rule | undefined

    feuille.racine.walkRules((regle) => {
      if (sansEchappement(regle.selector).startsWith(".group-hover/lien:")) {
        panneau = regle
      }
      if (
        sansEchappement(regle.selector).startsWith(".group-hover/categorie:")
      ) {
        bande = regle
      }
    })

    expect(panneau?.toString()).toContain("text-decoration-line: underline")
    expect(bande?.toString()).toContain("text-decoration-line: underline")
  })

  it("n'émet le soulignement du titre de la carte de blog que sous la requête du pointeur fin", () => {
    const liste = selecteurs(feuille).map(sansEchappement)

    expect(liste.some((selecteur) => selecteur.includes(DEMI_REQUETE))).toBe(
      false
    )
    expect(
      liste.some((selecteur) => selecteur.includes(REQUETE_COMPLETE))
    ).toBe(true)

    const regles = reglesDuSurvolSouligne(feuille)

    expect(regles.length).toBeGreaterThan(0)

    for (const regle of regles) {
      expect(dansLaRequeteDuPointeurFin(regle)).toBe(true)
      expect(regle.toString()).toContain("text-decoration-line: underline")
    }
  })
})
