import type { Metadata } from "next"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { SignUpForm } from "@/components/auth/sign-up-form"

export const metadata: Metadata = {
  title: "Créer un compte",
  description:
    "Créez votre compte eguidar.ma pour commander en ligne et payer à la livraison partout au Maroc.",
}

export default function SignUpPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Eguidar</h1>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Créer un compte</CardTitle>
          <CardDescription>
            Inscrivez-vous pour passer commande et suivre vos livraisons.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignUpForm />
        </CardContent>
      </Card>
    </>
  )
}
