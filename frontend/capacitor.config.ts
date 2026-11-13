import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.openmercy.app',
  appName: 'Open Mercy',
  webDir: 'dist',
  // The web view's own colour, seen for a moment after the launch screen
  // before the page draws: the app's black, not a white flash.
  backgroundColor: '#0a0a0b',
  plugins: {
    // Google, plus Apple on iOS, where Apple requires it beside Google. The
    // other providers stay out of the binary (their SDKs are not bundled).
    SocialLogin: {
      providers: {
        google: true,
        apple: true,
        facebook: false,
        twitter: false,
      },
    },
  },
  experimental: {
    ios: {
      spm: {
        // Firebase Analytics without the advertising identifier: no IDFA is
        // read, so the app needs no App Tracking Transparency prompt.
        swiftToolsVersion: '6.1',
        packageTraits: {
          '@capacitor-firebase/analytics': ['AnalyticsWithoutAdIdSupport'],
        },
        // Avoids a SwiftPM package identity collision (capacitor-firebase#959).
        packageOptions: {
          '@capacitor-firebase/analytics': { symlink: true },
        },
      },
    },
  },
};

export default config;
