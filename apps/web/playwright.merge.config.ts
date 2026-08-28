import { defineConfig } from "@playwright/test";

/**
 * Reporters for `playwright merge-reports` after CI shards finish.
 * Produces the same HTML + JSON artifacts the single-runner job used to emit.
 */
export default defineConfig({
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "e2e-report" }],
    ["json", { outputFile: "e2e-results.json" }],
  ],
});
