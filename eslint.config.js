import node from "@burdenoff/toolchain/eslint/node";

// The toolchain's Node profile (typescript-eslint recommended, Node globals,
// no Prettier plugin). The trailing rules keep this repository's stricter
// settings: `any` is an error, unused variables may be prefixed with `_`, and
// the four rules ESLint 10's recommended set added over ESLint 9's (the
// toolchain supports ESLint 9) stay on.
export default node({
  ignores: ["boilerplate/**", "templates/**", ".eslintcache"],
  globals: { Bun: "readonly" },
  rules: {
    "no-shadow-restricted-names": ["error", { reportGlobalThis: true }],
    "no-unassigned-vars": "error",
    "no-useless-assignment": "error",
    "preserve-caught-error": ["error", { requireCatchParameter: false }],
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
      },
    ],
  },
});
