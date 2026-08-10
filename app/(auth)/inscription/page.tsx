import type { Metadata } from "next"

import { SignUpForm } from "@/components/auth/sign-up-form"

export const metadata: Metadata = {
  title: "Créer un compte — Eguidar",
}

export default function SignUpPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Eguidar</h1>
      <SignUpForm />
    </>
  )
}
