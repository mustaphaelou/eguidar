import { afterEach, describe, expect, it, vi } from "vitest"

import {
  ACTIONS_PAR_TYPE_OTP,
  ACTIONS_TEST_DE_SECURITE,
} from "@/lib/vocabulaire-test-de-securite"
import {
  ENVOIS_PROTEGES,
  actionPourEnvoi,
  hotesDuTestDeSecurite,
  pluginTestDeSecurite,
  verifierTestDeSecurite,
} from "@/lib/test-de-securite"

const SECRET = "secret-de-test"
const HOTES = ["eguidar.com", "preview.eguidar.test"]
const URL_SITEVERIFY =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify"

type OptionsVerification = Parameters<typeof verifierTestDeSecurite>[0]

function requete(
  chemin = "/api/auth/sign-up/email",
  jeton: string | null = "jeton",
  entetes: Record<string, string> = {}
): Request {
  const toutes = new Headers(entetes)
  if (jeton !== null) toutes.set("x-captcha-response", jeton)
  return new Request(`http://localhost:3000${chemin}`, {
    method: "POST",
    headers: toutes,
  })
}

function siteverify(donnees: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(donnees), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function fetchQuiRend(
  donnees: Record<string, unknown>,
  status = 200
): ReturnType<typeof vi.fn<typeof globalThis.fetch>> {
  return vi.fn<typeof globalThis.fetch>(async () => siteverify(donnees, status))
}

function verifier(options: Partial<OptionsVerification> = {}) {
  return verifierTestDeSecurite({
    requete: requete(),
    action: ACTIONS_TEST_DE_SECURITE.inscription,
    secretKey: SECRET,
    allowedHostnames: HOTES,
    ...options,
  })
}

async function codeDe(reponse: unknown) {
  const avecReponse = reponse as { response?: Response } | undefined
  expect(
    avecReponse?.response,
    "la vérification aurait dû refuser"
  ).toBeDefined()
  const corps = (await avecReponse!.response!.json()) as { code?: string }
  return { status: avecReponse!.response!.status, code: corps.code }
}

function corpsEnvoye(fetch: ReturnType<typeof fetchQuiRend>) {
  return JSON.parse(
    (fetch.mock.calls[0][1] as RequestInit).body as string
  ) as Record<string, unknown>
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("hotesDuTestDeSecurite", () => {
  it("ne sert que l'Hôte canonique et l'hôte du déploiement", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://preview.example")
    vi.stubEnv("NEXT_PUBLIC_BETTER_AUTH_URL", "")

    expect(hotesDuTestDeSecurite()).toEqual(["eguidar.com", "preview.example"])
  })

  it("ne déclare jamais www, qui redirige vers l'apex", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://eguidar.com")
    vi.stubEnv("NEXT_PUBLIC_BETTER_AUTH_URL", "")

    expect(hotesDuTestDeSecurite()).toEqual(["eguidar.com"])
  })
})

describe("actionPourEnvoi", () => {
  it("nomme l'action de chacun des quatre Envois protégés", () => {
    expect(actionPourEnvoi("/api/auth/sign-up/email", null)).toBe(
      ACTIONS_TEST_DE_SECURITE.inscription
    )
    expect(actionPourEnvoi("/api/auth/sign-in/email", null)).toBe(
      ACTIONS_TEST_DE_SECURITE.connexion
    )
    expect(
      actionPourEnvoi("/api/auth/email-otp/send-verification-otp", {
        type: "email-verification",
      })
    ).toBe(ACTIONS_PAR_TYPE_OTP["email-verification"])
    expect(
      actionPourEnvoi("/api/auth/email-otp/send-verification-otp", {
        type: "forget-password",
      })
    ).toBe(ACTIONS_PAR_TYPE_OTP["forget-password"])
  })

  it("n'attribue d'action qu'aux envois déclarés", () => {
    expect(actionPourEnvoi("/api/auth/get-session", null)).toBeNull()
    expect(actionPourEnvoi("/api/auth/sign-in/email-otp", null)).toBeNull()
    expect(
      actionPourEnvoi("/api/auth/email-otp/send-verification-otp", {
        type: "change-email",
      })
    ).toBeNull()
  })

  it("déclare une entrée par Envoi protégé, pas une par point d'entrée", () => {
    expect(ENVOIS_PROTEGES).toHaveLength(4)
    expect(new Set(ENVOIS_PROTEGES.map((envoi) => envoi.action))).toEqual(
      new Set(Object.values(ACTIONS_TEST_DE_SECURITE))
    )
  })
})

