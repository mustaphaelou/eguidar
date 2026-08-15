import { describe, expect, it } from "vitest"
import { NextRequest } from "next/server"

import { proxy } from "./proxy"

function request(path: string) {
  return new NextRequest(new URL(path, "http://localhost:3000"))
}

describe("proxy", () => {
  it("redirects /connexion to /?open=login", () => {
    const res = proxy(request("/connexion"))

    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("http://localhost:3000/?open=login")
  })

  it("preserves a validated next param on /connexion", () => {
    const res = proxy(request("/connexion?next=/panier"))

    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/?open=login&next=%2Fpanier"
    )
  })

  it("drops an invalid next param on /connexion", () => {
    const res = proxy(request("/connexion?next=//evil.example"))

    expect(res.headers.get("location")).toBe("http://localhost:3000/?open=login")
  })

  it("redirects /inscription to /?open=signup", () => {
    const res = proxy(request("/inscription"))

    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("http://localhost:3000/?open=signup")
  })

  it("preserves a validated next param on /inscription", () => {
    const res = proxy(request("/inscription?next=/profil"))

    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/?open=signup&next=%2Fprofil"
    )
  })

  it("does not redirect other paths when a session cookie exists", () => {
    const res = proxy(
      new NextRequest("http://localhost:3000/produits", {
        headers: { cookie: "better-auth.session_token=abc" },
      })
    )

    expect(res.status).toBe(200)
  })
})
