import { beforeEach, describe, expect, it, vi } from "vitest"

import { realLivraisonEffects } from "@/lib/use-cases/livraison-effects"

vi.mock("@/lib/use-cases/cache-invalidation", () => ({
  invalidateLivraison: vi.fn(),
}))

import { invalidateLivraison } from "@/lib/use-cases/cache-invalidation"

describe("realLivraisonEffects revalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("delegates shipping revalidation to invalidateLivraison", () => {
    realLivraisonEffects.revalidateShipping()

    expect(invalidateLivraison).toHaveBeenCalledOnce()
  })
})
