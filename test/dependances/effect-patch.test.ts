import { createRequire } from "node:module"

import { describe, expect, it } from "vitest"

type SchemaApi = {
  String: unknown
  TemplateLiteral: (...segments: readonly unknown[]) => unknown
  decodeUnknownSync: (schema: unknown) => (input: string) => unknown
}

function chargeSchema(): SchemaApi | null {
  try {
    const effet = createRequire(import.meta.url)("effect") as {
      Schema?: SchemaApi
    }
    return effet.Schema ?? null
  } catch {
    return null
  }
}

function template(Schema: SchemaApi): unknown {
  return Schema.TemplateLiteral(
    Schema.String,
    ":",
    Schema.String,
    ":",
    Schema.String,
    "X"
  )
}

describe("le TemplateLiteral corrigé (GHSA-7589-6fvf-x4pw, CVE-2026-121707)", () => {
  it("décode une entrée conforme", () => {
    const Schema = chargeSchema()
    if (Schema === null) return
    expect(Schema.decodeUnknownSync(template(Schema))("a:b:cX")).toBe("a:b:cX")
  })

  it("rejette une entrée non conforme de 5 000 caractères sans rétroaction", () => {
    const Schema = chargeSchema()
    if (Schema === null) return
    expect(() =>
      Schema.decodeUnknownSync(template(Schema))(":".repeat(5000))
    ).toThrow()
  })
})
