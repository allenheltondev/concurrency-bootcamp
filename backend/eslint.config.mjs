/* ESLint flat config for the backend — @eslint/js recommended (the default
   rule set), Node globals, one adjustment: destructure-and-drop
   (`const { pk, sk, type, ...rest } = item`) is how the DAL strips storage
   attributes, so rest siblings don't count as unused. */
import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/"] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node }
    },
    rules: {
      "no-unused-vars": ["error", { ignoreRestSiblings: true, argsIgnorePattern: "^_", varsIgnorePattern: "^_" }]
    }
  },
  {
    // The hexagonal boundary, enforced: the domain core imports no AWS SDK,
    // no Powertools, no middy, and nothing from the adapters — only other
    // domain modules. A violation fails CI, not a code review.
    files: ["src/domain/**"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["@aws-sdk/*", "@aws-lambda-powertools/*", "@middy/*", "zod", "**/adapters/**", "**/lib/**"],
          message: "src/domain is the hexagonal core — inject dependencies through ports instead of importing infrastructure."
        }]
      }]
    }
  }
];
