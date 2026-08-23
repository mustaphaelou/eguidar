import { redirect } from "next/navigation"

import { loginUrl } from "@/lib/lien-de-connexion"
import { getAdminSession } from "@/lib/use-cases/get-admin-session"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

export const INVALID_FORM_MESSAGE = "Formulaire invalide"

export interface AdminActionState {
  error?: string
}

export interface AdminActionOptions<Input> {
  next: string
  parse?: (formData: FormData) => Input | null
}

export interface AdminFormActionOptions<
  Input,
> extends AdminActionOptions<Input> {
  run: (input: Input) => AdminActionState | Promise<AdminActionState>
}

export interface AdminTaskActionOptions<
  Input,
> extends AdminActionOptions<Input> {
  run: (input: Input) => void | Promise<void>
}

export type AdminFormAction = (
  prevState: AdminActionState,
  formData: FormData
) => Promise<AdminActionState>

export type AdminTaskAction = (formData: FormData) => Promise<void>

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function executeAdminAction<Input, Result>(
  options: AdminActionOptions<Input> & {
    run: (input: Input) => Result | Promise<Result>
  },
  formData: FormData,
  resolveUserFacingError: (message: string) => Result,
  successResult: Result
): Promise<Result> {
  const session = await getAdminSession()
  if (!session) redirect(loginUrl(options.next))

  let input: Input | null
  try {
    input = options.parse
      ? options.parse(formData)
      : (formData as unknown as Input)
  } catch (error) {
    return resolveUserFacingError(errorMessage(error))
  }

  if (input === null) return successResult

  try {
    return await options.run(input)
  } catch (error) {
    if (error instanceof UserFacingError) {
      return resolveUserFacingError(error.message)
    }
    throw error
  }
}

export function adminFormAction<Input = FormData>(
  options: AdminFormActionOptions<Input>
): AdminFormAction {
  return async (_prevState, formData) =>
    executeAdminAction(options, formData, (message) => ({ error: message }), {})
}

export function adminTaskAction<Input = FormData>(
  options: AdminTaskActionOptions<Input>
): AdminTaskAction {
  return async (formData) => {
    await executeAdminAction(options, formData, () => undefined, undefined)
  }
}
