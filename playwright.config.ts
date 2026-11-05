import { defineConfig, devices } from "@playwright/test"

/**
 * La sonde navigateur : un seul projet Chromium, le format d'un téléphone
 * courant, mouvement réduit, et aucune reprise. Le serveur n'est pas lancé par
 * `webServer` : la fixture de worker copie l'artefact construit et le démarre
 * sur un port libre, comme le Dockerfile le ferait.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  outputDir: "test-results",
  use: {
    ...devices["Desktop Chrome"],
    browserName: "chromium",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [{ name: "chromium-mobile" }],
})
