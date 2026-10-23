import { describe, expect, it } from "vitest"

import {
  estLeSlugDeRepli,
  parametresDeSlug,
  SLUG_DE_REPLI,
} from "./parametre-de-repli"
import { slugify } from "./slug"

describe("le paramètre de repli des routes dynamiques", () => {
  it("prérend au moins un slug quand le catalogue est vide", () => {
    expect(parametresDeSlug([])).toEqual([{ slug: "__placeholder__" }])
  })

  it("garde les slugs réels, dans l'ordre, quand le catalogue en porte", () => {
    expect(parametresDeSlug(["iphone-15-pro", "galaxy-s24"])).toEqual([
      { slug: "iphone-15-pro" },
      { slug: "galaxy-s24" },
    ])
  })

  it("ne peut pas entrer en collision avec un slug que le catalogue produit", () => {
    const slugReel = slugify(SLUG_DE_REPLI)

    expect(slugReel).not.toBe(SLUG_DE_REPLI)
    expect(parametresDeSlug([slugReel])).toEqual([{ slug: slugReel }])
  })

  it("reconnaît le repli, et seulement lui", () => {
    expect(estLeSlugDeRepli(SLUG_DE_REPLI)).toBe(true)
    expect(estLeSlugDeRepli("iphone-15-pro")).toBe(false)
    expect(estLeSlugDeRepli("")).toBe(false)
  })
})
