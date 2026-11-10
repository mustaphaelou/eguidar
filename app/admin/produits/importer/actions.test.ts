import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Client } from "@/lib/use-cases/session-courante"
import type { TeleversementImport } from "@/lib/use-cases/import-produits"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"
import { redirectMock, sessionCouranteMock } from "@/test/navigation-mocks"

const televersements = vi.hoisted(() => ({
  appels: [] as TeleversementImport[],
  resultat: { lotId: "lot-1", statut: "brouillon" as const },
}))

const verifications = vi.hoisted(() => ({
  appels: [] as string[],
  erreur: null as Error | null,
}))

const applications = vi.hoisted(() => ({
  appels: [] as { lotId: string; curseur: number }[],
  resultat: {} as Record<string, unknown>,
  erreur: null as Error | null,
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
  verifierLeLot: async (lotId: string) => {
    verifications.appels.push(lotId)
    if (verifications.erreur !== null) throw verifications.erreur
    return undefined as never
  },
  appliquerLeLot: async (lotId: string, curseur: number) => {
    applications.appels.push({ lotId, curseur })
    if (applications.erreur !== null) throw applications.erreur
    return applications.resultat
  },
}))

import {
  appliquerLeLotAction,
  televerserLeFichierAction,
  verifierLeLotAction,
} from "@/app/admin/produits/importer/actions"

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
  verifications.appels.length = 0
  verifications.erreur = null
  applications.appels.length = 0
  applications.resultat = {}
  applications.erreur = null
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

function formulaireDeVerification(lotId?: string): FormData {
  const formData = new FormData()
  if (lotId !== undefined) formData.set("lotId", lotId)
  return formData
}

describe("verifierLeLotAction", () => {
  it("confie le Lot au cas d'usage et revient sur la page du Lot vérifié", async () => {
    await expect(
      verifierLeLotAction({}, formulaireDeVerification("lot-42"))
    ).rejects.toMatchObject({
      name: "NEXT_REDIRECT",
      url: "/admin/produits/importer?lot=lot-42",
    })

    expect(verifications.appels).toEqual(["lot-42"])
  })

  it("refuse un compte ordinaire avant de vérifier le Lot", async () => {
    sessionCouranteMock.mockResolvedValue(CLIENT_ORDINAIRE)

    await expect(
      verifierLeLotAction({}, formulaireDeVerification("lot-42"))
    ).rejects.toMatchObject({
      name: "NEXT_REDIRECT",
      url: "/?open=login&next=%2Fadmin%2Fproduits%2Fimporter",
    })

    expect(verifications.appels).toEqual([])
  })

  it("refuse un formulaire sans Lot, sans rien vérifier", async () => {
    const resultat = await verifierLeLotAction({}, formulaireDeVerification())

    expect(resultat).toEqual({ error: "Aucun Lot à vérifier" })
    expect(verifications.appels).toEqual([])
  })

  it("rend le message français d'un Lot impossible à vérifier", async () => {
    verifications.erreur = new UserFacingError(
      "Ce Lot est déjà appliqué : la Vérification ne peut plus le rejuger."
    )

    const resultat = await verifierLeLotAction(
      {},
      formulaireDeVerification("lot-42")
    )

    expect(resultat).toEqual({
      error:
        "Ce Lot est déjà appliqué : la Vérification ne peut plus le rejuger.",
    })
    expect(verifications.appels).toEqual(["lot-42"])
  })
})

function formulaireDApplication(lotId?: string, curseur?: string): FormData {
  const formData = new FormData()
  if (lotId !== undefined) formData.set("lotId", lotId)
  if (curseur !== undefined) formData.set("curseur", curseur)
  return formData
}

describe("appliquerLeLotAction", () => {
  it("confie le Lot et le curseur au cas d'usage et rend son résultat", async () => {
    applications.resultat = {
      lotId: "lot-42",
      traites: 25,
      reste: 2,
      curseurSuivant: 25,
      ecrits: 25,
      indexes: 24,
      echecs: [],
      indexationEnAttente: true,
      statut: "en_cours",
    }

    const resultat = await appliquerLeLotAction(
      {},
      formulaireDApplication("lot-42", "25")
    )

    expect(resultat).toEqual(applications.resultat)
    expect(applications.appels).toEqual([{ lotId: "lot-42", curseur: 25 }])
  })

  it("refuse un compte ordinaire avant d'appliquer", async () => {
    sessionCouranteMock.mockResolvedValue(CLIENT_ORDINAIRE)

    await expect(
      appliquerLeLotAction({}, formulaireDApplication("lot-42", "0"))
    ).rejects.toMatchObject({
      name: "NEXT_REDIRECT",
      url: "/?open=login&next=%2Fadmin%2Fproduits%2Fimporter",
    })

    expect(applications.appels).toEqual([])
  })

  it("refuse un formulaire sans Lot ou avec un curseur invalide", async () => {
    expect(await appliquerLeLotAction({}, formulaireDApplication())).toEqual({
      error: "Aucun Lot à appliquer",
    })
    expect(
      await appliquerLeLotAction({}, formulaireDApplication("lot-42", "-1"))
    ).toEqual({ error: "Curseur d'application invalide" })
    expect(
      await appliquerLeLotAction({}, formulaireDApplication("lot-42", "abc"))
    ).toEqual({ error: "Curseur d'application invalide" })

    expect(applications.appels).toEqual([])
  })

  it("rend le message français d'un Lot impossible à appliquer", async () => {
    applications.erreur = new UserFacingError(
      "Ce Lot est déjà appliqué : il ne peut pas l'être une seconde fois."
    )

    const resultat = await appliquerLeLotAction(
      {},
      formulaireDApplication("lot-42", "0")
    )

    expect(resultat).toEqual({
      error:
        "Ce Lot est déjà appliqué : il ne peut pas l'être une seconde fois.",
    })
    expect(applications.appels).toEqual([{ lotId: "lot-42", curseur: 0 }])
  })
})
