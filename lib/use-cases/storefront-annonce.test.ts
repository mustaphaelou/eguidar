import { cacheLife, cacheTag } from "next/cache"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { prisma } from "@/lib/db"
import { ANNONCE_TAG } from "@/lib/use-cases/cache-invalidation"
import {
  fetchAnnonceActive,
  getAnnonceActive,
} from "@/lib/use-cases/storefront"

describe("fetchAnnonceActive", () => {
  beforeEach(async () => {
    await prisma.annonce.deleteMany()
    vi.clearAllMocks()
  })

  it("retourne null quand aucune Annonce n'existe", async () => {
    expect(await fetchAnnonceActive()).toBeNull()
  })

  it("retourne null quand l'Annonce est inactive", async () => {
    await prisma.annonce.create({
      data: {
        id: "default",
        actif: false,
        message: "Livraison offerte dès 500 DH",
        lienUrl: "/produits",
        lienLibelle: "Voir le catalogue",
      },
    })

    expect(await fetchAnnonceActive()).toBeNull()
  })

  it("retourne null quand l'Annonce est active mais que le message est vide", async () => {
    await prisma.annonce.create({
      data: {
        id: "default",
        actif: true,
        message: "   ",
      },
    })

    expect(await fetchAnnonceActive()).toBeNull()
  })

  it("retourne le message seul quand l'Annonce active n'a pas de lien", async () => {
    await prisma.annonce.create({
      data: {
        id: "default",
        actif: true,
        message: "  Livraison offerte dès 500 DH  ",
      },
    })

    expect(await fetchAnnonceActive()).toEqual({
      message: "Livraison offerte dès 500 DH",
      lienUrl: null,
      lienLibelle: null,
    })
  })

  it("retourne le message et le lien quand l'URL et le libellé sont tous deux présents", async () => {
    await prisma.annonce.create({
      data: {
        id: "default",
        actif: true,
        message: "Nouvelle collection disponible",
        lienUrl: " /produits ",
        lienLibelle: " Découvrir ",
      },
    })

    expect(await fetchAnnonceActive()).toEqual({
      message: "Nouvelle collection disponible",
      lienUrl: "/produits",
      lienLibelle: "Découvrir",
    })
  })

  it("écarte un lien incomplet quand l'URL ou le libellé manque", async () => {
    await prisma.annonce.create({
      data: {
        id: "default",
        actif: true,
        message: "Offre de la semaine",
        lienUrl: "/produits",
        lienLibelle: "   ",
      },
    })

    expect(await fetchAnnonceActive()).toEqual({
      message: "Offre de la semaine",
      lienUrl: null,
      lienLibelle: null,
    })
  })
})

describe("getAnnonceActive", () => {
  beforeEach(async () => {
    await prisma.annonce.deleteMany()
    vi.clearAllMocks()
  })

  it("étiquette la lecture avec ANNONCE_TAG et la durée de cache de navigation", async () => {
    await prisma.annonce.create({
      data: {
        id: "default",
        actif: true,
        message: "Livraison rapide partout au Maroc",
        lienUrl: "/conditions",
        lienLibelle: "En savoir plus",
      },
    })

    const annonce = await getAnnonceActive()

    expect(annonce).toEqual({
      message: "Livraison rapide partout au Maroc",
      lienUrl: "/conditions",
      lienLibelle: "En savoir plus",
    })
    expect(cacheTag).toHaveBeenCalledWith(ANNONCE_TAG)
    expect(cacheLife).toHaveBeenCalledWith({
      revalidate: 31_536_000,
      expire: 31_536_000,
    })
  })
})
