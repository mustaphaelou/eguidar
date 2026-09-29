// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { isCaptchaRejection, useTestDeSecurite } from "./test-de-securite"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

type TurnstileOptions = {
  sitekey: string
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

function Harness() {
  const captcha = useTestDeSecurite()
  return (
    <div>
      <div data-ready={String(captcha.ready)} />
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

function ready() {
  return container.querySelector("[data-ready]")?.getAttribute("data-ready")
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

describe("isCaptchaRejection", () => {
  it("matches the two captcha-rejection codes", () => {
    expect(isCaptchaRejection({ code: "MISSING_RESPONSE" })).toBe(true)
    expect(isCaptchaRejection({ code: "INVALID_RESPONSE" })).toBe(true)
  })

  it("does not match other error codes, missing codes or a missing error", () => {
    expect(isCaptchaRejection({ code: "INVALID_OTP" })).toBe(false)
    expect(isCaptchaRejection({ code: "TOO_MANY_ATTEMPTS" })).toBe(false)
    expect(isCaptchaRejection({})).toBe(false)
    expect(isCaptchaRejection(null)).toBe(false)
    expect(isCaptchaRejection(undefined)).toBe(false)
  })
})

describe("useTestDeSecurite", () => {
  it("is always ready, renders nothing and issues no headers when the site key is absent", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "")

    await render(<Harness />)

    expect(ready()).toBe("true")
    expect(headers()).toBe("undefined")
    expect(container.querySelector("script#turnstile-script")).toBeNull()
    expect(renderMock).not.toHaveBeenCalled()
  })

  it("renders the field and the widget is not ready before a token arrives when the site key is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA")

    await render(<Harness />)
    await loadScript()

    expect(renderMock).toHaveBeenCalledTimes(1)
    expect(capturedOptions().sitekey).toBe("1x00000000000000000000AA")
    expect(capturedOptions().theme).toBe("auto")
    expect(ready()).toBe("false")
    expect(headers()).toBe("undefined")
  })

  it("becomes ready and carries the jeton header once the token arrives", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA")

    await render(<Harness />)
    await loadScript()

    await act(async () => {
      capturedOptions().callback("tok-1")
    })

    expect(ready()).toBe("true")
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

    expect(ready()).toBe("false")
    expect(headers()).toBe("undefined")
    expect(document.body.textContent).toContain(
      "Vérification de sécurité expirée."
    )
  })

  it("clears the jeton and shows error feedback on the error callback", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA")

    await render(<Harness />)
    await loadScript()

    await act(async () => {
      capturedOptions().callback("tok-1")
    })
    await act(async () => {
      capturedOptions()["error-callback"]!()
    })

    expect(ready()).toBe("false")
    expect(headers()).toBe("undefined")
    expect(document.body.textContent).toContain(
      "Impossible de charger le test de sécurité."
    )
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
    expect(ready()).toBe("false")
    expect(headers()).toBe("undefined")
    expect(document.body.textContent).not.toContain(
      "Vérification de sécurité expirée."
    )

    await act(async () => {
      capturedOptions().callback("tok-2")
    })

    expect(ready()).toBe("true")
    expect(headers()).toBe(JSON.stringify({ "x-captcha-response": "tok-2" }))
  })

  it("keeps the script tag when the widget unmounts and reuses it when a second one mounts", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA")

    await render(<Harness />)
    await loadScript()

    expect(scriptTags()).toHaveLength(1)

    await unmountLast()

    // Le compte est pris entre les deux widgets : c'est là que la balise se
    // ferait retirer. Retirée puis recréée, elle laisserait le document sans
    // balise entre les deux, et le remontage redemanderait `api.js`.
    expect(scriptTags()).toHaveLength(1)

    await render(<Harness />)

    // Le second widget s'est bien remonté — sans quoi le compte porterait sur
    // un widget qui n'existe plus — et n'a pas créé de seconde balise.
    expect(renderMock).toHaveBeenCalledTimes(2)
    expect(scriptTags()).toHaveLength(1)
  })
})
