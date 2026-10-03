import { act } from "react"
import type { ReactElement } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, vi } from "vitest"

/**
 * Harnais de rendu d'un composant de formulaire, pour les suites qui le montent
 * dans `happy-dom`.
 *
 * Les suites de composants de l'Administration ont tous le même geste : monter
 * une racine React dans un conteneur du document, la rendre, choisir une option
 * de `Select` comme un utilisateur — un clic sur l'option du menu — puis soumettre
 * le formulaire et laisser l'action se résoudre. Ce fichier tient la partie
 * identique ; chaque suite garde la sienne, qui est ce qui distingue ses
 * composants : la boîte du bouton de suppression vit dans un portail et se lit
 * par l'étiquette de son `Select`, le formulaire de catégorie n'en a qu'un, seul
 * dans son conteneur.
 *
 * `// @vitest-environment happy-dom` reste dans chaque suite : Vitest lit la
 * directive dans le fichier de test, pas dans ce module.
 */
;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

export interface RenduFormulaire {
  /** Le conteneur monté : ce que la ligne rend, hors boîte de dialogue. */
  container: HTMLDivElement
  /** Rend un élément dans le conteneur et laisse le rendu se faire. */
  render(element: ReactElement): void
  /** Soumet un formulaire et attend que l'action de formulaire se résolve. */
  soumettre(form: HTMLFormElement): Promise<void>
  /** Clique l'option d'un `Select` dont le texte est exactement celui-là. */
  cliquerOption(libelle: string): Promise<void>
  /** Le bouton du conteneur dont le libellé est exactement celui-là. */
  boutonDontLeLibelleEst(libelle: string): HTMLButtonElement
}

/**
 * Monte un conteneur neuf avant chaque test et le démonte après, en posant au
 * passage `IS_REACT_ACT_ENVIRONMENT` que `act` exige. À appeler au niveau du
 * `describe` : les crochets doivent être posés pendant la collecte.
 */
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

/**
 * L'action de formulaire d'un composant `useActionState`, qui garde chaque
 * `FormData` soumis au lieu de le laisser partir. Le type d'état est donné par
 * l'appelant — c'est lui qui connaît `CategoryFormState`, `DeleteCategoryState`
 * — et il est ici un paramètre générique plutôt qu'un `any`.
 */
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
