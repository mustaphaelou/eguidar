import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { SignInForm } from "@/components/auth/sign-in-form"

export const metadata: Metadata = {
  title: "Se connecter",
  description:
    "Connectez-vous à votre compte eguidar.ma pour passer commande et suivre vos livraisons.",
}

export default function SignInPage() {
  return (
    <>
      <h1 className="sr-only">Se connecter à Eguidar</h1>
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center gap-2 text-center">
          <CardTitle className="text-xl">Connexion à Eguidar</CardTitle>
          <CardDescription>
            Pas encore de compte ?{" "}
            <Link
              href="/inscription"
              className="underline underline-offset-4 hover:text-primary"
            >
              Inscrivez-vous
            </Link>
          </CardDescription>
        </CardHeader>
        <Suspense fallback={null}>
          <CardContent>
            <SignInForm
              hasGoogle={Boolean(process.env.GOOGLE_CLIENT_ID)}
              hasApple={Boolean(process.env.APPLE_CLIENT_ID)}
            />
          </CardContent>
        </Suspense>
      </Card>
    </>
  )
}
