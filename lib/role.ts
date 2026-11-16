export type Role = "user" | "admin"

export function estRoleAdmin(role: string): boolean {
  return role === "admin"
}
