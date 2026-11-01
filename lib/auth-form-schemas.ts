import { z } from "zod"

import { LONGUEUR_MINIMALE_MOT_DE_PASSE } from "@/lib/longueur-mot-de-passe"

export const MESSAGE_MOT_DE_PASSE_TROP_COURT = `Le mot de passe doit contenir au moins ${LONGUEUR_MINIMALE_MOT_DE_PASSE} caractères.`

export const MESSAGE_MOTS_DE_PASSE_DIFFERENTS =
  "Les mots de passe ne correspondent pas."

const emailField = z
  .string()
  .trim()
  .min(1, { message: "Saisissez votre adresse e-mail." })
  .pipe(z.email({ message: "Saisissez une adresse e-mail valide." }))

export const signInSchema = z.object({
  email: emailField,
  password: z.string().min(1, { message: "Saisissez votre mot de passe." }),
})

const champMotDePasse = z.string().min(LONGUEUR_MINIMALE_MOT_DE_PASSE, {
  message: MESSAGE_MOT_DE_PASSE_TROP_COURT,
})

export const signUpSchema = z.object({
  name: z.string().trim().min(1, { message: "Saisissez votre nom complet." }),
  email: emailField,
  password: champMotDePasse,
})

export const resetPasswordSchema = z
  .object({
    password: champMotDePasse,
    confirmPassword: z.string(),
  })
  .refine(({ password, confirmPassword }) => password === confirmPassword, {
    message: MESSAGE_MOTS_DE_PASSE_DIFFERENTS,
    path: ["confirmPassword"],
  })

export function collectFieldIssues(error: z.ZodError): Record<string, string> {
  const issues: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path[0]
    if (typeof key === "string") {
      issues[key] ??= issue.message
    }
  }
  return issues
}
