import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.srgoodjob.haveguide',
  appName: 'HaveGuide',
  webDir: 'dist/client',
  server: {
    androidScheme: 'https',
  },
};

export default config;
