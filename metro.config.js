const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// .lottie (dotLottie) files are binary archives, so Metro has to treat them as
// assets rather than trying to parse them as source.
config.resolver.assetExts.push('lottie');

module.exports = config;
