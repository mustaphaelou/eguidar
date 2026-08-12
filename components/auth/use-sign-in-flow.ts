"use client"

import { useCallback, useState } from "react"
import { useSearchParams } from "next/navigation"

import { authClient } from "@/lib/client"

const captchaHeaders = (token: string | null) =>
  token ? { "x-captcha-response": token } : undefined

export const captchaEnabled = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)

export type SignInStep = "form" | "otp"

export type SignInFlow = ReturnType<typeof useSignInFlow>

export function useSignInFlow() {
  const searchParams = useSearchParams()
  const rawNext = searchParams.get("next")
  const next =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : "/"
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [otpCaptchaToken, setOtpCaptchaToken] = useState<string | null>(null)
  const [otpSent, setOtpSent] = useState(false)
  const [otp, setOtp] = useState("")
  const [step, setStep] = useState<SignInStep>("form")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleCaptchaChange = useCallback(
    (token: string | null) => setCaptchaToken(token),
    []
  )
  const handleOtpCaptchaChange = useCallback(
    (token: string | null) => setOtpCaptchaToken(token),
    []
  )

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = await authClient.signIn.email({
        email,
        password,
        fetchOptions: { headers: captchaHeaders(captchaToken) },
      })
      if (result.error) {
        if (result.error.code === "EMAIL_NOT_VERIFIED") {
          setStep("otp")
          return
        }
        setError(translateAuthError(result.error))
        return
      }
      window.location.href = next
    } finally {
      setLoading(false)
    }
  }

  async function handleSendOtp() {
    setError(null)
    setLoading(true)
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "email-verification",
        fetchOptions: { headers: captchaHeaders(otpCaptchaToken) },
      })
      if (result.error) {
        setError(translateAuthError(result.error))
        return
      }
      setOtpSent(true)
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = await authClient.emailOtp.verifyEmail({ email, otp })
      if (result.error) {
        setError(translateAuthError(result.error))
        return
      }
      window.location.href = "/connexion"
    } finally {
      setLoading(false)
    }
  }

  async function handleSocial(provider: "google" | "apple") {
    setError(null)
    const result = await authClient.signIn.social({
      provider,
      callbackURL: next,
    })
    if (result.error) setError(translateAuthError(result.error))
  }

  function backToForm() {
    setStep("form")
    setError(null)
  }

  return {
    next,
    email,
    setEmail,
    password,
    setPassword,
    captchaToken,
    otpCaptchaToken,
    otpSent,
    otp,
    setOtp,
    step,
    error,
    loading,
    handleCaptchaChange,
    handleOtpCaptchaChange,
    handleSignIn,
    handleSendOtp,
    handleVerifyOtp,
    handleSocial,
    backToForm,
  }
}

export function translateAuthError(error: {
  code?: string
  message?: string
  status?: number
}): string {
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "E-mail ou mot de passe invalide."
    case "EMAIL_NOT_VERIFIED":
      return "Votre adresse e-mail n'est pas encore vérifiée."
    case "MISSING_RESPONSE":
      return "Veuillez valider le test de sécurité (Turnstile)."
    case "INVALID_RESPONSE":
      return "Le test de sécurité a échoué. Veuillez réessayer."
    default:
      return error.message ?? "Une erreur est survenue. Veuillez réessayer."
  }
}
