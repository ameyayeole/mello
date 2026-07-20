// Jest config for Expo SDK 56 / React 19. Per the Expo docs, `jest-expo` is the
// preset — it wires up the Babel transform, the React Native module mocks and
// the platform-specific module resolution that a plain `ts-jest` setup would
// have to reproduce by hand.
//
// Note there is no `react-test-renderer` here on purpose: it does not support
// React 19, which is why @testing-library/react-native replaces it.
module.exports = {
  preset: 'jest-expo',

  // Everything in node_modules is normally left untransformed, but React Native
  // and the Expo packages ship untranspiled ESM/Flow, so they have to be run
  // through Babel. This is the list from the Expo docs, trimmed to the
  // ecosystems this app actually depends on and extended with the ones it adds
  // (reanimated, gesture-handler, bottom-sheet, supabase, lucide).
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)' +
      '|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*' +
      '|react-navigation|@react-navigation/.*' +
      '|react-native-svg|react-native-reanimated|react-native-gesture-handler' +
      '|react-native-safe-area-context|@gorhom/.*' +
      '|@supabase/.*|lucide-react-native)',
  ],

  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],

  // Deliberately no moduleNameMapper. jest-expo already derives the `@/` alias
  // from tsconfig paths, and a top-level mapper *replaces* the preset's rather
  // than merging with it — which silently drops the react-native mapping and
  // breaks @testing-library/react-native's renderer resolution.

  // Scoped deliberately. The pure logic in utils/ and the mockable Supabase
  // calls in services/ are what make the two big components safe to refactor;
  // screen tests are a separate, much larger undertaking.
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts?(x)'],

  collectCoverageFrom: ['src/utils/**/*.ts', 'src/services/**/*.ts'],
};
