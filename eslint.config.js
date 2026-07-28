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
      // The React Compiler correctness rules (eslint-plugin-react-hooks v6) are
      // WARN, not ERROR, in this Reanimated-heavy RN app. Audited every hit
      // (2026-07): they fire on Reanimated worklet writes (`sv.value = …`),
      // imperative run-once refs (`didInitialPop.current`), and legitimate
      // external-sync effects (hydrate form from loaded data, merge realtime
      // messages) — framework patterns, not bugs. Erroring would tax every
      // animated/realtime file with a disable comment for zero safety gain.
      // Same calibration the repo already chose for exhaustive-deps above; they
      // stay visible as warnings so genuinely new violations still surface.
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
]);
