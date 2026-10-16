import { describe, expect, it } from "vitest"

import {
  creerTeleversementBrouillons,
  MESSAGE_FICHIER_NON_IMAGE,
} from "@/components/admin/televersement-brouillons"
import type { AppelTeleversement } from "@/test/televersement-brouillons-memoire"
import { creerPortTeleversementEnMemoire } from "@/test/televersement-brouillons-memoire"

function image(nom: string, type = "image/png"): File {
  return new File(["image"], nom, { type })
}

function operations(appels: AppelTeleversement[]): string[] {
  return appels.map((appel) => appel.operation)
}

describe("Téléversement des Brouillons d'Image produit", () => {
  it("pré-signe et envoie dans l'ordre, au plus les places données", async () => {
    const port = creerPortTeleversementEnMemoire()

    const resultat = await creerTeleversementBrouillons(port).ajouter(
      [image("a.png"), image("b.png"), image("c.png")],
      2
    )

    expect(resultat).toEqual({
      ajoutees: [
        {
          kind: "brouillon",
          draftId: "brouillon-1",
          previewUrl:
            "https://cdn.example.test/products/brouillons/brouillon-1.png",
        },
        {
          kind: "brouillon",
          draftId: "brouillon-2",
          previewUrl:
            "https://cdn.example.test/products/brouillons/brouillon-2.png",
        },
      ],
    })
    expect(operations(port.appels)).toEqual([
      "presigner",
      "envoyer",
      "presigner",
      "envoyer",
    ])
    expect(port.appels[0]).toMatchObject({
      operation: "presigner",
      contentType: "image/png",
      size: 5,
    })
    expect(port.appels[1]).toMatchObject({
      operation: "envoyer",
      uploadUrl: "https://televersement.example.test/1",
    })
  })

  it("n'appelle pas le port quand aucune place n'est libre", async () => {
    const port = creerPortTeleversementEnMemoire()

    const resultat = await creerTeleversementBrouillons(port).ajouter(
      [image("a.png")],
      0
    )

    expect(resultat).toEqual({ ajoutees: [] })
    expect(port.appels).toEqual([])
  })

  it("refuse un fichier non-image sans le pré-signer, en gardant son message", async () => {
    const port = creerPortTeleversementEnMemoire()

    const resultat = await creerTeleversementBrouillons(port).ajouter(
      [image("notes.txt", "text/plain"), image("b.png")],
      8
    )

    expect(resultat.message).toBe(MESSAGE_FICHIER_NON_IMAGE)
    expect(resultat.ajoutees).toHaveLength(1)
    expect(operations(port.appels)).toEqual(["presigner", "envoyer"])
  })

  it("relaie un refus de pré-signature et poursuit le lot", async () => {
    const port = creerPortTeleversementEnMemoire({
      presigner: ({ contentType }) =>
        contentType === "image/gif"
          ? { ok: false, message: "Type de fichier non pris en charge" }
          : {
              ok: true,
              draftId: "brouillon-accepte",
              uploadUrl: "https://televersement.example.test/ok",
              previewUrl:
                "https://cdn.example.test/products/brouillons/accepte.png",
            },
    })

    const resultat = await creerTeleversementBrouillons(port).ajouter(
      [image("anim.gif", "image/gif"), image("b.png")],
      8
    )

    expect(resultat).toEqual({
      ajoutees: [
        {
          kind: "brouillon",
          draftId: "brouillon-accepte",
          previewUrl:
            "https://cdn.example.test/products/brouillons/accepte.png",
        },
      ],
      message: "Type de fichier non pris en charge",
    })
  })

  it("n'arrête pas le lot après un envoi refusé", async () => {
    const port = creerPortTeleversementEnMemoire({
      envoyer: ({ fichier }) =>
        fichier.name === "a.png"
          ? { ok: false, message: "Échec de l'envoi vers le stockage" }
          : { ok: true },
    })

    const resultat = await creerTeleversementBrouillons(port).ajouter(
      [image("a.png"), image("b.png")],
      8
    )

    expect(resultat.message).toBe("Échec de l'envoi vers le stockage")
    expect(resultat.ajoutees).toHaveLength(1)
  })

  it("garde le dernier refus du lot", async () => {
    const port = creerPortTeleversementEnMemoire({
      presigner: () => ({ ok: false, message: "Brouillon refusé" }),
    })

    const resultat = await creerTeleversementBrouillons(port).ajouter(
      [image("notes.txt", "text/plain"), image("a.png")],
      8
    )

    expect(resultat.message).toBe("Brouillon refusé")
    expect(resultat.ajoutees).toEqual([])
  })

  it("s'arrête au plafond avant même de refuser un fichier non-image", async () => {
    const port = creerPortTeleversementEnMemoire()

    const resultat = await creerTeleversementBrouillons(port).ajouter(
      [image("a.png"), image("notes.txt", "text/plain")],
      1
    )

    expect(resultat.ajoutees).toHaveLength(1)
    expect(resultat.message).toBeUndefined()
  })

  it("rend le verdict de libération tel quel", async () => {
    const port = creerPortTeleversementEnMemoire({
      relacher: () => ({ ok: false, message: "Refus de libération" }),
    })

    await expect(
      creerTeleversementBrouillons(port).relacher("brouillon-1")
    ).resolves.toEqual({ ok: false, message: "Refus de libération" })
    expect(port.appels).toEqual([
      { operation: "relacher", draftId: "brouillon-1" },
    ])
  })
})
