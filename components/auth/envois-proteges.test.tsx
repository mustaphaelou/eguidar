// @vitest-environment happy-dom
import {
  mockNextNavigation,
  resetNavigation,
  setInputValue,
} from "./test-utils"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useSignInFlow } from "./use-sign-in-flow"
import { useSignUpFlow } from "./use-sign-up-flow"
import { useOtpExchange } from "./verification-de-l-email"
import { ENVOIS_PROTEGES } from "@/lib/test-de-securite"

vi.mock("next/navigation", () => mockNextNavigation())

const JETON = "jeton-de-la-garde"

const CLE_SITE = "1x00000000000000000000AA"

const CHEMIN_BASE = "/api/auth"

interface Envoi {
  chemin: string
  entetes: Record<string, string>
}

const attaches: { envoi: string; action: string }[] = []

const envois: Envoi[] = vi.hoisted(() => {
  const captures: { chemin: string; entetes: Record<string, string> }[] = []
  globalThis.fetch = (async (
    entree: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const url =
      typeof entree === "string"
        ? entree
        : entree instanceof URL
          ? entree.href
          : entree.url
    captures.push({
      chemin: new URL(url).pathname,
      entetes: Object.fromEntries(new Headers(init?.headers)),
    })
    return new Response(
      JSON.stringify({ code: "GARD_ENTREE", message: "envoi observé" }),
      { status: 400, headers: { "content-type": "application/json" } }
    )
  }) as typeof globalThis.fetch
  return captures
})

const ADRESSE = "jane@example.com"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let scriptDuWidget: HTMLScriptElement
const roots: ReturnType<typeof createRoot>[] = []

beforeEach(async () => {
  envois.length = 0
  attaches.length = 0
  container = document.createElement("div")
  document.body.appendChild(container)
  resetNavigation("/")
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", CLE_SITE)
  scriptDuWidget = document.createElement("script")
  scriptDuWidget.id = "turnstile-script"
  document.head.appendChild(scriptDuWidget)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => root.render(<Surfaces />))
  window.turnstile = {
    render: (_cible, options) => {
      attaches.push({
        envoi:
          _cible
            .closest("[data-envoi-protege]")
            ?.getAttribute("data-envoi-protege") ?? "inconnu",
        action: options.action,
      })
      options.callback(JETON)
      return "widget-de-la-garde"
    },
    remove: () => {},
    reset: () => {},
  }
  await act(async () => {
    scriptDuWidget.dispatchEvent(new Event("load"))
  })
})

