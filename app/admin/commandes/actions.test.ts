import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Client } from "@/lib/use-cases/session-courante"
import { sessionCouranteMock, redirectMock } from "@/test/navigation-mocks"

const { updateOrderStatusMock } = vi.hoisted(() => ({
  updateOrderStatusMock: vi.fn(),
}))

vi.mock("next/navigation", async () => {
  const h = await import("@/test/navigation-mocks")
  return { redirect: h.redirectMock }
})
vi.mock("@/lib/use-cases/session-courante", async (importOriginal) => {
  const h = await import("@/test/navigation-mocks")
  return {
    ...(await importOriginal<
      typeof import("@/lib/use-cases/session-courante")
    >()),
    lireSession: h.sessionCouranteMock,
  }
})
vi.mock("@/lib/use-cases/orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/use-cases/orders")>()),
  updateOrderStatus: updateOrderStatusMock,
}))

import { updateOrderStatusAction } from "@/app/admin/commandes/actions"
import { InvalidOrderTransitionError } from "@/lib/use-cases/orders"

const ADMIN_SESSION: Client = {
  id: "2",
  name: "Admin Test",
  email: "admin@example.ma",
  role: "admin",
}

function formData(nextStatus: string): FormData {
  const fd = new FormData()
  fd.append("orderId", "cmd-1")
  fd.append("nextStatus", nextStatus)
  return fd
}

describe("updateOrderStatusAction", () => {
  beforeEach(() => {
    sessionCouranteMock.mockReset()
    updateOrderStatusMock.mockReset()
    redirectMock.mockClear()
  })

  it("swallows a malformed statut token silently without delegating", async () => {
    sessionCouranteMock.mockResolvedValue(ADMIN_SESSION)

    await expect(
      updateOrderStatusAction(formData("jeton-bidon"))
    ).resolves.toBeUndefined()
    expect(updateOrderStatusMock).not.toHaveBeenCalled()
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it("redirects a genuine domain refusal to the order's refusal banner", async () => {
    sessionCouranteMock.mockResolvedValue(ADMIN_SESSION)
    updateOrderStatusMock.mockRejectedValue(
      new InvalidOrderTransitionError("shipped", "cancelled")
    )

    await expect(
      updateOrderStatusAction(formData("cancelled"))
    ).rejects.toMatchObject({
      url: "/admin/commandes/cmd-1?transition=refusee",
      name: "NEXT_REDIRECT",
    })
    expect(redirectMock).toHaveBeenCalledWith(
      "/admin/commandes/cmd-1?transition=refusee"
    )
  })

  it("delegates a valid submission exactly once with the parsed statut", async () => {
    sessionCouranteMock.mockResolvedValue(ADMIN_SESSION)
    updateOrderStatusMock.mockResolvedValue({})

    await expect(
      updateOrderStatusAction(formData("confirmed"))
    ).rejects.toMatchObject({
      url: "/admin/commandes/cmd-1",
      name: "NEXT_REDIRECT",
    })
    expect(updateOrderStatusMock).toHaveBeenCalledTimes(1)
    expect(updateOrderStatusMock).toHaveBeenCalledWith("cmd-1", "confirmed")
  })
})
