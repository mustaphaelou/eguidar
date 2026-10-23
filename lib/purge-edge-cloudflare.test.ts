import { describe, expect, it, vi } from "vitest"

import {
  LIMITE_URLS_PAR_APPEL_PURGE,
  type DemandePurge,
} from "@/lib/purge-edge"
import { creerPurgeEdgeCloudflare } from "@/lib/purge-edge-cloudflare"

const ENV = {
  CLOUDFLARE_ZONE_ID: "zone-eguidar",
  CLOUDFLARE_API_TOKEN: "jeton-purge",
} as const

const URL_PURGE =
  "https://api.cloudflare.com/client/v4/zones/zone-eguidar/purge_cache"

function reponseJson(charge: unknown, status = 200): Response {
  return new Response(JSON.stringify(charge), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function reponseAcceptee(): Response {
  return reponseJson({
    success: true,
    errors: [],
    messages: [],
    result: { id: "purge-1" },
  })
}

function transportAccepte() {
  return vi.fn(async (_url: string, _init: RequestInit): Promise<Response> =>
    reponseAcceptee()
  )
}

function demande(urls: readonly string[]): DemandePurge {
  return { kind: "urls", urls }
}

function corpsDe(appel: unknown[]): {
  files?: string[]
  purge_everything?: boolean
} {
  const init = appel[1] as RequestInit
  return JSON.parse(String(init.body)) as {
    files?: string[]
    purge_everything?: boolean
  }
}

describe("adaptateur Cloudflare de purge de l'edge", () => {
  it("envoie les documents en `files`, avec le jeton de purge et l'URL de la zone", async () => {
    const transport = transportAccepte()
    const purge = creerPurgeEdgeCloudflare({ env: ENV, transport })

    const resultat = await purge.purger(
      demande(["https://eguidar.com/produit/a", "https://eguidar.com/"])
    )

    expect(resultat).toEqual({
      ok: true,
      urls: ["https://eguidar.com/produit/a", "https://eguidar.com/"],
    })
    expect(transport).toHaveBeenCalledOnce()
    const [url, init] = transport.mock.calls[0]!
    expect(url).toBe(URL_PURGE)
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        Authorization: "Bearer jeton-purge",
        "Content-Type": "application/json",
      },
    })
    expect(corpsDe(transport.mock.calls[0]!)).toEqual({
      files: ["https://eguidar.com/produit/a", "https://eguidar.com/"],
    })
  })

  it("découpe les documents au plafond du fournisseur, sans en perdre", async () => {
    const transport = transportAccepte()
    const purge = creerPurgeEdgeCloudflare({ env: ENV, transport })
    const urls = Array.from(
      { length: LIMITE_URLS_PAR_APPEL_PURGE + 5 },
      (_, index) => `https://eguidar.com/produit/p-${index}`
    )

    await expect(purge.purger(demande(urls))).resolves.toEqual({
      ok: true,
      urls,
    })

    expect(transport).toHaveBeenCalledTimes(2)
    expect(corpsDe(transport.mock.calls[0]!).files).toHaveLength(
      LIMITE_URLS_PAR_APPEL_PURGE
    )
    expect(corpsDe(transport.mock.calls[1]!).files).toHaveLength(5)
    expect([
      ...(corpsDe(transport.mock.calls[0]!).files ?? []),
      ...(corpsDe(transport.mock.calls[1]!).files ?? []),
    ]).toEqual(urls)
  })

  it("respecte une limite de lot injectée", async () => {
    const transport = transportAccepte()
    const purge = creerPurgeEdgeCloudflare({
      env: ENV,
      transport,
      limiteUrlsParAppel: 2,
    })

    await purge.purger(
      demande([
        "https://eguidar.com/a",
        "https://eguidar.com/b",
        "https://eguidar.com/c",
      ])
    )

    expect(transport).toHaveBeenCalledTimes(2)
    expect(corpsDe(transport.mock.calls[0]!).files).toEqual([
      "https://eguidar.com/a",
      "https://eguidar.com/b",
    ])
    expect(corpsDe(transport.mock.calls[1]!).files).toEqual([
      "https://eguidar.com/c",
    ])
  })

  it("dédoublonne les documents avant de les envoyer", async () => {
    const transport = transportAccepte()
    const purge = creerPurgeEdgeCloudflare({ env: ENV, transport })

    await expect(
      purge.purger(
        demande([
          "https://eguidar.com/",
          "https://eguidar.com/",
          "https://eguidar.com/a",
        ])
      )
    ).resolves.toEqual({
      ok: true,
      urls: ["https://eguidar.com/", "https://eguidar.com/a"],
    })
    expect(corpsDe(transport.mock.calls[0]!).files).toEqual([
      "https://eguidar.com/",
      "https://eguidar.com/a",
    ])
  })

  it("purge tout le catalogue en une seule requête `purge_everything`", async () => {
    const transport = transportAccepte()
    const purge = creerPurgeEdgeCloudflare({ env: ENV, transport })

    await expect(purge.purger({ kind: "tout" })).resolves.toEqual({
      ok: true,
      urls: [],
    })
    expect(transport).toHaveBeenCalledOnce()
    expect(corpsDe(transport.mock.calls[0]!)).toEqual({
      purge_everything: true,
    })
  })

  it("ne fait aucun appel pour une demande vide", async () => {
    const transport = transportAccepte()
    const purge = creerPurgeEdgeCloudflare({ env: ENV, transport })

    await expect(purge.purger(demande([]))).resolves.toEqual({
      ok: true,
      urls: [],
    })
    expect(transport).not.toHaveBeenCalled()
  })

  it("répond non-configure sans appeler le transport quand les identifiants manquent", async () => {
    const transport = transportAccepte()

    const sansZone = creerPurgeEdgeCloudflare({
      env: { CLOUDFLARE_API_TOKEN: "jeton" },
      transport,
    })
    const sansJeton = creerPurgeEdgeCloudflare({
      env: { CLOUDFLARE_ZONE_ID: "zone" },
      transport,
    })
    const vide = creerPurgeEdgeCloudflare({ env: {}, transport })

    for (const purge of [sansZone, sansJeton, vide]) {
      const resultat = await purge.purger(demande(["https://eguidar.com/"]))
      expect(resultat.ok).toBe(false)
      if (!resultat.ok) {
        expect(resultat.erreur.code).toBe("non-configure")
        expect(resultat.erreur.message).toContain("CLOUDFLARE_ZONE_ID")
        expect(resultat.erreur.message).toContain("CLOUDFLARE_API_TOKEN")
      }
    }
    expect(transport).not.toHaveBeenCalled()
  })

  it("répond erreur-purge sur un refus de l'API sans lever", async () => {
    const transport = vi.fn(async () =>
      reponseJson(
        {
          success: false,
          errors: [
            { code: 1134, message: "Unable to purge, rate limit reached" },
          ],
          messages: [],
          result: null,
        },
        200
      )
    )
    const purge = creerPurgeEdgeCloudflare({ env: ENV, transport })

    await expect(
      purge.purger(demande(["https://eguidar.com/"]))
    ).resolves.toEqual({
      ok: false,
      erreur: {
        code: "erreur-purge",
        message: "Unable to purge, rate limit reached",
      },
    })
  })

  it("répond erreur-purge sur un statut HTTP en échec", async () => {
    const transport = vi.fn(async () =>
      reponseJson({ success: false, errors: [], result: null }, 503)
    )
    const purge = creerPurgeEdgeCloudflare({ env: ENV, transport })

    await expect(
      purge.purger(demande(["https://eguidar.com/"]))
    ).resolves.toEqual({
      ok: false,
      erreur: { code: "erreur-purge", message: "HTTP 503" },
    })
  })

  it("répond erreur-purge quand le transport se lève, et poursuit les autres lots", async () => {
    const transport = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValueOnce(new Error("réseau indisponible"))
      .mockResolvedValueOnce(reponseAcceptee())
    const purge = creerPurgeEdgeCloudflare({
      env: ENV,
      transport,
      limiteUrlsParAppel: 1,
    })

    const resultat = await purge.purger(
      demande(["https://eguidar.com/a", "https://eguidar.com/b"])
    )

    expect(resultat.ok).toBe(false)
    if (!resultat.ok) {
      expect(resultat.erreur.code).toBe("erreur-purge")
      expect(resultat.erreur.message).toContain("réseau indisponible")
    }
    expect(transport).toHaveBeenCalledTimes(2)
  })
})
