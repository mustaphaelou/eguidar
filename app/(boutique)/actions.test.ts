import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  refreshMock,
  ajouterAuPanierMock,
  modifierQuantiteMock,
  retirerDuPanierMock,
} = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  ajouterAuPanierMock: vi.fn(),
  modifierQuantiteMock: vi.fn(),
  retirerDuPanierMock: vi.fn(),
}))

vi.mock("next/cache", () => ({ refresh: refreshMock }))

vi.mock("@/lib/panier", () => ({
  ajouterArticleAuPanier: ajouterAuPanierMock,
  modifierQuantiteArticlePanier: modifierQuantiteMock,
  retirerArticleDuPanier: retirerDuPanierMock,
}))

import {
  ajouterArticleAuPanierAction,
  modifierQuantiteArticlePanierAction,
  retirerArticleDuPanierAction,
} from "./actions"

beforeEach(() => {
  refreshMock.mockReset()
  ajouterAuPanierMock.mockReset()
  modifierQuantiteMock.mockReset()
  retirerDuPanierMock.mockReset()
})

describe("ajouterArticleAuPanierAction — couture cadre", () => {
  it("delegates to the deepened write and refreshes on success", async () => {
    ajouterAuPanierMock.mockResolvedValue({ ok: true })

    const resultat = await ajouterArticleAuPanierAction("variante-a", 2)

    expect(resultat).toEqual({ ok: true })
    expect(ajouterAuPanierMock).toHaveBeenCalledTimes(1)
    expect(ajouterAuPanierMock).toHaveBeenCalledWith("variante-a", 2)
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it("returns the refusal motif without refreshing on refusal", async () => {
    ajouterAuPanierMock.mockResolvedValue({
      ok: false,
      motif: "quantite-invalide",
    })

    const resultat = await ajouterArticleAuPanierAction("variante-a", 0)

    expect(resultat).toEqual({ ok: false, motif: "quantite-invalide" })
    expect(ajouterAuPanierMock).toHaveBeenCalledWith("variante-a", 0)
    expect(refreshMock).not.toHaveBeenCalled()
  })
})

describe("modifierQuantiteArticlePanierAction — couture cadre", () => {
  it("delegates to the deepened write and refreshes on success", async () => {
    modifierQuantiteMock.mockResolvedValue({ ok: true })

    const resultat = await modifierQuantiteArticlePanierAction("article-a", 4)

    expect(resultat).toEqual({ ok: true })
    expect(modifierQuantiteMock).toHaveBeenCalledTimes(1)
    expect(modifierQuantiteMock).toHaveBeenCalledWith("article-a", 4)
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it("returns the refusal motif without refreshing on refusal", async () => {
    modifierQuantiteMock.mockResolvedValue({
      ok: false,
      motif: "article-inconnu",
    })

    const resultat = await modifierQuantiteArticlePanierAction(
      "article-inconnu",
      3
    )

    expect(resultat).toEqual({ ok: false, motif: "article-inconnu" })
    expect(modifierQuantiteMock).toHaveBeenCalledWith(
      "article-inconnu",
      3
    )
    expect(refreshMock).not.toHaveBeenCalled()
  })
})

describe("retirerArticleDuPanierAction — couture cadre", () => {
  it("delegates to the deepened write and refreshes on success", async () => {
    retirerDuPanierMock.mockResolvedValue({ ok: true })

    const resultat = await retirerArticleDuPanierAction("article-a")

    expect(resultat).toEqual({ ok: true })
    expect(retirerDuPanierMock).toHaveBeenCalledTimes(1)
    expect(retirerDuPanierMock).toHaveBeenCalledWith("article-a")
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it("returns the refusal motif without refreshing on refusal", async () => {
    retirerDuPanierMock.mockResolvedValue({
      ok: false,
      motif: "article-inconnu",
    })

    const resultat = await retirerArticleDuPanierAction("article-inconnu")

    expect(resultat).toEqual({ ok: false, motif: "article-inconnu" })
    expect(retirerDuPanierMock).toHaveBeenCalledWith("article-inconnu")
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
