import { describe, expect, it } from "vitest"

import {
  ORDRE_ENTETES_ADRESSE_CLIENT,
  PROXIES_DE_CONFIANCE,
} from "@/lib/adresse-client"
import { auth } from "@/lib/auth"

describe("Limiteur d'authentification — adresse du client", () => {
  it("lit les en-têtes dans l'ordre du résolveur, Cloudflare d'abord", () => {
    const adresse = auth.options.advanced?.ipAddress

    expect(adresse?.ipAddressHeaders).toEqual([...ORDRE_ENTETES_ADRESSE_CLIENT])
    expect(adresse?.ipAddressHeaders?.[0]).toBe("cf-connecting-ip")
  })

  it("déclare la chaîne de proxies observée comme fiable", () => {
    const adresse = auth.options.advanced?.ipAddress

    expect(adresse?.trustedProxies).toEqual([...PROXIES_DE_CONFIANCE])
  })
})

describe("Chaîne de proxies de l'authentification", () => {
  it("couvre les plages publiées de Cloudflare et les proxys privés", () => {
    expect(PROXIES_DE_CONFIANCE).toEqual(
      expect.arrayContaining([
        "173.245.48.0/20",
        "104.16.0.0/13",
        "2400:cb00::/32",
        "2606:4700::/32",
        "10.0.0.0/8",
        "172.16.0.0/12",
        "192.168.0.0/16",
        "127.0.0.0/8",
        "::1/128",
      ])
    )
  })
})
