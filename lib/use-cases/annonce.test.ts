import { beforeEach, describe, expect, it, vi } from "vitest"

import { prisma } from "@/lib/db"
import {
  AnnonceValidationError,
  getAnnonce,
  updateAnnonce,
  type AnnonceEffects,
} from "@/lib/use-cases/annonce"

function effetsFactices(): {
  effects: AnnonceEffects
  invalidateAnnonce: ReturnType<typeof vi.fn<() => Promise<void>>>
} {
  const invalidateAnnonce = vi.fn(async () => {})
  return {
    effects: { invalidateAnnonce },
    invalidateAnnonce,
  }
}

describe("use-case Annonce", () => {
  beforeEach(async () => {
    await prisma.annonce.deleteMany()
  })

  it("retourne null tant qu'aucune Annonce n'est enregistrée", async () => {
    expect(await getAnnonce()).toBeNull()
  })

  it("crée puis met à jour le singleton Annonce en nettoyant les espaces et déclenche l'invalidation", async () => {
    const { effects, invalidateAnnonce } = effetsFactices()

    const creee = await updateAnnonce(
      {
        actif: true,
        message: "  Livraison offerte dès 500 MAD  ",
        lienUrl: "  /categorie/smartphones  ",
        lienLibelle: "  Découvrir  ",
      },
      effects
    )

    expect(creee).toMatchObject({
      id: "default",
      actif: true,
      message: "Livraison offerte dès 500 MAD",
      lienUrl: "/categorie/smartphones",
      lienLibelle: "Découvrir",
    })
    expect(invalidateAnnonce).toHaveBeenCalledTimes(1)

    const lue = await getAnnonce()
    expect(lue).toMatchObject({
      id: "default",
      actif: true,
      message: "Livraison offerte dès 500 MAD",
      lienUrl: "/categorie/smartphones",
      lienLibelle: "Découvrir",
    })

    const miseAJour = await updateAnnonce(
      {
        actif: false,
        message: "   ",
        lienUrl: "  ",
        lienLibelle: "",
      },
      effects
    )

    expect(miseAJour).toMatchObject({
      id: "default",
      actif: false,
      message: "",
      lienUrl: null,
      lienLibelle: null,
    })
    expect(invalidateAnnonce).toHaveBeenCalledTimes(2)
    expect(await prisma.annonce.count()).toBe(1)
  })

  it("autorise une Annonce active sans lien lorsque URL et libellé sont vides ou absents", async () => {
    const { effects, invalidateAnnonce } = effetsFactices()

    const annonce = await updateAnnonce(
      {
        actif: true,
        message: "Nouvelle collection disponible",
        lienUrl: null,
        lienLibelle: null,
      },
      effects
    )

    expect(annonce).toMatchObject({
      actif: true,
      message: "Nouvelle collection disponible",
      lienUrl: null,
      lienLibelle: null,
    })
    expect(invalidateAnnonce).toHaveBeenCalledOnce()
  })

  it("refuse d'activer une Annonce avec un message vide ou composé d'espaces", async () => {
    const { effects, invalidateAnnonce } = effetsFactices()

    await expect(
      updateAnnonce(
        {
          actif: true,
          message: "   ",
          lienUrl: null,
          lienLibelle: null,
        },
        effects
      )
    ).rejects.toBeInstanceOf(AnnonceValidationError)

    expect(invalidateAnnonce).not.toHaveBeenCalled()
    expect(await getAnnonce()).toBeNull()
  })

  it("refuse un message de plus de 160 caractères, actif ou inactif", async () => {
    const { effects, invalidateAnnonce } = effetsFactices()
    const tropLong = "a".repeat(161)

    await expect(
      updateAnnonce({ actif: true, message: tropLong }, effects)
    ).rejects.toBeInstanceOf(AnnonceValidationError)

    await expect(
      updateAnnonce({ actif: false, message: tropLong }, effects)
    ).rejects.toBeInstanceOf(AnnonceValidationError)

    const exactement160 = "a".repeat(160)
    const valide = await updateAnnonce(
      { actif: true, message: exactement160 },
      effects
    )
    expect(valide.message).toHaveLength(160)
    expect(invalidateAnnonce).toHaveBeenCalledOnce()
  })

  it("exige le duo URL et libellé de lien (tout ou rien)", async () => {
    const { effects, invalidateAnnonce } = effetsFactices()

    await expect(
      updateAnnonce(
        {
          actif: true,
          message: "Offre du jour",
          lienUrl: "/produits",
          lienLibelle: "",
        },
        effects
      )
    ).rejects.toBeInstanceOf(AnnonceValidationError)

    await expect(
      updateAnnonce(
        {
          actif: true,
          message: "Offre du jour",
          lienUrl: "  ",
          lienLibelle: "Voir les offres",
        },
        effects
      )
    ).rejects.toBeInstanceOf(AnnonceValidationError)

    expect(invalidateAnnonce).not.toHaveBeenCalled()
  })

  it("refuse un libellé de lien de plus de 40 caractères", async () => {
    const { effects, invalidateAnnonce } = effetsFactices()

    await expect(
      updateAnnonce(
        {
          actif: true,
          message: "Offre du jour",
          lienUrl: "/produits",
          lienLibelle: "b".repeat(41),
        },
        effects
      )
    ).rejects.toBeInstanceOf(AnnonceValidationError)

    const valide = await updateAnnonce(
      {
        actif: true,
        message: "Offre du jour",
        lienUrl: "/produits",
        lienLibelle: "b".repeat(40),
      },
      effects
    )
    expect(valide.lienLibelle).toHaveLength(40)
    expect(invalidateAnnonce).toHaveBeenCalledOnce()
  })

  it.each([
    "https://evil.example/promo",
    "http://eguidar.com/produits",
    "//evil.example/promo",
    "/%2f/evil.example",
    "/%5cevil",
    "/promo\\evil",
    "javascript:alert(1)",
    "produits",
    "/promo\nheader",
  ])("refuse une URL de lien non sûre : %s", async (lienUrl) => {
    const { effects, invalidateAnnonce } = effetsFactices()

    await expect(
      updateAnnonce(
        {
          actif: true,
          message: "Offre du jour",
          lienUrl,
          lienLibelle: "Voir",
        },
        effects
      )
    ).rejects.toBeInstanceOf(AnnonceValidationError)

    expect(invalidateAnnonce).not.toHaveBeenCalled()
  })

  it.each([
    "/",
    "/produits",
    "/categorie/smartphones",
    "/produits?tri=prix#haut",
  ])("accepte un chemin interne relatif sûr : %s", async (lienUrl) => {
    const { effects } = effetsFactices()

    const annonce = await updateAnnonce(
      {
        actif: true,
        message: "Offre du jour",
        lienUrl,
        lienLibelle: "Voir",
      },
      effects
    )

    expect(annonce.lienUrl).toBe(lienUrl)
  })
})
