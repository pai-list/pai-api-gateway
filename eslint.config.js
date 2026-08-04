import eslintPluginImport from 'eslint-plugin-import';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

/** @type {import("eslint").Linter.Config} */
export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      import: eslintPluginImport,
    },
    extends: [
      'eslint:recommended',
      'plugin:@typescript-eslint/recommended',
      'plugin:import/typescript',
      'plugin:prettier/recommended',
    ],
    rules: {
      // TypeScript specific rules
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-inferrable-types': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-empty-interface': 'warn',
      '@typescript-eslint/array-type': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/prefer-optional-chain': 'warn',

      // Import rules
      'import/no-unresolved': 'error',
      'import/no-duplicates': 'error',
      'import/order': 'warn',

      // Style rules
      'prefer-const': 'warn',
      'no-console': 'warn',
      'no-debugger': 'error',

      // Prettier integration
      'prettier/prettier': 'error',

      // Performance and maintainability
      'no-param-reassign': 'warn',
      'no-useless-catch': 'warn',
    },
  },
  {
    // Ignore build artifacts and node_modules
    ignores: ['dist/', 'node_modules/', '**/*.d.ts', '**/*.min.js'],
  },
];
