import { describe, expect, it } from "vitest"

import {
  CartItemNotFoundError,
  CartValidationError,
  CartVariantNotFoundError,
} from "@/lib/panier"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

const errorFactory: [string, () => unknown][] = [
  [
    "CartValidationError",
    () => new CartValidationError(["la quantité doit être au moins 1"]),
  ],
  ["CartVariantNotFoundError", () => new CartVariantNotFoundError()],
  ["CartItemNotFoundError", () => new CartItemNotFoundError()],
]

describe.each(errorFactory)("%s", (_name, create) => {
  it("extends UserFacingError at its definition site", () => {
    expect(create()).toBeInstanceOf(UserFacingError)
  })
})
