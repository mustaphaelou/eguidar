"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"

type ApercuDuPanierContexte = {
  ouvert: boolean
  basculer: () => void
  fermer: () => void
}

const ApercuDuPanierContext = createContext<ApercuDuPanierContexte | null>(null)

export function ApercuDuPanierProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [ouvert, setOuvert] = useState(false)

  const fermer = useCallback(() => setOuvert(false), [])

  const basculer = useCallback(() => setOuvert((precedent) => !precedent), [])

  const valeur = useMemo(
    () => ({ ouvert, basculer, fermer }),
    [ouvert, basculer, fermer]
  )

  return (
    <ApercuDuPanierContext.Provider value={valeur}>
      {children}
    </ApercuDuPanierContext.Provider>
  )
}

export function useApercuDuPanier(): ApercuDuPanierContexte {
  const contexte = useContext(ApercuDuPanierContext)
  if (!contexte) {
    throw new Error(
      "useApercuDuPanier must be used within an ApercuDuPanierProvider"
    )
  }
  return contexte
}
