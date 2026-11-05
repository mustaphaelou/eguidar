import { describe, expect, it } from "vitest"

import { resoudreBaseDeSonde } from "./base-de-sonde"

const BASE_DE_TEST = "postgresql://eguidar:eguidar@127.0.0.1:5433/eguidar_test"
const BASE_DE_SONDE =
  "postgresql://eguidar:eguidar@127.0.0.1:5433/eguidar_probe"

describe("la base de la sonde", () => {
  it("prend la base annoncée par `E2E_DATABASE_URL`", () => {
    expect(
      resoudreBaseDeSonde({
        E2E_DATABASE_URL: "postgresql://u:p@localhost:5432/eguidar_probe",
      })
    ).toBe("postgresql://u:p@localhost:5432/eguidar_probe")
  })

  it("dérive `eguidar_probe` de la base de test, sans la toucher", () => {
    expect(resoudreBaseDeSonde({ TEST_DATABASE_URL: BASE_DE_TEST })).toBe(
      BASE_DE_SONDE
    )
  })

  it("dérive `eguidar_probe` de la base de développement quand aucune base de test n'est déclarée", () => {
    expect(
      resoudreBaseDeSonde({
        DATABASE_URL: "postgresql://u:p@localhost:5432/eguidar?schema=public",
      })
    ).toBe("postgresql://u:p@localhost:5432/eguidar_probe?schema=public")
  })

  it("refuse la base de développement `eguidar`, même annoncée explicitement", () => {
    expect(() =>
      resoudreBaseDeSonde({
        E2E_DATABASE_URL: "postgresql://u:p@localhost:5432/eguidar",
      })
    ).toThrow(/refuse.*eguidar/i)
  })

  it("refuse la base de test `eguidar_test`, même annoncée explicitement", () => {
    expect(() =>
      resoudreBaseDeSonde({
        E2E_DATABASE_URL: "postgresql://u:p@localhost:5432/eguidar_test",
      })
    ).toThrow(/refuse.*eguidar_test/i)
  })

  it("refuse un nom de base qui n'est pas nommé", () => {
    expect(() =>
      resoudreBaseDeSonde({
        E2E_DATABASE_URL: "postgresql://u:p@localhost:5432/",
      })
    ).toThrow(/nom de base/i)
  })

  it("s'arrête quand aucune URL ne peut être lue", () => {
    expect(() => resoudreBaseDeSonde({})).toThrow(
      /E2E_DATABASE_URL|TEST_DATABASE_URL/
    )
  })
})
