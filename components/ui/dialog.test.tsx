// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
})

afterEach(() => {
  for (const root of roots) root.unmount()
  roots.length = 0
  container.remove()
  vi.restoreAllMocks()
})

function render(element: ReactElement) {
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(element))
}

function dialogMarkup() {
  return (
    <Dialog>
      <DialogTrigger>Open dialog</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dialog title</DialogTitle>
          <DialogDescription>Dialog description</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  )
}

function trigger() {
  return document.querySelector<HTMLElement>('[data-slot="dialog-trigger"]')!
}

function content() {
  return document.querySelector<HTMLElement>('[data-slot="dialog-content"]')
}

function overlay() {
  return document.querySelector<HTMLElement>('[data-slot="dialog-overlay"]')
}

function openDialog() {
  act(() => trigger().click())
}

function pressEscape() {
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    )
  })
}

describe("Dialog", () => {
  it("opens on trigger click and renders the dialog with its title", () => {
    render(dialogMarkup())
    expect(content()).toBeNull()

    openDialog()

    const popup = content()
    expect(popup).not.toBeNull()
    expect(popup?.getAttribute("role")).toBe("dialog")
    expect(
      popup?.querySelector('[data-slot="dialog-title"]')?.textContent
    ).toBe("Dialog title")
    expect(
      popup?.querySelector('[data-slot="dialog-description"]')?.textContent
    ).toBe("Dialog description")
  })

  it("closes on Escape", () => {
    render(dialogMarkup())
    openDialog()
    expect(content()).not.toBeNull()

    pressEscape()
    expect(content()).toBeNull()
  })

  it("closes on backdrop click", () => {
    render(dialogMarkup())
    openDialog()
    expect(overlay()).not.toBeNull()

    act(() => {
      overlay()!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(content()).toBeNull()
  })

  it("moves focus into the dialog and keeps it trapped while open", async () => {
    render(dialogMarkup())
    openDialog()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const popup = content()!
    expect(popup.contains(document.activeElement)).toBe(true)

    for (let i = 0; i < 5; i++) {
      act(() => {
        document.activeElement!.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Tab", bubbles: true })
        )
      })
      expect(popup.contains(document.activeElement)).toBe(true)
    }
  })

  it("locks page scroll while open and restores it on close", async () => {
    render(dialogMarkup())

    openDialog()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(document.body.style.overflowY).toBe("hidden")

    pressEscape()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(document.body.style.overflowY).toBe("")
  })
})