afterEach(async () => {
  await act(async () => {
    for (const root of roots) root.unmount()
  })
  roots.length = 0
  container.remove()
  scriptDuWidget.remove()
  delete window.turnstile
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

function Connexion() {
  const flow = useSignInFlow({
    step: "form",
    email: ADRESSE,
    onStepChange: () => {},
  })
  return (
    <form onSubmit={flow.handleSignIn}>
      <button type="submit" data-envoi>
        connexion
      </button>
      <button
        type="button"
        data-envoi
        onClick={() => flow.handleSocial("google")}
      >
        connexion sociale
      </button>
      <input
        aria-label="code-connexion"
        value={flow.otp.otp}
        onChange={(e) => flow.otp.setOtp(e.target.value)}
      />
      <button type="button" data-envoi onClick={() => flow.otp.verify()}>
        vérification du code
      </button>
      <div data-envoi-protege="connexion">{flow.captcha.field}</div>
      <div data-envoi-protege="code">{flow.otp.captchaField}</div>
    </form>
  )
}

function Inscription() {
  const flow = useSignUpFlow({
    step: "form",
    email: ADRESSE,
    onStepChange: () => {},
    onVerified: () => {},
  })
  return (
    <form onSubmit={flow.handleSignUp}>
      <button type="submit" data-envoi>
        inscription
      </button>
      <div data-envoi-protege="inscription">{flow.captcha.field}</div>
    </form>
  )
}

function EnvoiDuCode() {
  const otp = useOtpExchange({ email: ADRESSE, type: "forget-password" })
  return (
    <div>
      <button type="button" data-envoi onClick={() => otp.send()}>
        envoi du code
      </button>
      <input
        aria-label="code-reinitialisation"
        value={otp.otp}
        onChange={(e) => otp.setOtp(e.target.value)}
      />
      <button type="button" data-envoi onClick={() => otp.verify()}>
        vérification du code
      </button>
      <div data-envoi-protege="reinitialisation">{otp.captchaField}</div>
    </div>
  )
}

function Surfaces() {
  return (
    <div>
      <Connexion />
      <Inscription />
      <EnvoiDuCode />
    </div>
  )
}

async function envoyer() {
  for (const libelle of ["code-connexion", "code-reinitialisation"]) {
    setInputValue(
      container.querySelector<HTMLInputElement>(
        `input[aria-label="${libelle}"]`
      )!,
      "123456"
    )
  }
  for (const bouton of container.querySelectorAll<HTMLButtonElement>(
    "button[data-envoi]"
  )) {
    await act(async () => {
      bouton.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

function pointsDEntreeProtegesParLeNavigateur(): string[] {
  return [
    ...new Set(
      envois
        .filter((envoi) => envoi.entetes["x-captcha-response"] !== undefined)
        .map((envoi) => envoi.chemin.replace(CHEMIN_BASE, ""))
    ),
  ].sort()
}

function pointsDEntreeProtegesParLeServeur(): string[] {
  return [...new Set(ENVOIS_PROTEGES.map((envoi) => envoi.chemin))].sort()
}

function ecart(navigateur: string[], serveur: string[]) {
  return {
    protegeSansEnvoi: serveur.filter((point) => !navigateur.includes(point)),
    envoiSansProtection: navigateur.filter((point) => !serveur.includes(point)),
  }
}

describe("Envois protégés et points d'entrée protégés", () => {
  it("les deux listes disent la même chose", async () => {
    await envoyer()

    const navigateur = pointsDEntreeProtegesParLeNavigateur()
    const serveur = pointsDEntreeProtegesParLeServeur()
    const { protegeSansEnvoi, envoiSansProtection } = ecart(navigateur, serveur)

    expect(
      navigateur.length,
      "aucun envoi protégé n'est parti"
    ).toBeGreaterThan(0)
    expect(
      protegeSansEnvoi,
      `le serveur protège ${protegeSansEnvoi.join(", ")} et le navigateur n'en envoie aucun`
    ).toEqual([])
    expect(
      envoiSansProtection,
      `le navigateur envoie ${envoiSansProtection.join(", ")} et le serveur ne protège aucun point d'entrée correspondant`
    ).toEqual([])
  })

  it("attache à chaque widget l'action de son Envoi protégé", async () => {
    await envoyer()

    expect(
      new Map(attaches.map(({ envoi, action }) => [envoi, action]))
    ).toEqual(
      new Map([
        ["connexion", "connexion"],
        ["code", "code"],
        ["inscription", "inscription"],
        ["reinitialisation", "reinitialisation"],
      ])
    )
  })

  it("la garde distingue un Envoi protégé d'un envoi ordinaire", async () => {
    await envoyer()

    const chemins = envois.map((envoi) => envoi.chemin)
    expect(chemins).toContain(`${CHEMIN_BASE}/email-otp/verify-email`)
    expect(chemins).toContain(`${CHEMIN_BASE}/sign-in/social`)

    const navigateur = pointsDEntreeProtegesParLeNavigateur()
    expect(navigateur).not.toContain("/email-otp/verify-email")
    expect(navigateur).not.toContain("/sign-in/social")
    expect(navigateur).toContain("/email-otp/send-verification-otp")
  })

  it("l'accord se rompt dès qu'un seul côté gagne un membre", () => {
    const navigateur = ["/sign-in/email", "/sign-up/email"]
    const serveur = [...navigateur, "/email-otp/send-verification-otp"]

    expect(ecart(navigateur, serveur).protegeSansEnvoi).toEqual([
      "/email-otp/send-verification-otp",
    ])
    expect(ecart(serveur, navigateur).envoiSansProtection).toEqual([
      "/email-otp/send-verification-otp",
    ])
    expect(ecart(navigateur, navigateur)).toEqual({
      protegeSansEnvoi: [],
      envoiSansProtection: [],
    })
  })
})
