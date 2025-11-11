module.exports = {
  env: {
    browser: true,
    es6: true,
    node: true,
  },
  root: true,
  plugins: [
    "@stylistic",
  ],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "plugin:import/recommended",
    "plugin:import/typescript",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "plugin:@stylistic/recommended", // Add stylistic rules
  ],
  rules: {
    //    "import/no-cycle": ["error"],
    "comma-dangle": ["error", "always-multiline"],
    "eqeqeq": ["error"],
    "@typescript-eslint/no-unnecessary-condition": "error",
    "no-mixed-operators": ["error"],
    "semi": [
      "error",
      "never"
    ],
    "react-hooks/exhaustive-deps": "error",
    "@typescript-eslint/no-unused-vars": [
      "error", {
        "caughtErrors": "none"
      }
    ],
    "@typescript-eslint/no-misused-promises": [
      "error",
      {
        "checksVoidReturn": false
      }
    ],
    // Stylistic rules from your reference
    "@stylistic/indent": ["error", 2],
    "@stylistic/quotes": ["error", "double"],
    "@stylistic/member-delimiter-style": ["error", {
      "multiline": {
        "delimiter": "semi",
        "requireLast": true
      },
      "singleline": {
        "delimiter": "semi",
        "requireLast": false
      }
    }],
    "@stylistic/type-generic-spacing": "error",
    "@stylistic/type-annotation-spacing": "error",
    "@stylistic/function-call-spacing": ["error", "never"],
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: [
      "./tsconfig.json"
    ]
  },
  settings: {
    "import/resolver": {
      "typescript": { }
    },
    react: {
      version: "detect"
    }
  },
  ignorePatterns: [
    "webpack.*",
    "forge.config.ts",
    "src/libs/**",
    "src/onlyfans/demo/**",
    "vitest.config.mts"
  ]
};
