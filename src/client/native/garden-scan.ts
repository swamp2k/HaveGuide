import { Capacitor, registerPlugin } from '@capacitor/core';

export interface GardenScanCapabilities {
  platform: 'android' | 'web';
  native: boolean;
  arCoreAvailability: string;
  arCoreSupported: boolean;
  arCoreInstalled: boolean;
  depthSupported: boolean;
  sceneSemanticsSupported: boolean;
  probeError?: string;
}

interface GardenScanNativePlugin {
  getCapabilities(): Promise<Omit<GardenScanCapabilities, 'native'>>;
  ensureArCore(): Promise<{ status: string }>;
}

const NativeGardenScan = registerPlugin<GardenScanNativePlugin>('GardenScan');

export function isAndroidNative(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export async function getGardenScanCapabilities(): Promise<GardenScanCapabilities> {
  if (!isAndroidNative()) {
    return {
      platform: 'web',
      native: false,
      arCoreAvailability: 'WEB_ONLY',
      arCoreSupported: false,
      arCoreInstalled: false,
      depthSupported: false,
      sceneSemanticsSupported: false,
    };
  }

  const capabilities = await NativeGardenScan.getCapabilities();
  return { ...capabilities, native: true };
}

export async function ensureGardenScanArCore(): Promise<{ status: string }> {
  if (!isAndroidNative()) throw new Error('Smart Garden Scan kræver Have Guide Android-appen.');
  return NativeGardenScan.ensureArCore();
}
