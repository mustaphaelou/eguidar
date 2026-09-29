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

vi.mock("next/navigation", () => mockNextNavigation())

/**
 * L'accord entre les Envois protégés et les points d'entrée protégés.
 *
 * Un **Envoi protégé** est un envoi qui porte le jeton du Test de sécurité ;
 * le serveur protège, de l'autre côté, une liste de points d'entrée. Les deux
 * listes disent la même chose, et elles l'ont déjà dite faux : le serveur
 * protégeait `/request-password-reset`, que rien n'appelle — la réinitialisation
 * du mot de passe passe par `/email-otp/send-verification-otp`, comme le reste.
 *
 * Les deux côtés sont donc lus **séparément**, jamais depuis une constante
 * partagée : une constante que les deux moitiés liraient ne pourrait pas
 * échouer, elle recopierait la dérive qu'elle est censée attraper.
 *
 * - Le navigateur est lu **sur le fil**. Ce fichier ne double pas la
 *   bibliothèque : les trois Envois protégés partent vraiment, et l'URL ainsi
 *   que l'en-tête `x-captcha-response` sont lus au point d'entrée réseau. Le
 *   chemin observé est donc le chemin que le serveur verra, pas un chemin
 *   recopié.
 * - Le serveur est lu **sur l'instance**. La liste vient de
 *   `auth.options.plugins`, le plugin tel qu'il a été enregistré, et non d'une
 *   relecture de `lib/auth.ts` : ce qui compte est ce que le serveur protège,
 *   pas ce que le fichier dit avoir protégé. La clé du Test de sécurité est
 *   posée le temps de la lecture, parce que le plugin n'est enregistré que
 *   lorsqu'elle existe — et son absence ferait échouer la garde au lieu de la
 *   laisser passer sur une liste vide.
 *
 * Le chemin retenu de part et d'autre est le même : le plugin retire le
 * `basePath` avant de comparer (`captcha/index.mjs`), la garde le retire aussi.
 */

/** Le jeton que le Test de sécurité résout, et que chaque Envoi protégé porte. */
const JETON = "jeton-de-la-garde"

/** La clé du Test de sécurité, sans laquelle il ne rend aucun jeton. */
const CLE_SITE = "1x00000000000000000000AA"

/** La clé du serveur, sans laquelle le plugin de Test de sécurité n'est pas enregistré. */
const CLE_TURNSTILE = "0x0000000000000000000000000000000000000000"

/** Le `basePath` que le plugin retire avant de comparer — celui par défaut. */
const CHEMIN_BASE = "/api/auth"

interface Envoi {
  chemin: string
  entetes: Record<string, string>
}

/**
 * Le point d'entrée réseau, branché **avant** l'import de la bibliothèque :
 * celle-ci prend `fetch` au moment où le client est créé, donc une substitution
 * faite plus tard ne la verrait jamais.
 */
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

/** L'e-mail des trois surfaces : la garde lit les envois, pas les comptes. */
const ADRESSE = "jane@example.com"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let scriptDuWidget: HTMLScriptElement
const roots: ReturnType<typeof createRoot>[] = []

beforeEach(async () => {
  envois.length = 0
  container = document.createElement("div")
  document.body.appendChild(container)
  resetNavigation("/")
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", CLE_SITE)
  // Le script du Test de sécurité est posé avant le rendu et sans `src` : le
  // Test de sécurité le trouve, ne l'insère pas, et n'essaie surtout pas d'aller
  // le chercher. La garde n'a pas à savoir comment le script arrive.
  scriptDuWidget = document.createElement("script")
  scriptDuWidget.id = "turnstile-script"
  document.head.appendChild(scriptDuWidget)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => root.render(<Surfaces />))
  window.turnstile = {
    render: (_cible, options) => {
      options.callback(JETON)
      return "widget-de-la-garde"
    },
    remove: () => {},
    reset: () => {},
  }
  // Les trois Tests de sécurité n'écoutent le script que tant qu'il n'est pas
  // chargé : le déclenchement se fait une fois le stub en place, sinon ils
  // sortiraient de leur attente par une microtâche hors de `act`.
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

/** La Connexion par mot de passe : `authClient.signIn.email`. */
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
      {flow.captcha.field}
    </form>
  )
}

/** La création de compte à l'Inscription : `authClient.signUp.email`. */
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
      {flow.captcha.field}
    </form>
  )
}

/**
 * L'envoi du code — ici celui de la réinitialisation du mot de passe, qui
 * passe par le même point d'entrée que la Vérification de l'e-mail et par
 * personne d'autre.
 */
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
      {otp.captchaField}
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

/** Actionne chaque surface, dans l'ordre où le Client les actionne. */
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

/**
 * Les points d'entrée que le navigateur protège : ceux vers lesquels part une
 * requête portant le jeton. Un envoi ordinaire en est exclu par construction —
 * c'est ce qui distingue la liste de « toutes les requêtes de la page ».
 */
function pointsDEntreeProtegesParLeNavigateur(): string[] {
  return [
    ...new Set(
      envois
        .filter((envoi) => envoi.entetes["x-captcha-response"] !== undefined)
        .map((envoi) => envoi.chemin.replace(CHEMIN_BASE, ""))
    ),
  ].sort()
}

/** Les points d'entrée que le serveur protège, tels qu'il les a enregistrés. */
async function pointsDEntreeProtegesParLeServeur(): Promise<string[]> {
  vi.stubEnv("TURNSTILE_SECRET_KEY", CLE_TURNSTILE)
  vi.resetModules()
  const { auth } = await import("@/lib/auth")
  const options = auth.options as unknown as {
    basePath?: string
    plugins?: { id?: string; options?: { endpoints?: string[] } }[]
  }
  // Le plugin ne retire que le `basePath` par défaut : la garde en retire le
  // même, et elle le vérifie plutôt que de le supposer.
  expect(options.basePath ?? CHEMIN_BASE).toBe(CHEMIN_BASE)
  const plugin = options.plugins?.find((p) => p.id === "captcha")
  expect(
    plugin,
    "le plugin de Test de sécurité n'est pas enregistré sur l'instance"
  ).toBeDefined()
  const endpoints = plugin?.options?.endpoints
  expect(
    Array.isArray(endpoints) && endpoints.length > 0,
    "le plugin de Test de sécurité ne protège aucun point d'entrée"
  ).toBe(true)
  return [...(endpoints ?? [])].sort()
}

/** Ce que chaque côté a en plus de l'autre — vide quand les deux disent pareil. */
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
    const serveur = await pointsDEntreeProtegesParLeServeur()
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

  it("la garde distingue un Envoi protégé d'un envoi ordinaire", async () => {
    await envoyer()

    // Contre-exemples réels, dans les mêmes trois modules : deux envois que
    // l'application fait tous les jours et qui ne portent aucun jeton. Ils
    // prouvent que la garde ne passe pas sur « toute requête de la page ».
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

    // Un membre que le navigateur n'a pas.
    expect(ecart(navigateur, serveur).protegeSansEnvoi).toEqual([
      "/email-otp/send-verification-otp",
    ])
    // Le même membre, vu de l'autre côté.
    expect(ecart(serveur, navigateur).envoiSansProtection).toEqual([
      "/email-otp/send-verification-otp",
    ])
    // Deux listes d'accord ne signalent rien.
    expect(ecart(navigateur, navigateur)).toEqual({
      protegeSansEnvoi: [],
      envoiSansProtection: [],
    })
  })
})
