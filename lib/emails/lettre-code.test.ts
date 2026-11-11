import { describe, expect, it, vi } from "vitest"

import { site, staticPages } from "@/lib/site"
import { lire } from "@/lib/use-cases/outils-frontiere"

import type { ClientEmails } from "./adaptateur-envoi"
import { DUREE_VIE_CODE_SECONDS, libelleDureeCode } from "./duree-code"
import { sendOtpEmail } from "./index"

const globalResend = globalThis as unknown as { resend?: ClientEmails }

interface AppelEmail {
  payload: {
    from: string
    to: string
    subject: string
    html: string
    text?: string
  }
  options?: { idempotencyKey?: string }
}

const destinataire = "cliente-otp@example.com"
const code = "529174"

function clientEnMemoire() {
  const appels: AppelEmail[] = []
  const client: ClientEmails = {
    emails: {
      async send(payload, options) {
        appels.push({ payload, options })
        return { id: "double-en-memoire" }
      },
    },
  }
  return { client, appels }
}

async function envoyer(type: string): Promise<AppelEmail> {
  const clePrecedente = process.env.RESEND_API_KEY
  const clientPrecedent = globalResend.resend
  const { client, appels } = clientEnMemoire()

  try {
    process.env.RESEND_API_KEY = "re_test_double_en_memoire"
    globalResend.resend = client
    await sendOtpEmail(destinataire, code, type)
  } finally {
    if (clePrecedente === undefined) {
      delete process.env.RESEND_API_KEY
    } else {
      process.env.RESEND_API_KEY = clePrecedente
    }
    globalResend.resend = clientPrecedent
  }

  expect(appels).toHaveLength(1)
  return appels[0]!
}

describe("Lettre de code", () => {
  it("part dans le gabarit, avec le sujet, le pré-en-tête et le code", async () => {
    const { payload } = await envoyer("email-verification")

    expect(payload.subject).toBe("Votre code de vérification Eguidar")
    expect(payload.to).toBe(destinataire)
    expect(payload.html).toContain("<!DOCTYPE html>")
    expect(payload.html).toContain('class="eguidar-contenu"')
    expect(payload.html).toMatch(/>\s*eguidar\.\s*<\/a/)
    expect(payload.html).toContain(
      `Votre code de vérification Eguidar est ${code}.`
    )
    expect(payload.text).toBeDefined()
    for (const corps of [payload.html, payload.text]) {
      expect(corps).toContain("Code de vérification")
      expect(corps).toContain(code)
    }
  })

  it("porte le pied de la lettre, contact et pages du site compris", async () => {
    const { payload } = await envoyer("sign-in")
    const corps = [payload.html, payload.text] as const

    for (const contenu of corps) {
      expect(contenu).toContain(site.contactEmail)
      for (const page of staticPages) {
        expect(contenu).toContain(`${site.url}${page.href}`)
      }
    }
  })

  const LIBELLÉS: ReadonlyArray<readonly [string, string]> = [
    ["email-verification", "la vérification de votre adresse e-mail"],
    ["sign-in", "la connexion à votre compte"],
    ["forget-password", "la réinitialisation de votre mot de passe"],
    ["change-email", "le changement de votre adresse e-mail"],
  ]

  for (const [type, libellé] of LIBELLÉS) {
    it(`dit « ${libellé} » pour ${type}`, async () => {
      const { payload } = await envoyer(type)
      const phrase = `Votre code pour ${libellé} est :`

      expect(payload.subject).toBe("Votre code de vérification Eguidar")
      expect(payload.html).toContain(phrase)
      expect(payload.text).toContain(phrase)
    })
  }

  it("se replie sur « l'utilisation de votre compte »", async () => {
    const { payload } = await envoyer("mystère")

    expect(payload.text).toContain(
      "Votre code pour l'utilisation de votre compte est :"
    )
    expect(payload.html).toContain(
      "Votre code pour l&#39;utilisation de votre compte est :"
    )
  })

  it("annonce la durée de vie lue dans le module", async () => {
    const { payload } = await envoyer("forget-password")
    const phrase = `Ce code expire dans ${libelleDureeCode(DUREE_VIE_CODE_SECONDS)}.`

    expect(payload.html).toContain(phrase)
    expect(payload.text).toContain(phrase)
  })

  it("avertit une fois, sans journaliser le code, quand le fournisseur est absent", async () => {
    const clePrecedente = process.env.RESEND_API_KEY
    const clientPrecedent = globalResend.resend
    const avertissement = vi.spyOn(console, "warn").mockImplementation(() => {})

    try {
      delete process.env.RESEND_API_KEY
      globalResend.resend = undefined

      await sendOtpEmail(destinataire, code, "email-verification")

      expect(avertissement).toHaveBeenCalledTimes(1)
      const message = avertissement.mock.calls.flat().join(" ")
      expect(message).toContain(destinataire)
      expect(message).toContain("RESEND_API_KEY absent")
      expect(message).not.toContain(code)
      expect(globalResend.resend).toBeUndefined()
    } finally {
      avertissement.mockRestore()
      if (clePrecedente === undefined) {
        delete process.env.RESEND_API_KEY
      } else {
        process.env.RESEND_API_KEY = clePrecedente
      }
      globalResend.resend = clientPrecedent
    }
  })

  it("garde sa signature à trois paramètres", () => {
    expect(sendOtpEmail.length).toBe(3)
  })
})

describe("La durée de vie du code", () => {
  it("nomme les minutes et les secondes sans arrondir", () => {
    expect(libelleDureeCode(60)).toBe("1 minute")
    expect(libelleDureeCode(300)).toBe("5 minutes")
    expect(libelleDureeCode(90)).toBe("1 minute 30 secondes")
  })

  it("ancre la configuration d'authentification sur la même valeur", () => {
    const source = lire(import.meta.url, "../auth.ts")

    expect(source).toMatch(
      /emailOTP\(\{[\s\S]*?expiresIn:\s*DUREE_VIE_CODE_SECONDS/
    )
  })
})
