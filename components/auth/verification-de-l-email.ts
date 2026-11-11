"use client"

import { useState } from "react"

import {
  MESSAGE_SERVEUR_INJOIGNABLE,
  resolveAuthRefusal,
  translateAuthError,
} from "@/components/auth/auth-form-glue"
import { portAuthentificationClient } from "@/components/auth/port-authentification-client"
import type { PortAuthentification } from "@/components/auth/port-authentification"
import { useTestDeSecurite } from "@/components/auth/test-de-securite"
import {
  ACTIONS_PAR_TYPE_OTP,
  type TypeOtp,
} from "@/lib/vocabulaire-test-de-securite"

export type OtpExchangeType = TypeOtp

export function useOtpExchange(
  {
    email,
    type,
    onSent,
    onVerified,
  }: {
    email: string
    type: OtpExchangeType
    onSent?: () => void
    onVerified?: (email: string) => void
  },
  port: PortAuthentification = portAuthentificationClient
) {
  const [otpSent, setOtpSent] = useState(false)
  const [otp, setOtp] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const captcha = useTestDeSecurite(ACTIONS_PAR_TYPE_OTP[type])

  async function send() {
    setError(null)
    setLoading(true)
    try {
      const result = await port.envoyerCode({
        email,
        type,
        entetes: captcha.headers,
      })
      if (result.error) {
        setError(resolveAuthRefusal(result.error, captcha.reset))
        return
      }
      setOtpSent(true)
      onSent?.()
    } catch {
      setError(MESSAGE_SERVEUR_INJOIGNABLE)
    } finally {
      setLoading(false)
    }
  }

  async function verify() {
    setError(null)
    setLoading(true)
    try {
      const result = await port.verifierCode({ email, code: otp })
      if (result.error) {
        setError(translateAuthError(result.error))
        return
      }
      onVerified?.(email)
    } catch {
      setError(MESSAGE_SERVEUR_INJOIGNABLE)
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
