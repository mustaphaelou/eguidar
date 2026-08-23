import { describe, expect, it, vi, beforeEach } from "vitest"

const { redirectMock, sessionMock } = vi.hoisted(() => {
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
    sessionMock: vi.fn(),
  }
})

vi.mock("next/navigation", () => ({ redirect: redirectMock }))
vi.mock("@/lib/use-cases/get-admin-session", () => ({
  getAdminSession: sessionMock,
}))

import {
  adminFormAction,
  adminTaskAction,
  INVALID_FORM_MESSAGE,
} from "@/lib/use-cases/admin-actions"
import { loginUrl } from "@/lib/lien-de-connexion"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

const ADMIN_SESSION = { user: { id: "1", role: "admin" } }

class StubUserFacingError extends UserFacingError {}

function formData(): FormData {
  return new FormData()
}

describe("INVALID_FORM_MESSAGE", () => {
  it("is the one shared constant", () => {
    expect(INVALID_FORM_MESSAGE).toBe("Formulaire invalide")
  })
})

describe("adminFormAction", () => {
  beforeEach(() => {
    sessionMock.mockReset()
    redirectMock.mockClear()
  })

  it("redirects an anonymous session to loginUrl(next)", async () => {
    sessionMock.mockResolvedValue(null)
    const action = adminFormAction({
      next: "/admin/villes",
      run: async () => ({}),
    })

    await expect(action({}, formData())).rejects.toMatchObject({
      url: loginUrl("/admin/villes"),
    })
    expect(redirectMock).toHaveBeenCalledWith(loginUrl("/admin/villes"))
  })

  it("passes the parsed input to run when the session is authenticated", async () => {
    sessionMock.mockResolvedValue(ADMIN_SESSION)
    const run = vi.fn(async (_input: { name: string; fee: number }) => ({}))
    const action = adminFormAction<{ name: string; fee: number }>({
      next: "/admin/villes",
      parse: (fd) => ({
        name: String(fd.get("name") ?? ""),
        fee: Number(fd.get("fee") ?? 0),
      }),
      run,
    })
    const fd = formData()
    fd.append("name", "Rabat")
    fd.append("fee", "1250")

    await expect(action({}, fd)).resolves.toEqual({})
    expect(run).toHaveBeenCalledWith({ name: "Rabat", fee: 1250 })
  })

  it("turns a parser throw into { error: message } without running", async () => {
    sessionMock.mockResolvedValue(ADMIN_SESSION)
    const run = vi.fn(async () => ({}))
    const action = adminFormAction<{ fee: number }>({
      next: "/admin/villes",
      parse: () => {
        throw new Error("Montant invalide")
      },
      run,
    })

    await expect(action({}, formData())).resolves.toEqual({
      error: "Montant invalide",
    })
    expect(run).not.toHaveBeenCalled()
  })

  it("turns a UserFacingError from run into { error: error.message }", async () => {
    sessionMock.mockResolvedValue(ADMIN_SESSION)
    const action = adminFormAction({
      next: "/admin/villes",
      run: async () => {
        throw new StubUserFacingError("Ville introuvable")
      },
    })

    await expect(action({}, formData())).resolves.toEqual({
      error: "Ville introuvable",
    })
  })

  it("rethrows a plain error verbatim", async () => {
    sessionMock.mockResolvedValue(ADMIN_SESSION)
    const boom = new Error("boom")
    const action = adminFormAction({
      next: "/admin/villes",
      run: async () => {
        throw boom
      },
    })

    await expect(action({}, formData())).rejects.toBe(boom)
  })

  it("rethrows the redirect control flow thrown by run untouched", async () => {
    sessionMock.mockResolvedValue(ADMIN_SESSION)
    const action = adminFormAction({
      next: "/admin/villes",
      run: async () => {
        redirectMock("/admin/villes")
        return {}
      },
    })

    await expect(action({}, formData())).rejects.toMatchObject({
      url: "/admin/villes",
      name: "NEXT_REDIRECT",
    })
  })

  it("skips run and reports success when the parser returns null", async () => {
    sessionMock.mockResolvedValue(ADMIN_SESSION)
    const run = vi.fn(async () => ({}))
    const action = adminFormAction<unknown>({
      next: "/admin/villes",
      parse: () => null,
      run,
    })

    await expect(
      action({ error: "ancienne erreur" }, formData())
    ).resolves.toEqual({})
    expect(run).not.toHaveBeenCalled()
  })
})

describe("adminTaskAction", () => {
  beforeEach(() => {
    sessionMock.mockReset()
    redirectMock.mockClear()
  })

  it("redirects an anonymous session to loginUrl(next)", async () => {
    sessionMock.mockResolvedValue(null)
    const action = adminTaskAction({
      next: "/admin/villes",
      run: async () => {},
    })

    await expect(action(formData())).rejects.toMatchObject({
      url: loginUrl("/admin/villes"),
    })
  })

  it("passes the parsed input to run and resolves void when authenticated", async () => {
    sessionMock.mockResolvedValue(ADMIN_SESSION)
    const run = vi.fn(async (input: { cityId: string }) => {
      expect(input).toEqual({ cityId: "42" })
    })
    const action = adminTaskAction<{ cityId: string }>({
      next: "/admin/villes",
      parse: (fd) => {
        const cityId = String(fd.get("cityId") ?? "")
        return cityId ? { cityId } : null
      },
      run,
    })
    const fd = formData()
    fd.append("cityId", "42")

    await expect(action(fd)).resolves.toBeUndefined()
    expect(run).toHaveBeenCalledWith({ cityId: "42" })
  })

  it("swallows a parser throw silently without running", async () => {
    sessionMock.mockResolvedValue(ADMIN_SESSION)
    const run = vi.fn(async () => {})
    const action = adminTaskAction<{ cityId: string }>({
      next: "/admin/villes",
      parse: () => {
        throw new Error("Format invalide")
      },
      run,
    })

    await expect(action(formData())).resolves.toBeUndefined()
    expect(run).not.toHaveBeenCalled()
  })

  it("swallows a UserFacingError from run as a silent no-op", async () => {
    sessionMock.mockResolvedValue(ADMIN_SESSION)
    const action = adminTaskAction<{ cityId: string }>({
      next: "/admin/villes",
      parse: (fd) => ({ cityId: String(fd.get("cityId") ?? "") }),
      run: async () => {
        throw new StubUserFacingError("Ville introuvable")
      },
    })

    await expect(action(formData())).resolves.toBeUndefined()
  })

  it("rethrows a plain error verbatim", async () => {
    sessionMock.mockResolvedValue(ADMIN_SESSION)
    const boom = new Error("boom")
    const action = adminTaskAction({
      next: "/admin/villes",
      run: async () => {
        throw boom
      },
    })

    await expect(action(formData())).rejects.toBe(boom)
  })

  it("rethrows the redirect control flow thrown by run untouched", async () => {
    sessionMock.mockResolvedValue(ADMIN_SESSION)
    const action = adminTaskAction({
      next: "/admin/villes",
      run: async () => {
        redirectMock("/admin/produits")
      },
    })

    await expect(action(formData())).rejects.toMatchObject({
      url: "/admin/produits",
      name: "NEXT_REDIRECT",
    })
  })

  it("skips run and resolves void when the parser returns null", async () => {
    sessionMock.mockResolvedValue(ADMIN_SESSION)
    const run = vi.fn(async () => {})
    const action = adminTaskAction<unknown>({
      next: "/admin/villes",
      parse: () => null,
      run,
    })

    await expect(action(formData())).resolves.toBeUndefined()
    expect(run).not.toHaveBeenCalled()
  })
})
