import { describe, expect, it } from "vitest"

import {
  MAX_ARTICLES_PANIER_VISITEUR,
  NOM_COOKIE_PANIER_VISITEUR,
  addToPanierVisiteur,
  mergePaniersVisiteur,
  parsePanierVisiteur,
  serializePanierVisiteur,
  type ArticlePanierVisiteur,
} from "./panier-visiteur"

const ENTREES_MAL_FORMEES = [
  '{"variantId":"v1"}',
  '{"quantity":2}',
  '{"variantId":"","quantity":2}',
  '{"variantId":"v1","quantity":0}',
  '{"variantId":"v1","quantity":-1}',
  '{"variantId":"v1","quantity":1.5}',
  '{"variantId":"v1","quantity":"2"}',
  '{"variantId":7,"quantity":2}',
  "null",
  '"texte"',
  "42",
  "{}",
]

const BRUTS_ILLECIBLES = ["{", "not json", '[{"variantId":"v1"', '""']

function articles(n: number): ArticlePanierVisiteur[] {
  return Array.from({ length: n }, (_, i) => ({
    variantId: `v${i + 1}`,
    quantity: i + 1,
  }))
}

describe("NOM_COOKIE_PANIER_VISITEUR", () => {
  it("names the httpOnly cookie holding the Visiteur's Panier", () => {
    expect(NOM_COOKIE_PANIER_VISITEUR).toBe("panier-visiteur")
  })
})

describe("MAX_ARTICLES_PANIER_VISITEUR", () => {
  it("fixe la cap à vingt articles distincts", () => {
    expect(MAX_ARTICLES_PANIER_VISITEUR).toBe(20)
  })
})

describe("serializePanierVisiteur", () => {
  it("emits the exact cookie JSON shape", () => {
    expect(
      serializePanierVisiteur([
        { variantId: "v1", quantity: 2 },
        { variantId: "v2", quantity: 1 },
      ])
    ).toBe('[{"variantId":"v1","quantity":2},{"variantId":"v2","quantity":1}]')
    expect(serializePanierVisiteur([])).toBe("[]")
  })

  it("round-trips through parse", () => {
    const panier = [
      { variantId: "variante-a", quantity: 3 },
      { variantId: "variante-b", quantity: 1 },
    ]
    expect(parsePanierVisiteur(serializePanierVisiteur(panier))).toEqual(panier)
  })

  it("drops malformed entries instead of persisting them", () => {
    expect(
      serializePanierVisiteur([
        { variantId: "v1", quantity: 2 },
        { variantId: "", quantity: 2 },
        { variantId: "v2", quantity: 0.5 },
        { variantId: "v3", quantity: -4 },
      ])
    ).toBe('[{"variantId":"v1","quantity":2}]')
  })

  it("sums duplicate variants into a single line", () => {
    expect(
      serializePanierVisiteur([
        { variantId: "v1", quantity: 2 },
        { variantId: "v1", quantity: 3 },
        { variantId: "v2", quantity: 1 },
      ])
    ).toBe('[{"variantId":"v1","quantity":5},{"variantId":"v2","quantity":1}]')
  })

  it("caps the cookie at twenty distinct articles, first appearances first", () => {
    const serialise = serializePanierVisiteur(articles(25))
    const panier = parsePanierVisiteur(serialise)
    expect(panier).toHaveLength(MAX_ARTICLES_PANIER_VISITEUR)
    expect(panier[19]).toEqual({ variantId: "v20", quantity: 20 })
  })
})

describe("parsePanierVisiteur", () => {
  it("round-trips serialized output exactly", () => {
    const brut = serializePanierVisiteur(articles(3))
    expect(parsePanierVisiteur(brut)).toEqual(articles(3))
  })

  it("yields an empty Panier for absent or empty input", () => {
    expect(parsePanierVisiteur()).toEqual([])
    expect(parsePanierVisiteur(null)).toEqual([])
    expect(parsePanierVisiteur("")).toEqual([])
  })

  it("fails closed on unreadable JSON", () => {
    for (const brut of BRUTS_ILLECIBLES) {
      expect(parsePanierVisiteur(brut)).toEqual([])
    }
  })

  it("yields an empty Panier for anything but an array", () => {
    for (const brut of ['{"variantId":"v1","quantity":2}', "true"]) {
      expect(parsePanierVisiteur(brut)).toEqual([])
    }
  })

  it("drops malformed entries and keeps the valid ones in order", () => {
    const brut = `["chaine",null,{"variantId":"va","quantity":2},${ENTREES_MAL_FORMEES.join(",")},{"variantId":"vb","quantity":1}]`
    expect(parsePanierVisiteur(brut)).toEqual([
      { variantId: "va", quantity: 2 },
      { variantId: "vb", quantity: 1 },
    ])
  })

  it("sums duplicated variants instead of keeping duplicate lines", () => {
    expect(
      parsePanierVisiteur(
        '[{"variantId":"v1","quantity":2},{"variantId":"v2","quantity":1},{"variantId":"v1","quantity":4}]'
      )
    ).toEqual([
      { variantId: "v1", quantity: 6 },
      { variantId: "v2", quantity: 1 },
    ])
  })

  it("keeps only the first twenty distinct articles of a tampered cookie", () => {
    const brut = JSON.stringify(articles(22))
    expect(parsePanierVisiteur(brut)).toEqual(articles(20))
  })
})

