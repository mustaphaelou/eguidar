# Password reset flow via OTP on dedicated page

We decided to implement the password reset flow on a dedicated standalone page at `/mot-de-passe-oublie` (with a permanent redirect from `/request-password-reset`), using Better Auth's `emailOTP` plugin with a 2-step single-page experience (request OTP with Turnstile captcha -> verify OTP & set new password).

Why: Unlike login/signup, password reset is an infrequent, high-security recovery action that often involves email switching or external links. Keeping it on a clean standalone page avoids modal nesting complications. Using the existing Better Auth `emailOTP` plugin (`sendVerificationOtp` with `type: "forget-password"` and `resetPassword`) reuses the existing Resend email template and unified OTP verification mechanism without adding extra token schemas. Upon successful reset, the user is redirected to `/connexion` to log in with their updated credentials.

Considered options: link-based token reset with `/reinitialiser-mot-de-passe?token=...` (rejected — requires extra token routing and diverges from our OTP email infrastructure); in-modal reset flow (rejected — clutters the login dialog and risks state loss on accidental dismissal).
