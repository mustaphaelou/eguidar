import { hashPassword } from "better-auth/crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { findFirst, update } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
}))

vi.mock("@/lib/db", () => ({
  prisma: { account: { findFirst, update } },
}))

import { verifierMotDePasseEtRehacher } from "@/lib/rehachage-mot-de-passe"

const MOT_DE_PASSE = "MotDePasse!Rehache1"

describe("Rehachage du mot de passe — échec d'écriture", () => {
  beforeEach(() => {
    findFirst.mockReset()
    update.mockReset()
  })

  it("laisse la Connexion réussir quand la réécriture échoue, et le journalise", async () => {
    const ancien = await hashPassword(MOT_DE_PASSE)
    findFirst.mockResolvedValue({ id: "compte-1" })
    update.mockRejectedValue(new Error("base indisponible"))
    const journal = vi.spyOn(console, "error").mockImplementation(() => {})

    await expect(
      verifierMotDePasseEtRehacher({ hash: ancien, password: MOT_DE_PASSE })
    ).resolves.toBe(true)
    expect(journal).toHaveBeenCalled()
    journal.mockRestore()
  })
})
