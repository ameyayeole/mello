const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

// Prettier is wired in as `eslint-config-prettier` (turns OFF stylistic rules
// that would fight the formatter) rather than `eslint-plugin-prettier` (which
// would report every formatting deviation as a lint error). The codebase
// predates the formatter, so enforcing it here would bury real findings under
// ~109 files of pure reformatting. Run `npm run format` to reformat on purpose.
module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: [
      'ios/**',
      'android/**',
      'dist/**',
      '.expo/**',
      // Deno runtime, different globals and import style.
      'supabase/functions/**',
    ],
  },
  {
    // eslint-config-expo only registers @typescript-eslint for these globs, so
    // the override has to be scoped the same way or the plugin resolves to
    // nothing on .js files.
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // Unused code is the smell class that let a whole dead feature survive
      // here, so it's an error — with the conventional underscore escape hatch
      // for deliberately-ignored args and caught errors.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
]);
