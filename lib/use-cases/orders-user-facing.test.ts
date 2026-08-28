import { describe, expect, it } from "vitest"

import {
  CheckoutValidationError,
  EmptyCartError,
  InvalidOrderTransitionError,
  OrderNotFoundError,
  OutOfStockError,
} from "@/lib/use-cases/orders"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

describe.each([
  ["OrderNotFoundError", () => new OrderNotFoundError()],
  [
    "InvalidOrderTransitionError",
    () => new InvalidOrderTransitionError("pending", "shipped"),
  ],
  [
    "CheckoutValidationError",
    () => new CheckoutValidationError(["ville de livraison requise"]),
  ],
  ["EmptyCartError", () => new EmptyCartError()],
  [
    "OutOfStockError",
    () =>
      new OutOfStockError([
        {
          productName: "Thé vert",
          variantName: "Menthe",
          requested: 2,
          available: 1,
        },
      ]),
  ],
])("%s", (_name, create) => {
  it("extends UserFacingError at its definition site", () => {
    expect(create()).toBeInstanceOf(UserFacingError)
  })
})
