import { describe, expect, it } from "vitest"
import { NextRequest } from "next/server"

import { loginUrl, signupUrl } from "@/lib/lien-de-connexion"

import { proxy } from "./proxy"

const ORIGIN = "http://localhost:3000"

function request(path: string) {
  return new NextRequest(new URL(path, ORIGIN))
}

function absolute(url: string) {
  return new URL(url, ORIGIN).toString()
}

function loggedInRequest(path: string) {
  return new NextRequest(new URL(path, ORIGIN), {
    headers: { cookie: "better-auth.session_token=abc" },
  })
}

describe("proxy", () => {
  describe("inbound legacy /connexion and /inscription links", () => {
    it("lands /connexion on the home page with the Connexion dialog open", () => {
      const res = proxy(request("/connexion"))

      expect(res.status).toBe(307)
      expect(res.headers.get("location")).toBe(absolute(loginUrl()))
    })

    it("preserves a validated destination on /connexion", () => {
      const res = proxy(request("/connexion?next=/panier"))

      expect(res.headers.get("location")).toBe(absolute(loginUrl("/panier")))
    })

    it("silently drops an invalid destination on /connexion", () => {
      const res = proxy(request("/connexion?next=//evil.example"))

      expect(res.headers.get("location")).toBe(absolute(loginUrl()))
    })

    it("drops an empty destination on /connexion", () => {
      const res = proxy(request("/connexion?next="))

      expect(res.headers.get("location")).toBe(absolute(loginUrl()))
    })

    it("lands /inscription on the home page with the Inscription dialog open", () => {
      const res = proxy(request("/inscription"))

      expect(res.status).toBe(307)
      expect(res.headers.get("location")).toBe(absolute(signupUrl()))
    })

    it("preserves a validated destination on /inscription", () => {
      const res = proxy(request("/inscription?next=/profil"))

      expect(res.headers.get("location")).toBe(absolute(signupUrl("/profil")))
    })
  })

  describe("guarded access when logged out", () => {
    it("takes one redirect straight to the final-form login URL for a back-office section", () => {
      const res = proxy(request("/admin/produits"))

      expect(res.status).toBe(307)
      expect(res.headers.get("location")).toBe(
        absolute(loginUrl("/admin/produits"))
      )
    })

    it("takes one redirect straight to the final-form login URL for a compte section", () => {
      const res = proxy(request("/compte/commandes?page=2"))

      expect(res.status).toBe(307)
      expect(res.headers.get("location")).toBe(
        absolute(loginUrl("/compte/commandes?page=2"))
      )
    })
  })

  it("does not redirect guarded paths when a session cookie exists", () => {
    const res = proxy(loggedInRequest("/admin/produits"))

    expect(res.status).toBe(200)
  })
})
