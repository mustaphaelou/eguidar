import { beforeEach, describe, expect, it, vi } from "vitest"

import { SEARCH_QUERY_MAX_LENGTH } from "@/lib/search-params"

const { searchSuggestionsMock } = vi.hoisted(() => ({
  searchSuggestionsMock: vi.fn(),
}))

vi.mock("@/lib/use-cases/search", () => ({
  searchSuggestions: searchSuggestionsMock,
}))

import { GET } from "./route"

function request(queryString: string): Request {
  return new Request(`http://localhost/api/recherche/suggestions${queryString}`)
}

beforeEach(() => {
  searchSuggestionsMock.mockReset()
  searchSuggestionsMock.mockResolvedValue({
    products: [],
    categories: [],
  })
})

describe("GET /api/recherche/suggestions", () => {
  it("borne le terme absurde avant de joindre le moteur", async () => {
    const terme = "a".repeat(10_000)

    const reponse = await GET(request(`?q=${terme}`))

    expect(reponse.status).toBe(200)
    expect(searchSuggestionsMock).toHaveBeenCalledTimes(1)
    const requete = searchSuggestionsMock.mock.calls[0][0]
    expect(requete).toBe(terme.slice(0, SEARCH_QUERY_MAX_LENGTH))
    expect(requete.length).toBeLessThan(terme.length)
  })

  it("transmet une requête normale rognée, telle quelle", async () => {
    searchSuggestionsMock.mockResolvedValue({
      products: [{ id: "casque-1" }],
      categories: [{ slug: "audio-hifi", name: "Audio & Hi-Fi" }],
    })

    const reponse = await GET(request("?q=%20%20casque%20%20"))

    await expect(reponse.json()).resolves.toEqual({
      products: [{ id: "casque-1" }],
      categories: [{ slug: "audio-hifi", name: "Audio & Hi-Fi" }],
    })
    expect(searchSuggestionsMock).toHaveBeenCalledWith("casque")
  })

  it("ne joint pas le moteur pour un terme trop court", async () => {
    const reponse = await GET(request("?q=a"))

    await expect(reponse.json()).resolves.toEqual({
      products: [],
      categories: [],
    })
    expect(searchSuggestionsMock).not.toHaveBeenCalled()
  })

  it("ne lit que la première occurrence du terme", async () => {
    await GET(request("?q=casque&q=clavier"))

    expect(searchSuggestionsMock).toHaveBeenCalledWith("casque")
  })
})
