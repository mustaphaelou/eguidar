import { describe, expect, it } from "vitest"

import {
  loginUrl,
  parseAuthParams,
  signupUrl,
  withAuthParams,
  withoutAuthParams,
} from "./lien-de-connexion"

const OPEN_REDIRECT_CASES = [
  "//evil.example",
  "//evil.example/panier",
  "https://evil.example",
  "http://evil.example/panier",
  "javascript:alert(1)",
]

describe("loginUrl", () => {
  it("emits the final-form URL without a destination", () => {
    expect(loginUrl()).toBe("/?open=login")
  })

  it("percent-encodes the destination", () => {
    expect(loginUrl("/admin")).toBe("/?open=login&next=%2Fadmin")
    expect(loginUrl("/profil/commandes?page=2")).toBe(
      "/?open=login&next=%2Fprofil%2Fcommandes%3Fpage%3D2"
    )
  })

  it("drops an unsafe destination", () => {
    for (const unsafe of OPEN_REDIRECT_CASES) {
      expect(loginUrl(unsafe)).toBe("/?open=login")
    }
    expect(loginUrl("")).toBe("/?open=login")
  })
})

describe("signupUrl", () => {
  it("emits the final-form URL", () => {
    expect(signupUrl()).toBe("/?open=signup")
    expect(signupUrl("/profil")).toBe("/?open=signup&next=%2Fprofil")
  })

  it("drops an unsafe destination", () => {
    for (const unsafe of OPEN_REDIRECT_CASES) {
      expect(signupUrl(unsafe)).toBe("/?open=signup")
    }
    expect(signupUrl("")).toBe("/?open=signup")
  })
})

describe("parseAuthParams", () => {
  it("round-trips builder output given as a search string", () => {
    const url = loginUrl("/admin")
    const search = url.slice(url.indexOf("?"))

    expect(parseAuthParams(search)).toEqual({
      dialog: "login",
      next: "/admin",
    })
  })

  it("round-trips builder output given as URLSearchParams", () => {
    const url = signupUrl("/profil")
    const search = new URLSearchParams(url.slice(url.indexOf("?")))

    expect(parseAuthParams(search)).toEqual({
      dialog: "signup",
      next: "/profil",
    })
  })

  it("decodes a destination that carries its own query", () => {
    expect(parseAuthParams("?open=login&next=%2Fprofil%2Fcommandes%3Fpage%3D2")).toEqual({
      dialog: "login",
      next: "/profil/commandes?page=2",
    })
  })

  it("yields nulls for absent parameters", () => {
    expect(parseAuthParams("")).toEqual({ dialog: null, next: null })
    expect(parseAuthParams("?q=chaussures&tri=prix-asc")).toEqual({
      dialog: null,
      next: null,
    })
  })

  it("yields a null dialog for unknown open values", () => {
    expect(parseAuthParams("?open=checkout")).toEqual({ dialog: null, next: null })
    expect(parseAuthParams("?open=")).toEqual({ dialog: null, next: null })
  })

  it("yields a null destination for unsafe values", () => {
    for (const unsafe of OPEN_REDIRECT_CASES) {
      expect(parseAuthParams(`?open=login&next=${unsafe}`)).toEqual({
        dialog: "login",
        next: null,
      })
    }
    expect(parseAuthParams("?open=login&next=")).toEqual({
      dialog: "login",
      next: null,
    })
  })
})

describe("withAuthParams", () => {
  it("overwrites both parameters in one call and preserves the others", () => {
    expect(
      withAuthParams(
        "/recherche?q=chaussure&tri=prix-asc&open=login&next=%2Fpanier",
        { dialog: "signup", next: "/commandes" }
      )
    ).toBe("/recherche?q=chaussure&tri=prix-asc&open=signup&next=%2Fcommandes")
  })

  it("adds the parameters to a URL that has none", () => {
    expect(
      withAuthParams("/recherche?q=chaussure", {
        dialog: "login",
        next: "/recherche?q=chaussure&tri=prix-asc",
      })
    ).toBe(
      "/recherche?q=chaussure&open=login&next=%2Frecherche%3Fq%3Dchaussure%26tri%3Dprix-asc"
    )
  })

  it("leaves a parameter untouched when its option is omitted", () => {
    expect(withAuthParams("/", { dialog: "signup" })).toBe("/?open=signup")
    expect(withAuthParams("/compte?open=login&next=%2Fpanier", { next: "/commandes" })).toBe(
      "/compte?open=login&next=%2Fcommandes"
    )
  })

  it("treats an absolute URL as its same-site path", () => {
    expect(
      withAuthParams("https://boutique.example/panier?open=login", {
        dialog: "signup",
      })
    ).toBe("/panier?open=signup")
  })

  it("fails closed on an unsafe destination", () => {
    for (const unsafe of OPEN_REDIRECT_CASES) {
      expect(withAuthParams("/", { dialog: "login", next: unsafe })).toBe(
        "/?open=login"
      )
    }
    expect(
      withAuthParams("/?next=%2Fpanier", { dialog: "login", next: "//evil.example" })
    ).toBe("/?open=login")
    expect(
      withAuthParams("/compte?next=%2Fpanier", { dialog: "login", next: "" })
    ).toBe("/compte?open=login")
  })

  it("matches builder output", () => {
    expect(withAuthParams("/", { dialog: "login" })).toBe(loginUrl())
    expect(withAuthParams("/", { dialog: "signup", next: "/admin" })).toBe(
      signupUrl("/admin")
    )
  })
})

describe("withoutAuthParams", () => {
  it("removes only the dialog parameter", () => {
    expect(withoutAuthParams("/recherche?q=chaussure&open=login&next=%2Fpanier")).toBe(
      "/recherche?q=chaussure&next=%2Fpanier"
    )
  })

  it("leaves URLs without a dialog parameter unchanged", () => {
    expect(withoutAuthParams("/compte?onglet=commandes")).toBe(
      "/compte?onglet=commandes"
    )
    expect(withoutAuthParams("/")).toBe("/")
  })
})
