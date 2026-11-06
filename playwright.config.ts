import { defineConfig, devices } from "@playwright/test"

/**
 * La sonde navigateur : le format d'un téléphone courant, mouvement réduit, et
 * aucune reprise. Un projet « preparation » ouvre d'abord la Session courante
 * une seule fois (son état est réutilisé par les cas qui la déclarent) ; le
 * projet Chromium n'est lancé qu'après lui. Le serveur n'est pas lancé par
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
  projects: [
    // La Session courante s'ouvre une fois, avant la sonde : les cas qui en
    // dépendent déclarent `test.use({ storageState: FICHIER_DE_SESSION })`.
    // Les cas anonymes (Panier visiteur) gardent un contexte sans session.
    { name: "preparation", testMatch: "**/*.setup.ts" },
    {
      name: "chromium-mobile",
      testMatch: "**/*.spec.ts",
      dependencies: ["preparation"],
    },
  ],
})
