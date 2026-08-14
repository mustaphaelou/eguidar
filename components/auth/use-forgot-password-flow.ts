"use client"

import { useCallback, useState } from "react"

import { authClient } from "@/lib/client"

const captchaHeaders = (token: string | null) =>
  token ? { "x-captcha-response": token } : undefined

export const captchaEnabled = Boolean(
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
)

export type ForgotPasswordStep = "email" | "otp" | "success"

export function useForgotPasswordFlow() {
  const [email, setEmail] = useState("")
  const [otp, setOtp] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [step, setStep] = useState<ForgotPasswordStep>("email")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleCaptchaChange = useCallback(
    (token: string | null) => setCaptchaToken(token),
    []
  )

  async function handleSendOtp(e?: React.FormEvent) {
    if (e) e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "forget-password",
        fetchOptions: { headers: captchaHeaders(captchaToken) },
      })
      if (result.error) {
        setError(translateForgotPasswordError(result.error))
        return
      }
      setStep("otp")
    } finally {
      setLoading(false)
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.")
      return
    }

    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.")
      return
    }

    setLoading(true)
    try {
      const result = await authClient.emailOtp.resetPassword({
        email,
        otp,
        password,
      })
      if (result.error) {
        setError(translateForgotPasswordError(result.error))
        return
      }
      setStep("success")
    } finally {
      setLoading(false)
    }
  }

  function backToEmail() {
    setStep("email")
    setError(null)
  }

  return {
    email,
    setEmail,
    otp,
    setOtp,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    captchaToken,
    step,
    error,
    loading,
    handleCaptchaChange,
    handleSendOtp,
    handleResetPassword,
    backToEmail,
  }
}

export function translateForgotPasswordError(error: {
  code?: string
  message?: string
  status?: number
}): string {
  switch (error.code) {
    case "USER_NOT_FOUND":
      return "Aucun compte n'est associé à cette adresse e-mail."
    case "INVALID_OTP":
      return "Le code de vérification est invalide ou incorrect."
    case "OTP_EXPIRED":
      return "Le code de vérification a expiré. Veuillez en demander un nouveau."
    case "TOO_MANY_ATTEMPTS":
      return "Trop de tentatives. Veuillez patienter avant de réessayer."
    case "PASSWORD_TOO_SHORT":
      return "Le mot de passe doit contenir au moins 8 caractères."
    case "PASSWORDS_DO_NOT_MATCH":
      return "Les mots de passe ne correspondent pas."
    case "MISSING_RESPONSE":
      return "Veuillez valider le test de sécurité (Turnstile)."
    case "INVALID_RESPONSE":
      return "Le test de sécurité a échoué. Veuillez réessayer."
    default:
      return error.message ?? "Une erreur est survenue. Veuillez réessayer."
  }
}
