// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Turnstile } from "./turnstile"

vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA")

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

type TurnstileOptions = {
  sitekey: string
  callback: (token: string) => void
  "expired-callback"?: () => void
  "error-callback"?: () => void
  theme?: string
}

let container: HTMLDivElement
let root: ReturnType<typeof createRoot> | null = null
const renderMock = vi.fn(
  (_container: HTMLElement, _options: TurnstileOptions) => "widget-1"
)
const removeMock = vi.fn()
const resetMock = vi.fn()

function capturedOptions(): TurnstileOptions {
  return renderMock.mock.calls[0][1]
}

async function renderWidget() {
  root = createRoot(container)
  await act(async () => {
    root!.render(<Turnstile onTokenChange={onTokenChange} />)
  })
  const script = document.getElementById("turnstile-script")
  expect(script).not.toBeNull()
  await act(async () => {
    script!.dispatchEvent(new Event("load"))
  })
}

const onTokenChange = vi.fn()

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
  root?.unmount()
  root = null
  container.remove()
  document.getElementById("turnstile-script")?.remove()
  delete window.turnstile
  vi.clearAllMocks()
  onTokenChange.mockClear()
})

describe("Turnstile", () => {
  it("renders the widget with the auto theme", async () => {
    await renderWidget()

    expect(renderMock).toHaveBeenCalledTimes(1)
    expect(capturedOptions().sitekey).toBe("1x00000000000000000000AA")
    expect(capturedOptions().theme).toBe("auto")
  })

  it("forwards tokens and clears them on expiry", async () => {
    await renderWidget()

    await act(async () => {
      capturedOptions().callback("tok-123")
    })
    expect(onTokenChange).toHaveBeenLastCalledWith("tok-123")

    await act(async () => {
      capturedOptions()["expired-callback"]!()
    })
    expect(onTokenChange).toHaveBeenLastCalledWith(null)
    expect(document.body.textContent).toContain(
      "Vérification de sécurité expirée."
    )
  })

  it("offers a retry that resets the widget after expiry", async () => {
    await renderWidget()

    await act(async () => {
      capturedOptions()["expired-callback"]!()
    })
    const retry = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Réessayer")
    )
    expect(retry).toBeDefined()

    await act(async () => {
      retry!.click()
    })
    expect(resetMock).toHaveBeenCalledWith("widget-1")
    expect(document.body.textContent).not.toContain(
      "Vérification de sécurité expirée."
    )
  })

  it("shows an error state when the widget fails to load", async () => {
    await renderWidget()

    await act(async () => {
      capturedOptions()["error-callback"]!()
    })
    expect(onTokenChange).toHaveBeenLastCalledWith(null)
    expect(document.body.textContent).toContain(
      "Impossible de charger le test de sécurité."
    )
  })
})
