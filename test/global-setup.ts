import "dotenv/config"

import { execSync } from "node:child_process"

export default function globalSetup() {
  const testDbUrl = process.env.TEST_DATABASE_URL
  if (!testDbUrl) throw new Error("TEST_DATABASE_URL is not set")

  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: testDbUrl },
    stdio: "inherit",
  })
}
