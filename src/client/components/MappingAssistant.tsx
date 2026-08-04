import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, {
  type GeoJSONSource,
  type Map as MapLibreMap,
  type StyleSpecification,
} from 'maplibre-gl';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type {
  CaptureFrame,
  CaptureSession,
  CaptureWorkspace,
} from '../../shared/capture-types';
import type { GardenDetail } from '../../shared/types';
import { api, ApiError } from '../api';
import { captureApi } from '../capture-api';
import { StatusMessage } from './StatusMessage';
import './MappingAssistant.css';

interface MappingAssistantProps {
  garden: GardenDetail;
}

type BaseLayer = 'map' | 'aerial';
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
  remainingDegrees: number | null;
}

const SHOTS_PER_STATION = 6;
const TURN_STEP_DEGREES = 60;

function buildMapStyle(aerialAvailable: boolean): StyleSpecification {
  const sources: StyleSpecification['sources'] = {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© OpenStreetMap-bidragsydere',
    },
  };
  if (aerialAvailable) {
    sources.orthophoto = {
      type: 'raster',
      tiles: ['/api/map/orthophoto/{z}/{x}/{y}.jpg'],
      tileSize: 256,
      maxzoom: 21,
      attribution: 'GeoDanmark Ortofoto · Datafordeleren',
    };
  }
  return {
    version: 8,
    sources,
    layers: [
      { id: 'osm', type: 'raster', source: 'osm' },
      ...(aerialAvailable
        ? [{ id: 'orthophoto', type: 'raster' as const, source: 'orthophoto', layout: { visibility: 'none' as const } }]
        : []),
    ],
  };
}

function AerialOverview({ garden, aerialAvailable }: { garden: GardenDetail; aerialAvailable: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [baseLayer, setBaseLayer] = useState<BaseLayer>(aerialAvailable ? 'aerial' : 'map');

  const featureCollection = useMemo<FeatureCollection<Geometry>>(() => ({
    type: 'FeatureCollection',
    features: garden.features.map((item) => ({
      type: 'Feature',
      id: item.id,
      geometry: item.geometry,
      properties: { name: item.name, type: item.type },
    } satisfies Feature<Geometry>)),
  }), [garden.features]);
  const featureCollectionRef = useRef(featureCollection);
  const baseLayerRef = useRef(baseLayer);

  useEffect(() => { featureCollectionRef.current = featureCollection; }, [featureCollection]);
  useEffect(() => { baseLayerRef.current = baseLayer; }, [baseLayer]);
  useEffect(() => {
    if (aerialAvailable) setBaseLayer('aerial');
  }, [aerialAvailable]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildMapStyle(aerialAvailable),
      center: [garden.centerLng, garden.centerLat],
      zoom: 19,
      maxZoom: 22,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => {
      if (aerialAvailable) {
        map.setLayoutProperty('osm', 'visibility', baseLayerRef.current === 'map' ? 'visible' : 'none');
        map.setLayoutProperty('orthophoto', 'visibility', baseLayerRef.current === 'aerial' ? 'visible' : 'none');
      }
      map.addSource('garden-mapping', { type: 'geojson', data: featureCollectionRef.current });
      map.addLayer({
        id: 'garden-mapping-fill',
        type: 'fill',
        source: 'garden-mapping',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': '#d69935', 'fill-opacity': 0.22 },
      });
      map.addLayer({
        id: 'garden-mapping-line',
        type: 'line',
        source: 'garden-mapping',
        filter: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]],
        paint: { 'line-color': '#fff7db', 'line-width': 4, 'line-opacity': 0.95 },
      });
      map.addLayer({
        id: 'garden-mapping-point',
        type: 'circle',
        source: 'garden-mapping',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 7,
          'circle-color': '#d69935',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [aerialAvailable, garden.centerLat, garden.centerLng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    (map.getSource('garden-mapping') as GeoJSONSource | undefined)?.setData(featureCollection);
  }, [featureCollection]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded() || !aerialAvailable) return;
    map.setLayoutProperty('osm', 'visibility', baseLayer === 'map' ? 'visible' : 'none');
    map.setLayoutProperty('orthophoto', 'visibility', baseLayer === 'aerial' ? 'visible' : 'none');
  }, [aerialAvailable, baseLayer]);

  return (
    <section className="mapping-assistant-card aerial-card">
      <div className="mapping-card-heading">
        <div>
          <p className="eyebrow">Grundstruktur</p>
          <h2>Tegn oven på haven</h2>
          <p>Brug luftfotoet til grænser, bede, træer, terrasse og skråninger. Dine eksisterende objekter vises ovenpå.</p>
        </div>
        <div className="base-layer-toggle" aria-label="Vælg kortbaggrund">
          <button type="button" className={baseLayer === 'map' ? 'active' : ''} onClick={() => setBaseLayer('map')}>Kort</button>
          <button type="button" className={baseLayer === 'aerial' ? 'active' : ''} onClick={() => setBaseLayer('aerial')} disabled={!aerialAvailable}>Luftfoto</button>
        </div>
      </div>
      <div ref={containerRef} className="aerial-overview-map" aria-label="Kortlægning på kort eller luftfoto" />
      {!aerialAvailable && <p className="field-help">Luftfoto mangler Datafordeler-nøglen. Det almindelige kort virker imens.</p>}
    </section>
  );
}

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

