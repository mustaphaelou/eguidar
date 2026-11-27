import { describe, expect, it } from "vitest"

import { AnnonceValidationError } from "@/lib/use-cases/annonce"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

describe("AnnonceValidationError", () => {
  it("extends UserFacingError at its definition site", () => {
    expect(new AnnonceValidationError(["message requis"])).toBeInstanceOf(
      UserFacingError
    )
  })
})
