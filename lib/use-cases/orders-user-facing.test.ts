import { describe, expect, it } from "vitest"

import {
  InvalidOrderTransitionError,
  OrderNotFoundError,
} from "@/lib/use-cases/orders"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

describe.each([
  ["OrderNotFoundError", () => new OrderNotFoundError()],
  [
    "InvalidOrderTransitionError",
    () => new InvalidOrderTransitionError("pending", "shipped"),
  ],
])("%s", (_name, create) => {
  it("stays a plain error so the run callback owns the refusal branch", () => {
    expect(create()).not.toBeInstanceOf(UserFacingError)
  })
})
