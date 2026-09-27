import { describe, expect, it } from "vitest"

import {
  CityNameConflictError,
  CityNotFoundError,
  CitySlugConflictError,
  CityValidationError,
  ShippingValidationError,
} from "@/lib/use-cases/livraison"
import { DeliveryCityNotFoundError } from "@/lib/use-cases/livraison-prix"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

const errorFactory: [string, () => unknown][] = [
  ["CityValidationError", () => new CityValidationError(["nom requis"])],
  ["CityNameConflictError", () => new CityNameConflictError()],
  ["CitySlugConflictError", () => new CitySlugConflictError()],
  ["CityNotFoundError", () => new CityNotFoundError()],
  ["DeliveryCityNotFoundError", () => new DeliveryCityNotFoundError()],
  [
    "ShippingValidationError",
    () =>
      new ShippingValidationError([
        "le seuil de livraison offerte doit être positif",
      ]),
  ],
]

describe.each(errorFactory)("%s", (_name, create) => {
  it("extends UserFacingError at its definition site", () => {
    expect(create()).toBeInstanceOf(UserFacingError)
  })
})
