import { renderToReadableStream } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { BandeCategories } from "./bande-categories"

async function rendre(): Promise<string> {
  const flux = await renderToReadableStream(
    <BandeCategories
      categories={[
        {
          id: "cat-1",
          name: "Smartphones",
          slug: "smartphones",
          image: null,
          productCount: 4,
          children: [],
        },
        {
          id: "cat-2",
          name: "Ordinateurs & Tablettes",
          slug: "ordinateurs-tablettes",
          image: null,
          productCount: 1,
          children: [],
        },
      ]}
    />
  )
  await flux.allReady
  return new Response(flux).text()
}

describe("BandeCategories", () => {
  it("dispose les catégories dans une grille intrinsèque avec sous-grille partagée", async () => {
    const html = await rendre()

    expect(html).toContain("auto-fit")
    expect(html).toContain("grid-rows-subgrid")
    expect(html).toContain("tabular-nums")
    expect(html).toContain("4 produits")
    expect(html).toContain("1 produit")
  })
})
