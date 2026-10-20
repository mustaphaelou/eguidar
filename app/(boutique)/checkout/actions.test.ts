import { beforeEach, describe, expect, it, vi } from "vitest"
import { refresh } from "next/cache"

import type { Client } from "@/lib/use-cases/session-courante"
import { redirectMock, sessionCouranteMock } from "@/test/navigation-mocks"

const { placeOrderMock, updateProfileMock } = vi.hoisted(() => ({
  placeOrderMock: vi.fn(),
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
vi.mock("@/lib/use-cases/orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/use-cases/orders")>()),
  placeOrder: placeOrderMock,
}))
vi.mock("@/lib/use-cases/account", () => ({
  updateProfile: updateProfileMock,
}))

import { placeOrderAction } from "@/app/(boutique)/checkout/actions"
import { DeliveryCityNotFoundError } from "@/lib/use-cases/livraison-prix"
import {
  CheckoutValidationError,
  DevisPériméError,
  EmptyCartError,
  OutOfStockError,
} from "@/lib/use-cases/orders"

const SESSION_USER: Client = {
  id: "1",
  name: "Client Test",
  email: "client@example.ma",
  role: "user",
}
const INPUT = {
  cityId: "42",
  address: "12 rue des Orangers",
  phone: "+212600000000",
  totalAffiche: 102500,
}

function formData(): FormData {
  const fd = new FormData()
  fd.append("cityId", INPUT.cityId)
  fd.append("address", INPUT.address)
  fd.append("phone", INPUT.phone)
  fd.append("totalAffiche", "1025.00")
  return fd
}

