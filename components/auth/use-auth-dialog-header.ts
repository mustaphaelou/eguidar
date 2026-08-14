"use client"

import { useCallback, useState } from "react"

export function useAuthDialogHeader<T extends string>(initialEmail: string) {
  const [header, setHeader] = useState<{ step: T; email: string }>({
    step: "form" as T,
    email: initialEmail,
  })

  const handleStepChange = useCallback((step: T, stepEmail: string) => {
    setHeader({ step, email: stepEmail })
  }, [])

  return { header, handleStepChange }
}
