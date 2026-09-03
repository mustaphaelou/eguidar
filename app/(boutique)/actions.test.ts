import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  refreshMock,
  ajouterAuPanierCourantMock,
  modifierQuantiteCourantMock,
  retirerDuPanierCourantMock,
} = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  ajouterAuPanierCourantMock: vi.fn(),
  modifierQuantiteCourantMock: vi.fn(),
  retirerDuPanierCourantMock: vi.fn(),
}))

vi.mock("next/cache", () => ({ refresh: refreshMock }))

vi.mock("@/lib/panier", () => ({
  ajouterArticleAuPanierCourant: ajouterAuPanierCourantMock,
  modifierQuantiteArticlePanierCourant: modifierQuantiteCourantMock,
  retirerArticleDuPanierCourant: retirerDuPanierCourantMock,
}))

import {
  ajouterArticleAuPanierAction,
  modifierQuantiteArticlePanierAction,
  retirerArticleDuPanierAction,
} from "./actions"

beforeEach(() => {
  refreshMock.mockReset()
  ajouterAuPanierCourantMock.mockReset()
  modifierQuantiteCourantMock.mockReset()
  retirerDuPanierCourantMock.mockReset()
})

describe("ajouterArticleAuPanierAction — couture cadre", () => {
  it("delegates to the deepened write and refreshes on success", async () => {
    ajouterAuPanierCourantMock.mockResolvedValue({ ok: true })

    const resultat = await ajouterArticleAuPanierAction("variante-a", 2)

    expect(resultat).toEqual({ ok: true })
    expect(ajouterAuPanierCourantMock).toHaveBeenCalledTimes(1)
    expect(ajouterAuPanierCourantMock).toHaveBeenCalledWith("variante-a", 2)
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it("returns the refusal motif without refreshing on refusal", async () => {
    ajouterAuPanierCourantMock.mockResolvedValue({
      ok: false,
      motif: "quantite-invalide",
    })

    const resultat = await ajouterArticleAuPanierAction("variante-a", 0)

    expect(resultat).toEqual({ ok: false, motif: "quantite-invalide" })
    expect(ajouterAuPanierCourantMock).toHaveBeenCalledWith("variante-a", 0)
    expect(refreshMock).not.toHaveBeenCalled()
  })
})

describe("modifierQuantiteArticlePanierAction — couture cadre", () => {
  it("delegates to the deepened write and refreshes on success", async () => {
    modifierQuantiteCourantMock.mockResolvedValue({ ok: true })

    const resultat = await modifierQuantiteArticlePanierAction("article-a", 4)

    expect(resultat).toEqual({ ok: true })
    expect(modifierQuantiteCourantMock).toHaveBeenCalledTimes(1)
    expect(modifierQuantiteCourantMock).toHaveBeenCalledWith("article-a", 4)
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it("returns the refusal motif without refreshing on refusal", async () => {
    modifierQuantiteCourantMock.mockResolvedValue({
      ok: false,
      motif: "article-inconnu",
    })

    const resultat = await modifierQuantiteArticlePanierAction(
      "article-inconnu",
      3
    )

    expect(resultat).toEqual({ ok: false, motif: "article-inconnu" })
    expect(modifierQuantiteCourantMock).toHaveBeenCalledWith(
      "article-inconnu",
      3
    )
    expect(refreshMock).not.toHaveBeenCalled()
  })
})

describe("retirerArticleDuPanierAction — couture cadre", () => {
  it("delegates to the deepened write and refreshes on success", async () => {
    retirerDuPanierCourantMock.mockResolvedValue({ ok: true })

    const resultat = await retirerArticleDuPanierAction("article-a")

    expect(resultat).toEqual({ ok: true })
    expect(retirerDuPanierCourantMock).toHaveBeenCalledTimes(1)
    expect(retirerDuPanierCourantMock).toHaveBeenCalledWith("article-a")
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it("returns the refusal motif without refreshing on refusal", async () => {
    retirerDuPanierCourantMock.mockResolvedValue({
      ok: false,
      motif: "article-inconnu",
    })

    const resultat = await retirerArticleDuPanierAction("article-inconnu")

    expect(resultat).toEqual({ ok: false, motif: "article-inconnu" })
    expect(retirerDuPanierCourantMock).toHaveBeenCalledWith("article-inconnu")
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
