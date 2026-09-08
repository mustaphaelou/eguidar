"use client"

import { useState } from "react"

import {
  captchaHeaders,
  translateAuthError,
  useCaptcha,
} from "@/components/auth/auth-form-glue"
import { authClient } from "@/lib/client"
import { collectFieldIssues, signUpSchema } from "@/lib/auth-form-schemas"

export type SignUpStep = "form" | "otp"

export type SignUpFlow = ReturnType<typeof useSignUpFlow>

export function useSignUpFlow({
  initialEmail,
  onVerified,
  onIssues,
}: {
  initialEmail?: string
  onVerified?: (email: string) => void
  onIssues?: (issues: Record<string, string>) => void
} = {}) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState(initialEmail ?? "")
  const [password, setPassword] = useState("")
  const [otpSent, setOtpSent] = useState(false)
  const [otp, setOtp] = useState("")
  const [step, setStep] = useState<SignUpStep>("form")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const formCaptcha = useCaptcha()
  const otpCaptcha = useCaptcha()

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    const parsed = signUpSchema.safeParse({ name, email, password })
    if (!parsed.success) {
      onIssues?.(collectFieldIssues(parsed.error))
      return
    }
    onIssues?.({})
    setError(null)
    setLoading(true)
    try {
      const result = await authClient.signUp.email({
        name: parsed.data.name,
        email: parsed.data.email,
        password: parsed.data.password,
        fetchOptions: { headers: captchaHeaders(formCaptcha.token) },
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

  async function handleSendOtp() {
    setError(null)
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
    setLoading(true)
    try {
      const result = await authClient.emailOtp.verifyEmail({ email, otp })
      if (result.error) {
        setError(translateAuthError(result.error))
        return
      }
      onVerified?.(email)
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
    otpSent,
    otp,
    setOtp,
    step,
    error,
    loading,
    formCaptcha,
    otpCaptcha,
    handleSignUp,
    handleSendOtp,
    handleVerifyOtp,
  }
}
