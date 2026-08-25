import { describe, expect, it, vi, beforeEach } from "vitest"

const { redirectMock, sessionUserMock, updateProfileMock } = vi.hoisted(() => {
  class RedirectSentinel extends Error {
    url: string
    constructor(url: string) {
      super(`NEXT_REDIRECT;replace;${url};307;`)
      this.name = "NEXT_REDIRECT"
      this.url = url
    }
  }
  return {
    redirectMock: vi.fn((url: string) => {
      throw new RedirectSentinel(url)
    }),
    sessionUserMock: vi.fn(),
    updateProfileMock: vi.fn(),
  }
})

vi.mock("next/navigation", () => ({ redirect: redirectMock }))
vi.mock("@/lib/use-cases/get-session", () => ({
  getSessionUser: sessionUserMock,
}))
vi.mock("@/lib/use-cases/get-admin-session", () => ({
  getAdminSession: vi.fn(),
}))
vi.mock("@/lib/use-cases/account", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/use-cases/account")>()
  return { ...actual, updateProfile: updateProfileMock }
})

import { updateProfileAction } from "@/app/(boutique)/profil/actions"
import { ProfileValidationError } from "@/lib/use-cases/account"
import { loginUrl } from "@/lib/lien-de-connexion"
import { DeliveryCityNotFoundError } from "@/lib/use-cases/livraison"

const SESSION_USER = { id: "user-1", email: "client@example.ma", role: "user" }

function formData(): FormData {
  return new FormData()
}

describe("updateProfileAction", () => {
  beforeEach(() => {
    sessionUserMock.mockReset()
    updateProfileMock.mockReset()
    redirectMock.mockClear()
  })

  it("redirects an anonymous session to the Lien de connexion carrying /profil", async () => {
    sessionUserMock.mockResolvedValue(null)

    await expect(updateProfileAction({}, formData())).rejects.toMatchObject({
      url: loginUrl("/profil"),
      name: "NEXT_REDIRECT",
    })
    expect(redirectMock).toHaveBeenCalledWith(loginUrl("/profil"))
  })

  it("turns a profile-validation refusal into { error } without saving", async () => {
    sessionUserMock.mockResolvedValue(SESSION_USER)
    updateProfileMock.mockRejectedValue(
      new ProfileValidationError(["le téléphone doit être valide"])
    )

    await expect(updateProfileAction({}, formData())).resolves.toEqual({
      error: "Données invalides : le téléphone doit être valide",
    })
    expect(updateProfileMock).toHaveBeenCalledTimes(1)
  })

  it("turns a delivery-city-not-found refusal into { error }", async () => {
    sessionUserMock.mockResolvedValue(SESSION_USER)
    updateProfileMock.mockRejectedValue(new DeliveryCityNotFoundError())

    await expect(updateProfileAction({}, formData())).resolves.toEqual({
      error: "Ville de livraison introuvable",
    })
  })

  it("rethrows an unexpected error verbatim", async () => {
    sessionUserMock.mockResolvedValue(SESSION_USER)
    const boom = new Error("boom")
    updateProfileMock.mockRejectedValue(boom)

    await expect(updateProfileAction({}, formData())).rejects.toBe(boom)
  })

  it("updates the authenticated user's profile and returns exactly { success: true }", async () => {
    sessionUserMock.mockResolvedValue(SESSION_USER)
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
    sessionUserMock.mockResolvedValue(SESSION_USER)
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
