import { Suspense } from "react"

import { AuthDialogsProvider } from "./auth-dialogs-context"
import { AuthUrlSanitizer } from "./auth-url-sanitizer"
import { SignInDialog } from "./sign-in-dialog"
import { SignUpDialog } from "./sign-up-dialog"

export function AuthDialogs({ children }: { children: React.ReactNode }) {
  return (
    <AuthDialogsProvider>
      {children}
      <AuthUrlSanitizer />
      <Suspense fallback={null}>
        <SignInDialog
          hasGoogle={Boolean(process.env.GOOGLE_CLIENT_ID)}
          hasApple={Boolean(process.env.APPLE_CLIENT_ID)}
        />
      </Suspense>
      <Suspense fallback={null}>
        <SignUpDialog />
      </Suspense>
    </AuthDialogsProvider>
  )
}
