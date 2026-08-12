import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, type StyleSpecification } from 'maplibre-gl';
import type { GardenDetail } from '../../shared/types';
import { runtimeUrl } from '../runtime-url';
import { smartScanApi, type SmartScanAlignment, type SmartScanStoredSession } from '../smart-scan-api';
import './SmartScanAlignment.css';

interface SmartScanAlignmentProps {
  garden: GardenDetail;
  session: SmartScanStoredSession;
}

const mapStyle: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© OpenStreetMap-bidragsydere',
    },
    orthophoto: {
      type: 'raster',
      tiles: [runtimeUrl('/api/map/orthophoto/{z}/{x}/{y}.jpg')],
      tileSize: 256,
      maxzoom: 21,
      attribution: 'GeoDanmark Ortofoto · Datafordeleren',
    },
  },
  layers: [
    { id: 'scan-align-osm', type: 'raster', source: 'osm' },
    { id: 'scan-align-aerial', type: 'raster', source: 'orthophoto', layout: { visibility: 'none' } },
  ],
};

function effectiveFeatureType(session: SmartScanStoredSession, featureId: string, fallback: string): string {
  return session.reviews.find((review) => review.featureId === featureId)?.typeOverride || fallback;
}

function localBounds(session: SmartScanStoredSession) {
  const features = session.draftFeatures.filter((feature) => {
    const review = session.reviews.find((item) => item.featureId === feature.id);
    return review?.decision !== 'rejected';
  });
  if (features.length === 0) return { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  return {
    minX: Math.min(...features.map((feature) => feature.bounds.min[0])),
    maxX: Math.max(...features.map((feature) => feature.bounds.max[0])),
    minZ: Math.min(...features.map((feature) => feature.bounds.min[2])),
    maxZ: Math.max(...features.map((feature) => feature.bounds.max[2])),
  };
}

function defaultAlignment(garden: GardenDetail, session: SmartScanStoredSession): SmartScanAlignment {
  const bounds = localBounds(session);
  return {
    anchorLat: garden.centerLat,
    anchorLng: garden.centerLng,
    originX: (bounds.minX + bounds.maxX) / 2,
    originZ: (bounds.minZ + bounds.maxZ) / 2,
    rotationDegrees: 0,
    scale: 1,
    status: 'draft',
  };
}

function localToLngLat(point: [number, number], alignment: SmartScanAlignment): [number, number] {
  const radians = (alignment.rotationDegrees * Math.PI) / 180;
  const x = (point[0] - alignment.originX) * alignment.scale;
  const z = (point[1] - alignment.originZ) * alignment.scale;
  const east = x * Math.cos(radians) - z * Math.sin(radians);
  const north = x * Math.sin(radians) + z * Math.cos(radians);
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLng = Math.max(1, metersPerDegreeLat * Math.cos((alignment.anchorLat * Math.PI) / 180));
  return [alignment.anchorLng + east / metersPerDegreeLng, alignment.anchorLat + north / metersPerDegreeLat];
}

function nudge(alignment: SmartScanAlignment, eastMeters: number, northMeters: number): SmartScanAlignment {
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLng = Math.max(1, metersPerDegreeLat * Math.cos((alignment.anchorLat * Math.PI) / 180));
  return {
    ...alignment,
    anchorLat: alignment.anchorLat + northMeters / metersPerDegreeLat,
    anchorLng: alignment.anchorLng + eastMeters / metersPerDegreeLng,
    status: 'draft',
  };
}

function featureCollection(session: SmartScanStoredSession, alignment: SmartScanAlignment) {
  const reviews = new Map(session.reviews.map((review) => [review.featureId, review]));
  return {
    type: 'FeatureCollection' as const,
    features: session.draftFeatures.flatMap((feature) => {
      const review = reviews.get(feature.id);
      if (review?.decision === 'rejected') return [];
      const footprint = review?.footprint && review.footprint.length >= 3 ? review.footprint : feature.footprint;
      if (!footprint || footprint.length < 3) return [];
      const coordinates = footprint.map((point) => localToLngLat(point, alignment));
      coordinates.push(coordinates[0]!);
      return [{
        type: 'Feature' as const,
        id: feature.id,
        geometry: { type: 'Polygon' as const, coordinates: [coordinates] },
        properties: {
          id: feature.id,
          type: effectiveFeatureType(session, feature.id, feature.type),
          decision: review?.decision ?? 'pending',
        },
      }];
    }),
  };
}

export function SmartScanAlignmentEditor({ garden, session }: SmartScanAlignmentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const placingRef = useRef(false);
  const [alignment, setAlignment] = useState<SmartScanAlignment>(() => defaultAlignment(garden, session));
  const [aerialAvailable, setAerialAvailable] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const geojson = useMemo(() => featureCollection(session, alignment), [session, alignment]);
  const visibleFeatures = geojson.features.length;

  useEffect(() => { placingRef.current = placing; }, [placing]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      smartScanApi.getAlignment(garden.id, session.sessionId).catch(() => null),
      fetch('/api/map/config', { credentials: 'include' })
        .then((response) => response.ok ? response.json() as Promise<{ aerialAvailable: boolean }> : { aerialAvailable: false })
        .catch(() => ({ aerialAvailable: false })),
    ]).then(([saved, mapConfig]) => {
      if (cancelled) return;
      if (saved?.alignment && typeof saved.alignment.anchorLat === 'number' && typeof saved.alignment.anchorLng === 'number') {
        setAlignment({ ...defaultAlignment(garden, session), ...saved.alignment, status: saved.status === 'aligned' ? 'aligned' : 'draft' });
      }
      setAerialAvailable(Boolean(mapConfig.aerialAvailable));
    });
    return () => { cancelled = true; };
  }, [garden, session]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle,
      center: [garden.centerLng, garden.centerLat],
      zoom: 20,
      maxZoom: 22,
      transformRequest: (url) => url.includes('/api/') ? { url: runtimeUrl(url), credentials: 'include' } : { url },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    map.on('load', () => {
      map.addSource('smart-scan-aligned', { type: 'geojson', data: geojson });
      map.addLayer({
        id: 'smart-scan-aligned-fill',
        type: 'fill',
        source: 'smart-scan-aligned',
        paint: {
          'fill-color': [
            'match', ['get', 'type'],
            'tree', '#4f8b49', 'bush', '#71a65e', 'hedge', '#47785a', 'lawn', '#a9c86e',
            'bed', '#c89a67', 'path', '#a69a85', 'patio', '#b4a18b', 'building', '#6f7f8f',
            'fence', '#8e735d', 'play_equipment', '#d3924e', 'water', '#6da6b8', '#8e8796',
          ],
          'fill-opacity': 0.42,
        },
      });
      map.addLayer({
        id: 'smart-scan-aligned-line',
        type: 'line',
        source: 'smart-scan-aligned',
        paint: {
          'line-color': ['case', ['==', ['get', 'decision'], 'accepted'], '#173e2b', '#ffffff'],
          'line-width': ['case', ['==', ['get', 'decision'], 'accepted'], 3, 2],
          'line-dasharray': [2, 1],
        },
      });
    });
    map.on('click', (event) => {
      if (!placingRef.current) return;
      setAlignment((current) => ({ ...current, anchorLat: event.lngLat.lat, anchorLng: event.lngLat.lng, status: 'draft' }));
      setPlacing(false);
      setMessage('Modelcentrum er flyttet. Finjustér og gem placeringen.');
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [garden.centerLat, garden.centerLng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    (map.getSource('smart-scan-aligned') as GeoJSONSource | undefined)?.setData(geojson);
  }, [geojson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    map.setLayoutProperty('scan-align-osm', 'visibility', aerialAvailable ? 'none' : 'visible');
    map.setLayoutProperty('scan-align-aerial', 'visibility', aerialAvailable ? 'visible' : 'none');
  }, [aerialAvailable]);

  async function save(status: 'draft' | 'aligned') {
    setSaving(true);
    setMessage(status === 'aligned' ? 'Gemmer den færdige placering…' : 'Gemmer placeringen…');
    try {
      const response = await smartScanApi.saveAlignment(garden.id, session.sessionId, { ...alignment, status });
      setAlignment(response.alignment);
      setMessage(status === 'aligned' ? 'Scan-modellen er placeret på haven.' : 'Placeringen er gemt som kladde.');
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Placeringen kunne ikke gemmes.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="smart-scan-alignment">
      <div className="smart-scan-alignment-heading">
        <div>
          <p className="eyebrow">4.2C.5 · Placér scan på haven</p>
          <h3>Læg modellen over luftfotoet</h3>
          <p>{visibleFeatures} ikke-afviste footprints vises samlet. Grøn status betyder kun, at placeringen er godkendt — ikke landmålingspræcision.</p>
        </div>
        <span className={`smart-scan-alignment-status ${alignment.status}`}>{alignment.status === 'aligned' ? 'Placeret' : 'Kladde'}</span>
      </div>

      <div className={`smart-scan-alignment-map${placing ? ' placing' : ''}`} ref={containerRef} />

      <div className="smart-scan-alignment-controls">
        <div className="smart-scan-alignment-nudge" aria-label="Flyt scan-model">
          <span />
          <button type="button" onClick={() => setAlignment((current) => nudge(current, 0, .5))}>↑</button>
          <span />
          <button type="button" onClick={() => setAlignment((current) => nudge(current, -.5, 0))}>←</button>
          <button type="button" onClick={() => setAlignment((current) => nudge(current, 0, -.5))}>↓</button>
          <button type="button" onClick={() => setAlignment((current) => nudge(current, .5, 0))}>→</button>
        </div>

        <div className="smart-scan-alignment-tuning">
          <label>Drej
            <div className="smart-scan-inline-controls">
              <button type="button" onClick={() => setAlignment((current) => ({ ...current, rotationDegrees: current.rotationDegrees - 5, status: 'draft' }))}>−5°</button>
              <strong>{Math.round(((alignment.rotationDegrees % 360) + 360) % 360)}°</strong>
              <button type="button" onClick={() => setAlignment((current) => ({ ...current, rotationDegrees: current.rotationDegrees + 5, status: 'draft' }))}>+5°</button>
            </div>
          </label>
          <label>Finjustér størrelse · {Math.round(alignment.scale * 100)}%
            <input type="range" min="0.85" max="1.15" step="0.01" value={alignment.scale} onChange={(event) => setAlignment((current) => ({ ...current, scale: Number(event.target.value), status: 'draft' }))} />
          </label>
        </div>
      </div>

      <div className="smart-scan-alignment-actions">
        <button type="button" className="smart-scan-secondary-button" disabled={saving} onClick={() => { setPlacing(true); setMessage('Tryk på luftfotoet dér, hvor scan-modellens centrum skal ligge.'); }}>Placér centrum på kortet</button>
        <button type="button" className="smart-scan-secondary-button" disabled={saving} onClick={() => void save('draft')}>Gem kladde</button>
        <button type="button" className="primary-button" disabled={saving} onClick={() => void save('aligned')}>Godkend placering</button>
      </div>
      {message && <p className="field-help">{message}</p>}
    </section>
  );
}
