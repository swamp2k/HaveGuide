import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CaptureFrame, CaptureSession, CaptureWorkspace } from '../../shared/capture-types';
import type { GardenDetail } from '../../shared/types';
import { api, ApiError } from '../api';
import { captureApi } from '../capture-api';
import { StatusMessage } from './StatusMessage';

interface GuidedCaptureProps {
  garden: GardenDetail;
  workspace: CaptureWorkspace;
  onWorkspace: (workspace: CaptureWorkspace) => void;
  onClose: () => void;
}

type CompassEvent = DeviceOrientationEvent & { webkitCompassHeading?: number };
type PermissionableOrientationConstructor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

interface PositionSnapshot {
  latitude: number;
  longitude: number;
  accuracyM: number;
}

interface CaptureGuidance {
  stationNo: number;
  shotNo: number;
  phase: 'overview' | 'turn' | 'move';
  title: string;
  detail: string;
  ready: boolean;
  arrow: string;
  arrowRotation: number;
  liveDistanceM: number | null;
}

const SHOTS_PER_STATION = 6;
const TURN_STEP_DEGREES = 60;

function getPosition(): Promise<PositionSnapshot | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyM: position.coords.accuracy,
      }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 5_000 },
    );
  });
}

function canvasBlob(video: HTMLVideoElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context || canvas.width === 0 || canvas.height === 0) {
      reject(new Error('Kameraet er ikke klar endnu.'));
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Billedet kunne ikke gemmes.'));
    }, 'image/jpeg', 0.9);
  });
}

function qualityLabel(frame: CaptureFrame): string {
  if (frame.qualityStatus === 'good') return 'God forbindelse';
  if (frame.qualityStatus === 'retake') return 'Tag helst igen';
  return 'Kontrollér billedet';
}

function normalizeBearing(value: number): number {
  return ((value % 360) + 360) % 360;
}

function signedBearingDelta(current: number, target: number): number {
  return ((target - current + 540) % 360) - 180;
}

