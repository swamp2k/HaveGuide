import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, type StyleSpecification } from 'maplibre-gl';
import type { GardenDetail } from '../../shared/types';
import { runtimeUrl } from '../runtime-url';
import {
  smartScanApi,
  type SmartScanAlignment,
  type SmartScanDriftCorrection,
  type SmartScanStoredSession,
} from '../smart-scan-api';
import './SmartScanAlignment.css';

interface SmartScanAlignmentProps {
  garden: GardenDetail;
  session: SmartScanStoredSession;
}

type LngLatPoint = [number, number];
type LocalPoint = [number, number];

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

function activeFeatures(session: SmartScanStoredSession) {
  const reviews = new Map(session.reviews.map((review) => [review.featureId, review]));
  return session.draftFeatures.flatMap((feature) => {
    const review = reviews.get(feature.id);
    if (review?.decision === 'rejected') return [];
    const footprint = review?.footprint && review.footprint.length >= 3 ? review.footprint : feature.footprint;
    return footprint && footprint.length >= 3 ? [{ feature, review, footprint }] : [];
  });
}

function localBounds(session: SmartScanStoredSession) {
  const features = activeFeatures(session);
  if (features.length === 0) return { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  return {
    minX: Math.min(...features.map(({ feature }) => feature.bounds.min[0])),
    maxX: Math.max(...features.map(({ feature }) => feature.bounds.max[0])),
    minZ: Math.min(...features.map(({ feature }) => feature.bounds.min[2])),
    maxZ: Math.max(...features.map(({ feature }) => feature.bounds.max[2])),
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
    driftCorrection: null,
  };
}

function correctedLocalPoint(point: LocalPoint, correction?: SmartScanDriftCorrection | null): LocalPoint {
  if (!correction || correction.knots.length < 2) return point;
  const coordinate = correction.axis === 'x' ? point[0] : point[1];
  const knots = correction.knots;
  let left = knots[0]!;
  let right = knots[knots.length - 1]!;
  for (let index = 0; index < knots.length - 1; index += 1) {
    const candidateLeft = knots[index]!;
    const candidateRight = knots[index + 1]!;
    if (coordinate >= candidateLeft.position && coordinate <= candidateRight.position) {
      left = candidateLeft;
      right = candidateRight;
      break;
    }
  }
  const span = Math.max(0.001, right.position - left.position);
  const t = Math.max(0, Math.min(1, (coordinate - left.position) / span));
  const offsetX = left.offsetX + (right.offsetX - left.offsetX) * t;
  const offsetZ = left.offsetZ + (right.offsetZ - left.offsetZ) * t;
  return [point[0] + offsetX, point[1] + offsetZ];
}

function localToLngLat(point: LocalPoint, alignment: SmartScanAlignment): LngLatPoint {
  const corrected = correctedLocalPoint(point, alignment.driftCorrection);
  const radians = (alignment.rotationDegrees * Math.PI) / 180;
  const x = (corrected[0] - alignment.originX) * alignment.scale;
  const z = (corrected[1] - alignment.originZ) * alignment.scale;
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

function boundaryRing(garden: GardenDetail): LngLatPoint[] | null {
  const boundary = garden.features.find((feature) => feature.type === 'garden_boundary' && feature.geometry.type === 'Polygon');
  if (!boundary || boundary.geometry.type !== 'Polygon') return null;
  const ring = boundary.geometry.coordinates[0] ?? [];
  return ring.length >= 4 ? ring.map((point) => [point[0], point[1]] as LngLatPoint) : null;
}

function pointInPolygon(point: LngLatPoint, polygon: LngLatPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if (!a || !b) continue;
    const intersects = ((a[1] > point[1]) !== (b[1] > point[1]))
      && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / ((b[1] - a[1]) || Number.EPSILON) + a[0];
    if (intersects) inside = !inside;
  }
  return inside;
}

function centroid(points: LngLatPoint[]): LngLatPoint {
  const count = Math.max(1, points.length);
  return [
    points.reduce((sum, point) => sum + point[0], 0) / count,
    points.reduce((sum, point) => sum + point[1], 0) / count,
  ];
}

interface BoundaryDiagnostics {
  available: boolean;
  totalVertices: number;
  outsideVertices: number;
  outsideRatio: number;
  violatingFeatures: number;
  totalFeatures: number;
  severe: boolean;
}

function boundaryDiagnostics(session: SmartScanStoredSession, alignment: SmartScanAlignment, boundary: LngLatPoint[] | null): BoundaryDiagnostics {
  if (!boundary) {
    return { available: false, totalVertices: 0, outsideVertices: 0, outsideRatio: 0, violatingFeatures: 0, totalFeatures: 0, severe: false };
  }
  let totalVertices = 0;
  let outsideVertices = 0;
  let violatingFeatures = 0;
  const features = activeFeatures(session);
  for (const { footprint } of features) {
    const transformed = footprint.map((point) => localToLngLat(point, alignment));
    const outside = transformed.filter((point) => !pointInPolygon(point, boundary)).length;
    const centerOutside = !pointInPolygon(centroid(transformed), boundary);
    totalVertices += transformed.length;
    outsideVertices += outside;
    if (centerOutside || outside / transformed.length > 0.25) violatingFeatures += 1;
  }
  const outsideRatio = totalVertices > 0 ? outsideVertices / totalVertices : 0;
  return {
    available: true,
    totalVertices,
    outsideVertices,
    outsideRatio,
    violatingFeatures,
    totalFeatures: features.length,
    severe: outsideRatio > 0.08 || violatingFeatures > Math.max(1, Math.floor(features.length * 0.1)),
  };
}

function isBetterBoundaryFit(
  candidate: BoundaryDiagnostics,
  best: BoundaryDiagnostics,
  candidatePenalty = 0,
  bestPenalty = 0,
): boolean {
  if (candidate.outsideVertices !== best.outsideVertices) return candidate.outsideVertices < best.outsideVertices;
  if (candidate.violatingFeatures !== best.violatingFeatures) return candidate.violatingFeatures < best.violatingFeatures;
  return candidatePenalty + 1e-9 < bestPenalty;
}

function boundaryCollection(boundary: LngLatPoint[] | null) {
  if (!boundary) return { type: 'FeatureCollection' as const, features: [] };
  return {
    type: 'FeatureCollection' as const,
    features: [{
      type: 'Feature' as const,
      id: 'garden-boundary',
      geometry: { type: 'Polygon' as const, coordinates: [boundary] },
      properties: {},
    }],
  };
}

function featureCollection(session: SmartScanStoredSession, alignment: SmartScanAlignment) {
  return {
    type: 'FeatureCollection' as const,
    features: activeFeatures(session).map(({ feature, review, footprint }) => {
      const coordinates = footprint.map((point) => localToLngLat(point, alignment));
      coordinates.push(coordinates[0]!);
      return {
        type: 'Feature' as const,
        id: feature.id,
        geometry: { type: 'Polygon' as const, coordinates: [coordinates] },
        properties: {
          id: feature.id,
          type: effectiveFeatureType(session, feature.id, feature.type),
          decision: review?.decision ?? 'pending',
        },
      };
    }),
  };
}

function violationPointsCollection(session: SmartScanStoredSession, alignment: SmartScanAlignment, boundary: LngLatPoint[] | null) {
  if (!boundary) return { type: 'FeatureCollection' as const, features: [] };
  return {
    type: 'FeatureCollection' as const,
    features: activeFeatures(session).flatMap(({ feature, footprint }) =>
      footprint
        .map((point) => localToLngLat(point, alignment))
        .filter((point) => !pointInPolygon(point, boundary))
        .map((point, index) => ({
          type: 'Feature' as const,
          id: `${feature.id}-${index}`,
          geometry: { type: 'Point' as const, coordinates: point },
          properties: { featureId: feature.id },
        })),
    ),
  };
}

function findBestGlobalFit(session: SmartScanStoredSession, current: SmartScanAlignment, boundary: LngLatPoint[]) {
  const base: SmartScanAlignment = { ...current, driftCorrection: null, status: 'draft' };
  const baseline = boundaryDiagnostics(session, base, boundary);
  let best: { alignment: SmartScanAlignment; diagnostics: BoundaryDiagnostics; penalty: number } = {
    alignment: base,
    diagnostics: baseline,
    penalty: 0,
  };
  for (let north = -5; north <= 5; north += 1) {
    for (let east = -5; east <= 5; east += 1) {
      for (let rotation = -20; rotation <= 20; rotation += 5) {
        const candidate = nudge({ ...base, rotationDegrees: base.rotationDegrees + rotation }, east, north);
        const diagnostics = boundaryDiagnostics(session, candidate, boundary);
        const movementPenalty = (Math.abs(east) + Math.abs(north)) * 0.002 + Math.abs(rotation) * 0.0005;
        if (isBetterBoundaryFit(diagnostics, best.diagnostics, movementPenalty, best.penalty)) {
          best = { alignment: candidate, diagnostics, penalty: movementPenalty };
        }
      }
    }
  }
  return { alignment: best.alignment, diagnostics: best.diagnostics, baseline };
}

function makeInitialDriftCorrection(session: SmartScanStoredSession, baselineOutsideRatio: number): SmartScanDriftCorrection {
  const bounds = localBounds(session);
  const rangeX = bounds.maxX - bounds.minX;
  const rangeZ = bounds.maxZ - bounds.minZ;
  const axis: 'x' | 'z' = rangeX >= rangeZ ? 'x' : 'z';
  const min = axis === 'x' ? bounds.minX : bounds.minZ;
  const max = axis === 'x' ? bounds.maxX : bounds.maxZ;
  const knots = Array.from({ length: 5 }, (_, index) => ({
    position: min + ((max - min) * index) / 4,
    offsetX: 0,
    offsetZ: 0,
  }));
  return { axis, knots, baselineOutsideRatio };
}

function correctionPenalty(correction: SmartScanDriftCorrection): number {
  let displacement = 0;
  let roughness = 0;
  correction.knots.forEach((knot, index) => {
    displacement += Math.hypot(knot.offsetX, knot.offsetZ);
    const previous = correction.knots[index - 1];
    if (previous) roughness += Math.hypot(knot.offsetX - previous.offsetX, knot.offsetZ - previous.offsetZ);
  });
  return displacement * 0.003 + roughness * 0.006;
}

function optimizeLocalDrift(session: SmartScanStoredSession, current: SmartScanAlignment, boundary: LngLatPoint[]) {
  const rawAlignment: SmartScanAlignment = { ...current, driftCorrection: null, status: 'draft' };
  const baseline = boundaryDiagnostics(session, rawAlignment, boundary);
  let correction = makeInitialDriftCorrection(session, baseline.outsideRatio);
  let bestAlignment: SmartScanAlignment = { ...rawAlignment, driftCorrection: correction };
  let bestDiagnostics = boundaryDiagnostics(session, bestAlignment, boundary);
  let bestPenalty = correctionPenalty(correction);
  const centerIndex = Math.floor(correction.knots.length / 2);

  for (let pass = 0; pass < 3; pass += 1) {
    for (let knotIndex = 0; knotIndex < correction.knots.length; knotIndex += 1) {
      if (knotIndex === centerIndex) continue;
      const existing = correction.knots[knotIndex]!;
      let knotBest = existing;
      let knotBestPenalty = bestPenalty;
      let knotBestDiagnostics = bestDiagnostics;
      for (let dx = -1.5; dx <= 1.5; dx += 0.5) {
        for (let dz = -1.5; dz <= 1.5; dz += 0.5) {
          const candidateKnot = {
            ...existing,
            offsetX: Math.max(-3, Math.min(3, existing.offsetX + dx)),
            offsetZ: Math.max(-3, Math.min(3, existing.offsetZ + dz)),
          };
          const candidateCorrection: SmartScanDriftCorrection = {
            ...correction,
            knots: correction.knots.map((knot, index) => index === knotIndex ? candidateKnot : knot),
          };
          const candidateAlignment: SmartScanAlignment = { ...rawAlignment, driftCorrection: candidateCorrection };
          const diagnostics = boundaryDiagnostics(session, candidateAlignment, boundary);
          const penalty = correctionPenalty(candidateCorrection);
          if (isBetterBoundaryFit(diagnostics, knotBestDiagnostics, penalty, knotBestPenalty)) {
            knotBest = candidateKnot;
            knotBestPenalty = penalty;
            knotBestDiagnostics = diagnostics;
          }
        }
      }
      correction = {
        ...correction,
        knots: correction.knots.map((knot, index) => index === knotIndex ? knotBest : knot),
      };
      bestPenalty = knotBestPenalty;
      bestDiagnostics = knotBestDiagnostics;
      bestAlignment = { ...rawAlignment, driftCorrection: correction };
    }
  }

  if (bestDiagnostics.outsideVertices >= baseline.outsideVertices) {
    return { alignment: rawAlignment, diagnostics: baseline, baseline };
  }

  return { alignment: bestAlignment, diagnostics: bestDiagnostics, baseline };
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

  const boundary = useMemo(() => boundaryRing(garden), [garden]);
  const diagnostics = useMemo(() => boundaryDiagnostics(session, alignment, boundary), [session, alignment, boundary]);
  const geojson = useMemo(() => featureCollection(session, alignment), [session, alignment]);
  const boundaryGeojson = useMemo(() => boundaryCollection(boundary), [boundary]);
  const violationGeojson = useMemo(() => violationPointsCollection(session, alignment, boundary), [session, alignment, boundary]);
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
      map.addSource('smart-scan-boundary', { type: 'geojson', data: boundaryGeojson });
      map.addLayer({ id: 'smart-scan-boundary-fill', type: 'fill', source: 'smart-scan-boundary', paint: { 'fill-color': '#f5e6a8', 'fill-opacity': 0.1 } });
      map.addLayer({ id: 'smart-scan-boundary-line', type: 'line', source: 'smart-scan-boundary', paint: { 'line-color': '#f4f0d8', 'line-width': 4 } });
      map.addSource('smart-scan-aligned', { type: 'geojson', data: geojson });
      map.addLayer({
        id: 'smart-scan-aligned-fill',
        type: 'fill',
        source: 'smart-scan-aligned',
        paint: {
          'fill-color': ['match', ['get', 'type'],
            'tree', '#4f8b49', 'bush', '#71a65e', 'hedge', '#47785a', 'lawn', '#a9c86e',
            'bed', '#c89a67', 'path', '#a69a85', 'patio', '#b4a18b', 'building', '#6f7f8f',
            'fence', '#8e735d', 'play_equipment', '#d3924e', 'water', '#6da6b8', '#8e8796'],
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
      map.addSource('smart-scan-violations', { type: 'geojson', data: violationGeojson });
      map.addLayer({
        id: 'smart-scan-violation-points',
        type: 'circle',
        source: 'smart-scan-violations',
        paint: {
          'circle-radius': 5,
          'circle-color': '#d92f25',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
          'circle-opacity': 0.92,
        },
      });
    });
    map.on('click', (event) => {
      if (!placingRef.current) return;
      setAlignment((current) => ({ ...current, anchorLat: event.lngLat.lat, anchorLng: event.lngLat.lng, driftCorrection: null, status: 'draft' }));
      setPlacing(false);
      setMessage('Modelcentrum er flyttet. Lokal drift-korrektion er nulstillet, så den kan beregnes igen på den nye placering.');
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
    (map.getSource('smart-scan-boundary') as GeoJSONSource | undefined)?.setData(boundaryGeojson);
    (map.getSource('smart-scan-violations') as GeoJSONSource | undefined)?.setData(violationGeojson);
  }, [geojson, boundaryGeojson, violationGeojson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    map.setLayoutProperty('scan-align-osm', 'visibility', aerialAvailable ? 'none' : 'visible');
    map.setLayoutProperty('scan-align-aerial', 'visibility', aerialAvailable ? 'visible' : 'none');
  }, [aerialAvailable]);

  function optimizeAgainstBoundary() {
    if (!boundary) {
      setMessage('Der er ingen tegnet havegrænse at tilpasse scanningen til.');
      return;
    }
    const before = diagnostics;
    const best = findBestGlobalFit(session, alignment, boundary);
    const beforePct = Math.round(before.outsideRatio * 100);
    const afterPct = Math.round(best.diagnostics.outsideRatio * 100);
    if (best.diagnostics.outsideVertices > before.outsideVertices) {
      setMessage(`Bedste globale placering blev afvist, fordi den ville forværre boundary-fejlen fra ${beforePct}% til ${afterPct}%. Den nuværende placering er bevaret.`);
      return;
    }
    setAlignment(best.alignment);
    setMessage(best.diagnostics.severe
      ? `Bedste globale fit reducerer punkter udenfor fra ${beforePct}% til ${afterPct}%, men der er stadig væsentlige boundary-fejl. Kør lokal drift-korrektion som næste trin.`
      : `Bedste globale fit reducerer punkter udenfor fra ${beforePct}% til ${afterPct}%. Finjustér visuelt og godkend derefter.`);
  }

  function correctLocalDrift() {
    if (!boundary) {
      setMessage('Der er ingen tegnet havegrænse at korrigere imod.');
      return;
    }
    const result = optimizeLocalDrift(session, alignment, boundary);
    const beforePct = Math.round(result.baseline.outsideRatio * 100);
    const afterPct = Math.round(result.diagnostics.outsideRatio * 100);
    if (result.diagnostics.outsideVertices >= result.baseline.outsideVertices) {
      setMessage(`Lokal drift-korrektion fandt ingen sikker forbedring fra ${beforePct}%. Rågeometrien er bevaret.`);
      return;
    }
    setAlignment(result.alignment);
    setMessage(result.diagnostics.severe
      ? `Lokal drift-korrektion reducerer boundary-fejlen fra ${beforePct}% til ${afterPct}%. Der er stadig restfejl, så modellen forbliver kladde.`
      : `Lokal drift-korrektion reducerer boundary-fejlen fra ${beforePct}% til ${afterPct}%. Kontrollér især den hårde rækværkskant visuelt.`);
  }

  function resetLocalDrift() {
    setAlignment((current) => ({ ...current, driftCorrection: null, status: 'draft' }));
    setMessage('Lokal drift-korrektion er fjernet. Den oprindelige scan-geometri vises igen.');
  }

  async function save(status: 'draft' | 'aligned') {
    if (status === 'aligned' && diagnostics.available && diagnostics.severe) {
      setMessage('Placeringen kan ikke godkendes endnu: for meget af scan-modellen krydser den kendte havegrænse. Gem som kladde eller korrigér først.');
      return;
    }
    setSaving(true);
    setMessage(status === 'aligned' ? 'Gemmer den boundary-kontrollerede placering…' : 'Gemmer placeringen…');
    try {
      const response = await smartScanApi.saveAlignment(garden.id, session.sessionId, { ...alignment, status });
      setAlignment(response.alignment);
      setMessage(status === 'aligned' ? 'Scan-modellen er placeret inden for den kendte havegrænse.' : 'Placeringen og eventuel drift-korrektion er gemt som kladde.');
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Placeringen kunne ikke gemmes.');
    } finally {
      setSaving(false);
    }
  }

  const baselineRatio = alignment.driftCorrection?.baselineOutsideRatio;

  return (
    <section className="smart-scan-alignment">
      <div className="smart-scan-alignment-heading">
        <div>
          <p className="eyebrow">4.2C.7 · Local drift correction</p>
          <h3>Ret lokal AR-drift uden at mase hele haven</h3>
          <p>{visibleFeatures} ikke-afviste footprints sammenlignes med din tegnede havegrænse. Røde prikker er de konkrete footprint-punkter, der ligger udenfor.</p>
        </div>
        <span className={`smart-scan-alignment-status ${alignment.status}`}>{alignment.status === 'aligned' ? 'Placeret' : 'Kladde'}</span>
      </div>

      <div className={`smart-scan-boundary-health${diagnostics.severe ? ' severe' : diagnostics.available ? ' good' : ''}`}>
        {diagnostics.available ? (
          <>
            <strong>{Math.round(diagnostics.outsideRatio * 100)}% af footprint-punkterne ligger udenfor havegrænsen</strong>
            <span>{diagnostics.violatingFeatures}/{diagnostics.totalFeatures} områder har en tydelig boundary-konflikt.</span>
            {alignment.driftCorrection && baselineRatio != null && (
              <span>Segmenteret korrektion aktiv: {Math.round(baselineRatio * 100)}% → {Math.round(diagnostics.outsideRatio * 100)}%. Midterzonen er fastholdt som anker.</span>
            )}
            {diagnostics.severe && <span>Placeringen kan først godkendes, når restfejlen er lille nok. Rå ARCore-geometri overskrives aldrig.</span>}
          </>
        ) : (
          <><strong>Ingen havegrænse fundet</strong><span>Tegn først `Havegrænse`, hvis alignment skal kunne boundary-kontrolleres.</span></>
        )}
      </div>

      <div className={`smart-scan-alignment-map${placing ? ' placing' : ''}`} ref={containerRef} />

      <div className="smart-scan-alignment-controls">
        <div className="smart-scan-alignment-nudge" aria-label="Flyt scan-model">
          <span />
          <button type="button" onClick={() => setAlignment((current) => ({ ...nudge(current, 0, .5), driftCorrection: null }))}>↑</button>
          <span />
          <button type="button" onClick={() => setAlignment((current) => ({ ...nudge(current, -.5, 0), driftCorrection: null }))}>←</button>
          <button type="button" onClick={() => setAlignment((current) => ({ ...nudge(current, 0, -.5), driftCorrection: null }))}>↓</button>
          <button type="button" onClick={() => setAlignment((current) => ({ ...nudge(current, .5, 0), driftCorrection: null }))}>→</button>
        </div>

        <div className="smart-scan-alignment-tuning">
          <label>Drej
            <div className="smart-scan-inline-controls">
              <button type="button" onClick={() => setAlignment((current) => ({ ...current, rotationDegrees: current.rotationDegrees - 5, driftCorrection: null, status: 'draft' }))}>−5°</button>
              <strong>{Math.round(((alignment.rotationDegrees % 360) + 360) % 360)}°</strong>
              <button type="button" onClick={() => setAlignment((current) => ({ ...current, rotationDegrees: current.rotationDegrees + 5, driftCorrection: null, status: 'draft' }))}>+5°</button>
            </div>
          </label>
          <label>Finjustér størrelse · {Math.round(alignment.scale * 100)}%
            <input type="range" min="0.85" max="1.15" step="0.01" value={alignment.scale} onChange={(event) => setAlignment((current) => ({ ...current, scale: Number(event.target.value), driftCorrection: null, status: 'draft' }))} />
          </label>
        </div>
      </div>

      <div className="smart-scan-drift-actions">
        <button type="button" className="smart-scan-secondary-button" disabled={saving || !boundary} onClick={optimizeAgainstBoundary}>Find bedste globale placering</button>
        <button type="button" className="primary-button" disabled={saving || !boundary} onClick={correctLocalDrift}>Korrigér lokal scan-drift</button>
        {alignment.driftCorrection && <button type="button" className="smart-scan-tertiary-button" disabled={saving} onClick={resetLocalDrift}>Nulstil lokal korrektion</button>}
      </div>

      <div className="smart-scan-alignment-actions">
        <button type="button" className="smart-scan-secondary-button" disabled={saving} onClick={() => { setPlacing(true); setMessage('Tryk på luftfotoet dér, hvor scan-modellens centrum skal ligge.'); }}>Placér centrum på kortet</button>
        <button type="button" className="smart-scan-secondary-button" disabled={saving} onClick={() => void save('draft')}>Gem kladde</button>
        <button type="button" className="primary-button" disabled={saving || (diagnostics.available && diagnostics.severe)} onClick={() => void save('aligned')}>Godkend placering</button>
      </div>
      {message && <p className="field-help">{message}</p>}
    </section>
  );
}
