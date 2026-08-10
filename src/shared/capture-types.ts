export type CaptureMode = 'perimeter' | 'panorama' | 'zone';
export type CaptureStatus = 'active' | 'completed' | 'cancelled';
export type CaptureQuality = 'good' | 'review' | 'retake';

export interface CaptureHotspot {
  frameId: string;
  featureId: string;
  xNorm: number;
  yNorm: number;
  source: 'manual' | 'suggested';
  confidence: 'suggested' | 'confirmed';
}

export interface CaptureStation {
  stationNo: number;
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  source: 'gps' | 'manual' | 'unknown';
  frameIds: string[];
}

export interface CaptureFrame {
  id: string;
  sessionId: string;
  mediaId: string;
  sequenceNo: number;
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  bearingDegrees: number | null;
  overlapPercent: number | null;
  distanceFromPreviousM: number | null;
  bearingDeltaDegrees: number | null;
  qualityStatus: CaptureQuality;
  qualityMessages: string[];
  capturedAt: string;
  contentUrl: string;
  originalFilename: string;
  hotspots: CaptureHotspot[];
}

export interface CaptureSession {
  id: string;
  gardenId: string;
  targetFeatureId: string | null;
  title: string;
  mode: CaptureMode;
  status: CaptureStatus;
  targetOverlapPercent: number;
  currentSequence: number;
  startedAt: string;
  completedAt: string | null;
  frames: CaptureFrame[];
  stations: CaptureStation[];
}

export interface CaptureWorkspace {
  activeSession: CaptureSession | null;
  sessions: CaptureSession[];
  aerialAvailable: boolean;
  aerialProvider: string | null;
}