describe("addToPanierVisiteur", () => {
  it("adds an article to an empty Panier", () => {
    expect(addToPanierVisiteur([], "v1", 2)).toEqual({
      ok: true,
      articles: [{ variantId: "v1", quantity: 2 }],
    })
  })

  it("sums into an existing variant without creating a second line", () => {
    expect(
      addToPanierVisiteur([{ variantId: "v1", quantity: 2 }], "v1", 3)
    ).toEqual({ ok: true, articles: [{ variantId: "v1", quantity: 5 }] })
  })

  it("accepts a twentieth distinct article and refuses a twenty-first", () => {
    const plein = addToPanierVisiteur(articles(19), "v20", 1)
    expect(plein).toEqual({
      ok: true,
      articles: [...articles(19), { variantId: "v20", quantity: 1 }],
    })
    const refuse = addToPanierVisiteur(plein.articles, "v21", 1)
    expect(refuse).toEqual({
      ok: false,
      motif: "cap-atteinte",
      articles: plein.articles,
    })
  })

  it("still sums an existing variant when the cap is full", () => {
    const plein = addToPanierVisiteur(articles(20), "v20", 1).articles
    expect(addToPanierVisiteur(plein, "v7", 10)).toEqual({
      ok: true,
      articles: plein.map((article) =>
        article.variantId === "v7"
          ? { ...article, quantity: article.quantity + 10 }
          : article
      ),
    })
  })

  it("refuses quantities outside the bounds addToCart enforces", () => {
    const actuels = [{ variantId: "v1", quantity: 2 }]
    for (const quantity of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(addToPanierVisiteur(actuels, "v2", quantity)).toEqual({
        ok: false,
        motif: "quantite-invalide",
        articles: actuels,
      })
    }
  })

  it("refuses an empty variant id", () => {
    expect(addToPanierVisiteur([], "", 1)).toEqual({
      ok: false,
      motif: "quantite-invalide",
      articles: [],
    })
  })

  it("normalizes its input list before adding", () => {
    expect(
      addToPanierVisiteur(
        [
          { variantId: "v1", quantity: 1 },
          { variantId: "v1", quantity: 1 },
          { variantId: "v2", quantity: 0 },
        ],
        "v3",
        1
      )
    ).toEqual({
      ok: true,
      articles: [
        { variantId: "v1", quantity: 2 },
        { variantId: "v3", quantity: 1 },
      ],
    })
  })

  it("leaves the given list untouched", () => {
    const actuels = [{ variantId: "v1", quantity: 1 }]
    addToPanierVisiteur(actuels, "v1", 5)
    expect(actuels).toEqual([{ variantId: "v1", quantity: 1 }])
  })
})

describe("mergePaniersVisiteur", () => {
  it("unions two Paniers summing quantities per shared variant", () => {
    expect(
      mergePaniersVisiteur(
        [
          { variantId: "v1", quantity: 2 },
          { variantId: "v2", quantity: 1 },
        ],
        [
          { variantId: "v2", quantity: 3 },
          { variantId: "v3", quantity: 1 },
        ]
      )
    ).toEqual([
      { variantId: "v1", quantity: 2 },
      { variantId: "v2", quantity: 4 },
      { variantId: "v3", quantity: 1 },
    ])
  })

  it("never produces duplicate lines, whatever duplicates each side holds", () => {
    expect(
      mergePaniersVisiteur(
        [
          { variantId: "v1", quantity: 1 },
          { variantId: "v1", quantity: 1 },
        ],
        [{ variantId: "v1", quantity: 1 }]
      )
    ).toEqual([{ variantId: "v1", quantity: 3 }])
  })

  it("drops malformed entries from either side", () => {
    expect(
      mergePaniersVisiteur(
        [
          { variantId: "v1", quantity: 2 },
          { variantId: "", quantity: 9 },
        ],
        [
          { variantId: "v2", quantity: 0 },
          { variantId: "v3", quantity: 1 },
        ]
      )
    ).toEqual([
      { variantId: "v1", quantity: 2 },
      { variantId: "v3", quantity: 1 },
    ])
  })

  it("keeps merged sums even past any single-quantity bound", () => {
    expect(
      mergePaniersVisiteur(
        [{ variantId: "v1", quantity: 1000000 }],
        [{ variantId: "v1", quantity: 2000000 }]
      )
    ).toEqual([{ variantId: "v1", quantity: 3000000 }])
  })

  it("caps at twenty distinct articles, keeping first appearances", () => {
    const gauche = articles(12)
    const droite = Array.from({ length: 12 }, (_, i) => ({
      variantId: `w${i + 1}`,
      quantity: i + 1,
    }))
    const fusionne = mergePaniersVisiteur(gauche, droite)
    expect(fusionne).toHaveLength(MAX_ARTICLES_PANIER_VISITEUR)
    expect(fusionne.slice(0, 12)).toEqual(gauche)
    expect(fusionne.slice(12)).toEqual(droite.slice(0, 8))
  })
})
