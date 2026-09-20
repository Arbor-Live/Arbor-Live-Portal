import { fixupConfigRules } from "@eslint/compat";
import { plugin as shadcn } from "@shadcn/lint";
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
  {
    plugins: { shadcn },
    settings: {
      shadcn: {
        ui: "@/components/ui",
      },
    },
    rules: {
      // Underscore-prefixed bindings are intentional throwaways (e.g. pulling a
      // prop out of a destructure so it is not forwarded to the DOM).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  // The design-system components own their own spacing/colors; rules should
  // only apply to call sites, not to the component definitions themselves.
  {
    files: ["src/components/ui/**"],
    rules: {
      "shadcn/no-restyle": "off",
      "shadcn/no-raw-colors": "off",
      "shadcn/no-arbitrary-values": "off",
      "shadcn/no-inline-styles": "off",
      "shadcn/no-unknown-classes": "off",
      "shadcn/require-static-classes": "off",
    },
  },
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
