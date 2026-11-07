import { describe, expect, it, vi } from "vitest"

import { lire } from "@/lib/use-cases/outils-frontiere"

import type { ClientEmails } from "./adaptateur-envoi"
import { libelleDureeCode } from "./duree-code"
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

function capturerJournal() {
  const appels: unknown[][] = []
  const noter = (message: unknown, ...rest: unknown[]) => {
    appels.push([message, ...rest])
  }
  const espions = [
    vi.spyOn(console, "log").mockImplementation(noter),
    vi.spyOn(console, "info").mockImplementation(noter),
    vi.spyOn(console, "warn").mockImplementation(noter),
    vi.spyOn(console, "error").mockImplementation(noter),
    vi.spyOn(console, "debug").mockImplementation(noter),
  ]

  return {
    appels,
    texte: () => appels.flat().join(" "),
    restaurer: () => {
      for (const espion of espions) espion.mockRestore()
    },
  }
}

describe("sendOtpEmail", () => {
  const destinataire = "cliente-otp@example.com"
  const code = "529174"

  it("ne journalise jamais le code de vérification quand le fournisseur est absent", async () => {
    const clePrecedente = process.env.RESEND_API_KEY
    const clientPrecedent = globalResend.resend
    const journal = capturerJournal()

    try {
      delete process.env.RESEND_API_KEY
      globalResend.resend = undefined

      await sendOtpEmail(destinataire, code, "email-verification")

      expect(journal.appels).toHaveLength(1)
      expect(journal.texte()).toContain(destinataire)
      expect(journal.texte()).toContain("RESEND_API_KEY absent")
      expect(journal.texte()).not.toContain(code)
    } finally {
      journal.restaurer()
      if (clePrecedente === undefined) {
        delete process.env.RESEND_API_KEY
      } else {
        process.env.RESEND_API_KEY = clePrecedente
      }
      globalResend.resend = clientPrecedent
    }
  })

  it("envoie le code au fournisseur sans le journaliser quand le fournisseur est présent", async () => {
    const clePrecedente = process.env.RESEND_API_KEY
    const clientPrecedent = globalResend.resend
    const appels: AppelEmail[] = []
    const journal = capturerJournal()

    try {
      process.env.RESEND_API_KEY = "re_test_double_en_memoire"
      globalResend.resend = {
        emails: {
          async send(payload, options) {
            appels.push({ payload, options })
            return { id: "double-en-memoire" }
          },
        },
      }

      await sendOtpEmail(destinataire, code, "email-verification")

      expect(appels).toHaveLength(1)
      expect(appels[0]!.payload).toMatchObject({
        to: destinataire,
        subject: "Votre code de vérification Eguidar",
      })
      expect(appels[0]!.payload.html).toContain(code)
      expect(journal.appels).toEqual([])
    } finally {
      journal.restaurer()
      if (clePrecedente === undefined) {
        delete process.env.RESEND_API_KEY
      } else {
        process.env.RESEND_API_KEY = clePrecedente
      }
      globalResend.resend = clientPrecedent
    }
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
