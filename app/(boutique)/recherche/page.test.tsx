import { renderToReadableStream } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { MESSAGE_LIMITEUR_INDISPONIBLE } from "@/lib/acces-recherche"
import { MESSAGE_TROP_DE_RECHERCHES } from "@/lib/limiteur-recherche"

const { consommerMock, searchProductsMock } = vi.hoisted(() => ({
  consommerMock: vi.fn(),
  searchProductsMock: vi.fn(),
}))

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }),
}))

vi.mock("@/lib/limiteur-recherche-redis", () => ({
  creerLimiteurRechercheRedis: () => ({ consommer: consommerMock }),
}))

vi.mock("@/lib/use-cases/search", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/use-cases/search")>()
  return { ...actual, searchProducts: searchProductsMock }
})

vi.mock("@/components/storefront/search-results", () => ({
  SearchResults: ({ query }: { query: string }) => (
    <div data-testid="resultats">{query}</div>
  ),
  SearchSkeleton: () => <div data-testid="squelette" />,
}))

import SearchPage from "./page"

async function rendre(q: string): Promise<string> {
  const flux = await renderToReadableStream(
    <SearchPage searchParams={Promise.resolve({ q })} />
  )
  return new Response(flux).text()
}

beforeEach(() => {
  consommerMock.mockReset()
  consommerMock.mockResolvedValue("autorise")
  searchProductsMock.mockReset()
  searchProductsMock.mockResolvedValue({
    query: "casque",
    totalHits: 0,
    products: [],
    facets: { marque: [], categorie: [], prix: [] },
    filtresActifs: [],
    sort: "pertinence",
    currentPage: 1,
    totalPages: 1,
    pageSize: 24,
  })
})

describe("Page Recherche — limiteur", () => {
  it("rend l'avis de refus et n'interroge pas le moteur quand le budget est dépassé", async () => {
    consommerMock.mockResolvedValue("refuse")

    const html = await rendre("casque")

    expect(html).toContain(MESSAGE_TROP_DE_RECHERCHES)
    expect(searchProductsMock).not.toHaveBeenCalled()
  })

  it("interroge le moteur quand le limiteur autorise", async () => {
    const html = await rendre("casque")

    expect(html).toContain("resultats")
    expect(searchProductsMock).toHaveBeenCalledWith(
      "casque",
      {},
      {
        sort: "pertinence",
        page: 1,
      }
    )
  })

  it("laisse la Recherche ouverte et journalise quand le limiteur est en panne", async () => {
    const avertissement = vi.spyOn(console, "warn").mockImplementation(() => {})
    const panne = new Error("Redis injoignable")
    consommerMock.mockRejectedValue(panne)

    const html = await rendre("casque")

    expect(html).toContain("resultats")
    expect(searchProductsMock).toHaveBeenCalled()
    expect(avertissement).toHaveBeenCalledWith(
      MESSAGE_LIMITEUR_INDISPONIBLE,
      panne
    )
    avertissement.mockRestore()
  })

  it("ne consomme pas de budget pour une Recherche vide", async () => {
    const html = await rendre("   ")

    expect(html).toContain("Recherchez un produit")
    expect(consommerMock).not.toHaveBeenCalled()
  })
})
