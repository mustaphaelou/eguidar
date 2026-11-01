import { getIP } from "@better-auth/core/utils/ip"
import { describe, expect, it } from "vitest"

import {
  ORDRE_ENTETES_ADRESSE_CLIENT,
  PROXIES_DE_CONFIANCE,
} from "@/lib/adresse-client"
import { auth } from "@/lib/auth"

function requeteAvec(entetes: Record<string, string>): Request {
  return new Request("http://localhost:3000/api/auth/sign-in/email", {
    headers: entetes,
  })
}

describe("Limiteur d'authentification — adresse du client", () => {
  it("lit les en-têtes dans l'ordre du résolveur, Cloudflare d'abord", () => {
    const adresse = auth.options.advanced?.ipAddress

    expect(adresse?.ipAddressHeaders).toEqual([...ORDRE_ENTETES_ADRESSE_CLIENT])
    expect(adresse?.ipAddressHeaders?.[0]).toBe("cf-connecting-ip")
  })

  it("déclare les plages de proxies de confiance sur les options d'authentification", () => {
    const adresse = auth.options.advanced?.ipAddress

    expect(adresse?.trustedProxies).toEqual([...PROXIES_DE_CONFIANCE])
  })

  it("résout le client réel derrière un x-forwarded-for multi-relais", () => {
    const requete = requeteAvec({ "x-forwarded-for": "203.0.113.7, 10.0.0.2" })

    expect(getIP(requete, auth.options)).toBe("203.0.113.7")
  })

  it("préfère cf-connecting-ip au relais de transmission", () => {
    const requete = requeteAvec({
      "cf-connecting-ip": "203.0.113.7",
      "x-forwarded-for": "198.51.100.99, 10.0.0.2",
    })

    expect(getIP(requete, auth.options)).toBe("203.0.113.7")
  })
})
