"use client"

import { useState } from "react"

import { resolveAuthRefusal } from "@/components/auth/auth-form-glue"
import type { PortAuthentification } from "@/components/auth/port-authentification"
import { portAuthentificationClient } from "@/components/auth/port-authentification-client"
import { useOtpExchange } from "@/components/auth/verification-de-l-email"
import { useTestDeSecurite } from "@/components/auth/test-de-securite"
import { ACTIONS_TEST_DE_SECURITE } from "@/lib/vocabulaire-test-de-securite"

type SignUpFlowStep = "form" | "otp"

export type SignUpFlow = ReturnType<typeof useSignUpFlow>

export function useSignUpFlow(
  {
    email: adresseDeDépart,
    onVerified,
  }: {
    email: string
    onVerified?: (email: string) => void
  },
  port: PortAuthentification = portAuthentificationClient
) {
  const [step, setStep] = useState<SignUpFlowStep>("form")
  const [email, setEmail] = useState(adresseDeDépart)
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const captcha = useTestDeSecurite(ACTIONS_TEST_DE_SECURITE.inscription)
  const otp = useOtpExchange(
    { email, type: "email-verification", onVerified },
    port
  )

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = await port.inscription({
        nom: name,
        email,
        motDePasse: password,
        entetes: captcha.headers,
      })
      if (result.error) {
        setError(resolveAuthRefusal(result.error, captcha.reset))
        return
      }
      setStep("otp")
    } finally {
      setLoading(false)
    }
  }

  return {
    name,
    setName,
    email,
    setEmail,
    password,
    setPassword,
    otp,
    step,
    error,
    loading,
    captcha,
    handleSignUp,
  }
}
