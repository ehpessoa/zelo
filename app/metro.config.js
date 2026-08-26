const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro precisa saber que ".tflite" é um asset binário (assim como
 * .png/.ttf), senão ele tenta interpretar o arquivo como módulo JS ao
 * usar require('...tflite') dentro do useBehaviorVision.
 */
const config = {
  resolver: {
    assetExts: [
      ...getDefaultConfig(__dirname).resolver.assetExts.filter((ext) => ext !== 'svg'),
      'tflite',
      'ttf',
    ],
    sourceExts: getDefaultConfig(__dirname).resolver.sourceExts,
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
