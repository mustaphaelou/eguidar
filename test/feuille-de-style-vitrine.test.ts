import { readFileSync } from "node:fs"
import path from "node:path"

import type { Declaration } from "postcss"
import { beforeAll, describe, expect, it } from "vitest"

import {
  compilerLaFeuilleDeStyle,
  declarationsDe,
  estDansLaCoucheBase,
  estDansLaRacine,
  estDansRequete,
  reglesDuSelecteur,
  type FeuilleDeStyleCompilee,
  valeurDe,
  valeurNormalisee,
  valeursDe,
} from "./feuille-de-style"

const JETONS_FLUIDES = [
  "--text-titre-hero",
  "--text-surtitre-hero",
  "--text-titre-promo",
  "--text-surtitre-promo",
  "--text-callout",
  "--text-titre-produit",
  "--text-titre-section",
  "--text-prix-fiche",
  "--text-prix-barre",
] as const

const JETONS_OKLCH = ["--link-sombre", "--succes", "--succes-point"] as const

const JETONS_MELANGE_OKLCH = [
  "--encre-sombre-secondaire",
  "--encre-attenuee",
  "--succes-fond",
  "--destructif-fond",
  "--bordure-subtile",
] as const

const FICHIERS_VITRINE = [
  "app/(boutique)/page.tsx",
  "app/(boutique)/produit/[slug]/page.tsx",
  "components/storefront/panneau-accueil.tsx",
  "components/storefront/bande-categories.tsx",
  "components/storefront/apple-breadcrumb.tsx",
  "components/storefront/product-gallery.tsx",
  "components/storefront/product-buy-box.tsx",
  "components/storefront/barre-d-achat.tsx",
  "components/storefront/carte-produit.tsx",
  "components/storefront/panier-badge.tsx",
  "lib/apparition.ts",
] as const

