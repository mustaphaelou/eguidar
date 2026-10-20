import { beforeEach, describe, expect, it, vi } from "vitest"

import { MESSAGE_LIMITEUR_INDISPONIBLE } from "@/lib/acces-recherche"
import { MESSAGE_TROP_DE_RECHERCHES } from "@/lib/limiteur-recherche"
import { SEARCH_QUERY_MAX_LENGTH } from "@/lib/search-params"

const { searchSuggestionsMock, consommerMock } = vi.hoisted(() => ({
  searchSuggestionsMock: vi.fn(),
  consommerMock: vi.fn(),
}))

vi.mock("@/lib/use-cases/search", () => ({
  searchSuggestions: searchSuggestionsMock,
}))

vi.mock("@/lib/limiteur-recherche-redis", () => ({
  creerLimiteurRechercheRedis: () => ({ consommer: consommerMock }),
}))

import { GET } from "./route"

function request(
  queryString: string,
  entetes: Record<string, string> = {}
): Request {
  return new Request(
    `http://localhost/api/recherche/suggestions${queryString}`,
    { headers: entetes }
  )
}

beforeEach(() => {
  searchSuggestionsMock.mockReset()
  searchSuggestionsMock.mockResolvedValue({
    products: [],
    categories: [],
  })
  consommerMock.mockReset()
  consommerMock.mockResolvedValue("autorise")
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
    expect(consommerMock).not.toHaveBeenCalled()
  })

  it("ne lit que la première occurrence du terme", async () => {
    await GET(request("?q=casque&q=clavier"))

    expect(searchSuggestionsMock).toHaveBeenCalledWith("casque")
  })

  it("répond 429 sans joindre le moteur quand le budget est dépassé", async () => {
    consommerMock.mockResolvedValue("refuse")

    const reponse = await GET(request("?q=casque"))

    expect(reponse.status).toBe(429)
    await expect(reponse.json()).resolves.toEqual({
      error: MESSAGE_TROP_DE_RECHERCHES,
    })
    expect(searchSuggestionsMock).not.toHaveBeenCalled()
  })

  it("limite par l'adresse du client lue dans les en-têtes", async () => {
    await GET(
      request("?q=casque", {
        "x-forwarded-for": "203.0.113.7, 10.0.0.1",
      })
    )

    expect(consommerMock).toHaveBeenCalledWith("10.0.0.1")
  })

  it("laisse la Recherche ouverte et journalise quand le limiteur est en panne", async () => {
    const avertissement = vi.spyOn(console, "warn").mockImplementation(() => {})
    const panne = new Error("Redis injoignable")
    consommerMock.mockRejectedValue(panne)

    const reponse = await GET(request("?q=casque"))

    expect(reponse.status).toBe(200)
    expect(searchSuggestionsMock).toHaveBeenCalledWith("casque")
    expect(avertissement).toHaveBeenCalledWith(
      MESSAGE_LIMITEUR_INDISPONIBLE,
      panne
    )
    avertissement.mockRestore()
  })
})
