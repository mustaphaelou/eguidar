import { describe, expect, it } from "vitest"

import { decoupeContenuArticle } from "@/lib/blog-contenu"

describe("decoupeContenuArticle", () => {
  it("rend chaque bloc de texte séparé par une ligne vide en paragraphe", () => {
    const fragments = decoupeContenuArticle(
      "Premier paragraphe.\n\nDeuxième paragraphe."
    )
    expect(fragments).toEqual([
      { type: "paragraphe", texte: "Premier paragraphe." },
      { type: "paragraphe", texte: "Deuxième paragraphe." },
    ])
  })

  it("rend une ligne ## en Intertitre", () => {
    const fragments = decoupeContenuArticle(
      "Intro.\n\n## Choisir son écran\n\nUn paragraphe de conseils."
    )
    expect(fragments).toEqual([
      { type: "paragraphe", texte: "Intro." },
      { type: "intertitre", texte: "Choisir son écran" },
      { type: "paragraphe", texte: "Un paragraphe de conseils." },
    ])
  })

  it("rend une figure avec son texte alternatif, son URL et sa légende", () => {
    const fragments = decoupeContenuArticle(
      '![Un casque posé sur un bureau](/images/casque.webp "Le casque du guide")'
    )
    expect(fragments).toEqual([
      {
        type: "figure",
        alt: "Un casque posé sur un bureau",
        url: "/images/casque.webp",
        legende: "Le casque du guide",
      },
    ])
  })

  it("rend une figure sans titre avec une légende nulle", () => {
    const fragments = decoupeContenuArticle(
      "![Un casque posé sur un bureau](/images/casque.webp)"
    )
    expect(fragments).toEqual([
      {
        type: "figure",
        alt: "Un casque posé sur un bureau",
        url: "/images/casque.webp",
        legende: null,
      },
    ])
  })

  it("réunit les lignes - consécutives en une seule liste", () => {
    const fragments = decoupeContenuArticle("- Autonomie\n- Poids\n- Prix")
    expect(fragments).toEqual([
      { type: "liste", items: ["Autonomie", "Poids", "Prix"] },
    ])
  })

  it("rend une ligne > en citation", () => {
    const fragments = decoupeContenuArticle("> Un casque qui se fait oublier.")
    expect(fragments).toEqual([
      { type: "citation", texte: "Un casque qui se fait oublier." },
    ])
  })

  it("conserve l'ordre des cinq formes dans un document mixte", () => {
    const contenu = [
      "Un paragraphe d'ouverture.",
      "",
      "## Choisir son casque",
      "",
      '![Un casque posé sur un bureau](/images/casque.webp "Le casque du guide")',
      "",
      "- Autonomie",
      "- Poids",
      "",
      "> Un casque qui se fait oublier.",
      "",
      "Un paragraphe de clôture.",
    ].join("\n")

    expect(decoupeContenuArticle(contenu)).toEqual([
      { type: "paragraphe", texte: "Un paragraphe d'ouverture." },
      { type: "intertitre", texte: "Choisir son casque" },
      {
        type: "figure",
        alt: "Un casque posé sur un bureau",
        url: "/images/casque.webp",
        legende: "Le casque du guide",
      },
      { type: "liste", items: ["Autonomie", "Poids"] },
      { type: "citation", texte: "Un casque qui se fait oublier." },
      { type: "paragraphe", texte: "Un paragraphe de clôture." },
    ])
  })

  it("rend le corpus historique — paragraphes et ## — comme avant", () => {
    const contenu = [
      "Intro.",
      "",
      "## Choisir son écran",
      "",
      "Un paragraphe de conseils.",
      "",
      "## ",
      "",
      "Conclusion.",
    ].join("\n")

    expect(decoupeContenuArticle(contenu)).toEqual([
      { type: "paragraphe", texte: "Intro." },
      { type: "intertitre", texte: "Choisir son écran" },
      { type: "paragraphe", texte: "Un paragraphe de conseils." },
      { type: "paragraphe", texte: "Conclusion." },
    ])
  })

  it("rend un contenu vide comme zéro Fragment", () => {
    expect(decoupeContenuArticle("")).toEqual([])
    expect(decoupeContenuArticle(" \n\n\t\n")).toEqual([])
  })

  it("rend un marqueur non fermé comme du texte", () => {
    expect(decoupeContenuArticle("![Un casque](/images/casque.webp")).toEqual([
      { type: "paragraphe", texte: "![Un casque](/images/casque.webp" },
    ])
    expect(
      decoupeContenuArticle('![Un casque](/images/casque.webp "Le casque)')
    ).toEqual([
      {
        type: "paragraphe",
        texte: '![Un casque](/images/casque.webp "Le casque)',
      },
    ])
  })

  it("laisse un renvoi ^9 sans note dans le texte", () => {
    const fragments = decoupeContenuArticle(
      "Le prix peut varier^9 selon la ville.\n\nUne autre ligne^2."
    )
    expect(fragments).toEqual([
      {
        type: "paragraphe",
        texte: "Le prix peut varier^9 selon la ville.",
      },
      { type: "paragraphe", texte: "Une autre ligne^2." },
    ])
  })

  it("garde le HTML hostile du Contenu comme du texte", () => {
    expect(decoupeContenuArticle("<script>alert(1)</script>")).toEqual([
      { type: "paragraphe", texte: "<script>alert(1)</script>" },
    ])
    expect(decoupeContenuArticle("## \n\n<script>alert(1)</script>")).toEqual([
      { type: "paragraphe", texte: "<script>alert(1)</script>" },
    ])
  })
})
