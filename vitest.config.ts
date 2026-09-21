import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Root config for the pure workspace packages (`@arbor/format`,
// `@arbor/invoice-document`). Convex function tests live under
// `packages/backend/convex` and run with their own `convex-test`/edge-runtime
// setup, so they are excluded here.
export default defineConfig({
  resolve: {
    // Mirror the web app's `@/*` tsconfig path so component smoke tests can
    // import modules that use it (e.g. `@/lib/utils`).
    alias: { "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: [
      "packages/format/**/*.test.ts",
      "packages/invoice-document/**/*.test.ts",
      "packages/rider-document/**/*.test.ts",
      "packages/show-file/**/*.test.ts",
      "packages/email/**/*.test.ts",
      "packages/backend/convex/lib/**/*.test.ts",
      "apps/web/src/lib/**/*.test.ts",
      // Server-rendered component smoke tests (no DOM needed).
      "apps/web/src/components/**/*.smoke.test.tsx",
    ],
  },
});