function distanceMeters(from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }): number {
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
      remainingDegrees: null,
    };
  }

  if (shotNo === 1) {
    const liveDistanceM = previous.latitude !== null
      && previous.longitude !== null
      && position
      ? distanceMeters(
        { latitude: previous.latitude, longitude: previous.longitude },
        position,
      )
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
      remainingDegrees: null,
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
      ? 'Motivet matcher den ønskede retning. Brug den gennemsigtige billedkant til at finjustere overlap og tag billedet.'
      : 'Behold cirka en tredjedel af forrige billede i overlapfeltet. Det binder billederne sammen.',
    ready,
    arrow: remainingDegrees !== null && remainingDegrees < 0 ? '↺' : '↻',
    arrowRotation: remainingDegrees === null ? 0 : Math.max(-90, Math.min(90, remainingDegrees)),
    liveDistanceM: null,
    remainingDegrees,
  };
}

function GuidedCamera({
  garden,
  workspace,
  onWorkspace,
  onClose,
}: {
  garden: GardenDetail;
  workspace: CaptureWorkspace;
  onWorkspace: (workspace: CaptureWorkspace) => void;
  onClose: () => void;
}) {
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
        setCameraError('Direkte kamera understøttes ikke i denne browser. Brug filknappen nedenfor.');
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
        setCameraError('Kameraet kunne ikke åbnes. Kontrollér tilladelsen eller brug filknappen.');
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
      setMessage(latest?.qualityMessages[0] ?? 'Billedet er gemt. Følg næste instruktion på skærmen.');
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
      <header className="guided-camera-header">
        <div>
          <p className="eyebrow">Station {guidance.stationNo} · billede {guidance.shotNo}/{SHOTS_PER_STATION}</p>
          <strong>{guidance.title}</strong>
        </div>
        <button type="button" className="camera-close" onClick={onClose} aria-label="Luk kamera">×</button>
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
          <div>
            <strong>{guidance.title}</strong>
            <p>{guidance.detail}</p>
          </div>
        </div>

        <div className="capture-shot-progress" aria-label={`Billede ${guidance.shotNo} af ${SHOTS_PER_STATION} på stationen`}>
          {Array.from({ length: SHOTS_PER_STATION }, (_, index) => (
            <span
              key={index}
              className={index < guidance.shotNo - 1 ? 'done' : index === guidance.shotNo - 1 ? 'current' : ''}
            />
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

        <div className="camera-actions">
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
          <button type="button" className="secondary-button" disabled={busy || session.frames.length < 2} onClick={() => void complete()}>Afslut</button>
        </div>
      </footer>
    </div>
  );
}

function VirtualTour({ workspace }: { workspace: CaptureWorkspace }) {
  const session = workspace.activeSession ?? workspace.sessions.find((item) => item.frames.length > 0) ?? null;
  if (!session?.frames.length) return null;
  const stationCount = Math.ceil(session.frames.length / SHOTS_PER_STATION);
  const positionedFrames = session.frames.filter((frame) => frame.latitude !== null && frame.longitude !== null).length;

  return (
    <section className="mapping-assistant-card virtual-tour">
      <div className="mapping-card-heading">
        <div>
          <p className="eyebrow">Virtuel rundtur</p>
          <h2>{session.title}</h2>
          <p>{stationCount} station{stationCount === 1 ? '' : 'er'} · GPS-position på {positionedFrames} af {session.frames.length} billeder.</p>
        </div>
        <span className="tour-count">{session.frames.length} billeder</span>
      </div>
      <div className="tour-strip">
        {session.frames.map((frame) => {
          const stationNo = Math.floor((frame.sequenceNo - 1) / SHOTS_PER_STATION) + 1;
          const shotNo = ((frame.sequenceNo - 1) % SHOTS_PER_STATION) + 1;
          return (
            <article key={frame.id} className={`tour-frame quality-${frame.qualityStatus}`}>
              <img src={frame.contentUrl} alt={`Station ${stationNo}, billede ${shotNo}`} />
              <div><strong>{stationNo}.{shotNo}</strong><span>{qualityLabel(frame)}</span></div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function MappingAssistant({ garden }: MappingAssistantProps) {
  const [workspace, setWorkspace] = useState<CaptureWorkspace | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [targetFeatureId, setTargetFeatureId] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await captureApi.getWorkspace(garden.id);
      setWorkspace(response.workspace);
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Billedturen kunne ikke hentes.');
    }
  }, [garden.id]);

  useEffect(() => { void load(); }, [load]);

  async function startCapture() {
    setBusy(true);
    setMessage('');
    try {
      const response = await captureApi.startSession(garden.id, {
        title: 'Guidet opmåling af haven',
        mode: 'perimeter',
        targetOverlapPercent: 35,
        ...(targetFeatureId ? { targetFeatureId } : {}),
      });
      setWorkspace(response.workspace);
      setCameraOpen(true);
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Opmålingen kunne ikke startes.');
    } finally {
      setBusy(false);
    }
  }

  if (!workspace) {
    return <section className="mapping-assistant-loading"><div className="spinner" /><span>Forbereder assisteret kortlægning…</span></section>;
  }

  const activeFrames = workspace.activeSession?.frames.length ?? 0;
  const activeStations = activeFrames === 0 ? 1 : Math.floor(activeFrames / SHOTS_PER_STATION) + 1;

  return (
    <div className="mapping-assistant">
      <AerialOverview garden={garden} aerialAvailable={workspace.aerialAvailable} />

      <section className="mapping-assistant-card capture-entry-card">
        <div className="mapping-card-heading">
          <div>
            <p className="eyebrow">Guidet opmåling</p>
            <h2>Gå haven rundt station for station</h2>
            <p>Appen guider dig gennem seks overlappende billeder på hvert sted og beder dig derefter gå videre langs kanten. Position, retning, rækkefølge og billedforbindelse gemmes samlet.</p>
          </div>
          <span className="capture-icon" aria-hidden="true">◎</span>
        </div>
        {message && <StatusMessage kind="error">{message}</StatusMessage>}
        {!workspace.activeSession && (
          <label>Område <span className="optional">valgfrit</span>
            <select value={targetFeatureId} onChange={(event) => setTargetFeatureId(event.target.value)}>
              <option value="">Hele haven</option>
              {garden.features.map((feature) => <option value={feature.id} key={feature.id}>{feature.name}</option>)}
            </select>
          </label>
        )}
        <div className="survey-plan">
          <div><strong>1</strong><span>Tag seks billeder rundt om dig</span></div>
          <div><strong>2</strong><span>Gå 4–6 skridt med uret langs kanten</span></div>
          <div><strong>3</strong><span>Gentag til hele haven er dækket</span></div>
        </div>
        {workspace.activeSession && (
          <p className="active-survey-status">Aktiv opmåling: station {activeStations} · {activeFrames} billeder gemt</p>
        )}
        <button type="button" className="primary-button" disabled={busy} onClick={() => void (workspace.activeSession ? setCameraOpen(true) : startCapture())}>
          {workspace.activeSession ? `Fortsæt opmåling · ${activeFrames} billeder` : 'Start guidet opmåling'}
        </button>
      </section>

      <VirtualTour workspace={workspace} />

      {cameraOpen && workspace.activeSession && (
        <GuidedCamera garden={garden} workspace={workspace} onWorkspace={setWorkspace} onClose={() => setCameraOpen(false)} />
      )}
    </div>
  );
}
