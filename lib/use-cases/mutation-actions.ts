import { redirect } from "next/navigation"

import { loginUrl } from "@/lib/lien-de-connexion"
import { getAdminSession } from "@/lib/use-cases/get-admin-session"
import { getSessionUser } from "@/lib/use-cases/get-session"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

export const INVALID_FORM_MESSAGE = "Formulaire invalide"

export interface MutationActionState {
  error?: string
}

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getSessionUser>>>

export interface MutationActionOptions<Input, Caller> {
  gate: () => Promise<Caller | null>
  next: string
  parse?: (formData: FormData) => Input | null
}

export interface MutationFormActionOptions<
  Input,
  Caller,
  State extends MutationActionState = MutationActionState,
> extends MutationActionOptions<Input, Caller> {
  run: (input: Input, caller: Caller) => NoInfer<State> | Promise<NoInfer<State>>
}

export interface MutationTaskActionOptions<
  Input,
  Caller,
> extends MutationActionOptions<Input, Caller> {
  run: (input: Input, caller: Caller) => void | Promise<void>
}

export type MutationFormAction<
  State extends MutationActionState = MutationActionState,
> = (
  prevState: State,
  formData: FormData
) => Promise<State | { error: string }>

export type MutationTaskAction = (formData: FormData) => Promise<void>

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function executeMutationAction<Input, Caller, Result>(
  options: MutationActionOptions<Input, Caller> & {
    run: (input: Input, caller: Caller) => Result | Promise<Result>
  },
  formData: FormData,
  resolveUserFacingError: (message: string) => Result,
  successResult: Result
): Promise<Result> {
  const caller = await options.gate()
  if (!caller) redirect(loginUrl(options.next))

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
    return await options.run(input, caller)
  } catch (error) {
    if (error instanceof UserFacingError) {
      return resolveUserFacingError(error.message)
    }
    throw error
  }
}

export function mutationFormAction<
  Input = FormData,
  Caller = unknown,
  State extends MutationActionState = MutationActionState,
>(
  options: MutationFormActionOptions<Input, Caller, State>
): MutationFormAction<State> {
  return async (_prevState, formData) =>
    executeMutationAction<Input, Caller, State | { error: string }>(
      options,
      formData,
      (message) => ({ error: message }),
      {} as State
    )
}

export function mutationTaskAction<Input = FormData, Caller = unknown>(
  options: MutationTaskActionOptions<Input, Caller>
): MutationTaskAction {
  return async (formData) => {
    await executeMutationAction<Input, Caller, void>(
      options,
      formData,
      () => undefined,
      undefined
    )
  }
}

async function adminGate(): Promise<SessionUser | null> {
  const session = await getAdminSession()
  return session?.user ?? null
}

export function formAction<
  Input = FormData,
  State extends MutationActionState = MutationActionState,
>(
  options: Omit<MutationFormActionOptions<Input, SessionUser, State>, "gate">
): MutationFormAction<State> {
  return mutationFormAction<Input, SessionUser, State>({
    ...options,
    gate: getSessionUser,
  })
}

export function taskAction<Input = FormData>(
  options: Omit<MutationTaskActionOptions<Input, SessionUser>, "gate">
): MutationTaskAction {
  return mutationTaskAction<Input, SessionUser>({
    ...options,
    gate: getSessionUser,
  })
}

export function adminFormAction<
  Input = FormData,
  State extends MutationActionState = MutationActionState,
>(
  options: Omit<MutationFormActionOptions<Input, SessionUser, State>, "gate">
): MutationFormAction<State> {
  return mutationFormAction<Input, SessionUser, State>({
    ...options,
    gate: adminGate,
  })
}

export function adminTaskAction<Input = FormData>(
  options: Omit<MutationTaskActionOptions<Input, SessionUser>, "gate">
): MutationTaskAction {
  return mutationTaskAction<Input, SessionUser>({
    ...options,
    gate: adminGate,
  })
}
