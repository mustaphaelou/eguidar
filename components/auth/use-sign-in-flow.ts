"use client"

import { useState } from "react"

import {
  MESSAGE_SERVEUR_INJOIGNABLE,
  resolveAuthRefusal,
  translateAuthError,
} from "@/components/auth/auth-form-glue"
import type { PortAuthentification } from "@/components/auth/port-authentification"
import { portAuthentificationClient } from "@/components/auth/port-authentification-client"
import { useOtpExchange } from "@/components/auth/verification-de-l-email"
import { useTestDeSecurite } from "@/components/auth/test-de-securite"
import { ACTIONS_TEST_DE_SECURITE } from "@/lib/vocabulaire-test-de-securite"
import type { FournisseurSocial } from "@/lib/oauth-providers"

type SignInFlowStep = "form" | "otp"

export type SignInFlow = ReturnType<typeof useSignInFlow>

export function useSignInFlow(
  {
    email: adresseDeDépart,
    onSuccess,
    destination,
    pageAddress,
    socialReturnAddress,
  }: {
    email: string
    onSuccess?: () => void
    destination: string | null
    pageAddress: string
    socialReturnAddress: string
  },
  port: PortAuthentification = portAuthentificationClient
) {
  const [step, setStep] = useState<SignInFlowStep>("form")
  const [email, setEmail] = useState(adresseDeDépart)
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const captcha = useTestDeSecurite(ACTIONS_TEST_DE_SECURITE.connexion)
  const otp = useOtpExchange(
    {
      email,
      type: "email-verification",
      onVerified: () => {
        setNotice("Votre e-mail est vérifié. Connectez-vous.")
        backToForm()
      },
    },
    port
  )

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setLoading(true)
    try {
      const result = await port.connexionParMotDePasse({
        email,
        motDePasse: password,
        entetes: captcha.headers,
      })
      if (result.error) {
        if (result.error.code === "EMAIL_NOT_VERIFIED") {
          setStep("otp")
          return
        }
        setError(resolveAuthRefusal(result.error, captcha.reset))
        return
      }
      completeSignIn()
    } catch {
      setError(MESSAGE_SERVEUR_INJOIGNABLE)
    } finally {
      setLoading(false)
    }
  }

  async function handleSocial(provider: FournisseurSocial) {
    setError(null)
    setNotice(null)
    try {
      const result = await port.connexionSociale({
        fournisseur: provider,
        adresseDeRetour: socialSignInDestination(pageAddress),
        adresseDeRetourEnEchec: socialSignInDestination(socialReturnAddress),
      })
      if (result.error) setError(translateAuthError(result.error))
    } catch {
      setError(MESSAGE_SERVEUR_INJOIGNABLE)
    }
  }

  function completeSignIn() {
    if (destination) {
      window.location.href = destination
      return
    }
    onSuccess?.()
  }

  function backToForm() {
    setStep("form")
    setError(null)
  }

  return {
    email,
    setEmail,
    password,
    setPassword,
    otp,
    step,
    error,
    notice,
    loading,
    captcha,
    handleSignIn,
    handleSocial,
    backToForm,
  }
}

function socialSignInDestination(pageAddress: string) {
  return new URL(pageAddress, window.location.origin).toString()
}