describe("verifierTestDeSecurite", () => {
  it("accepte un jeton dont l'action et l'hôte sont ceux du send", async () => {
    const fetch = fetchQuiRend({
      success: true,
      action: ACTIONS_TEST_DE_SECURITE.inscription,
      hostname: "eguidar.com",
    })

    const resultat = await verifier({ fetch })

    expect(resultat).toBeUndefined()
    expect(fetch).toHaveBeenCalledWith(
      URL_SITEVERIFY,
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
    )
  })

  it("transmet l'adresse du Client au service de vérification", async () => {
    const fetch = fetchQuiRend({
      success: true,
      action: ACTIONS_TEST_DE_SECURITE.connexion,
      hostname: "eguidar.com",
    })

    await verifier({
      requete: requete("/api/auth/sign-in/email", "jeton", {
        "cf-connecting-ip": "203.0.113.10",
      }),
      action: ACTIONS_TEST_DE_SECURITE.connexion,
      fetch,
    })

    expect(corpsEnvoye(fetch).remoteip).toBe("203.0.113.10")
  })

  it("refuse un jeton absent sans appeler le service", async () => {
    const fetch = fetchQuiRend({ success: true })

    const resultat = await verifier({
      requete: requete("/api/auth/sign-up/email", null),
      fetch,
    })

    expect(await codeDe(resultat)).toEqual({
      status: 400,
      code: "MISSING_RESPONSE",
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    {
      nom: "une action d'un autre send",
      donnees: {
        success: true,
        action: ACTIONS_TEST_DE_SECURITE.connexion,
        hostname: "eguidar.com",
      },
      code: "VERIFICATION_FAILED",
      status: 403,
    },
    {
      nom: "un hôte étranger",
      donnees: {
        success: true,
        action: ACTIONS_TEST_DE_SECURITE.inscription,
        hostname: "evil.example",
      },
      code: "VERIFICATION_FAILED",
      status: 403,
    },
    {
      nom: "un hôte absent",
      donnees: {
        success: true,
        action: ACTIONS_TEST_DE_SECURITE.inscription,
      },
      code: "VERIFICATION_FAILED",
      status: 403,
    },
    {
      nom: "un verdict négatif",
      donnees: { success: false },
      code: "VERIFICATION_FAILED",
      status: 403,
    },
  ])("refuse $nom", async ({ donnees, code, status }) => {
    const fetch = fetchQuiRend(donnees)

    const resultat = await verifier({ fetch })

    expect(await codeDe(resultat)).toEqual({ status, code })
  })

  it("échoue fermé quand le service est indisponible", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      throw new Error("réseau indisponible")
    })

    const resultat = await verifier({ fetch })

    expect(await codeDe(resultat)).toEqual({
      status: 500,
      code: "UNKNOWN_ERROR",
    })
  })

  it("échoue fermé quand le service rend un corps illisible", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response("pas du JSON", { status: 200 })
    )

    const resultat = await verifier({ fetch })

    expect(await codeDe(resultat)).toEqual({
      status: 500,
      code: "UNKNOWN_ERROR",
    })
  })
})

describe("pluginTestDeSecurite", () => {
  function plugin() {
    return pluginTestDeSecurite({
      secretKey: SECRET,
      allowedHostnames: HOTES,
    })
  }

  function contexte() {
    return { options: { basePath: "/api/auth" } } as never
  }

  it("ne touche pas un point d'entrée ordinaire", async () => {
    const resultat = await plugin().onRequest?.(
      new Request("http://localhost:3000/api/auth/get-session"),
      contexte()
    )

    expect(resultat).toBeUndefined()
  })

  it("vérifie le send que la requête désigne", async () => {
    const fetch = fetchQuiRend({
      success: true,
      action: ACTIONS_PAR_TYPE_OTP["forget-password"],
      hostname: "preview.eguidar.test",
    })
    vi.stubGlobal("fetch", fetch)

    const resultat = await plugin().onRequest?.(
      new Request(
        "http://localhost:3000/api/auth/email-otp/send-verification-otp",
        {
          method: "POST",
          headers: { "x-captcha-response": "jeton" },
          body: JSON.stringify({ type: "forget-password" }),
        }
      ),
      contexte()
    )

    expect(resultat).toBeUndefined()
    expect(corpsEnvoye(fetch).secret).toBe(SECRET)
  })

  it("refuse le send dont l'action ne correspond pas", async () => {
    vi.stubGlobal(
      "fetch",
      fetchQuiRend({
        success: true,
        action: ACTIONS_TEST_DE_SECURITE.inscription,
        hostname: "eguidar.com",
      })
    )

    const resultat = await plugin().onRequest?.(
      new Request(
        "http://localhost:3000/api/auth/email-otp/send-verification-otp",
        {
          method: "POST",
          headers: { "x-captcha-response": "jeton" },
          body: JSON.stringify({ type: "forget-password" }),
        }
      ),
      contexte()
    )

    expect(await codeDe(resultat)).toEqual({
      status: 403,
      code: "VERIFICATION_FAILED",
    })
  })

  it("refuse un type d'envoi non déclaré, sans appeler le service", async () => {
    const fetch = fetchQuiRend({ success: true })
    vi.stubGlobal("fetch", fetch)

    const resultat = await plugin().onRequest?.(
      new Request(
        "http://localhost:3000/api/auth/email-otp/send-verification-otp",
        {
          method: "POST",
          headers: { "x-captcha-response": "jeton" },
          body: JSON.stringify({ type: "change-email" }),
        }
      ),
      contexte()
    )

    expect(await codeDe(resultat)).toEqual({
      status: 403,
      code: "VERIFICATION_FAILED",
    })
    expect(fetch).not.toHaveBeenCalled()
  })
})
