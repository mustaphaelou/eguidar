import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Client } from "@/lib/use-cases/session-courante"
import type { TeleversementImport } from "@/lib/use-cases/import-produits"
import { redirectMock, sessionCouranteMock } from "@/test/navigation-mocks"

const televersements = vi.hoisted(() => ({
  appels: [] as TeleversementImport[],
  resultat: { lotId: "lot-1", statut: "brouillon" as const },
}))

vi.mock("next/navigation", async () => {
  const mocks = await import("@/test/navigation-mocks")
  return { redirect: mocks.redirectMock }
})

vi.mock("@/lib/use-cases/session-courante", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/use-cases/session-courante")
  >()),
  lireSession: sessionCouranteMock,
}))

vi.mock("@/lib/use-cases/import-produits", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/use-cases/import-produits")>()),
  televerserLeFichier: async (entree: TeleversementImport) => {
    televersements.appels.push(entree)
    return televersements.resultat
  },
}))

import { televerserLeFichierAction } from "@/app/admin/produits/importer/actions"

const ADMIN: Client = {
  id: "admin-import-1",
  name: "Éditeur",
  email: "editeur@example.test",
  role: "admin",
}

const CLIENT_ORDINAIRE: Client = {
  ...ADMIN,
  id: "client-import-1",
  role: "user",
}

function formulaire(fichier?: File): FormData {
  const formData = new FormData()
  if (fichier) formData.set("fichier", fichier)
  return formData
}

function fichierCsv(contenu: string, nom = "catalogue.csv"): File {
  return new File([contenu], nom, { type: "text/csv" })
}

beforeEach(() => {
  sessionCouranteMock.mockReset()
  sessionCouranteMock.mockResolvedValue(ADMIN)
  redirectMock.mockClear()
  televersements.appels.length = 0
})

describe("televerserLeFichierAction", () => {
  it("confie les octets du fichier au cas d'usage et ouvre le Lot", async () => {
    await expect(
      televerserLeFichierAction({}, formulaire(fichierCsv("slug,name\r\n")))
    ).rejects.toMatchObject({
      name: "NEXT_REDIRECT",
      url: "/admin/produits/importer?lot=lot-1",
    })

    expect(televersements.appels).toHaveLength(1)
    expect(televersements.appels[0]?.nomFichier).toBe("catalogue.csv")
    expect(televersements.appels[0]?.auteurId).toBe(ADMIN.id)
    expect(new TextDecoder().decode(televersements.appels[0]?.octets)).toBe(
      "slug,name\r\n"
    )
  })

  it("transmet aussi un fichier vide : c'est un fichier reçu, le Lot le jugera", async () => {
    await expect(
      televerserLeFichierAction({}, formulaire(fichierCsv("")))
    ).rejects.toMatchObject({ name: "NEXT_REDIRECT" })

    expect(televersements.appels).toHaveLength(1)
    expect(televersements.appels[0]?.octets.byteLength).toBe(0)
  })

  it("refuse un compte ordinaire avant de lire le fichier", async () => {
    sessionCouranteMock.mockResolvedValue(CLIENT_ORDINAIRE)

    await expect(
      televerserLeFichierAction({}, formulaire(fichierCsv("slug,name\r\n")))
    ).rejects.toMatchObject({
      name: "NEXT_REDIRECT",
      url: "/?open=login&next=%2Fadmin%2Fproduits%2Fimporter",
    })

    expect(televersements.appels).toEqual([])
  })

  it("refuse un formulaire sans fichier, sans créer de Lot", async () => {
    const resultat = await televerserLeFichierAction({}, formulaire())

    expect(resultat).toEqual({ error: "Aucun fichier reçu" })
    expect(televersements.appels).toEqual([])
  })
})
