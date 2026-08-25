import { describe, expect, it, vi, beforeEach } from "vitest"

import {
  adminSessionMock,
  redirectMock,
  sessionUserMock,
} from "@/test/navigation-mocks"

vi.mock("next/navigation", async () => {
  const h = await import("@/test/navigation-mocks")
  return { redirect: h.redirectMock }
})
vi.mock("@/lib/use-cases/get-session", async () => {
  const h = await import("@/test/navigation-mocks")
  return { getSessionUser: h.sessionUserMock }
})
vi.mock("@/lib/use-cases/get-admin-session", async () => {
  const h = await import("@/test/navigation-mocks")
  return { getAdminSession: h.adminSessionMock }
})

import {
  adminFormAction,
  adminTaskAction,
  formAction,
  INVALID_FORM_MESSAGE,
  taskAction,
} from "@/lib/use-cases/mutation-actions"
import { loginUrl } from "@/lib/lien-de-connexion"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

const SESSION_USER = { id: "1", email: "client@example.ma", role: "user" }
const ADMIN_SESSION = { user: { id: "2", role: "admin" } }

class StubUserFacingError extends UserFacingError {}

function formData(): FormData {
  return new FormData()
}

describe("INVALID_FORM_MESSAGE", () => {
  it("is the one shared constant", () => {
    expect(INVALID_FORM_MESSAGE).toBe("Formulaire invalide")
  })
})

