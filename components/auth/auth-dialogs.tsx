import { AuthDialogsProvider } from "./auth-dialogs-context"
import { SignInDialog } from "./sign-in-dialog"
import { SignUpDialog } from "./sign-up-dialog"

export function AuthDialogs({ children }: { children: React.ReactNode }) {
  return (
    <AuthDialogsProvider>
      {children}
      <SignInDialog
        hasGoogle={Boolean(process.env.GOOGLE_CLIENT_ID)}
        hasApple={Boolean(process.env.APPLE_CLIENT_ID)}
      />
      <SignUpDialog />
    </AuthDialogsProvider>
  )
}
