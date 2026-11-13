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
};

export default config;