function distanceMeters(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const earthRadiusM = 6_371_000;
  const lat1 = from.latitude * Math.PI / 180;
  const lat2 = to.latitude * Math.PI / 180;
  const deltaLat = (to.latitude - from.latitude) * Math.PI / 180;
  const deltaLng = (to.longitude - from.longitude) * Math.PI / 180;
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return earthRadiusM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildGuidance(
  session: CaptureSession,
  bearing: number | null,
  position: PositionSnapshot | null,
): CaptureGuidance {
  const nextIndex = session.currentSequence;
  const stationNo = Math.floor(nextIndex / SHOTS_PER_STATION) + 1;
  const shotNo = (nextIndex % SHOTS_PER_STATION) + 1;
  const previous = session.frames.at(-1) ?? null;

  if (!previous) {
    return {
      stationNo,
      shotNo,
      phase: 'overview',
      title: 'Stå ved et hjørne af haven',
      detail: 'Hold mobilen vandret og tag et bredt oversigtsbillede. Det bliver startpunktet for opmålingen.',
      ready: true,
      arrow: '◎',
      arrowRotation: 0,
      liveDistanceM: null,
    };
  }

  if (shotNo === 1) {
    const liveDistanceM = previous.latitude !== null
      && previous.longitude !== null
      && position
      ? distanceMeters({ latitude: previous.latitude, longitude: previous.longitude }, position)
      : null;
    const ready = liveDistanceM !== null && liveDistanceM >= 3;
    return {
      stationNo,
      shotNo,
      phase: 'move',
      title: ready ? `Stop ved station ${stationNo}` : 'Gå videre langs havens kant',
      detail: ready
        ? 'Du er langt nok fra sidste station. Vend kameraet ind mod haven og tag et nyt oversigtsbillede.'
        : liveDistanceM === null
          ? 'Gå 4–6 store skridt med uret langs kanten. GPS er kun en hjælp; brug også øjemål.'
          : `Du har flyttet dig cirka ${liveDistanceM.toFixed(1)} m. Fortsæt til omtrent 4–6 store skridt.`,
      ready,
      arrow: '➜',
      arrowRotation: 0,
      liveDistanceM,
    };
  }

  const targetBearing = previous.bearingDegrees === null
    ? null
    : normalizeBearing(previous.bearingDegrees + TURN_STEP_DEGREES);
  const remainingDegrees = targetBearing !== null && bearing !== null
    ? signedBearingDelta(bearing, targetBearing)
    : null;
  const ready = remainingDegrees !== null && Math.abs(remainingDegrees) <= 12;
  const turnDirection = remainingDegrees === null || remainingDegrees >= 0 ? 'højre' : 'venstre';
  const remainingText = remainingDegrees === null
    ? `${TURN_STEP_DEGREES}°`
    : `${Math.round(Math.abs(remainingDegrees))}°`;

  return {
    stationNo,
    shotNo,
    phase: 'turn',
    title: ready ? 'Godt — hold stille' : `Drej ${turnDirection} ${remainingText}`,
    detail: ready
      ? 'Motivet matcher retningen. Finjustér overlapfeltet og tag billedet.'
      : 'Behold cirka en tredjedel af forrige billede i overlapfeltet.',
    ready,
    arrow: remainingDegrees !== null && remainingDegrees < 0 ? '↺' : '↻',
    arrowRotation: remainingDegrees === null ? 0 : Math.max(-90, Math.min(90, remainingDegrees)),
    liveDistanceM: null,
  };
}

export function GuidedCapture({ garden, workspace, onWorkspace, onClose }: GuidedCaptureProps) {
  const session = workspace.activeSession;
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [bearing, setBearing] = useState<number | null>(null);
  const [position, setPosition] = useState<PositionSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [message, setMessage] = useState('');
  const previous = session?.frames.at(-1) ?? null;
  const guidance = useMemo(
    () => session ? buildGuidance(session, bearing, position) : null,
    [bearing, position, session],
  );

  const updateBearing = useCallback((event: Event) => {
    const orientation = event as CompassEvent;
    if (typeof orientation.webkitCompassHeading === 'number') {
      setBearing(Number(orientation.webkitCompassHeading.toFixed(1)));
      return;
    }
    if (orientation.alpha !== null && orientation.absolute) {
      setBearing(Number(((360 - orientation.alpha) % 360).toFixed(1)));
    }
  }, []);

  useEffect(() => {
    document.body.classList.add('guided-camera-open');
    return () => { document.body.classList.remove('guided-camera-open'); };
  }, []);

  useEffect(() => {
    let watchId: number | null = null;
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (current) => setPosition({
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
          accuracyM: current.coords.accuracy,
        }),
        () => undefined,
        { enableHighAccuracy: true, maximumAge: 2_000, timeout: 12_000 },
      );
    }
    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Direkte kamera understøttes ikke i denne browser. Brug Vælg billede.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setCameraError('Kameraet kunne ikke åbnes. Kontrollér tilladelsen eller brug Vælg billede.');
      }
    }
    void startCamera();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    window.addEventListener('deviceorientationabsolute', updateBearing);
    window.addEventListener('deviceorientation', updateBearing);
    return () => {
      window.removeEventListener('deviceorientationabsolute', updateBearing);
      window.removeEventListener('deviceorientation', updateBearing);
    };
  }, [updateBearing]);

  async function enableCompass() {
    const constructor = window.DeviceOrientationEvent as PermissionableOrientationConstructor | undefined;
    if (!constructor?.requestPermission) {
      setMessage('Kompasset bruges automatisk, når browseren leverer retningen.');
      return;
    }
    try {
      const result = await constructor.requestPermission();
      setMessage(result === 'granted' ? 'Kompas er aktiveret.' : 'Kompas blev ikke tilladt; overlap-guiden virker stadig.');
    } catch {
      setMessage('Kompas kunne ikke aktiveres; overlap-guiden virker stadig.');
    }
  }

  async function saveFile(file: File) {
    if (!session || !guidance) return;
    setBusy(true);
    setMessage('Gemmer billede, station og placering…');
    try {
      const currentPosition = position ?? await getPosition();
      const form = new FormData();
      form.set('gardenId', garden.id);
      form.set('file', file);
      form.set('note', `Guidet opmåling · station ${guidance.stationNo} · billede ${guidance.shotNo}/${SHOTS_PER_STATION}`);
      if (currentPosition) {
        form.set('latitude', String(currentPosition.latitude));
        form.set('longitude', String(currentPosition.longitude));
      }
      const uploaded = await api.uploadMedia(form);
      const response = await captureApi.addFrame(garden.id, session.id, {
        mediaId: uploaded.media.id,
        latitude: currentPosition?.latitude ?? null,
        longitude: currentPosition?.longitude ?? null,
        accuracyM: currentPosition?.accuracyM ?? null,
        bearingDegrees: bearing,
        capturedAt: new Date().toISOString(),
      });
      onWorkspace(response.workspace);
      const latest = response.workspace.activeSession?.frames.at(-1);
      setMessage(latest?.qualityMessages[0] ?? 'Billedet er gemt. Følg næste instruktion.');
    } catch (caught) {
      setMessage(caught instanceof ApiError || caught instanceof Error ? caught.message : 'Billedet kunne ikke gemmes.');
    } finally {
      setBusy(false);
    }
  }

  async function takePhoto() {
    if (!videoRef.current) return;
    try {
      const blob = await canvasBlob(videoRef.current);
      await saveFile(new File([blob], `have-opmaaling-${Date.now()}.jpg`, { type: 'image/jpeg' }));
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Billedet kunne ikke tages.');
    }
  }

  async function complete() {
    if (!session) return;
    setBusy(true);
    try {
      const response = await captureApi.updateSession(garden.id, session.id, { status: 'completed' });
      onWorkspace(response.workspace);
      onClose();
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Billedturen kunne ikke afsluttes.');
    } finally {
      setBusy(false);
    }
  }

  if (!session || !guidance) return null;

  return (
    <div className="guided-camera" role="dialog" aria-modal="true" aria-label="Guidet haveopmåling">
      <header className="guided-camera-header guided-camera-header-with-back">
        <button type="button" className="camera-back-button" onClick={onClose} disabled={busy}>
          <span aria-hidden="true">←</span> Kortlæg
        </button>
        <div className="camera-step-heading">
          <p className="eyebrow">Station {guidance.stationNo} · billede {guidance.shotNo}/{SHOTS_PER_STATION}</p>
          <strong>{guidance.title}</strong>
        </div>
      </header>

      <div className="camera-stage">
        <video ref={videoRef} muted playsInline className="camera-video" />
        {previous && guidance.phase === 'turn' && (
          <div className="previous-overlap" style={{ width: `${session.targetOverlapPercent}%` }} aria-hidden="true">
            <img src={previous.contentUrl} alt="" />
          </div>
        )}
        <div className="camera-guides" aria-hidden="true"><span /><span /></div>
        <div className={`virtual-capture-guide${guidance.ready ? ' ready' : ''}`}>
          <div className="guide-arrow" style={{ transform: `rotate(${guidance.arrowRotation}deg)` }} aria-hidden="true">{guidance.arrow}</div>
          <div><strong>{guidance.title}</strong><p>{guidance.detail}</p></div>
        </div>
        <div className="capture-shot-progress" aria-label={`Billede ${guidance.shotNo} af ${SHOTS_PER_STATION} på stationen`}>
          {Array.from({ length: SHOTS_PER_STATION }, (_, index) => (
            <span key={index} className={index < guidance.shotNo - 1 ? 'done' : index === guidance.shotNo - 1 ? 'current' : ''} />
          ))}
        </div>
        <div className="sensor-strip">
          <span>GPS {position ? `±${Math.round(position.accuracyM)} m` : 'søger…'}</span>
          <span>Retning {bearing === null ? '—' : `${Math.round(bearing)}°`}</span>
          {guidance.liveDistanceM !== null && <span>Flyttet ca. {guidance.liveDistanceM.toFixed(1)} m</span>}
          <button type="button" onClick={() => void enableCompass()}>Aktivér kompas</button>
        </div>
      </div>

      <footer className="guided-camera-footer">
        {cameraError && <StatusMessage kind="error">{cameraError}</StatusMessage>}
        {message && <StatusMessage>{message}</StatusMessage>}
        {previous && (
          <div className={`capture-quality quality-${previous.qualityStatus}`}>
            <strong>{qualityLabel(previous)}</strong>
            {previous.overlapPercent !== null && <span>Overlap: {Math.round(previous.overlapPercent)}%</span>}
          </div>
        )}
        <div className="camera-actions camera-actions-with-exit">
          <label className="secondary-button camera-file-button">
            Vælg billede
            <input
              type="file"
              accept="image/*"
              capture="environment"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void saveFile(file);
                event.target.value = '';
              }}
            />
          </label>
          <button
            type="button"
            className={`capture-button${guidance.ready ? ' ready' : ''}`}
            disabled={busy || Boolean(cameraError)}
            onClick={() => void takePhoto()}
            aria-label="Tag billede"
          ><span /></button>
          <button type="button" className="secondary-button" disabled={busy || session.frames.length < 2} onClick={() => void complete()}>Afslut tur</button>
        </div>
      </footer>
    </div>
  );
}
