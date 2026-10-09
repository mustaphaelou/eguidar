import { act } from "react"
import type { ReactElement } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, vi } from "vitest"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

export interface RenduFormulaire {
  container: HTMLDivElement
  render(element: ReactElement): void
  soumettre(form: HTMLFormElement): Promise<void>
  cliquerOption(libelle: string): Promise<void>
  boutonDontLeLibelleEst(libelle: string): HTMLButtonElement
}

export function monterFormulaire(): RenduFormulaire {
  let container: HTMLDivElement
  const roots: ReturnType<typeof createRoot>[] = []

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
  })

  afterEach(() => {
    act(() => {
      for (const root of roots) root.unmount()
    })
    roots.length = 0
    container.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  return {
    get container() {
      return container
    },
    render(element) {
      const root = createRoot(container)
      roots.push(root)
      act(() => root.render(element))
    },
    async soumettre(form) {
      await act(async () => {
        form.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true })
        )
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
    },
    async cliquerOption(libelle) {
      const option = [
        ...document.querySelectorAll<HTMLElement>('[data-slot="select-item"]'),
      ].find((element) => element.textContent === libelle)
      if (!option) throw new Error(`option absente du menu : ${libelle}`)
      await act(async () => {
        option.click()
      })
    },
    boutonDontLeLibelleEst(libelle) {
      const trouve = [
        ...container.querySelectorAll<HTMLButtonElement>(
          '[data-slot="button"]'
        ),
      ].find((bouton) => bouton.textContent === libelle)
      if (!trouve) throw new Error(`bouton absent de la ligne : « ${libelle} »`)
      return trouve
    },
  }
}

export function actionQuiCapture<S extends object>(): {
  soumissions: FormData[]
  action: (precedent: S, formData: FormData) => Promise<S>
} {
  const soumissions: FormData[] = []
  return {
    soumissions,
    action: vi.fn(async (_precedent: S, formData: FormData) => {
      soumissions.push(formData)
      return {} as S
    }),
  }
}
