import { beforeEach, describe, expect, it, vi } from "vitest"

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
import { DeliveryCityNotFoundError } from "@/lib/use-cases/livraison"
import {
  CheckoutValidationError,
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
}

function formData(): FormData {
  const fd = new FormData()
  fd.append("cityId", INPUT.cityId)
  fd.append("address", INPUT.address)
  fd.append("phone", INPUT.phone)
  return fd
}

describe("placeOrderAction", () => {
  beforeEach(() => {
    sessionCouranteMock.mockReset()
    placeOrderMock.mockReset()
    updateProfileMock.mockReset()
    redirectMock.mockClear()
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
