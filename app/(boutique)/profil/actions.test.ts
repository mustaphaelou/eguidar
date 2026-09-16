import { describe, expect, it, vi, beforeEach } from "vitest"

import type { Client } from "@/lib/use-cases/session-courante"
import { redirectMock, sessionCouranteMock } from "@/test/navigation-mocks"

const { updateProfileMock } = vi.hoisted(() => ({
  updateProfileMock: vi.fn(),
}))

vi.mock("next/navigation", async () => {
  const h = await import("@/test/navigation-mocks")
  return { redirect: h.redirectMock }
})
vi.mock("@/lib/use-cases/session-courante", async () => {
  const h = await import("@/test/navigation-mocks")
  return { lireSession: h.sessionCouranteMock }
})
vi.mock("@/lib/use-cases/account", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/use-cases/account")>()
  return { ...actual, updateProfile: updateProfileMock }
})

import { updateProfileAction } from "@/app/(boutique)/profil/actions"
import { ProfileValidationError } from "@/lib/use-cases/account"
import { DeliveryCityNotFoundError } from "@/lib/use-cases/livraison"

const SESSION_USER: Client = {
  id: "user-1",
  name: "Client Test",
  email: "client@example.ma",
  role: "user",
}

function formData(): FormData {
  return new FormData()
}

describe("updateProfileAction", () => {
  beforeEach(() => {
    sessionCouranteMock.mockReset()
    updateProfileMock.mockReset()
    redirectMock.mockClear()
  })

  it("refuses an anonymous Compte client with a typed result instead of a redirect, without saving", async () => {
    sessionCouranteMock.mockResolvedValue(null)

    await expect(updateProfileAction({}, formData())).resolves.toEqual({
      unauthenticated: true,
    })
    expect(redirectMock).not.toHaveBeenCalled()
    expect(updateProfileMock).not.toHaveBeenCalled()
  })

  it("turns a profile-validation refusal into { error } without saving", async () => {
    sessionCouranteMock.mockResolvedValue(SESSION_USER)
    updateProfileMock.mockRejectedValue(
      new ProfileValidationError(["le téléphone doit être valide"])
    )

    await expect(updateProfileAction({}, formData())).resolves.toEqual({
      error: "Données invalides : le téléphone doit être valide",
    })
    expect(updateProfileMock).toHaveBeenCalledTimes(1)
  })

  it("turns a delivery-city-not-found refusal into { error }", async () => {
    sessionCouranteMock.mockResolvedValue(SESSION_USER)
    updateProfileMock.mockRejectedValue(new DeliveryCityNotFoundError())

    await expect(updateProfileAction({}, formData())).resolves.toEqual({
      error: "Ville de livraison introuvable",
    })
  })

  it("rethrows an unexpected error verbatim", async () => {
    sessionCouranteMock.mockResolvedValue(SESSION_USER)
    const boom = new Error("boom")
    updateProfileMock.mockRejectedValue(boom)

    await expect(updateProfileAction({}, formData())).rejects.toBe(boom)
  })

  it("updates the authenticated user's profile and returns exactly { success: true }", async () => {
    sessionCouranteMock.mockResolvedValue(SESSION_USER)
    updateProfileMock.mockResolvedValue({})
    const fd = formData()
    fd.append("phone", "+212600000000")
    fd.append("address", "12 rue des Orangers")
    fd.append("cityId", "42")

    await expect(updateProfileAction({}, fd)).resolves.toEqual({
      success: true,
    })
    expect(updateProfileMock).toHaveBeenCalledWith("user-1", {
      phone: "+212600000000",
      address: "12 rue des Orangers",
      cityId: "42",
    })
  })

  it("maps an empty city to null when updating the profile", async () => {
    sessionCouranteMock.mockResolvedValue(SESSION_USER)
    updateProfileMock.mockResolvedValue({})
    const fd = formData()
    fd.append("phone", "+212600000000")
    fd.append("address", "12 rue des Orangers")

    await expect(updateProfileAction({}, fd)).resolves.toEqual({
      success: true,
    })
    expect(updateProfileMock).toHaveBeenCalledWith("user-1", {
      phone: "+212600000000",
      address: "12 rue des Orangers",
      cityId: null,
    })
  })
})
