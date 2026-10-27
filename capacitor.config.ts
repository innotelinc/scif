import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.scif.privatecomms',
  appName: 'SCIF',
  webDir: 'dist',
  plugins: {
    PushNotifications: {
      presentationOptions: ['alert', 'sound', 'badge']
    }
  }
};

export default config;
