import { describe, expect, it } from "vitest"

import { clientRedisPret, type ClientRedis } from "@/lib/redis"

function fauxClient(options: {
  isOpen: boolean
  connect?: () => Promise<void>
}): ClientRedis {
  return {
    isOpen: options.isOpen,
    connect: options.connect ?? (async () => {}),
  } as unknown as ClientRedis
}

describe("clientRedisPret", () => {
  it("rend null quand aucun client n'est configuré", async () => {
    await expect(clientRedisPret(() => null)).resolves.toBeNull()
  })

  it("laisse remonter une rejection de connexion", async () => {
    const echec = new Error("ECONNREFUSED")
    const client = fauxClient({
      isOpen: false,
      connect: async () => {
        throw echec
      },
    })

    await expect(clientRedisPret(() => client)).rejects.toBe(echec)
  })

  it("rend null quand le client n'est toujours pas ouvert après la connexion", async () => {
    const client = fauxClient({ isOpen: false })

    await expect(clientRedisPret(() => client)).resolves.toBeNull()
  })

  it("rend le client déjà ouvert sans le reconnecter", async () => {
    const client = fauxClient({
      isOpen: true,
      connect: async () => {
        throw new Error("connect ne doit pas être appelé")
      },
    })

    await expect(clientRedisPret(() => client)).resolves.toBe(client)
  })
})
