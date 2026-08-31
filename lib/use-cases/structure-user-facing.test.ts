import { describe, expect, it } from "vitest"

import {
  CategoryHasChildrenError,
  CategoryHasProductsError,
  CategoryNotFoundError,
  CategorySlugConflictError,
  CategoryValidationError,
} from "@/lib/use-cases/admin-structure"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

const errorFactory: [string, () => unknown][] = [
  [
    "CategoryValidationError",
    () => new CategoryValidationError(["slug requis"]),
  ],
  ["CategorySlugConflictError", () => new CategorySlugConflictError()],
  ["CategoryNotFoundError", () => new CategoryNotFoundError()],
  ["CategoryHasChildrenError", () => new CategoryHasChildrenError()],
  ["CategoryHasProductsError", () => new CategoryHasProductsError(2)],
]

describe.each(errorFactory)("%s", (_name, create) => {
  it("extends UserFacingError at its definition site", () => {
    expect(create()).toBeInstanceOf(UserFacingError)
  })
})
