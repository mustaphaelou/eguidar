import { describe, expect, it } from "vitest"

import {
  CatalogValidationError,
  DraftConflictError,
  DraftExpiredError,
  DraftPromotionRefusedError,
  DraftRegistryUnavailableError,
  DuplicateSkuError,
  ImageStorageUnavailableError,
  ProductNotFoundError,
  SlugConflictError,
  VariantNotFoundError,
} from "@/lib/use-cases/admin-catalog"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

const errorFactory: [string, () => unknown][] = [
  ["CatalogValidationError", () => new CatalogValidationError(["nom requis"])],
  ["SlugConflictError", () => new SlugConflictError()],
  ["DuplicateSkuError", () => new DuplicateSkuError()],
  ["DraftPromotionRefusedError", () => new DraftPromotionRefusedError("refus")],
  ["DraftExpiredError", () => new DraftExpiredError("expiré")],
  ["DraftConflictError", () => new DraftConflictError("conflit")],
  [
    "ImageStorageUnavailableError",
    () => new ImageStorageUnavailableError("stockage indisponible"),
  ],
  [
    "DraftRegistryUnavailableError",
    () => new DraftRegistryUnavailableError("registre indisponible"),
  ],
]

describe.each(errorFactory)("%s", (_name, create) => {
  it("extends UserFacingError at its definition site", () => {
    expect(create()).toBeInstanceOf(UserFacingError)
  })
})

describe.each([
  ["ProductNotFoundError", () => new ProductNotFoundError()],
  ["VariantNotFoundError", () => new VariantNotFoundError()],
])("%s", (_name, create) => {
  it("stays a plain error so it bubbles from task paths", () => {
    expect(create()).not.toBeInstanceOf(UserFacingError)
  })
})