describe("placeOrderAction", () => {
  beforeEach(() => {
    sessionCouranteMock.mockReset()
    placeOrderMock.mockReset()
    updateProfileMock.mockReset()
    redirectMock.mockClear()
    vi.mocked(refresh).mockClear()
  })

  it("refuses an anonymous Compte client with a typed result instead of a redirect, without placing an order", async () => {
    sessionCouranteMock.mockResolvedValue(null)

    await expect(placeOrderAction({}, formData())).resolves.toEqual({
      unauthenticated: true,
    })
    expect(redirectMock).not.toHaveBeenCalled()
    expect(placeOrderMock).not.toHaveBeenCalled()
  })

  it.each([
    [
      "CheckoutValidationError",
      () => new CheckoutValidationError(["l'adresse est requise"]),
      "Données invalides : l'adresse est requise",
    ],
    ["EmptyCartError", () => new EmptyCartError(), "Votre panier est vide"],
    [
      "OutOfStockError",
      () =>
        new OutOfStockError([
          {
            productName: "Huile d'argan",
            variantName: "50 ml",
            requested: 3,
            available: 1,
          },
        ]),
      "Stock insuffisant : « Huile d'argan 50 ml » : 3 demandé(s), 1 disponible(s)",
    ],
    [
      "DeliveryCityNotFoundError",
      () => new DeliveryCityNotFoundError(),
      "Ville de livraison introuvable",
    ],
    [
      "DevisPériméError",
      () => new DevisPériméError(),
      "Le Total à payer a changé depuis l'affichage — vérifiez le nouveau montant, puis confirmez.",
    ],
  ])(
    "turns %s into { error } with its French message",
    async (_name, create, message) => {
      sessionCouranteMock.mockResolvedValue(SESSION_USER)
      placeOrderMock.mockRejectedValue(create())

      await expect(placeOrderAction({}, formData())).resolves.toEqual({
        error: message,
      })
    }
  )

  it("demande le rafraîchissement de la page sur le refus de Devis périmé, pour montrer le montant courant", async () => {
    sessionCouranteMock.mockResolvedValue(SESSION_USER)
    placeOrderMock.mockRejectedValue(new DevisPériméError())

    await expect(placeOrderAction({}, formData())).resolves.toEqual({
      error:
        "Le Total à payer a changé depuis l'affichage — vérifiez le nouveau montant, puis confirmez.",
    })
    expect(vi.mocked(refresh)).toHaveBeenCalledOnce()
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it("ne rafraîchit pas la page sur un autre refus ni sur un succès", async () => {
    sessionCouranteMock.mockResolvedValue(SESSION_USER)
    placeOrderMock.mockRejectedValue(new EmptyCartError())

    await placeOrderAction({}, formData())
    expect(vi.mocked(refresh)).not.toHaveBeenCalled()

    placeOrderMock.mockResolvedValue({ id: "cmd-1" })
    updateProfileMock.mockResolvedValue({})

    await expect(placeOrderAction({}, formData())).rejects.toMatchObject({
      name: "NEXT_REDIRECT",
    })
    expect(vi.mocked(refresh)).not.toHaveBeenCalled()
  })

  it.each([
    ["absent", (fd: FormData) => fd.delete("totalAffiche")],
    ["vide", (fd: FormData) => fd.set("totalAffiche", "")],
  ])(
    "refuse un total affiché %s par « Formulaire invalide », avant tout parsing",
    async (_cas, vider) => {
      sessionCouranteMock.mockResolvedValue(SESSION_USER)
      const fd = formData()
      vider(fd)

      await expect(placeOrderAction({}, fd)).resolves.toEqual({
        error: "Formulaire invalide",
      })
      expect(placeOrderMock).not.toHaveBeenCalled()
    }
  )

  it("refuse un total affiché mal formé par la validation du checkout, jamais comme un formulaire invalide", async () => {
    sessionCouranteMock.mockResolvedValue(SESSION_USER)
    const fd = formData()
    fd.set("totalAffiche", "douze euros")

    const state = await placeOrderAction({}, fd)

    expect(state.error).toMatch(/^Données invalides : /)
    expect(state.error).not.toBe("Formulaire invalide")
    expect(placeOrderMock).not.toHaveBeenCalled()
  })

  it("transporte le total affiché en MAD décimal jusqu'à l'entier de centimes de la commande", async () => {
    sessionCouranteMock.mockResolvedValue(SESSION_USER)
    placeOrderMock.mockResolvedValue({ id: "cmd-transport" })
    updateProfileMock.mockResolvedValue({})
    const fd = formData()
    fd.set("totalAffiche", "1040.55")

    await expect(placeOrderAction({}, fd)).rejects.toMatchObject({
      url: "/commande/confirmation/cmd-transport",
      name: "NEXT_REDIRECT",
    })
    expect(placeOrderMock).toHaveBeenCalledWith(SESSION_USER.id, {
      ...INPUT,
      totalAffiche: 104055,
    })
  })

  it("places the order, prefills the profile, and sends the Compte client to the confirmation destination", async () => {
    sessionCouranteMock.mockResolvedValue(SESSION_USER)
    placeOrderMock.mockResolvedValue({ id: "cmd-1" })
    updateProfileMock.mockResolvedValue({})

    await expect(placeOrderAction({}, formData())).rejects.toMatchObject({
      url: "/commande/confirmation/cmd-1",
      name: "NEXT_REDIRECT",
    })
    expect(placeOrderMock).toHaveBeenCalledWith(SESSION_USER.id, INPUT)
    expect(updateProfileMock).toHaveBeenCalledWith(SESSION_USER.id, {
      phone: INPUT.phone,
      address: INPUT.address,
      cityId: INPUT.cityId,
    })
  })

  it("swallows a failed profile prefill and still sends the Compte client to the confirmation destination", async () => {
    sessionCouranteMock.mockResolvedValue(SESSION_USER)
    placeOrderMock.mockResolvedValue({ id: "cmd-2" })
    updateProfileMock.mockRejectedValue(new Error("boom"))

    await expect(placeOrderAction({}, formData())).rejects.toMatchObject({
      url: "/commande/confirmation/cmd-2",
      name: "NEXT_REDIRECT",
    })
  })

  it("rethrows a plain error verbatim", async () => {
    sessionCouranteMock.mockResolvedValue(SESSION_USER)
    const boom = new Error("boom")
    placeOrderMock.mockRejectedValue(boom)

    await expect(placeOrderAction({}, formData())).rejects.toBe(boom)
  })
})
