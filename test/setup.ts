import "dotenv/config"
import { vi } from "vitest"

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL

delete process.env.CLOUDFLARE_ZONE_ID
delete process.env.CLOUDFLARE_API_TOKEN

declare global {
  var BASE_UI_ANIMATIONS_DISABLED: boolean
}

// happy-dom 21 implémente `Element.getAnimations()` : Base UI attend alors une
// frame avant de démonter une boîte de dialogue fermée. Sans CSS, cette attente
// n'a rien à mesurer, et la fermeture reste synchrone pour les tests.
globalThis.BASE_UI_ANIMATIONS_DISABLED = true

vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  refresh: vi.fn(),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}))
