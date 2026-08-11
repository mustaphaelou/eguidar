// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Button } from "./button"

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

function renderCapturingErrors(element: ReactElement) {
  const errors: string[] = []
  vi.spyOn(console, "error").mockImplementation((...args) => {
    errors.push(args.join(" "))
  })
  render(element)
  return errors
}

describe("Button", () => {
  it("renders a non-button element via the render prop without the Base UI native-button warning", () => {
    const errors = renderCapturingErrors(
      <Button render={<a href="/panier" />}>Panier</Button>
    )
    expect(errors.filter((e) => e.includes("native <button>"))).toEqual([])
  })

  it("keeps native button semantics without the render prop", () => {
    const errors = renderCapturingErrors(<Button>Panier</Button>)
    expect(errors).toEqual([])
  })
})