describe("formAction", () => {
  beforeEach(() => {
    sessionUserMock.mockReset()
    adminSessionMock.mockReset()
    redirectMock.mockClear()
  })

  it("refuses an anonymous Compte client with a typed result instead of a redirect", async () => {
    sessionUserMock.mockResolvedValue(null)
    const action = formAction({
      run: async () => ({}),
    })

    await expect(action({}, formData())).resolves.toEqual({
      unauthenticated: true,
    })
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it("passes the parsed input and the authenticated user to run", async () => {
    sessionUserMock.mockResolvedValue(SESSION_USER)
    const run = vi.fn(async (_input: { phone: string }, _user: unknown) => ({}))
    const action = formAction<{ phone: string }>({
      parse: (fd) => ({ phone: String(fd.get("phone") ?? "") }),
      run,
    })
    const fd = formData()
    fd.append("phone", "0612345678")

    await expect(action({}, fd)).resolves.toEqual({})
    expect(run).toHaveBeenCalledWith({ phone: "0612345678" }, SESSION_USER)
  })

  it("turns a parser throw into { error: message } without running", async () => {
    sessionUserMock.mockResolvedValue(SESSION_USER)
    const run = vi.fn(async () => ({}))
    const action = formAction<{ phone: string }>({
      parse: () => {
        throw new Error("Téléphone invalide")
      },
      run,
    })

    await expect(action({}, formData())).resolves.toEqual({
      error: "Téléphone invalide",
    })
    expect(run).not.toHaveBeenCalled()
  })

  it("turns a UserFacingError from run into { error: error.message }", async () => {
    sessionUserMock.mockResolvedValue(SESSION_USER)
    const action = formAction({
      run: async () => {
        throw new StubUserFacingError("Ville de livraison introuvable")
      },
    })

    await expect(action({}, formData())).resolves.toEqual({
      error: "Ville de livraison introuvable",
    })
  })

  it("rethrows a plain error verbatim", async () => {
    sessionUserMock.mockResolvedValue(SESSION_USER)
    const boom = new Error("boom")
    const action = formAction({
      run: async () => {
        throw boom
      },
    })

    await expect(action({}, formData())).rejects.toBe(boom)
  })

  it("rethrows the redirect control flow thrown by run untouched", async () => {
    sessionUserMock.mockResolvedValue(SESSION_USER)
    const action = formAction({
      run: async () => {
        redirectMock("/commande/confirmation/1")
        return {}
      },
    })

    await expect(action({}, formData())).rejects.toMatchObject({
      url: "/commande/confirmation/1",
      name: "NEXT_REDIRECT",
    })
  })

  it("skips run and reports success when the parser returns null", async () => {
    sessionUserMock.mockResolvedValue(SESSION_USER)
    const run = vi.fn(async () => ({}))
    const action = formAction<unknown>({
      parse: () => null,
      run,
    })

    await expect(
      action({ error: "ancienne erreur" }, formData())
    ).resolves.toEqual({})
    expect(run).not.toHaveBeenCalled()
  })
})

describe("taskAction", () => {
  beforeEach(() => {
    sessionUserMock.mockReset()
    adminSessionMock.mockReset()
    redirectMock.mockClear()
  })

  it("refuses an anonymous Compte client with a typed result instead of a redirect", async () => {
    sessionUserMock.mockResolvedValue(null)
    const action = taskAction({
      run: async () => {},
    })

    await expect(action(formData())).resolves.toEqual({
      unauthenticated: true,
    })
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it("passes the parsed input and the authenticated user to run", async () => {
    sessionUserMock.mockResolvedValue(SESSION_USER)
    const run = vi.fn(async (input: { variantId: string }, _user: unknown) => {
      expect(input).toEqual({ variantId: "42" })
    })
    const action = taskAction<{ variantId: string }>({
      parse: (fd) => {
        const variantId = String(fd.get("variantId") ?? "")
        return variantId ? { variantId } : null
      },
      run,
    })
    const fd = formData()
    fd.append("variantId", "42")

    await expect(action(fd)).resolves.toBeUndefined()
    expect(run).toHaveBeenCalledWith({ variantId: "42" }, SESSION_USER)
  })

  it("swallows a parser throw silently without running", async () => {
    sessionUserMock.mockResolvedValue(SESSION_USER)
    const run = vi.fn(async () => {})
    const action = taskAction<{ variantId: string }>({
      parse: () => {
        throw new Error("Format invalide")
      },
      run,
    })

    await expect(action(formData())).resolves.toBeUndefined()
    expect(run).not.toHaveBeenCalled()
  })

  it("swallows a UserFacingError from run as a silent no-op", async () => {
    sessionUserMock.mockResolvedValue(SESSION_USER)
    const action = taskAction<{ variantId: string }>({
      parse: (fd) => ({ variantId: String(fd.get("variantId") ?? "") }),
      run: async () => {
        throw new StubUserFacingError("Variante introuvable")
      },
    })

    await expect(action(formData())).resolves.toBeUndefined()
  })

  it("rethrows a plain error verbatim", async () => {
    sessionUserMock.mockResolvedValue(SESSION_USER)
    const boom = new Error("boom")
    const action = taskAction({
      run: async () => {
        throw boom
      },
    })

    await expect(action(formData())).rejects.toBe(boom)
  })

  it("rethrows the redirect control flow thrown by run untouched", async () => {
    sessionUserMock.mockResolvedValue(SESSION_USER)
    const action = taskAction({
      run: async () => {
        redirectMock("/commande/confirmation/1")
      },
    })

    await expect(action(formData())).rejects.toMatchObject({
      url: "/commande/confirmation/1",
      name: "NEXT_REDIRECT",
    })
  })

  it("skips run and resolves void when the parser returns null", async () => {
    sessionUserMock.mockResolvedValue(SESSION_USER)
    const run = vi.fn(async () => {})
    const action = taskAction<unknown>({
      parse: () => null,
      run,
    })

    await expect(action(formData())).resolves.toBeUndefined()
    expect(run).not.toHaveBeenCalled()
  })
})

describe("adminFormAction", () => {
  beforeEach(() => {
    sessionUserMock.mockReset()
    adminSessionMock.mockReset()
    redirectMock.mockClear()
  })

  it("sends an anonymous Compte client to the Lien de connexion carrying /admin/villes as its Destination post-connexion", async () => {
    adminSessionMock.mockResolvedValue(null)
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
    adminSessionMock.mockResolvedValue(ADMIN_SESSION)
    const run = vi.fn(
      async (_input: { name: string; fee: number }, _user: unknown) => ({})
    )
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
    expect(run).toHaveBeenCalledWith({ name: "Rabat", fee: 1250 }, ADMIN_SESSION.user)
  })

  it("turns a parser throw into { error: message } without running", async () => {
    adminSessionMock.mockResolvedValue(ADMIN_SESSION)
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
    adminSessionMock.mockResolvedValue(ADMIN_SESSION)
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
    adminSessionMock.mockResolvedValue(ADMIN_SESSION)
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
    adminSessionMock.mockResolvedValue(ADMIN_SESSION)
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
    adminSessionMock.mockResolvedValue(ADMIN_SESSION)
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
    sessionUserMock.mockReset()
    adminSessionMock.mockReset()
    redirectMock.mockClear()
  })

  it("sends an anonymous Compte client to the Lien de connexion carrying /admin/villes as its Destination post-connexion", async () => {
    adminSessionMock.mockResolvedValue(null)
    const action = adminTaskAction({
      next: "/admin/villes",
      run: async () => {},
    })

    await expect(action(formData())).rejects.toMatchObject({
      url: loginUrl("/admin/villes"),
    })
  })

  it("passes the parsed input to run and resolves void when authenticated", async () => {
    adminSessionMock.mockResolvedValue(ADMIN_SESSION)
    const run = vi.fn(
      async (input: { cityId: string }, _user: unknown) => {
        expect(input).toEqual({ cityId: "42" })
      }
    )
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
    expect(run).toHaveBeenCalledWith({ cityId: "42" }, ADMIN_SESSION.user)
  })

  it("swallows a parser throw silently without running", async () => {
    adminSessionMock.mockResolvedValue(ADMIN_SESSION)
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
    adminSessionMock.mockResolvedValue(ADMIN_SESSION)
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
    adminSessionMock.mockResolvedValue(ADMIN_SESSION)
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
    adminSessionMock.mockResolvedValue(ADMIN_SESSION)
    const action = adminTaskAction({
      next: "/admin/produits",
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
    adminSessionMock.mockResolvedValue(ADMIN_SESSION)
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
