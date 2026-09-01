import { z } from "zod"

const emailField = z
  .string()
  .trim()
  .min(1, { message: "Saisissez votre adresse e-mail." })
  .pipe(z.email({ message: "Saisissez une adresse e-mail valide." }))

export const signInSchema = z.object({
  email: emailField,
  password: z.string().min(1, { message: "Saisissez votre mot de passe." }),
})

export const signUpSchema = z.object({
  name: z.string().trim().min(1, { message: "Saisissez votre nom complet." }),
  email: emailField,
  password: z.string().min(8, {
    message: "Le mot de passe doit contenir au moins 8 caractères.",
  }),
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
