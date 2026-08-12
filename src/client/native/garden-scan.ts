import { Capacitor, registerPlugin } from '@capacitor/core';

export interface GardenScanCapabilities {
  platform: 'android' | 'web';
  native: boolean;
  cameraPermissionGranted: boolean;
  locationPermissionGranted: boolean;
  arCoreAvailability: string;
  arCoreSupported: boolean;
  arCoreInstalled: boolean;
  depthSupported: boolean;
  sceneSemanticsSupported: boolean;
  probeError?: string;
}

export interface GardenScanSummary {
  sessionId: string;
  sessionPath: string;
  keyframes: number;
  frames: number;
  durationMs: number;
  depthEnabled: boolean;
  sceneSemanticsEnabled: boolean;
  locationCaptured: boolean;
  completed?: boolean;
}

export interface GardenScanReconstructionSummary {
  sessionId: string;
  sourceSchemaVersion: number;
  coordinateFrame: 'scan-origin' | 'legacy-arcore-world' | string;
  keyframesProcessed: number;
  keyframesSkipped: number;
  acceptedSamples: number;
  voxels: number;
  clusters: number;
  semanticSamples: Record<string, number>;
  reconstructionFile: string;
  voxelFile: string;
}

type NativeGardenScanCapabilities = Omit<GardenScanCapabilities, 'native'>;

interface GardenScanNativePlugin {
  getCapabilities(): Promise<NativeGardenScanCapabilities>;
  requestScanPermission(): Promise<NativeGardenScanCapabilities>;
  ensureArCore(): Promise<{ status: string }>;
  startScan(): Promise<GardenScanSummary>;
  reconstructLatestScan(): Promise<GardenScanReconstructionSummary>;
}

const NativeGardenScan = registerPlugin<GardenScanNativePlugin>('GardenScan');

export function isAndroidNative(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

function webCapabilities(): GardenScanCapabilities {
  return {
    platform: 'web',
    native: false,
    cameraPermissionGranted: false,
    locationPermissionGranted: false,
    arCoreAvailability: 'WEB_ONLY',
    arCoreSupported: false,
    arCoreInstalled: false,
    depthSupported: false,
    sceneSemanticsSupported: false,
  };
}

export async function getGardenScanCapabilities(): Promise<GardenScanCapabilities> {
  if (!isAndroidNative()) return webCapabilities();
  const capabilities = await NativeGardenScan.getCapabilities();
  return { ...capabilities, native: true };
}

export async function requestGardenScanPermission(): Promise<GardenScanCapabilities> {
  if (!isAndroidNative()) throw new Error('Smart Garden Scan kræver Have Guide Android-appen.');
  const capabilities = await NativeGardenScan.requestScanPermission();
  return { ...capabilities, native: true };
}

export async function ensureGardenScanArCore(): Promise<{ status: string }> {
  if (!isAndroidNative()) throw new Error('Smart Garden Scan kræver Have Guide Android-appen.');
  return NativeGardenScan.ensureArCore();
}

export async function startGardenScan(): Promise<GardenScanSummary> {
  if (!isAndroidNative()) throw new Error('Smart Garden Scan kræver Have Guide Android-appen.');
  return NativeGardenScan.startScan();
}

export async function reconstructLatestGardenScan(): Promise<GardenScanReconstructionSummary> {
  if (!isAndroidNative()) throw new Error('Spatial rekonstruktion kræver Have Guide Android-appen.');
  return NativeGardenScan.reconstructLatestScan();
}
