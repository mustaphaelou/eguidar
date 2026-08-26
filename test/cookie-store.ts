const paires = new Map<string, string>()

export const deletedCookieNames: string[] = []

export const cookieStoreMock = {
  get: (name: string) => {
    const value = paires.get(name)
    return value === undefined ? undefined : { name, value }
  },
  set: (name: string, value: string) => {
    paires.set(name, value)
  },
  delete: (name: string) => {
    if (paires.delete(name)) deletedCookieNames.push(name)
  },
}

export function resetCookieStoreMock() {
  paires.clear()
  deletedCookieNames.length = 0
}

export function setCookie(name: string, value: string) {
  paires.set(name, value)
}

export function hasCookie(name: string) {
  return paires.has(name)
}

export function readCookie(name: string): string | undefined {
  return cookieStoreMock.get(name)?.value
}
