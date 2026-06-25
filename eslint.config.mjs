import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Single flat config for the whole monorepo. Rules are scoped by path:
 * frontend gets React/browser rules, backend + electron get Node rules.
 * `prettier` is last so it disables any stylistic rules that fight the formatter.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/out/**',
      '**/node_modules/**',
      '**/*.config.{js,cjs,mjs,ts}',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Underscore-prefixed names are intentionally unused; warn (don't block) on the rest.
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // Frontend — React + browser globals.
  {
    files: ['frontend/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // Backend + electron — Node globals.
  {
    files: ['backend/**/*.ts', 'electron/**/*.{ts,js}'],
    languageOptions: { globals: { ...globals.node } },
  },

  prettier,
);
