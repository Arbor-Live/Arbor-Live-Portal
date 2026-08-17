import { defineConfig } from "vitest/config";

// Root config for the pure workspace packages (`@arbor/format`,
// `@arbor/invoice-document`). Convex function tests live under
// `packages/backend/convex` and run with their own `convex-test`/edge-runtime
// setup, so they are excluded here.
export default defineConfig({
  test: {
    environment: "node",
    include: [
      "packages/format/**/*.test.ts",
      "packages/invoice-document/**/*.test.ts",
      "packages/rider-document/**/*.test.ts",
      "packages/show-file/**/*.test.ts",
      "packages/backend/convex/lib/**/*.test.ts",
      "apps/web/src/lib/**/*.test.ts",
      // Server-rendered component smoke tests (no DOM needed).
      "apps/web/src/components/**/*.smoke.test.tsx",
    ],
  },
});
