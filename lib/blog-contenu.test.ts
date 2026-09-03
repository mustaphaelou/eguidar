import { describe, expect, it } from "vitest"

import {
  aDesSectionsArticle,
  decoupeContenuArticle,
} from "@/lib/blog-contenu"

describe("decoupeContenuArticle", () => {
  it("rend le plaintext sans sections en un seul paragraphe", () => {
    const blocs = decoupeContenuArticle(
      "Premier paragraphe.\n\nDeuxième paragraphe."
    )
    expect(blocs).toEqual([
      { type: "paragraphe", texte: "Premier paragraphe." },
      { type: "paragraphe", texte: "Deuxième paragraphe." },
    ])
    expect(aDesSectionsArticle("Premier paragraphe.")).toBe(false)
  })

  it("transforme les lignes ## en titres de section", () => {
    const blocs = decoupeContenuArticle(
      "Intro.\n\n## Choisir son écran\n\nUn paragraphe de conseils."
    )
    expect(blocs).toEqual([
      { type: "paragraphe", texte: "Intro." },
      { type: "titre-section", texte: "Choisir son écran" },
      { type: "paragraphe", texte: "Un paragraphe de conseils." },
    ])
    expect(
      aDesSectionsArticle("Intro.\n\n## Choisir son écran")
    ).toBe(true)
  })

  it("ignore les marqueurs ## vides et garde la sécurité plaintext", () => {
    const blocs = decoupeContenuArticle(
      "## \n\n<script>alert(1)</script>"
    )
    expect(blocs).toEqual([
      { type: "paragraphe", texte: "<script>alert(1)</script>" },
    ])
  })
})
