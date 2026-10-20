import { describe, expect, it } from "vitest"

import {
  loginUrl,
  parseAuthParams,
  signupUrl,
  urlWouldChange,
  withAuthParams,
  withoutAuthSearchParams,
} from "./lien-de-connexion"

const OPEN_REDIRECT_CASES = [
  "//evil.example",
  "//evil.example/panier",
  "https://evil.example",
  "http://evil.example/panier",
  "javascript:alert(1)",
]

const UNSAFE_DESTINATION_CHARS_CASES = [
  "/\\evil.example",
  "/\\/evil.example",
  "/produit\\atlas",
  "/%5Cevil.example",
  "/%5c/evil.example",
  "/%5C%5Cevil.example",
  "/\t/evil.example",
  "/\n/evil.example",
  "/\r/evil.example",
  "/%09/evil.example",
  "/%0A/evil.example",
  "/%0D/evil.example",
  "/\u0000/evil.example",
  "/%00evil.example",
  "/\u000b/evil.example",
  "/%0B/evil.example",
  "/\u000c/evil.example",
  "/%0C/evil.example",
  "/\u007f/evil.example",
  "/%7Fevil.example",
]

const UNSAFE_DESTINATION_CASES = [
  ...OPEN_REDIRECT_CASES,
  ...UNSAFE_DESTINATION_CHARS_CASES,
  "/%2Fevil.example",
  "/%2f%2fevil.example",
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

  it("keeps a destination carrying a legitimate space", () => {
    expect(loginUrl("/recherche?q=deux%20mots")).toBe(
      "/?open=login&next=%2Frecherche%3Fq%3Ddeux%2520mots"
    )
    expect(loginUrl("/recherche?q=deux mots")).toBe(
      "/?open=login&next=%2Frecherche%3Fq%3Ddeux+mots"
    )
  })

  it("drops an unsafe destination", () => {
    for (const unsafe of UNSAFE_DESTINATION_CASES) {
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
    for (const unsafe of UNSAFE_DESTINATION_CASES) {
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
      open: "login",
      dialog: "login",
      next: "/admin",
    })
  })

  it("round-trips builder output given as URLSearchParams", () => {
    const url = signupUrl("/profil")
    const search = new URLSearchParams(url.slice(url.indexOf("?")))

    expect(parseAuthParams(search)).toEqual({
      open: "signup",
      dialog: "signup",
      next: "/profil",
    })
  })

  it("decodes a destination that carries its own query", () => {
    expect(
      parseAuthParams("?open=login&next=%2Fprofil%2Fcommandes%3Fpage%3D2")
    ).toEqual({
      open: "login",
      dialog: "login",
      next: "/profil/commandes?page=2",
    })
  })

  it("round-trips a destination carrying a literal percent sign", () => {
    const url = loginUrl("/recherche?q=100%")

    expect(url).toBe("/?open=login&next=%2Frecherche%3Fq%3D100%25")
    expect(parseAuthParams(url.slice(url.indexOf("?")))).toEqual({
      open: "login",
      dialog: "login",
      next: "/recherche?q=100%",
    })
  })

  it("yields nulls for absent parameters", () => {
    expect(parseAuthParams("")).toEqual({
      open: null,
      dialog: null,
      next: null,
    })
    expect(parseAuthParams("?q=chaussures&tri=prix-asc")).toEqual({
      open: null,
      dialog: null,
      next: null,
    })
  })

  it("yields a null dialog for unknown open values", () => {
    expect(parseAuthParams("?open=checkout")).toEqual({
      open: "checkout",
      dialog: null,
      next: null,
    })
    expect(parseAuthParams("?open=")).toEqual({
      open: "",
      dialog: null,
      next: null,
    })
  })

  it("yields a null destination for unsafe values", () => {
    for (const unsafe of UNSAFE_DESTINATION_CASES) {
      expect(parseAuthParams(`?open=login&next=${unsafe}`)).toEqual({
        open: "login",
        dialog: "login",
        next: null,
      })
    }
    expect(parseAuthParams("?open=login&next=")).toEqual({
      open: "login",
      dialog: "login",
      next: null,
    })
  })

  it("keeps a destination carrying a legitimate space, raw or percent-encoded", () => {
    expect(
      parseAuthParams("?open=login&next=%2Frecherche%3Fq%3Ddeux%2520mots")
    ).toEqual({
      open: "login",
      dialog: "login",
      next: "/recherche?q=deux%20mots",
    })
    expect(
      parseAuthParams("?open=login&next=%2Frecherche%3Fq%3Ddeux%20mots")
    ).toEqual({
      open: "login",
      dialog: "login",
      next: "/recherche?q=deux mots",
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
    expect(
      withAuthParams("/compte?open=login&next=%2Fpanier", {
        next: "/commandes",
      })
    ).toBe("/compte?open=login&next=%2Fcommandes")
  })

  it("treats an absolute URL as its same-site path", () => {
    expect(
      withAuthParams("https://boutique.example/panier?open=login", {
        dialog: "signup",
      })
    ).toBe("/panier?open=signup")
  })

  it("fails closed on an unsafe destination", () => {
    for (const unsafe of UNSAFE_DESTINATION_CASES) {
      expect(withAuthParams("/", { dialog: "login", next: unsafe })).toBe(
        "/?open=login"
      )
    }
    expect(
      withAuthParams("/?next=%2Fpanier", {
        dialog: "login",
        next: "//evil.example",
      })
    ).toBe("/?open=login")
    expect(
      withAuthParams("/compte?next=%2Fpanier", { dialog: "login", next: "" })
    ).toBe("/compte?open=login")
  })

  it("keeps a legitimate destination exactly as written", () => {
    expect(
      withAuthParams("/", { dialog: "login", next: "/recherche?q=100%" })
    ).toBe("/?open=login&next=%2Frecherche%3Fq%3D100%25")
    expect(
      withAuthParams("/", {
        dialog: "login",
        next: "/produit/tshirt-%C3%A9t%C3%A9",
      })
    ).toBe("/?open=login&next=%2Fproduit%2Ftshirt-%25C3%25A9t%25C3%25A9")
  })

  it("keeps a legitimate destination carrying a space", () => {
    expect(
      withAuthParams("/", {
        dialog: "login",
        next: "/recherche?q=deux%20mots",
      })
    ).toBe("/?open=login&next=%2Frecherche%3Fq%3Ddeux%2520mots")
    expect(
      withAuthParams("/", { dialog: "login", next: "/recherche?q=deux mots" })
    ).toBe("/?open=login&next=%2Frecherche%3Fq%3Ddeux+mots")
  })

  it("matches builder output", () => {
    expect(withAuthParams("/", { dialog: "login" })).toBe(loginUrl())
    expect(withAuthParams("/", { dialog: "signup", next: "/admin" })).toBe(
      signupUrl("/admin")
    )
  })
})

describe("withoutAuthSearchParams", () => {
  it("maps an empty search to an empty result", () => {
    expect(withoutAuthSearchParams("")).toBe("")
    expect(withoutAuthSearchParams(new URLSearchParams())).toBe("")
  })

  it("strips a single auth parameter from a URL", () => {
    expect(withoutAuthSearchParams("/?open=login")).toBe("/")
    expect(withoutAuthSearchParams("/panier?next=%2Fprofil")).toBe("/panier")
  })

  it("strips both parameters while preserving unrelated ones", () => {
    expect(
      withoutAuthSearchParams(
        "/recherche?q=chaussure&tri=prix-asc&open=login&next=%2Fpanier"
      )
    ).toBe("/recherche?q=chaussure&tri=prix-asc")
    expect(
      withoutAuthSearchParams(
        "/recherche?q=chaussure&open=signup&tri=prix-asc&next=%2Fpanier&page=2"
      )
    ).toBe("/recherche?q=chaussure&tri=prix-asc&page=2")
  })

  it("preserves the hash", () => {
    expect(
      withoutAuthSearchParams("/produit/atlas?open=signup&next=%2Fpanier#avis")
    ).toBe("/produit/atlas#avis")
  })

  it("cleans a search string in place", () => {
    expect(
      withoutAuthSearchParams("?open=login&next=%2Fpanier&q=chaussure")
    ).toBe("?q=chaussure")
    expect(withoutAuthSearchParams("?open=login")).toBe("")
  })

  it("decodes and drops an encoded destination", () => {
    expect(
      withoutAuthSearchParams(
        "/profil?open=login&next=%2Fprofil%2Fcommandes%3Fpage%3D2"
      )
    ).toBe("/profil")
    expect(
      withoutAuthSearchParams(
        "?next=%2Fprofil%2Fcommandes%3Fpage%3D2&open=login"
      )
    ).toBe("")
  })

  it("cleans URLSearchParams without mutating the input", () => {
    const search = new URLSearchParams(
      "?open=signup&next=%2Fpanier&tri=prix-asc"
    )
    expect(withoutAuthSearchParams(search)).toBe("?tri=prix-asc")
    expect(search.has("open")).toBe(true)
    expect(search.has("next")).toBe(true)
  })

  it("round-trips builder output", () => {
    const url = loginUrl("/profil/commandes?page=2")
    expect(withoutAuthSearchParams(url)).toBe("/")
    expect(withoutAuthSearchParams(url.slice(url.indexOf("?")))).toBe("")
  })

  it("treats an absolute URL as its same-site path", () => {
    expect(
      withoutAuthSearchParams(
        "https://boutique.example/panier?open=login&next=%2Fprofil#avis"
      )
    ).toBe("/panier#avis")
  })

  it("leaves a clean URL untouched", () => {
    expect(withoutAuthSearchParams("/compte?onglet=commandes")).toBe(
      "/compte?onglet=commandes"
    )
    expect(withoutAuthSearchParams("/#avis")).toBe("/#avis")
    expect(withoutAuthSearchParams("/")).toBe("/")
  })
})

describe("urlWouldChange", () => {
  it("detects an added, removed or changed dialog parameter", () => {
    expect(urlWouldChange(loginUrl(), "/panier")).toBe(true)
    expect(
      urlWouldChange(
        withoutAuthSearchParams("/panier?open=login"),
        "/panier?open=login"
      )
    ).toBe(true)
    expect(urlWouldChange("/panier?open=signup", "/panier?open=login")).toBe(
      true
    )
  })

  it("sees through raw and percent-encoded spellings of the same parameters", () => {
    expect(
      urlWouldChange(
        "/panier?next=%2Fpanier&open=login",
        "/panier?next=/panier&open=login"
      )
    ).toBe(false)
    expect(
      urlWouldChange(
        "/panier?open=login&next=%2Fpanier",
        "/panier?open=login&next=%2Fpanier"
      )
    ).toBe(false)
  })

  it("ignores untouched path and hash while spotting real changes", () => {
    expect(
      urlWouldChange("/panier?open=login#avis", "/panier?open=login#avis")
    ).toBe(false)
    expect(
      urlWouldChange("/panier?open=login#apres", "/panier?open=login#avant")
    ).toBe(true)
    expect(urlWouldChange("/autre?open=login", "/panier?open=login")).toBe(true)
  })
})
