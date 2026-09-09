"use client"

import { useState } from "react"

import { useAuthDialogDestination } from "@/components/auth/auth-dialogs"
import { authClient } from "@/lib/client"
import { withoutAuthParams } from "@/lib/lien-de-connexion"

import {
  captchaHeaders,
  translateAuthError,
  useCaptcha,
} from "./auth-form-glue"

export type SignInStep = "form" | "otp"

export type SignInFlow = ReturnType<typeof useSignInFlow>

export function useSignInFlow({
  initialEmail,
  onSuccess,
}: {
  initialEmail?: string
  onSuccess?: () => void
} = {}) {
  const next = useAuthDialogDestination()
  const captcha = useCaptcha()
  const otpCaptcha = useCaptcha()
  const [email, setEmail] = useState(initialEmail ?? "")
  const [password, setPassword] = useState("")
  const [otpSent, setOtpSent] = useState(false)
  const [otp, setOtp] = useState("")
  const [step, setStep] = useState<SignInStep>("form")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setLoading(true)
    try {
      const result = await authClient.signIn.email({
        email,
        password,
        fetchOptions: { headers: captchaHeaders(captcha.token) },
      })
      if (result.error) {
        if (result.error.code === "EMAIL_NOT_VERIFIED") {
          setStep("otp")
          return
        }
        setError(translateAuthError(result.error))
        return
      }
      completeSignIn()
    } finally {
      setLoading(false)
    }
  }

  async function handleSendOtp() {
    setError(null)
    setNotice(null)
    setLoading(true)
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "email-verification",
        fetchOptions: { headers: captchaHeaders(otpCaptcha.token) },
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
    setNotice(null)
    setLoading(true)
    try {
      const result = await authClient.emailOtp.verifyEmail({ email, otp })
      if (result.error) {
        setError(translateAuthError(result.error))
        return
      }
      setNotice("Votre e-mail est vérifié. Connectez-vous.")
      backToForm()
    } finally {
      setLoading(false)
    }
  }

  function completeSignIn() {
    if (next) {
      window.location.href = next
      return
    }
    onSuccess?.()
  }

  async function handleSocial(provider: "google" | "apple") {
    setError(null)
    setNotice(null)
    const result = await authClient.signIn.social({
      provider,
      callbackURL: socialSignInDestination(),
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
    captcha,
    otpCaptcha,
    otpSent,
    otp,
    setOtp,
    step,
    error,
    notice,
    loading,
    handleSignIn,
    handleSendOtp,
    handleVerifyOtp,
    handleSocial,
    backToForm,
  }
}

function socialSignInDestination() {
  return new URL(
    withoutAuthParams(window.location.href),
    window.location.origin
  ).toString()
}
