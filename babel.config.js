module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Module resolver for @/* path alias (maps to src/)
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@': './src',
          },
          extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json'],
        },
      ],
      // Worklets plugin (Reanimated 4+ moved it here) MUST be listed last
      'react-native-worklets/plugin',
    ],
  };
};
