import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['**/dist', '**/node_modules', 'parser', 'supabase'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // A leading underscore marks a parameter as intentionally unused (e.g. Express's 4-arg
  // error handler, which Express recognises by its arity).
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },

  // Node packages: server, pipeline, shared
  {
    files: ['server/**/*.ts', 'pipeline/**/*.ts', 'shared/**/*.ts', '*.{js,ts}'],
    languageOptions: { globals: globals.node },
  },

  // Browser package: client
  {
    files: ['client/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // Must be last: turns off lint rules that fight with Prettier
  prettier,
);
