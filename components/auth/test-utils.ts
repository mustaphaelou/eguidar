import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import type { ReactNode } from "react"
import { afterEach, vi } from "vitest"

const racines: ReturnType<typeof createRoot>[] = []
const conteneurs: HTMLDivElement[] = []

afterEach(() => {
  for (const racine of racines) racine.unmount()
  racines.length = 0
  for (const conteneur of conteneurs) conteneur.remove()
  conteneurs.length = 0
})

/**
 * Rend un crochet en isolation et expose son état courant. Le racine et le
 * conteneur sont nettoyés après chaque test.
 */
export function renderHook<T>(hook: () => T): { readonly current: T } {
  let current!: T
  function Probe() {
    current = hook()
    return null
  }
  const conteneur = document.createElement("div")
  document.body.appendChild(conteneur)
  conteneurs.push(conteneur)
  const racine = createRoot(conteneur)
  racines.push(racine)
  act(() => racine.render(createElement(Probe)))
  return {
    get current() {
      return current
    },
  }
}

export const navigationSpies = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}

export const historyStack: string[] = []

export function mockNextNavigation() {
  return {
    usePathname: () => new URL(window.location.href).pathname,
    useRouter: () => ({
      push: (url: string, options?: { scroll?: boolean }) => {
        navigationSpies.push(url, options)
        historyStack.push(window.location.href)
        window.history.pushState(null, "", url)
      },
      replace: (url: string, options?: { scroll?: boolean }) => {
        navigationSpies.replace(url, options)
        window.history.replaceState(null, "", url)
      },
      refresh: () => {
        navigationSpies.refresh()
      },
    }),
    useSearchParams: () => new URLSearchParams(window.location.search),
  }
}

export function mockNextLink() {
  return {
    default: ({
      href,
      children,
      ...props
    }: {
      href: string
      children?: ReactNode
    } & Record<string, unknown>) =>
      createElement("a", { href, ...props }, children),
  }
}

export function restorePreviousUrl() {
  window.history.replaceState(null, "", historyStack.pop()!)
}

export function resetNavigation(url = "/") {
  window.history.replaceState(null, "", url)
  historyStack.length = 0
  navigationSpies.push.mockClear()
  navigationSpies.replace.mockClear()
  navigationSpies.refresh.mockClear()
}

export async function flush() {
  await act(async () => {})
}

export function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )!.set!
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}
