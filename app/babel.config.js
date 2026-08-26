module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // Resolve o alias "@/*" -> "src/*" declarado no tsconfig.json
    [
      'module-resolver',
      {
        root: ['.'],
        extensions: ['.ios.ts', '.android.ts', '.ts', '.ios.tsx', '.android.tsx', '.tsx', '.js', '.json'],
        alias: { '@': './src' },
      },
    ],

    // OBRIGATÓRIO para react-native-vision-camera v4 (frame processors em JS)
    ['react-native-worklets-core/plugin'],

    // OBRIGATÓRIO: react-native-reanimated DEVE ser o último plugin da lista
    'react-native-reanimated/plugin',
  ],
};
