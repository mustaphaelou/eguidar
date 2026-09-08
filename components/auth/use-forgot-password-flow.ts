"use client"

import { useCallback, useState } from "react"

import { authClient } from "@/lib/client"

import { translateAuthError } from "./auth-form-glue"

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
        setError(translateAuthError(result.error))
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
        setError(translateAuthError(result.error))
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
