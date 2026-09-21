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
      // Unknown classes silently generate no CSS; catching them is always safe.
      "shadcn/no-unknown-classes": "error",
      // Colors must come from the theme. The status palette lives under
      // `status-<hue>-<shade>` in globals.css; legacy utility colors are tokens.
      "shadcn/no-raw-colors": "error",
      // Disallow off-token values. The allow list is deliberately narrow: it
      // covers only families where a one-off value is the design —
      //   - grid templates and spans for the many bespoke data tables,
      //   - decorative background gradients / custom shadows ("color" category:
      //     arbitrary *color values*, which shadcn/no-raw-colors governs
      //     separately — this rule is about lengths),
      //   - multi-property transitions and their easing/duration,
      //   - viewport-relative and composite sizes (min-h-[80vh],
      //     min-w-[min(100%,24rem)], w-[calc(100%-0.5rem)]) that express a
      //     responsive relationship rather than a fixed length,
      //   - values derived from a CSS variable (left-[var(--sidebar-width)]).
      // Everything else has a token in globals.css: status colors, the compact
      // text sizes, tracking, aspect ratios, radius, the focus-ring width, the
      // table min-widths, the nav banner padding, and z-index.
      "shadcn/no-arbitrary-values": [
        "error",
        {
          allow: [
            "color",
            "grid-cols",
            "grid-rows",
            "shadow",
            "transition",
            "duration",
            "ease",
            "blur",
            "scale",
            "rotate",
            "min-h",
            "max-h",
            "min-w",
            "max-w",
            "w",
            "left",
            "right",
            "top",
            "bottom",
          ],
        },
      ],
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
