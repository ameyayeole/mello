import { ExpoConfig } from 'expo/config';

export default (): ExpoConfig => ({
  name: 'MELLO',
  slug: 'mello',
  version: '1.0.0',
  scheme: 'mello',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: 'com.yourcompany.mello',
    supportsTablet: false,
    // Takes effect on the next native rebuild; until then the login screen
    // hides the Apple button (module gated in auth.service).
    usesAppleSignIn: true,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSLocationWhenInUseUsageDescription:
        'MELLO needs your location to show nearby events.',
      NSLocationAlwaysAndWhenInUseUsageDescription:
        'MELLO uses your location to show nearby events.',
      NSCameraUsageDescription:
        'MELLO needs camera access to upload your profile photo.',
      NSPhotoLibraryUsageDescription:
        'MELLO needs photo library access to choose a profile photo.',
    },
  },
  android: {
    package: 'com.yourcompany.mello',
    adaptiveIcon: {
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      backgroundColor: '#FF5E5B',
    },
    config: {
      googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_KEY },
    },
    permissions: [
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.CAMERA',
    ],
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-status-bar',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        resizeMode: 'contain',
        backgroundColor: '#FF5E5B',
      },
    ],
    'expo-secure-store',
    'expo-apple-authentication',
    'expo-web-browser',
    'expo-image',
    'expo-location',
    [
      'expo-notifications',
      {
        color: '#FF5E5B',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission:
          'Allow MELLO to access your photos to set a profile picture.',
      },
    ],
    // Live door-scanner. Only active after a native rebuild; until then the
    // check-in screen falls back to photo-scan + code (module gated in
    // checkin.service → isLiveScannerAvailable).
    [
      'expo-camera',
      {
        cameraPermission:
          'Allow MELLO to use the camera to scan attendees at your event.',
      },
    ],
  ],
  owner: 'ameyayeole',
  extra: {
    eas: { projectId: 'fa48a434-1aeb-4db4-8fb8-20d161088554' },
  },
});