const MOTIF_INTERDIT =
  /\b(?:m[tblr]-|p[tblr]-|top-|bottom-|left-|right-|text-left|text-right|border-[tblr]\b|overflow-hidden|outline-none|transition-all|ease-in\b|#[0-9a-fA-F]{3,8}|(?:bg|text|border|divide|ring)-[a-z-]+\/[0-9]+)/

function declarationsDuTheme(
  feuille: FeuilleDeStyleCompilee,
  nom: string
): Declaration[] {
  return declarationsDe(feuille, nom).filter(
    (declaration) => !estDansLaRacine(declaration)
  )
}

function declarationsRacine(
  feuille: FeuilleDeStyleCompilee,
  nom: string
): Declaration[] {
  return declarationsDe(feuille, nom).filter((declaration) =>
    estDansLaRacine(declaration)
  )
}

function bornesRemDeClamp(valeur: string): [number, number] {
  const correspondance = valeur.match(
    /^clamp\(\s*([\d.]+)rem\s*,[^,]+,\s*([\d.]+)rem\s*\)$/
  )
  if (!correspondance) {
    throw new Error(`clamp attendu en rem, reçu : ${valeur}`)
  }
  return [Number(correspondance[1]), Number(correspondance[2])]
}

describe("les jetons fluides et couleurs oklch de l'accueil et de la fiche", () => {
  let feuille: FeuilleDeStyleCompilee

  beforeAll(async () => {
    feuille = await compilerLaFeuilleDeStyle()
  })

  it.each(JETONS_FLUIDES)(
    "déclare %s en clamp() avec un rapport max/min <= 2,5 et ses compagnons",
    (nom) => {
      const theme = declarationsDuTheme(feuille, nom)
      const racine = declarationsRacine(feuille, nom)

      expect(theme).toHaveLength(1)
      expect(valeurNormalisee(theme[0]!.value)).toBe(`var(${nom})`)
      expect(racine).toHaveLength(1)

      const valeur = valeurNormalisee(racine[0]!.value)
      const [min, max] = bornesRemDeClamp(valeur)
      expect(max / min).toBeLessThanOrEqual(2.5)
      expect(valeur).toMatch(/rem\s*\+\s*[\d.]+vw/)

      expect(declarationsDuTheme(feuille, `${nom}--line-height`)).toHaveLength(
        1
      )
      expect(
        declarationsDuTheme(feuille, `${nom}--letter-spacing`)
      ).toHaveLength(1)
    }
  )

  it.each(JETONS_OKLCH)("déclare %s en oklch(), sans hex ni oklab", (nom) => {
    const racine = declarationsRacine(feuille, nom)

    expect(racine).toHaveLength(1)
    const valeur = valeurNormalisee(racine[0]!.value)
    expect(valeur).toMatch(/^oklch\(/)
    expect(valeur).not.toMatch(/#|oklab/i)
  })

  it.each(JETONS_MELANGE_OKLCH)(
    "dérive %s par color-mix(in oklch, …), sans hex ni oklab",
    (nom) => {
      const racine = declarationsRacine(feuille, nom).map((declaration) =>
        valeurNormalisee(declaration.value)
      )
      const melanges = racine.filter((valeur) =>
        valeur.startsWith("color-mix(")
      )

      expect(melanges).toHaveLength(1)
      expect(melanges[0]).toMatch(/^color-mix\(in oklch,/)
      for (const valeur of racine) {
        expect(valeur).not.toMatch(/#|oklab/i)
      }
    }
  )
})

describe("les utilitaires d'interaction et de défilement de la vitrine", () => {
  let feuille: FeuilleDeStyleCompilee

  beforeAll(async () => {
    feuille = await compilerLaFeuilleDeStyle()
  })

  it("étend la zone tactile à 44 px via un pseudo-élément", () => {
    const regles = reglesDuSelecteur(feuille, ".zone-tactile::after")

    expect(regles).toHaveLength(1)
    expect(valeurNormalisee(valeurDe(regles[0]!, "inset") ?? "")).toBe(
      "min(0px, (100% - 44px) / 2)"
    )
  })

  it("cantonne text-box aux étiquettes centrées et jamais au sélecteur universel", () => {
    const etiquette = reglesDuSelecteur(feuille, ".etiquette-centree")
    expect(etiquette).toHaveLength(1)
    expect(valeurNormalisee(valeurDe(etiquette[0]!, "text-box") ?? "")).toBe(
      "trim-both cap alphabetic"
    )

    const universel = reglesDuSelecteur(feuille, "*")
    expect(valeursDe(universel, "text-box")).toEqual([])
  })

  it("rend tout un Panneau cliquable avec un anneau de focus sur le conteneur", () => {
    const lien = reglesDuSelecteur(
      feuille,
      ".panneau-cliquable .panneau-lien::after"
    )
    const focusLien = reglesDuSelecteur(
      feuille,
      ".panneau-cliquable .panneau-lien:focus-visible"
    )
    const focusPanneau = reglesDuSelecteur(
      feuille,
      ".panneau-cliquable:has(.panneau-lien:focus-visible)"
    )

    expect(lien).toHaveLength(1)
    expect(valeurDe(lien[0]!, "position")).toBe("absolute")
    expect(valeurDe(lien[0]!, "inset")).toBe("0")
    expect(focusLien).toHaveLength(1)
    expect(valeurNormalisee(valeurDe(focusLien[0]!, "outline") ?? "")).toBe(
      "2px solid transparent"
    )
    expect(focusPanneau).toHaveLength(1)
    expect(valeurNormalisee(valeurDe(focusPanneau[0]!, "outline") ?? "")).toBe(
      "2px solid var(--ring)"
    )
  })

  it("configure le rail défilant natif avec fondu de bord piloté par le défilement", () => {
    const regles = reglesDuSelecteur(feuille, ".rail-defilant")

    expect(regles).toHaveLength(1)
    expect(valeurDe(regles[0]!, "overflow-x")).toBe("auto")
    expect(valeurDe(regles[0]!, "overscroll-behavior-x")).toBe("contain")
    expect(valeurDe(regles[0]!, "scrollbar-width")).toBe("none")
    expect(valeurDe(regles[0]!, "animation-timeline")).toBe(
      "scroll(self inline)"
    )
  })

  it("pose les fondations tactiles, l'overscroll bureau et la transition inter-documents", () => {
    const racinesBase = reglesDuSelecteur(feuille, ":root").filter(
      estDansLaCoucheBase
    )
    expect(valeursDe(racinesBase, "-webkit-tap-highlight-color")).toContain(
      "transparent"
    )
    expect(valeursDe(racinesBase, "-webkit-text-size-adjust")).toContain("100%")

    const htmlBase = reglesDuSelecteur(feuille, "html").filter(
      estDansLaCoucheBase
    )
    expect(valeursDe(htmlBase, "overscroll-behavior-y")).toContain("none")
    expect(valeursDe(htmlBase, "scroll-padding-block-start")).toContain(
      "calc(2.75rem + env(safe-area-inset-top, 0px))"
    )

    const htmlTactile = htmlBase.filter((regle) =>
      estDansRequete(regle, "(any-pointer: coarse)")
    )
    expect(valeursDe(htmlTactile, "overscroll-behavior-y")).toEqual(["auto"])

    const transitions: string[] = []
    feuille.racine.walkAtRules("view-transition", (regle) => {
      regle.walkDecls("navigation", (declaration) => {
        transitions.push(declaration.value.trim())
      })
    })
    expect(transitions).toEqual(["auto"])
  })
})

describe("l'hygiène CSS des sources de l'accueil et de la fiche Produit", () => {
  it.each(FICHIERS_VITRINE)(
    "%s n'emploie ni utilitaire physique, ni overflow-hidden, ni teinte oklab",
    (fichier) => {
      const contenu = readFileSync(path.resolve(process.cwd(), fichier), "utf8")

      expect(contenu).not.toMatch(MOTIF_INTERDIT)
    }
  )
})
