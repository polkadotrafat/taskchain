import { defineConfig, globals } from "eslint/config";
import next from "eslint-config-next";

export default defineConfig([
  {
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  ...next,
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ]
  }
]);
