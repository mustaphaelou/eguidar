import { afterEach, describe, expect, it, vi } from "vitest"

import portHttpTeleversementBrouillons from "@/components/admin/televersement-brouillons-http"

function reponseJson(corps: unknown, status = 200): Response {
  return new Response(JSON.stringify(corps), { status })
}

const FICHIER = new File(["image"], "photo.png", { type: "image/png" })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("Téléversement des Brouillons d'Image produit — adaptateur HTTP", () => {
  it("pré-signe le fichier auprès de la route Admin et rend les faits du Brouillon", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      reponseJson({
        draftId: "draft-1",
        uploadUrl: "https://upload.example.test/signed",
        previewUrl: "https://cdn.example.test/products/brouillons/draft-1.png",
        expiresAt: "2026-10-15T12:00:00.000Z",
      })
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      portHttpTeleversementBrouillons.presigner({
        contentType: "image/png",
        size: 2048,
      })
    ).resolves.toEqual({
      ok: true,
      draftId: "draft-1",
      uploadUrl: "https://upload.example.test/signed",
      previewUrl: "https://cdn.example.test/products/brouillons/draft-1.png",
    })
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/uploads/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentType: "image/png", size: 2048 }),
    })
  })

  it("relaie le message d'erreur du serveur pour une pré-signature refusée", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          reponseJson({ error: "Fichier trop volumineux (10 Mo maximum)" }, 413)
        )
    )

    await expect(
      portHttpTeleversementBrouillons.presigner({
        contentType: "image/png",
        size: 20_000_000,
      })
    ).resolves.toEqual({
      ok: false,
      message: "Fichier trop volumineux (10 Mo maximum)",
    })
  })

  it("refuse une pré-signature sans corps d'erreur exploitable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 502 }))
    )

    await expect(
      portHttpTeleversementBrouillons.presigner({
        contentType: "image/png",
        size: 2048,
      })
    ).resolves.toEqual({ ok: false, message: "Échec de la pré-signature" })
  })

  it("refuse une réponse de pré-signature incomplète", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          reponseJson({ draftId: "draft-1", uploadUrl: "https://x.test" })
        )
    )

    await expect(
      portHttpTeleversementBrouillons.presigner({
        contentType: "image/png",
        size: 2048,
      })
    ).resolves.toEqual({
      ok: false,
      message: "Réponse de téléversement invalide",
    })
  })

  it("refuse une pré-signature injoignable sans lever", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))

    await expect(
      portHttpTeleversementBrouillons.presigner({
        contentType: "image/png",
        size: 2048,
      })
    ).resolves.toEqual({ ok: false, message: "Échec de la pré-signature" })
  })

  it("envoie le fichier à l'URL signée en PUT", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      portHttpTeleversementBrouillons.envoyer({
        uploadUrl: "https://upload.example.test/signed",
        fichier: FICHIER,
      })
    ).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith(
      "https://upload.example.test/signed",
      { method: "PUT", body: FICHIER }
    )
  })

  it("refuse un envoi au stockage qui échoue ou qui est injoignable", async () => {
    const envoi = {
      uploadUrl: "https://upload.example.test/signed",
      fichier: FICHIER,
    }

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 500 }))
    )
    await expect(
      portHttpTeleversementBrouillons.envoyer(envoi)
    ).resolves.toEqual({
      ok: false,
      message: "Échec de l'envoi vers le stockage",
    })

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))
    await expect(
      portHttpTeleversementBrouillons.envoyer(envoi)
    ).resolves.toEqual({
      ok: false,
      message: "Échec de l'envoi vers le stockage",
    })
  })

  it("libère le Brouillon auprès de la route Admin et rend le verdict", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(reponseJson({ released: true, draftId: "draft-1" }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      portHttpTeleversementBrouillons.relacher("draft-1")
    ).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/uploads/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draftId: "draft-1" }),
    })
  })

  it("relaie le message du serveur quand la libération est refusée", async () => {
    const message =
      "Le Brouillon d'Image produit a été libéré, mais son objet n'a pas pu être supprimé du stockage pour le moment."
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(reponseJson({ error: message }, 502))
    )

    await expect(
      portHttpTeleversementBrouillons.relacher("draft-1")
    ).resolves.toEqual({ ok: false, message })
  })

  it("refuse une libération injoignable ou sans corps d'erreur", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))
    await expect(
      portHttpTeleversementBrouillons.relacher("draft-1")
    ).resolves.toEqual({
      ok: false,
      message: "Échec de la libération du Brouillon d'Image produit",
    })

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 500 }))
    )
    await expect(
      portHttpTeleversementBrouillons.relacher("draft-1")
    ).resolves.toEqual({
      ok: false,
      message: "Échec de la libération du Brouillon d'Image produit",
    })
  })
})
