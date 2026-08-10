export class AdminGateError extends Error {
  constructor() {
    super("Accès réservé à l'administrateur")
    this.name = "AdminGateError"
  }
}

export function isAdminRole(user: { role?: string | null } | null | undefined): boolean {
  return user?.role === "admin"
}

export function requireAdminRole(user: { role?: string | null } | null | undefined): asserts user is {
  role: "admin"
} {
  if (!isAdminRole(user)) throw new AdminGateError()
}
