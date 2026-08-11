import { Suspense } from "react"
import type { Metadata } from "next"

import { SignInForm } from "@/components/auth/sign-in-form"

export const metadata: Metadata = {
  title: "Se connecter",
  description:
    "Connectez-vous à votre compte eguidar.ma pour passer commande et suivre vos livraisons.",
}

export default function SignInPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Eguidar</h1>
      <Suspense fallback={null}>
        <SignInForm hasGoogle={Boolean(process.env.GOOGLE_CLIENT_ID)} hasApple={Boolean(process.env.APPLE_CLIENT_ID)} />
      </Suspense>
    </>
  )
}
