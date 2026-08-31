import { describe, expect, it } from "vitest"

import { Prisma } from "@/lib/generated/prisma/client"
import {
  decodeP2002Fields,
  hasUniqueViolation,
} from "@/lib/use-cases/unique-violation"

function p2002(
  meta: Record<string, unknown> = {}
): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "7.9.1",
    meta,
  })
}

describe("decodeP2002Fields", () => {
  it("returns the target fields from meta.target", () => {
    expect(decodeP2002Fields(p2002({ target: ["slug"] }))).toEqual(["slug"])
  })

  it("returns fields from driverAdapterError.cause.constraint.fields when meta.target is absent", () => {
    expect(
      decodeP2002Fields(
        p2002({
          driverAdapterError: {
            cause: { constraint: { fields: ["slug"] } },
          },
        })
      )
    ).toEqual(["slug"])
  })

  it("prefers meta.target when both dialects are present", () => {
    expect(
      decodeP2002Fields(
        p2002({
          target: ["name"],
          driverAdapterError: { cause: { constraint: { fields: ["slug"] } } },
        })
      )
    ).toEqual(["name"])
  })

  it("returns [] for a non-P2002 code", () => {
    const other = new Prisma.PrismaClientKnownRequestError(
      "Foreign key constraint failed",
      {
        code: "P2003",
        clientVersion: "7.9.1",
      }
    )
    expect(decodeP2002Fields(other)).toEqual([])
  })

  it("returns [] for errors that are not Prisma known errors", () => {
    expect(decodeP2002Fields(new Error("boom"))).toEqual([])
    expect(decodeP2002Fields(null)).toEqual([])
    expect(decodeP2002Fields(undefined)).toEqual([])
  })

  it("returns [] when neither dialect carries fields", () => {
    expect(decodeP2002Fields(p2002({}))).toEqual([])
    expect(
      decodeP2002Fields(
        p2002({ driverAdapterError: { cause: { constraint: { fields: [] } } } })
      )
    ).toEqual([])
  })
})

describe("hasUniqueViolation", () => {
  it("is true when the decoded fields intersect the target fields", () => {
    expect(
      hasUniqueViolation(p2002({ target: ["slug", "sku"] }), ["slug"])
    ).toBe(true)
    expect(
      hasUniqueViolation(p2002({ target: ["sku"] }), ["sku", "slug"])
    ).toBe(true)
  })

  it("is false when the decoded fields do not intersect", () => {
    expect(hasUniqueViolation(p2002({ target: ["name"] }), ["slug"])).toBe(
      false
    )
  })

  it("is false for non-P2002 errors", () => {
    expect(hasUniqueViolation(new Error("boom"), ["slug"])).toBe(false)
  })
})
