// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { mockNextLink } from "./test-utils"
import { useTestDeSecurite } from "./test-de-securite"
import {
  ACTIONS_TEST_DE_SECURITE,
  type ActionTestDeSecurite,
} from "@/lib/vocabulaire-test-de-securite"

vi.mock("next/link", () => mockNextLink())

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

type TurnstileOptions = {
  sitekey: string
  action: string
  callback: (token: string) => void
  "expired-callback"?: () => void
  "error-callback"?: () => void
  theme?: string
}

const renderMock = vi.fn(
  (_container: HTMLElement, _options: TurnstileOptions) => "widget-1"
)
const removeMock = vi.fn()
const resetMock = vi.fn()

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  window.turnstile = {
    render: renderMock,
    remove: removeMock,
    reset: resetMock,
  }
})

afterEach(() => {
  for (const root of roots) root.unmount()
  roots.length = 0
  container.remove()
  document.getElementById("turnstile-script")?.remove()
  delete window.turnstile
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

function Harness({
  action = ACTIONS_TEST_DE_SECURITE.connexion,
}: {
  action?: ActionTestDeSecurite
} = {}) {
  const captcha = useTestDeSecurite(action)
  return (
    <div>
      <div data-etat={captcha.etat} />
      <div data-peut-envoyer={String(captcha.peutEnvoyer)} />
      <div
        data-headers={
          captcha.headers ? JSON.stringify(captcha.headers) : "undefined"
        }
      />
      <button type="button" data-reset onClick={() => captcha.reset()}>
        reset
      </button>
      {captcha.field}
    </div>
  )
}

function render(element: ReactElement) {
  const root = createRoot(container)
  roots.push(root)
  return act(async () => {
    root.render(element)
  })
}

function unmountLast() {
  const root = roots.pop()!
  return act(async () => {
    root.unmount()
  })
}

function scriptTags() {
  return document.querySelectorAll("#turnstile-script")
}

function etat() {
  return container.querySelector("[data-etat]")?.getAttribute("data-etat")
}

function widget() {
  return container.querySelector('[data-testid="test-de-securite-widget"]')
}

function peutEnvoyer() {
  return container
    .querySelector("[data-peut-envoyer]")
    ?.getAttribute("data-peut-envoyer")
}

function headers() {
  return container.querySelector("[data-headers]")?.getAttribute("data-headers")
}

async function resetClick() {
  await act(async () => {
    container.querySelector<HTMLButtonElement>("[data-reset]")!.click()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function capturedOptions(): TurnstileOptions {
  return renderMock.mock.calls[0][1]
}

async function loadScript() {
  const script = document.getElementById("turnstile-script")
  expect(script).not.toBeNull()
  await act(async () => {
    script!.dispatchEvent(new Event("load"))
  })
}

describe("useTestDeSecurite", () => {
  it("is ready, renders nothing and issues no headers when the site key is absent", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "")

    await render(<Harness />)

    expect(etat()).toBe("pret")
    expect(peutEnvoyer()).toBe("true")
    expect(headers()).toBe("undefined")
    expect(container.querySelector("script#turnstile-script")).toBeNull()
    expect(renderMock).not.toHaveBeenCalled()
  })

  it("renders the field and waits before a token arrives when the site key is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA")

    await render(<Harness />)
    await loadScript()

    expect(renderMock).toHaveBeenCalledTimes(1)
    expect(capturedOptions().sitekey).toBe("1x00000000000000000000AA")
    expect(capturedOptions().action).toBe("connexion")
    expect(capturedOptions().theme).toBe("auto")
    expect(etat()).toBe("attente")
    expect(peutEnvoyer()).toBe("false")
    expect(headers()).toBe("undefined")
  })

  it.each(Object.values(ACTIONS_TEST_DE_SECURITE))(
    "renders the %s action on the widget",
    async (action) => {
      vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA")

      await render(<Harness action={action} />)
      await loadScript()

      expect(capturedOptions().action).toBe(action)
    }
  )

  it("becomes ready and carries the jeton header once the token arrives", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA")

    await render(<Harness />)
    await loadScript()

    await act(async () => {
      capturedOptions().callback("tok-1")
    })

    expect(etat()).toBe("pret")
    expect(peutEnvoyer()).toBe("true")
    expect(headers()).toBe(JSON.stringify({ "x-captcha-response": "tok-1" }))
  })

  it("clears the jeton and shows expiry feedback on the expired callback", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA")

    await render(<Harness />)
    await loadScript()

    await act(async () => {
      capturedOptions().callback("tok-1")
    })
    await act(async () => {
      capturedOptions()["expired-callback"]!()
    })

    expect(etat()).toBe("attente")
    expect(peutEnvoyer()).toBe("false")
    expect(headers()).toBe("undefined")
    expect(document.body.textContent).toContain(
      "Vérification de sécurité expirée."
    )
  })

  it("clears the jeton, names the failure and keeps the send closed on the error callback", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA")

    await render(<Harness />)
    await loadScript()

    await act(async () => {
      capturedOptions().callback("tok-1")
    })
    await act(async () => {
      capturedOptions()["error-callback"]!()
    })

    expect(etat()).toBe("indisponible")
    expect(peutEnvoyer()).toBe("false")
    expect(headers()).toBe("undefined")
    expect(document.body.textContent).toContain(
      "La vérification de sécurité n'a pas pu aboutir."
    )
    expect(document.body.textContent).toContain(
      "nous vous aiderons à régler le problème"
    )
    expect(
      container.querySelector('a[href="/contact"]'),
      "le lien de contact est offert"
    ).not.toBeNull()
    expect(
      widget()?.classList.contains("hidden"),
      "le widget en échec est masqué"
    ).toBe(true)
  })

  it("reset clears the jeton and resets the widget so a fresh token can arrive", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA")

    await render(<Harness />)
    await loadScript()

    await act(async () => {
      capturedOptions().callback("tok-1")
    })
    await resetClick()

    expect(resetMock).toHaveBeenCalledWith("widget-1")
    expect(etat()).toBe("attente")
    expect(peutEnvoyer()).toBe("false")
    expect(headers()).toBe("undefined")
    expect(document.body.textContent).not.toContain(
      "Vérification de sécurité expirée."
    )

    await act(async () => {
      capturedOptions().callback("tok-2")
    })

    expect(etat()).toBe("pret")
    expect(peutEnvoyer()).toBe("true")
    expect(headers()).toBe(JSON.stringify({ "x-captcha-response": "tok-2" }))
  })

  it("keeps the script tag when the Test de sécurité unmounts and reuses it when a second one mounts", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA")

    await render(<Harness />)
    await loadScript()

    expect(scriptTags()).toHaveLength(1)

    await unmountLast()

    expect(scriptTags()).toHaveLength(1)

    await render(<Harness />)

    expect(renderMock).toHaveBeenCalledTimes(2)
    expect(scriptTags()).toHaveLength(1)
  })

  it("dit que le Test de sécurité n'a pas pu se charger quand le script ne charge pas, puis le repose au réessai", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA")

    await render(<Harness />)
    const premier = document.getElementById("turnstile-script")!
    await act(async () => {
      premier.dispatchEvent(new Event("error"))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.textContent).toContain(
      "La vérification de sécurité n'a pas pu aboutir."
    )
    expect(etat()).toBe("indisponible")
    expect(peutEnvoyer()).toBe("false")
    expect(widget()?.classList.contains("hidden")).toBe(true)

    const reessayer = [...container.querySelectorAll("button")].find(
      (bouton) => bouton.textContent === "Réessayer"
    )
    expect(reessayer, "le bouton Réessayer est offert").toBeDefined()

    await act(async () => {
      reessayer!.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const second = document.getElementById("turnstile-script")
    expect(second, "le script est reposé").not.toBeNull()
    expect(second).not.toBe(premier)

    await act(async () => {
      second!.dispatchEvent(new Event("load"))
    })

    expect(renderMock).toHaveBeenCalledTimes(1)
    expect(etat()).toBe("attente")
    expect(peutEnvoyer()).toBe("false")
    expect(widget()?.classList.contains("hidden")).toBe(false)
  })
})
