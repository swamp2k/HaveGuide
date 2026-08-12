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

export interface GardenScanSpatialBounds {
  min: [number, number, number];
  max: [number, number, number];
  sizeMeters?: [number, number, number];
}

export interface GardenScanVisionCandidate {
  clusterId: string;
  semanticLabel: string;
  preliminaryType: string;
  samples: number;
  spatialConfidence: number;
  centroid: [number, number, number];
  bounds: GardenScanSpatialBounds;
  keyframeId: string;
  imageBase64: string;
  mimeType: 'image/jpeg' | 'image/png';
}

export interface GardenScanVisionCandidateBatch {
  sessionId: string;
  coordinateFrame: string;
  candidateCount: number;
  bounds?: { available?: boolean } & Partial<GardenScanSpatialBounds>;
  candidates: GardenScanVisionCandidate[];
}

export interface GardenScanVisionClassification {
  clusterId: string;
  type: string;
  confidence: number;
  description: string;
  semanticLabel: string;
  model: string;
}

export interface GardenScanDraftFeature {
  id: string;
  type: string;
  confidence: number;
  reviewRequired: boolean;
  visionClassified: boolean;
  samples: number;
  voxels: number;
  centroid: [number, number, number];
  bounds: GardenScanSpatialBounds;
  sourceClusterIds: string[];
  semanticLabels: string[];
  evidenceKeyframes: string[];
  visionEvidence: string[];
}

export interface GardenScanUnderstandingSummary {
  sessionId: string;
  sourceClusters: number;
  visionClassifiedClusters: number;
  features: number;
  reviewRequired: number;
  typeCounts: Record<string, number>;
  bounds?: { available?: boolean } & Partial<GardenScanSpatialBounds>;
  draftFeatures: GardenScanDraftFeature[];
  draftFile: string;
}

type NativeGardenScanCapabilities = Omit<GardenScanCapabilities, 'native'>;

interface GardenScanNativePlugin {
  getCapabilities(): Promise<NativeGardenScanCapabilities>;
  requestScanPermission(): Promise<NativeGardenScanCapabilities>;
  ensureArCore(): Promise<{ status: string }>;
  startScan(): Promise<GardenScanSummary>;
  reconstructLatestScan(): Promise<GardenScanReconstructionSummary>;
  prepareLatestVisionCandidates(options: { limit: number }): Promise<GardenScanVisionCandidateBatch>;
  applyLatestVisionClassifications(options: { sessionId: string; classificationsJson: string }): Promise<GardenScanUnderstandingSummary>;
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

export async function prepareLatestGardenScanVisionCandidates(limit = 16): Promise<GardenScanVisionCandidateBatch> {
  if (!isAndroidNative()) throw new Error('RGB-forståelse kræver Have Guide Android-appen.');
  return NativeGardenScan.prepareLatestVisionCandidates({ limit });
}

export async function applyLatestGardenScanVisionClassifications(
  sessionId: string,
  classifications: GardenScanVisionClassification[],
): Promise<GardenScanUnderstandingSummary> {
  if (!isAndroidNative()) throw new Error('Feature-fusion kræver Have Guide Android-appen.');
  return NativeGardenScan.applyLatestVisionClassifications({
    sessionId,
    classificationsJson: JSON.stringify(classifications),
  });
}
