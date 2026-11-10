import { beforeEach, describe, expect, it, vi } from "vitest"

import { sessionCouranteMock } from "@/test/navigation-mocks"

vi.mock("@/lib/use-cases/session-courante", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/use-cases/session-courante")
  >()),
  lireSession: sessionCouranteMock,
}))

import { GET } from "@/app/api/admin/produits/importer/modele/route"
import { COLONNES_IMPORT } from "@/lib/import-produits"
import type { Client } from "@/lib/use-cases/session-courante"

const ADMIN: Client = {
  id: "admin-modele-1",
  name: "Éditeur",
  email: "editeur@example.test",
  role: "admin",
}

function comme(role: Client["role"] | null) {
  sessionCouranteMock.mockResolvedValue(
    role === null ? null : { ...ADMIN, role }
  )
}

beforeEach(() => {
  sessionCouranteMock.mockReset()
})

describe("GET /api/admin/produits/importer/modele", () => {
  it("télécharge le modèle à neuf colonnes pour un administrateur", async () => {
    comme("admin")

    const reponse = await GET()
    const corps = await reponse.text()

    expect(reponse.status).toBe(200)
    expect(reponse.headers.get("Content-Type")).toBe("text/csv; charset=utf-8")
    expect(reponse.headers.get("Content-Disposition")).toBe(
      'attachment; filename="modele-import-produits.csv"'
    )
    expect(reponse.headers.get("Cache-Control")).toBe("private, no-store")
    expect(corps.replace(/^\uFEFF/, "")).toBe(
      `${COLONNES_IMPORT.join(",")}\r\n`
    )
  })

  it("refuse un compte ordinaire sans rendre le modèle", async () => {
    comme("user")

    const reponse = await GET()

    expect(reponse.status).toBe(401)
    await expect(reponse.text()).resolves.toBe("Non autorisé")
  })

  it("refuse un visiteur sans session", async () => {
    comme(null)

    const reponse = await GET()

    expect(reponse.status).toBe(401)
    expect(reponse.headers.get("Content-Disposition")).toBeNull()
  })
})
