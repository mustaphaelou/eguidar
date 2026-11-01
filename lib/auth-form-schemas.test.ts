import { describe, expect, it } from "vitest"

import {
  resetPasswordSchema,
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
      expect(emailIssue?.message).toBe("Saisissez une adresse e-mail valide.")
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

  it("refuses a password shorter than the 15-character floor", () => {
    const result = signUpSchema.safeParse({
      name: "Salma",
      email: "a@b.ma",
      password: "MotDePasse!123",
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const passwordIssue = result.error.issues.find(
        (issue) => issue.path[0] === "password"
      )
      expect(passwordIssue?.message).toBe(
        "Le mot de passe doit contenir au moins 15 caractères."
      )
    }
  })

  it("accepts a password of exactly 15 characters", () => {
    const result = signUpSchema.safeParse({
      name: "Salma",
      email: "a@b.ma",
      password: "MotDePasse!1234",
    })

    expect(result.success).toBe(true)
  })

  it("accepts a valid signup", () => {
    const result = signUpSchema.safeParse({
      name: " Salma Bennani ",
      email: "salma@example.ma",
      password: "motdepasse12345",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe("Salma Bennani")
    }
  })
})

describe("resetPasswordSchema", () => {
  it("refuses a password shorter than the 15-character floor", () => {
    const result = resetPasswordSchema.safeParse({
      password: "MotDePasse!123",
      confirmPassword: "MotDePasse!123",
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      const passwordIssue = result.error.issues.find(
        (issue) => issue.path[0] === "password"
      )
      expect(passwordIssue?.message).toBe(
        "Le mot de passe doit contenir au moins 15 caractères."
      )
    }
  })

  it("accepts a password of exactly 15 characters when both entries match", () => {
    const result = resetPasswordSchema.safeParse({
      password: "MotDePasse!1234",
      confirmPassword: "MotDePasse!1234",
    })

    expect(result.success).toBe(true)
  })

  it("refuses two different passwords", () => {
    const result = resetPasswordSchema.safeParse({
      password: "MotDePasse!1234",
      confirmPassword: "AutreMotDePasse!1",
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      const confirmIssue = result.error.issues.find(
        (issue) => issue.path[0] === "confirmPassword"
      )
      expect(confirmIssue?.message).toBe(
        "Les mots de passe ne correspondent pas."
      )
    }
  })
})
