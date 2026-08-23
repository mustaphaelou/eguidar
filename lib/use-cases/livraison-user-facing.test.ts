import { describe, expect, it } from "vitest"

import {
  CityNameConflictError,
  CityNotFoundError,
  CityValidationError,
  ShippingValidationError,
} from "@/lib/use-cases/livraison"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

const errorFactory: [string, () => unknown][] = [
  ["CityValidationError", () => new CityValidationError(["nom requis"])],
  ["CityNameConflictError", () => new CityNameConflictError()],
  ["CityNotFoundError", () => new CityNotFoundError()],
  [
    "ShippingValidationError",
    () => new ShippingValidationError(["le seuil de livraison offerte doit être positif"]),
  ],
]

describe.each(errorFactory)("%s", (_name, create) => {
  it("extends UserFacingError at its definition site", () => {
    expect(create()).toBeInstanceOf(UserFacingError)
  })
})
