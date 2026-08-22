import { describe, expect, it } from "vitest"

import {
  signInSchema,
  signUpSchema,
} from "./auth-form-schemas"

describe("signInSchema", () => {
  it("requires an email", () => {
    const result = signInSchema.safeParse({ email: "", password: "x" })
    expect(result.success).toBe(false)
    if (!result.success) {
      const emailIssue = result.error.issues.find(
        (issue) => issue.path[0] === "email"
      )
      expect(emailIssue?.message).toBe("Saisissez votre adresse e-mail.")
    }
  })

  it("rejects malformed emails", () => {
    const result = signInSchema.safeParse({
      email: "pas-un-email",
      password: "x",
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const emailIssue = result.error.issues.find(
        (issue) => issue.path[0] === "email"
      )
      expect(emailIssue?.message).toBe(
        "Saisissez une adresse e-mail valide."
      )
    }
  })

  it("does not enforce a minimum password length on login", () => {
    const result = signInSchema.safeParse({
      email: "a@b.ma",
      password: "court",
    })
    expect(result.success).toBe(true)
  })

  it("trims the email", () => {
    const result = signInSchema.safeParse({
      email: "  a@b.ma  ",
      password: "peu-importe",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.email).toBe("a@b.ma")
    }
  })
})

describe("signUpSchema", () => {
  it("requires a name", () => {
    const result = signUpSchema.safeParse({
      name: "",
      email: "a@b.ma",
      password: "motdepasse",
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const nameIssue = result.error.issues.find(
        (issue) => issue.path[0] === "name"
      )
      expect(nameIssue?.message).toBe("Saisissez votre nom complet.")
    }
  })

  it("enforces a minimum password length of 8 on signup", () => {
    const result = signUpSchema.safeParse({
      name: "Salma",
      email: "a@b.ma",
      password: "court",
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const passwordIssue = result.error.issues.find(
        (issue) => issue.path[0] === "password"
      )
      expect(passwordIssue?.message).toBe(
        "Le mot de passe doit contenir au moins 8 caractères."
      )
    }
  })

  it("accepts a valid signup", () => {
    const result = signUpSchema.safeParse({
      name: " Salma Bennani ",
      email: "salma@example.ma",
      password: "motdepasse",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe("Salma Bennani")
    }
  })
})
