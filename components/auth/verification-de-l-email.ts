"use client"

import { useState } from "react"

import {
  resolveAuthRefusal,
  translateAuthError,
} from "@/components/auth/auth-form-glue"
import { useTestDeSecurite } from "@/components/auth/test-de-securite"
import { authClient } from "@/lib/client"

export type OtpExchangeType = "email-verification" | "forget-password"

export function useOtpExchange({
  email,
  type,
  onSent,
  onVerified,
}: {
  email: string
  type: OtpExchangeType
  onSent?: () => void
  onVerified?: (email: string) => void
}) {
  const [otpSent, setOtpSent] = useState(false)
  const [otp, setOtp] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const captcha = useTestDeSecurite()

  async function send() {
    setError(null)
    setLoading(true)
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email,
        type,
        fetchOptions: { headers: captcha.headers },
      })
      if (result.error) {
        setError(resolveAuthRefusal(result.error, captcha.reset))
        return
      }
      setOtpSent(true)
      onSent?.()
    } finally {
      setLoading(false)
    }
  }

  async function verify() {
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
    otpSent,
    otp,
    setOtp,
    error,
    loading,
    send,
    verify,
    captchaField: captcha.field,
    captchaReady: captcha.ready,
  }
}
