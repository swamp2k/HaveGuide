export type CaptureMode = 'perimeter' | 'panorama' | 'zone';
export type CaptureStatus = 'active' | 'completed' | 'cancelled';
export type CaptureQuality = 'good' | 'review' | 'retake';

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
}

export interface CaptureWorkspace {
  activeSession: CaptureSession | null;
  sessions: CaptureSession[];
  aerialAvailable: boolean;
  aerialProvider: string | null;
}
