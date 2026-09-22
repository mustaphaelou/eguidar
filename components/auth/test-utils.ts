import { act, createElement, useState } from "react"
import type { ReactNode } from "react"
import { vi } from "vitest"

import type { AuthFlowStep } from "@/components/auth/auth-dialog"

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
    } & Record<string, unknown>) => createElement("a", { href, ...props }, children),
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

export function useControlledFlow({
  step: defaultStep = "form",
  email: defaultEmail = "",
  onStepChange,
}: {
  step?: AuthFlowStep
  email?: string
  onStepChange?: (step: AuthFlowStep, email: string) => void
} = {}) {
  const [step, setStep] = useState<AuthFlowStep>(defaultStep)
  const [email, setEmail] = useState(defaultEmail)
  return {
    step,
    email,
    onStepChange: (nextStep: AuthFlowStep, nextEmail: string) => {
      setStep(nextStep)
      setEmail(nextEmail)
      onStepChange?.(nextStep, nextEmail)
    },
  }
}
