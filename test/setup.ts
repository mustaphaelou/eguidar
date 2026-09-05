import "dotenv/config"
import { vi } from "vitest"

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL

vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  refresh: vi.fn(),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}))
