import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import { loginUrl } from "@/lib/lien-de-connexion"
import type { Client } from "@/lib/use-cases/session-courante"
import { RedirectSentinel, sessionCouranteMock } from "@/test/navigation-mocks"

vi.mock("next/navigation", async () => {
  const mocks = await import("@/test/navigation-mocks")
  return { redirect: mocks.redirectMock }
})
vi.mock("@/lib/use-cases/session-courante", async (importOriginal) => {
  const mocks = await import("@/test/navigation-mocks")
  return {
    ...(await importOriginal<
      typeof import("@/lib/use-cases/session-courante")
    >()),
    lireSession: mocks.sessionCouranteMock,
  }
})

import { updateAnnonceAction } from "@/app/admin/annonce/actions"
import { prisma } from "@/lib/db"

const PROPRIETAIRE: Client = {
  id: "proprietaire-annonce",
  name: "Propriétaire",
  email: "proprietaire-annonce@example.test",
  role: "admin",
}

const CLIENT: Client = {
  id: "client-annonce",
  name: "Client",
  email: "client-annonce@example.test",
  role: "user",
}

function annonceFormData(champs: {
  actif?: string
  message?: string
  lienUrl?: string
  lienLibelle?: string
}): FormData {
  const data = new FormData()
  if (champs.actif !== undefined) data.set("actif", champs.actif)
  if (champs.message !== undefined) data.set("message", champs.message)
  if (champs.lienUrl !== undefined) data.set("lienUrl", champs.lienUrl)
  if (champs.lienLibelle !== undefined) {
    data.set("lienLibelle", champs.lienLibelle)
  }
  return data
}

beforeEach(async () => {
  sessionCouranteMock.mockReset()
  sessionCouranteMock.mockResolvedValue(PROPRIETAIRE)
  await prisma.annonce.deleteMany()
})

afterAll(async () => {
  await prisma.annonce.deleteMany()
  await prisma.$disconnect()
})

describe("updateAnnonceAction", () => {
  it("refuse un Visiteur non connecté et redirige vers le Lien de connexion", async () => {
    sessionCouranteMock.mockResolvedValue(null)

    const promesse = updateAnnonceAction(
      {},
      annonceFormData({ actif: "true", message: "Livraison offerte" })
    )
    await expect(promesse).rejects.toBeInstanceOf(RedirectSentinel)
    await expect(promesse).rejects.toMatchObject({
      url: loginUrl("/admin/annonce"),
    })

    expect(await prisma.annonce.count()).toBe(0)
  })

  it("refuse un Client non administrateur et redirige vers le Lien de connexion", async () => {
    sessionCouranteMock.mockResolvedValue(CLIENT)

    const promesse = updateAnnonceAction(
      {},
      annonceFormData({ actif: "true", message: "Livraison offerte" })
    )
    await expect(promesse).rejects.toBeInstanceOf(RedirectSentinel)
    await expect(promesse).rejects.toMatchObject({
      url: loginUrl("/admin/annonce"),
    })

    expect(await prisma.annonce.count()).toBe(0)
  })

  it("enregistre une Annonce valide pour l'administrateur", async () => {
    const resultat = await updateAnnonceAction(
      {},
      annonceFormData({
        actif: "true",
        message: "  Livraison offerte dès 500 MAD  ",
        lienUrl: "/produits",
        lienLibelle: "Découvrir",
      })
    )

    expect(resultat).toEqual({ saved: true })
    expect(
      await prisma.annonce.findUnique({ where: { id: "default" } })
    ).toMatchObject({
      actif: true,
      message: "Livraison offerte dès 500 MAD",
      lienUrl: "/produits",
      lienLibelle: "Découvrir",
    })
  })

  it("retourne une erreur de validation en français sur refus sans écrire en base", async () => {
    const resultat = await updateAnnonceAction(
      {},
      annonceFormData({
        actif: "true",
        message: "   ",
        lienUrl: "https://evil.example",
        lienLibelle: "Voir",
      })
    )

    expect(resultat).toMatchObject({
      error: expect.stringContaining("Données invalides"),
    })
    expect(await prisma.annonce.count()).toBe(0)
  })

  it("permet de désactiver l'Annonce avec un message vide", async () => {
    const resultat = await updateAnnonceAction(
      {},
      annonceFormData({
        actif: "false",
        message: "",
        lienUrl: "",
        lienLibelle: "",
      })
    )

    expect(resultat).toEqual({ saved: true })
    expect(
      await prisma.annonce.findUnique({ where: { id: "default" } })
    ).toMatchObject({
      actif: false,
      message: "",
      lienUrl: null,
      lienLibelle: null,
    })
  })
})
