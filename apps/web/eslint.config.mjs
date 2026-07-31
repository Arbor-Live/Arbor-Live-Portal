import { fixupConfigRules } from "@eslint/compat";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// `fixupConfigRules` shims the `context` methods ESLint 10 removed
// (`getFilename`, `getScope`, `getSourceCode`, `getAncestors`). Every plugin
// eslint-config-next bundles is clean except eslint-plugin-react, whose latest
// release (7.37.5) still calls them and throws on load without this. Drop the
// wrapper once eslint-config-next ships an ESLint 10 compatible react plugin.
const eslintConfig = defineConfig([
  ...fixupConfigRules(nextVitals),
  ...fixupConfigRules(nextTs),
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
