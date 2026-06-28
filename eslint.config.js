'use strict';

const js = require('@eslint/js');
const globals = require('globals');
const reactPlugin = require('eslint-plugin-react');
const reactHooks = require('eslint-plugin-react-hooks');
const tseslint = require('typescript-eslint');

/**
 * Flat ESLint config (ESLint 9+).
 *
 * The codebase has two worlds:
 *  - electron/  : Node.js / CommonJS main + preload + services
 *  - src/       : browser / React (ESM, JSX/TSX)
 *
 * Rules are intentionally pragmatic: this is a large project that has never
 * been linted, so we focus on real bugs (undefined vars, unsafe equality,
 * swallowed errors) and leave formatting to Prettier.
 */
module.exports = [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'release-auto/**',
      'build/**',
      'coverage/**',
      'config/user-settings.json',
      'config/runtime-state.json',
    ],
  },
  js.configs.recommended,

  // ESM config files at the repo root (vite.config.mjs, vitest.config.mjs)
  {
    files: ['*.config.mjs', '*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },

  // TypeScript files (renderer .ts/.tsx) — provide a TS parser
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, __APP_VERSION__: 'readonly' },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      react: reactPlugin,
      'react-hooks': reactHooks,
    },
    settings: { react: { version: '18' } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      eqeqeq: ['warn', 'smart'],
      // Use the TS-aware unused-vars rule; disable the base one to avoid double-reporting
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_|^React$',
        },
      ],
      'no-undef': 'off',
    },
  },

  // Electron main process / services + CommonJS test fixtures (Node, CommonJS)
  {
    files: ['electron/**/*.js', 'scripts/**/*.js', 'test/**/*.js', '*.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      eqeqeq: ['warn', 'smart'],
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-console': 'off',
    },
  },

  // Renderer (React, ESM, JS/JSX) — .ts/.tsx handled by the TypeScript block above
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: { react: reactPlugin, 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, __APP_VERSION__: 'readonly' },
    },
    settings: { react: { version: '18' } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react/jsx-uses-vars': 'warn',
      'react/jsx-uses-react': 'off',
      'react/react-in-jsx-scope': 'off',
      eqeqeq: ['warn', 'smart'],
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_|^React$',
        },
      ],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },

  // Tests (ESM; vitest helpers are imported explicitly). Must come last so it
  // overrides the CommonJS sourceType set by the electron/** glob above.
  {
    files: ['**/*.test.{js,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
  },
];
