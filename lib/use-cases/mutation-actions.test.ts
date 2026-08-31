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
  parseMoneyField,
  parseRequiredId,
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

describe("parseMoneyField", () => {
  it("parses a MAD amount into cents", () => {
    const fd = formData()
    fd.append("fee", "12,50")
    expect(parseMoneyField(fd, "fee")).toBe(1250)
  })

  it("throws the shared refusal message for a malformed amount", () => {
    const fd = formData()
    fd.append("fee", "beaucoup")
    expect(() => parseMoneyField(fd, "fee")).toThrow(INVALID_FORM_MESSAGE)
  })
})

describe("parseRequiredId", () => {
  it("returns the field value", () => {
    const fd = formData()
    fd.append("cityId", "42")
    expect(parseRequiredId(fd, "cityId")).toBe("42")
  })

  it("throws the shared refusal message when the field is missing or empty", () => {
    expect(() => parseRequiredId(formData(), "cityId")).toThrow(
      INVALID_FORM_MESSAGE
    )
    const fd = formData()
    fd.append("cityId", "")
    expect(() => parseRequiredId(fd, "cityId")).toThrow(INVALID_FORM_MESSAGE)
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
        return { variantId }
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
    expect(run).toHaveBeenCalledWith(
      { name: "Rabat", fee: 1250 },
      ADMIN_SESSION.user
    )
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
    const run = vi.fn(async (input: { cityId: string }, _user: unknown) => {
      expect(input).toEqual({ cityId: "42" })
    })
    const action = adminTaskAction<{ cityId: string }>({
      next: "/admin/villes",
      parse: (fd) => {
        const cityId = String(fd.get("cityId") ?? "")
        return cityId ? { cityId } : { cityId }
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

  it("swallows a UserFacingError from run as a silent no-op when no refusalUrl is given", async () => {
    adminSessionMock.mockResolvedValue(ADMIN_SESSION)
    const action = adminTaskAction<{ cityId: string }>({
      next: "/admin/villes",
      parse: (fd) => ({ cityId: String(fd.get("cityId") ?? "") }),
      run: async () => {
        throw new StubUserFacingError("Ville introuvable")
      },
    })

    await expect(action(formData())).resolves.toBeUndefined()
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it("redirects a UserFacingError from run to the refusalUrl derived from the parsed input", async () => {
    adminSessionMock.mockResolvedValue(ADMIN_SESSION)
    const action = adminTaskAction<{ orderId: string }>({
      next: "/admin/commandes",
      parse: (fd) => ({ orderId: String(fd.get("orderId") ?? "") }),
      refusalUrl: ({ orderId }) =>
        `/admin/commandes/${orderId}?transition=refusee`,
      run: async () => {
        throw new StubUserFacingError(
          "Transition invalide : pending → cancelled"
        )
      },
    })
    const fd = formData()
    fd.append("orderId", "7")

    await expect(action(fd)).rejects.toMatchObject({
      url: "/admin/commandes/7?transition=refusee",
      name: "NEXT_REDIRECT",
    })
    expect(redirectMock).toHaveBeenCalledWith(
      "/admin/commandes/7?transition=refusee"
    )
  })

  it("keeps parse failures silent even when refusalUrl is set", async () => {
    adminSessionMock.mockResolvedValue(ADMIN_SESSION)
    const run = vi.fn(async () => {})
    const action = adminTaskAction<{ orderId: string }>({
      next: "/admin/commandes",
      parse: () => {
        throw new Error(INVALID_FORM_MESSAGE)
      },
      refusalUrl: ({ orderId }) =>
        `/admin/commandes/${orderId}?transition=refusee`,
      run,
    })

    await expect(action(formData())).resolves.toBeUndefined()
    expect(run).not.toHaveBeenCalled()
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it("rethrows a plain error verbatim even when refusalUrl is set", async () => {
    adminSessionMock.mockResolvedValue(ADMIN_SESSION)
    const boom = new Error("boom")
    const action = adminTaskAction<{ orderId: string }>({
      next: "/admin/commandes",
      parse: (fd) => ({ orderId: String(fd.get("orderId") ?? "") }),
      refusalUrl: ({ orderId }) =>
        `/admin/commandes/${orderId}?transition=refusee`,
      run: async () => {
        throw boom
      },
    })

    await expect(action(formData())).rejects.toBe(boom)
  })

  it("rethrows the redirect control flow thrown by run untouched even when refusalUrl is set", async () => {
    adminSessionMock.mockResolvedValue(ADMIN_SESSION)
    const action = adminTaskAction<{ orderId: string }>({
      next: "/admin/commandes",
      parse: (fd) => ({ orderId: String(fd.get("orderId") ?? "") }),
      refusalUrl: ({ orderId }) =>
        `/admin/commandes/${orderId}?transition=refusee`,
      run: async () => {
        redirectMock("/admin/commandes/7")
      },
    })

    await expect(action(formData())).rejects.toMatchObject({
      url: "/admin/commandes/7",
      name: "NEXT_REDIRECT",
    })
  })
})
