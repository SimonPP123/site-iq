import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

// ESLint 9 flat config. eslint-config-next v16 ships native flat-config arrays, so we spread them
// directly (no FlatCompat) and layer the project rules on top.
const eslintConfig = [
  {
    ignores: [
      "node_modules/",
      ".next/",
      "out/",
      "public/",
      "coverage/",
      "playwright-report/",
      "test-results/",
      "next-env.d.ts",
      "n8n-workflows/",
    ],
  },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "prefer-const": "error",
      "no-var": "error",
      eqeqeq: ["error", "always"],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports" },
      ],
      "react/jsx-no-target-blank": "error",
      "react/self-closing-comp": "warn",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // Resetting a local flag when a prop/dep changes (e.g. the report-status effects, theme sync)
      // is an intentional, correct use of setState-in-effect here; keep it visible as a warning.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];

export default eslintConfig;
