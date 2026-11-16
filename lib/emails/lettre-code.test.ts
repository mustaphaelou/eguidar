import { describe, expect, it, vi } from "vitest"

import { site, staticPages } from "@/lib/site"
import { importeDe, lire } from "@/lib/use-cases/outils-frontiere"

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

const MODULE_DUREE = "lib/emails/duree-code"

const INVARIANT_DUREE_UNIQUE =
  "la durée de vie du code a une seule valeur : la configuration d'authentification et la lettre qui l'annonce lisent DUREE_VIE_CODE_SECONDS, de sorte que la promesse et le comportement ne peuvent pas dériver"

function importeLaDuree(source: string): boolean {
  return (
    importeDe(source, MODULE_DUREE) &&
    /\bimport\s*\{[^}]*\bDUREE_VIE_CODE_SECONDS\b[^}]*\}/.test(source)
  )
}

function violationsDeLaDureeUnique(auth: string, lettre: string): string[] {
  const violations: string[] = []

  if (!importeLaDuree(auth)) {
    violations.push(
      `la configuration d'authentification ne lit plus la durée dans ${MODULE_DUREE} : ${INVARIANT_DUREE_UNIQUE}`
    )
  } else if (
    !/emailOTP\(\{[\s\S]*?\bexpiresIn:\s*DUREE_VIE_CODE_SECONDS\b/.test(auth)
  ) {
    violations.push(
      `la configuration d'authentification n'expose plus DUREE_VIE_CODE_SECONDS en « expiresIn » : ${INVARIANT_DUREE_UNIQUE}`
    )
  }

  if (!importeLaDuree(lettre)) {
    violations.push(
      `la lettre n'annonce plus la durée lue dans ${MODULE_DUREE} : ${INVARIANT_DUREE_UNIQUE}`
    )
  } else if (!/libelleDureeCode\(\s*DUREE_VIE_CODE_SECONDS\s*\)/.test(lettre)) {
    violations.push(
      `la lettre n'annonce plus la durée lue dans DUREE_VIE_CODE_SECONDS : ${INVARIANT_DUREE_UNIQUE}`
    )
  }

  return violations
}

describe("La durée de vie du code", () => {
  it("nomme les minutes et les secondes sans arrondir", () => {
    expect(libelleDureeCode(60)).toBe("1 minute")
    expect(libelleDureeCode(300)).toBe("5 minutes")
    expect(libelleDureeCode(90)).toBe("1 minute 30 secondes")
  })

  it("garde une seule valeur pour la configuration et la lettre", () => {
    expect(
      violationsDeLaDureeUnique(
        lire(import.meta.url, "../auth.ts"),
        lire(import.meta.url, "./lettre-code.ts")
      )
    ).toEqual([])
  })

  it("tombe sur l'expiration écrite en dur, et nomme l'invariant", () => {
    const auth = lire(import.meta.url, "../auth.ts")
    const lettre = lire(import.meta.url, "./lettre-code.ts")
    const avecExpirationEnDur = auth.replace(
      "expiresIn: DUREE_VIE_CODE_SECONDS",
      "expiresIn: 300"
    )

    expect(avecExpirationEnDur).not.toBe(auth)
    expect(violationsDeLaDureeUnique(avecExpirationEnDur, lettre)).toEqual([
      `la configuration d'authentification n'expose plus DUREE_VIE_CODE_SECONDS en « expiresIn » : ${INVARIANT_DUREE_UNIQUE}`,
    ])
  })

  it("tombe sur la promesse écrite en dur, et nomme l'invariant", () => {
    const auth = lire(import.meta.url, "../auth.ts")
    const lettre = lire(import.meta.url, "./lettre-code.ts")
    const avecPromesseEnDur = lettre.replace(
      "libelleDureeCode(DUREE_VIE_CODE_SECONDS)",
      '"5 minutes"'
    )

    expect(avecPromesseEnDur).not.toBe(lettre)
    expect(violationsDeLaDureeUnique(auth, avecPromesseEnDur)).toEqual([
      `la lettre n'annonce plus la durée lue dans DUREE_VIE_CODE_SECONDS : ${INVARIANT_DUREE_UNIQUE}`,
    ])
  })

  it("tombe quand la configuration se donne sa propre valeur, et nomme l'invariant", () => {
    const auth = lire(import.meta.url, "../auth.ts")
    const lettre = lire(import.meta.url, "./lettre-code.ts")
    const avecValeurLocale = auth.replace(
      'import { DUREE_VIE_CODE_SECONDS } from "@/lib/emails/duree-code"',
      "const DUREE_VIE_CODE_SECONDS = 300"
    )

    expect(avecValeurLocale).not.toBe(auth)
    expect(violationsDeLaDureeUnique(avecValeurLocale, lettre)).toEqual([
      `la configuration d'authentification ne lit plus la durée dans ${MODULE_DUREE} : ${INVARIANT_DUREE_UNIQUE}`,
    ])
  })
})
