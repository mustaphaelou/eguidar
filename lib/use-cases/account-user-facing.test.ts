import { describe, expect, it } from "vitest"

import { ProfileValidationError } from "@/lib/use-cases/account"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

const errorFactory: [string, () => unknown][] = [
  [
    "ProfileValidationError",
    () => new ProfileValidationError(["le téléphone est invalide"]),
  ],
]

describe.each(errorFactory)("%s", (_name, create) => {
  it("extends UserFacingError at its definition site", () => {
    expect(create()).toBeInstanceOf(UserFacingError)
  })
})
