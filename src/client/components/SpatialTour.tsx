import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import maplibregl, {
  type GeoJSONSource,
  type Map as MapLibreMap,
  type Marker,
  type StyleSpecification,
} from 'maplibre-gl';
import type { Feature, FeatureCollection, Geometry, LineString } from 'geojson';
import { FEATURE_TYPE_LABELS } from '../../shared/constants';
import type {
  CaptureFrame,
  CaptureSession,
  CaptureStation,
  CaptureWorkspace,
} from '../../shared/capture-types';
import type { GardenDetail, GardenFeature } from '../../shared/types';
import { ApiError } from '../api';
import { captureApi } from '../capture-api';
import { StatusMessage } from './StatusMessage';
import './SpatialTour.css';

interface SpatialTourProps {
  garden: GardenDetail;
  workspace: CaptureWorkspace;
  onWorkspace: (workspace: CaptureWorkspace) => void;
}

const SHOTS_PER_STATION = 6;

function sessionForTour(workspace: CaptureWorkspace): CaptureSession | null {
  if (workspace.activeSession?.frames.length) return workspace.activeSession;
  return workspace.sessions.find((session) => session.frames.length > 0) ?? null;
}

function frameLabel(frame: CaptureFrame): { stationNo: number; shotNo: number } {
  return {
    stationNo: Math.floor((frame.sequenceNo - 1) / SHOTS_PER_STATION) + 1,
    shotNo: ((frame.sequenceNo - 1) % SHOTS_PER_STATION) + 1,
  };
}

function qualityLabel(frame: CaptureFrame): string {
  if (frame.qualityStatus === 'good') return 'God forbindelse';
  if (frame.qualityStatus === 'retake') return 'Tag helst igen';
  return 'Kontrollér billedet';
}

function featureAnchor(feature: GardenFeature): [number, number] | null {
  const geometry = feature.geometry;
  if (geometry.type === 'Point') return geometry.coordinates;
  const coordinates = geometry.type === 'LineString'
    ? geometry.coordinates
    : (geometry.coordinates[0]?.slice(0, -1) ?? []);
  if (coordinates.length === 0) return null;
  const totals = coordinates.reduce(
    (sum, position) => ({ lng: sum.lng + position[0], lat: sum.lat + position[1] }),
    { lng: 0, lat: 0 },
  );
  return [totals.lng / coordinates.length, totals.lat / coordinates.length];
}

function distanceMeters(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
): number {
  const radius = 6_371_000;
  const toRadians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = toRadians(second.latitude - first.latitude);
  const longitudeDelta = toRadians(second.longitude - first.longitude);
  const firstLatitude = toRadians(first.latitude);
  const secondLatitude = toRadians(second.latitude);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function bearingDegrees(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const toRadians = (value: number) => value * Math.PI / 180;
  const toDegrees = (value: number) => value * 180 / Math.PI;
  const firstLatitude = toRadians(from.latitude);
  const secondLatitude = toRadians(to.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const y = Math.sin(longitudeDelta) * Math.cos(secondLatitude);
  const x = Math.cos(firstLatitude) * Math.sin(secondLatitude)
    - Math.sin(firstLatitude) * Math.cos(secondLatitude) * Math.cos(longitudeDelta);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

function bearingDelta(first: number, second: number): number {
  return ((second - first + 540) % 360) - 180;
}

function destination(
  longitude: number,
  latitude: number,
  bearing: number,
  distanceM: number,
): [number, number] {
  const radius = 6_371_000;
  const angularDistance = distanceM / radius;
  const bearingRadians = bearing * Math.PI / 180;
  const latitudeRadians = latitude * Math.PI / 180;
  const longitudeRadians = longitude * Math.PI / 180;
  const destinationLatitude = Math.asin(
    Math.sin(latitudeRadians) * Math.cos(angularDistance)
      + Math.cos(latitudeRadians) * Math.sin(angularDistance) * Math.cos(bearingRadians),
  );
  const destinationLongitude = longitudeRadians + Math.atan2(
    Math.sin(bearingRadians) * Math.sin(angularDistance) * Math.cos(latitudeRadians),
    Math.cos(angularDistance) - Math.sin(latitudeRadians) * Math.sin(destinationLatitude),
  );
  return [destinationLongitude * 180 / Math.PI, destinationLatitude * 180 / Math.PI];
}

function buildSpatialMapStyle(aerialAvailable: boolean): StyleSpecification {
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
      { id: 'spatial-osm', type: 'raster', source: 'osm', layout: { visibility: aerialAvailable ? 'none' : 'visible' } },
      ...(aerialAvailable
        ? [{ id: 'spatial-orthophoto', type: 'raster' as const, source: 'orthophoto' }]
        : []),
    ],
  };
}

function SpatialTourMap({
  garden,
  session,
  frame,
  aerialAvailable,
  selectedFeatureId,
  onFeatureSelect,
  onStationSelect,
  onStationMove,
}: {
  garden: GardenDetail;
  session: CaptureSession;
  frame: CaptureFrame;
  aerialAvailable: boolean;
  selectedFeatureId: string;
  onFeatureSelect: (featureId: string) => void;
  onStationSelect: (stationNo: number) => void;
  onStationMove: (stationNo: number, longitude: number, latitude: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const onFeatureSelectRef = useRef(onFeatureSelect);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => { onFeatureSelectRef.current = onFeatureSelect; }, [onFeatureSelect]);

  const featureData = useMemo<FeatureCollection<Geometry>>(() => ({
    type: 'FeatureCollection',
    features: garden.features.map((feature) => ({
      type: 'Feature',
      id: feature.id,
      geometry: feature.geometry,
      properties: { id: feature.id, name: feature.name, type: feature.type },
    } satisfies Feature<Geometry>)),
  }), [garden.features]);

  const selectedData = useMemo<FeatureCollection<Geometry>>(() => ({
    type: 'FeatureCollection',
    features: garden.features
      .filter((feature) => feature.id === selectedFeatureId)
      .map((feature) => ({
        type: 'Feature',
        id: feature.id,
        geometry: feature.geometry,
        properties: { id: feature.id },
      } satisfies Feature<Geometry>)),
  }), [garden.features, selectedFeatureId]);

  const positionedStations = useMemo(
    () => session.stations.filter(
      (station): station is CaptureStation & { latitude: number; longitude: number } =>
        station.latitude !== null && station.longitude !== null,
    ),
    [session.stations],
  );

  const routeData = useMemo<FeatureCollection<LineString>>(() => {
    if (positionedStations.length < 2) return { type: 'FeatureCollection', features: [] };
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: positionedStations.map((station) => [station.longitude, station.latitude]),
        },
        properties: {},
      }],
    };
  }, [positionedStations]);

  const activeStationNo = frameLabel(frame).stationNo;
  const activeStation = session.stations.find((station) => station.stationNo === activeStationNo) ?? null;
  const directionData = useMemo<FeatureCollection<LineString>>(() => {
    if (
      !activeStation ||
      activeStation.latitude === null ||
      activeStation.longitude === null ||
      frame.bearingDegrees === null
    ) return { type: 'FeatureCollection', features: [] };
    const end = destination(activeStation.longitude, activeStation.latitude, frame.bearingDegrees, 7);
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [[activeStation.longitude, activeStation.latitude], end],
        },
        properties: {},
      }],
    };
  }, [activeStation, frame.bearingDegrees]);

  const featureDataRef = useRef(featureData);
  const routeDataRef = useRef(routeData);
  const directionDataRef = useRef(directionData);
  const selectedDataRef = useRef(selectedData);

  useEffect(() => { featureDataRef.current = featureData; }, [featureData]);
  useEffect(() => { routeDataRef.current = routeData; }, [routeData]);
  useEffect(() => { directionDataRef.current = directionData; }, [directionData]);
  useEffect(() => { selectedDataRef.current = selectedData; }, [selectedData]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildSpatialMapStyle(aerialAvailable),
      center: [garden.centerLng, garden.centerLat],
      zoom: 19,
      maxZoom: 22,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => {
      map.addSource('spatial-garden', { type: 'geojson', data: featureDataRef.current });
      map.addLayer({ id: 'spatial-feature-fill', type: 'fill', source: 'spatial-garden', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#3f795b', 'fill-opacity': 0.25 } });
      map.addLayer({ id: 'spatial-feature-line', type: 'line', source: 'spatial-garden', filter: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]], paint: { 'line-color': '#ffffff', 'line-width': 3 } });
      map.addLayer({ id: 'spatial-feature-point', type: 'circle', source: 'spatial-garden', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 7, 'circle-color': '#d69935', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } });

      map.addSource('spatial-selected', { type: 'geojson', data: selectedDataRef.current });
      map.addLayer({ id: 'spatial-selected-fill', type: 'fill', source: 'spatial-selected', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#ffd56c', 'fill-opacity': 0.5 } });
      map.addLayer({ id: 'spatial-selected-line', type: 'line', source: 'spatial-selected', filter: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]], paint: { 'line-color': '#ffd56c', 'line-width': 7 } });
      map.addLayer({ id: 'spatial-selected-point', type: 'circle', source: 'spatial-selected', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 12, 'circle-color': '#ffd56c', 'circle-stroke-color': '#173e2b', 'circle-stroke-width': 3 } });

      map.addSource('spatial-route', { type: 'geojson', data: routeDataRef.current });
      map.addLayer({ id: 'spatial-route-line', type: 'line', source: 'spatial-route', paint: { 'line-color': '#f4ce62', 'line-width': 4, 'line-dasharray': [2, 1] } });

      map.addSource('spatial-direction', { type: 'geojson', data: directionDataRef.current });
      map.addLayer({ id: 'spatial-direction-line', type: 'line', source: 'spatial-direction', paint: { 'line-color': '#ff5a4f', 'line-width': 5 } });
      setMapReady(true);
    });

    map.on('click', (event) => {
      const selectableLayers = ['spatial-feature-point', 'spatial-feature-line', 'spatial-feature-fill']
        .filter((layerId) => map.getLayer(layerId));
      const padding = 10;
      const hitBox: [[number, number], [number, number]] = [
        [event.point.x - padding, event.point.y - padding],
        [event.point.x + padding, event.point.y + padding],
      ];
      const hit = map.queryRenderedFeatures(hitBox, { layers: selectableLayers })
        .find((candidate) => typeof candidate.properties?.id === 'string');
      const featureId = typeof hit?.properties?.id === 'string' ? hit.properties.id : '';
      if (featureId) onFeatureSelectRef.current(featureId);
    });

    mapRef.current = map;
    return () => {
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [aerialAvailable, garden.centerLat, garden.centerLng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    (map.getSource('spatial-garden') as GeoJSONSource | undefined)?.setData(featureData);
  }, [featureData]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    (map.getSource('spatial-selected') as GeoJSONSource | undefined)?.setData(selectedData);
  }, [selectedData]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    (map.getSource('spatial-route') as GeoJSONSource | undefined)?.setData(routeData);
  }, [routeData]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    (map.getSource('spatial-direction') as GeoJSONSource | undefined)?.setData(directionData);
    if (activeStation && activeStation.latitude !== null && activeStation.longitude !== null) {
      map.easeTo({ center: [activeStation.longitude, activeStation.latitude], duration: 350 });
    }
  }, [activeStation, directionData]);

  useEffect(() => {
    for (const marker of markersRef.current) marker.remove();
    markersRef.current = [];
    const map = mapRef.current;
    if (!map || !mapReady) return;

    markersRef.current = positionedStations.map((station) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = `spatial-station-marker${station.stationNo === activeStationNo ? ' active' : ''}${station.source === 'manual' ? ' manual' : ''}`;
      element.textContent = String(station.stationNo);
      element.title = `Station ${station.stationNo} · træk for at rette placeringen`;
      element.addEventListener('click', () => onStationSelect(station.stationNo));
      const marker = new maplibregl.Marker({ element, draggable: true })
        .setLngLat([station.longitude, station.latitude])
        .addTo(map);
      marker.on('dragend', () => {
        const position = marker.getLngLat();
        onStationMove(station.stationNo, position.lng, position.lat);
      });
      return marker;
    });

    return () => {
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];
    };
  }, [activeStationNo, mapReady, onStationMove, onStationSelect, positionedStations]);

  return <div ref={containerRef} className="spatial-tour-map" aria-label="Luftfoto med rundturens stationer og haveobjekter" />;
}

function suggestedFeatures(garden: GardenDetail, frame: CaptureFrame) {
  if (frame.latitude === null || frame.longitude === null || frame.bearingDegrees === null) return [];
  const origin = { latitude: frame.latitude, longitude: frame.longitude };
  return garden.features
    .map((feature) => {
      const anchor = featureAnchor(feature);
      if (!anchor) return null;
      const target = { latitude: anchor[1], longitude: anchor[0] };
      const distanceM = distanceMeters(origin, target);
      const direction = bearingDegrees(origin, target);
      const delta = Math.abs(bearingDelta(frame.bearingDegrees ?? 0, direction));
      return { feature, distanceM, delta };
    })
    .filter((candidate): candidate is { feature: GardenFeature; distanceM: number; delta: number } =>
      candidate !== null && candidate.distanceM <= 60 && candidate.delta <= 55,
    )
    .sort((left, right) => left.delta - right.delta || left.distanceM - right.distanceM)
    .slice(0, 6);
}

function SpatialTourViewer({
  garden,
  workspace,
  initialIndex,
  onWorkspace,
  onClose,
}: {
  garden: GardenDetail;
  workspace: CaptureWorkspace;
  initialIndex: number;
  onWorkspace: (workspace: CaptureWorkspace) => void;
  onClose: () => void;
}) {
  const session = sessionForTour(workspace);
  const [index, setIndex] = useState(initialIndex);
  const [selectedFeatureId, setSelectedFeatureId] = useState('');
  const [linkFeatureId, setLinkFeatureId] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const filmstripRef = useRef<HTMLElement>(null);

  const frame = session?.frames[index] ?? session?.frames[0] ?? null;
  const selectedFeature = garden.features.find((feature) => feature.id === selectedFeatureId) ?? null;
  const candidates = useMemo(
    () => frame ? suggestedFeatures(garden, frame) : [],
    [frame, garden],
  );

  useEffect(() => {
    document.body.classList.add('virtual-tour-open');
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (!session) return;
      if (event.key === 'ArrowLeft') setIndex((current) => Math.max(0, current - 1));
      if (event.key === 'ArrowRight') setIndex((current) => Math.min(session.frames.length - 1, current + 1));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.classList.remove('virtual-tour-open');
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, session]);

  useEffect(() => {
    if (!session) return;
    setIndex((current) => Math.min(current, Math.max(0, session.frames.length - 1)));
  }, [session]);

  useEffect(() => {
    const active = filmstripRef.current?.querySelector<HTMLButtonElement>(`button[data-index="${index}"]`);
    active?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [index]);

  const selectMapFeature = useCallback((featureId: string) => {
    if (!session) return;
    setSelectedFeatureId(featureId);
    const linkedIndexes = session.frames
      .map((item, itemIndex) => item.hotspots.some((hotspot) => hotspot.featureId === featureId) ? itemIndex : -1)
      .filter((itemIndex) => itemIndex >= 0);
    if (linkedIndexes.length === 0) {
      setMessage('Objektet er på kortet, men er endnu ikke knyttet til et billede. Tryk “Knyt objekt”.');
      return;
    }
    const firstLinkedIndex = linkedIndexes[0];
    if (firstLinkedIndex !== undefined) setIndex(firstLinkedIndex);
    setMessage(`${linkedIndexes.length} billede${linkedIndexes.length === 1 ? '' : 'r'} er knyttet til objektet.`);
  }, [session]);

  const selectStation = useCallback((stationNo: number) => {
    if (!session) return;
    const firstIndex = session.frames.findIndex((item) => frameLabel(item).stationNo === stationNo);
    if (firstIndex >= 0) setIndex(firstIndex);
  }, [session]);

  const moveStation = useCallback(async (stationNo: number, longitude: number, latitude: number) => {
    if (!session) return;
    setBusy(true);
    try {
      const response = await captureApi.updateStation(garden.id, session.id, stationNo, { latitude, longitude });
      onWorkspace(response.workspace);
      setMessage(`Station ${stationNo} er flyttet og gemt.`);
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Stationen kunne ikke flyttes.');
    } finally {
      setBusy(false);
    }
  }, [garden.id, onWorkspace, session]);

  if (!session || !frame) return null;
  const label = frameLabel(frame);

  async function placeHotspot(event: ReactMouseEvent<HTMLImageElement>) {
    if (!linkFeatureId || busy) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const xNorm = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const yNorm = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    setBusy(true);
    try {
      const response = await captureApi.upsertHotspot(garden.id, session.id, frame.id, {
        featureId: linkFeatureId,
        xNorm,
        yNorm,
      });
      onWorkspace(response.workspace);
      setSelectedFeatureId(linkFeatureId);
      setLinkFeatureId('');
      setMessage('Objektet er nu knyttet til billedet og kortet.');
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Objektet kunne ikke knyttes til billedet.');
    } finally {
      setBusy(false);
    }
  }

  async function removeHotspot(featureId: string) {
    if (busy) return;
    setBusy(true);
    try {
      const response = await captureApi.deleteHotspot(garden.id, session.id, frame.id, featureId);
      onWorkspace(response.workspace);
      setSelectedFeatureId('');
      setMessage('Objektmarkeringen er fjernet fra dette billede.');
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Objektmarkeringen kunne ikke fjernes.');
    } finally {
      setBusy(false);
    }
  }

  const currentHotspot = frame.hotspots.find((hotspot) => hotspot.featureId === selectedFeatureId) ?? null;

  return (
    <div className="spatial-tour-viewer" role="dialog" aria-modal="true" aria-label="Rumlig virtuel rundtur i haven">
      <header className="spatial-tour-header">
        <button type="button" onClick={onClose}><span aria-hidden="true">←</span> Kortlæg</button>
        <div>
          <p className="eyebrow">Rumlig rundtur</p>
          <strong>Station {label.stationNo} · billede {label.shotNo}/{SHOTS_PER_STATION}</strong>
        </div>
        <button
          type="button"
          className={linkFeatureId ? 'active' : ''}
          onClick={() => setLinkFeatureId(linkFeatureId ? '' : (selectedFeatureId || candidates[0]?.feature.id || ''))}
          disabled={busy || garden.features.length === 0}
        >
          ＋ Knyt objekt
        </button>
      </header>

      <main className="spatial-tour-body">
        <section className="spatial-tour-image-pane">
          <div className={`spatial-tour-image-wrap${linkFeatureId ? ' linking' : ''}`}>
            <img
              src={frame.contentUrl}
              alt={`Station ${label.stationNo}, billede ${label.shotNo}`}
              onClick={(event) => void placeHotspot(event)}
            />
            {frame.hotspots.map((hotspot) => {
              const feature = garden.features.find((item) => item.id === hotspot.featureId);
              if (!feature) return null;
              return (
                <button
                  key={hotspot.featureId}
                  type="button"
                  className={`tour-hotspot${selectedFeatureId === hotspot.featureId ? ' active' : ''}`}
                  style={{ left: `${hotspot.xNorm * 100}%`, top: `${hotspot.yNorm * 100}%` }}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedFeatureId(hotspot.featureId);
                    setMessage('Objektet er fremhævet på både billede og kort.');
                  }}
                >
                  <span aria-hidden="true">●</span>{feature.name}
                </button>
              );
            })}
          </div>

          <button type="button" className="tour-previous" onClick={() => setIndex((current) => Math.max(0, current - 1))} disabled={index === 0} aria-label="Forrige billede">‹</button>
          <button type="button" className="tour-next" onClick={() => setIndex((current) => Math.min(session.frames.length - 1, current + 1))} disabled={index === session.frames.length - 1} aria-label="Næste billede">›</button>

          <div className="tour-frame-information">
            <strong>{qualityLabel(frame)}</strong>
            <span>{frame.bearingDegrees === null ? 'Retning ukendt' : `Retning ${Math.round(frame.bearingDegrees)}°`}</span>
            <span>{frame.accuracyM === null ? 'GPS ukendt' : `GPS ±${Math.round(frame.accuracyM)} m`}</span>
            <span>{frame.hotspots.length} objekt{frame.hotspots.length === 1 ? '' : 'er'}</span>
          </div>
        </section>

        <aside className="spatial-tour-side">
          <div className="spatial-map-heading">
            <div><strong>Kort og position</strong><small>Træk en station for at rette GPS-placeringen.</small></div>
            <span>Station {label.stationNo}</span>
          </div>
          <SpatialTourMap
            garden={garden}
            session={session}
            frame={frame}
            aerialAvailable={workspace.aerialAvailable}
            selectedFeatureId={selectedFeatureId}
            onFeatureSelect={selectMapFeature}
            onStationSelect={selectStation}
            onStationMove={(stationNo, longitude, latitude) => void moveStation(stationNo, longitude, latitude)}
          />

          {message && <StatusMessage>{message}</StatusMessage>}

          {linkFeatureId && (
            <div className="tour-link-panel">
              <div className="tour-link-panel-heading">
                <strong>Knyt objekt til billedet</strong>
                <button type="button" onClick={() => setLinkFeatureId('')}>Annuller</button>
              </div>
              {candidates.length > 0 && (
                <div className="tour-suggestions">
                  <span>Muligvis synligt her</span>
                  {candidates.map((candidate) => (
                    <button
                      key={candidate.feature.id}
                      type="button"
                      className={linkFeatureId === candidate.feature.id ? 'active' : ''}
                      onClick={() => {
                        setLinkFeatureId(candidate.feature.id);
                        setSelectedFeatureId(candidate.feature.id);
                      }}
                    >
                      <strong>{candidate.feature.name}</strong>
                      <small>ca. {Math.round(candidate.distanceM)} m · {Math.round(candidate.delta)}° fra billedretningen</small>
                    </button>
                  ))}
                </div>
              )}
              <label>
                Alle kortobjekter
                <select value={linkFeatureId} onChange={(event) => {
                  setLinkFeatureId(event.target.value);
                  setSelectedFeatureId(event.target.value);
                }}>
                  <option value="">Vælg objekt…</option>
                  {garden.features.map((feature) => (
                    <option key={feature.id} value={feature.id}>{feature.name} · {FEATURE_TYPE_LABELS[feature.type]}</option>
                  ))}
                </select>
              </label>
              <p>{linkFeatureId ? 'Tryk nu direkte på objektet i billedet.' : 'Vælg først hvilket kortobjekt du kan se.'}</p>
            </div>
          )}

          {selectedFeature && !linkFeatureId && (
            <div className="tour-object-card">
              <span>Valgt haveobjekt</span>
              <strong>{selectedFeature.name}</strong>
              <small>{FEATURE_TYPE_LABELS[selectedFeature.type]}</small>
              {currentHotspot ? (
                <button type="button" className="danger-link" disabled={busy} onClick={() => void removeHotspot(selectedFeature.id)}>Fjern fra dette billede</button>
              ) : (
                <button type="button" className="secondary-button" onClick={() => setLinkFeatureId(selectedFeature.id)}>Knyt til dette billede</button>
              )}
            </div>
          )}
        </aside>
      </main>

      <nav ref={filmstripRef} className="spatial-tour-filmstrip" aria-label="Billeder i rundturen">
        {session.frames.map((item, itemIndex) => {
          const itemLabel = frameLabel(item);
          return (
            <button
              key={item.id}
              data-index={itemIndex}
              type="button"
              className={itemIndex === index ? 'active' : ''}
              onClick={() => setIndex(itemIndex)}
              aria-label={`Åbn station ${itemLabel.stationNo}, billede ${itemLabel.shotNo}`}
            >
              <img src={item.contentUrl} alt="" />
              <span>{itemLabel.stationNo}.{itemLabel.shotNo}</span>
              {item.hotspots.length > 0 && <em>{item.hotspots.length}</em>}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export function SpatialTour({ garden, workspace, onWorkspace }: SpatialTourProps) {
  const session = sessionForTour(workspace);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const hasCaptureData = Boolean(workspace.activeSession) || workspace.sessions.length > 0;

  async function resetCapture() {
    if (busy) return;
    const confirmed = window.confirm(
      'Nulstil havebilleder? Alle billeder og stationer fra den guidede opmåling slettes permanent. Dine kortobjekter, planter og øvrige havebilleder bevares.',
    );
    if (!confirmed) return;
    setBusy(true);
    setMessage('Sletter rundtur og billeder…');
    try {
      const response = await captureApi.reset(garden.id);
      setViewerIndex(null);
      onWorkspace(response.workspace);
      setMessage(`${response.deletedImages} rundtursbillede${response.deletedImages === 1 ? '' : 'r'} slettet. Du kan starte en ny opmåling.`);
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Havebillederne kunne ikke nulstilles.');
    } finally {
      setBusy(false);
    }
  }

  if (!session?.frames.length) {
    if (!hasCaptureData && !message) return null;
    return (
      <section className="mapping-assistant-card spatial-tour-reset-only">
        {message && <StatusMessage>{message}</StatusMessage>}
        {hasCaptureData && (
          <button type="button" className="danger-button" disabled={busy} onClick={() => void resetCapture()}>
            {busy ? 'Nulstiller…' : 'Nulstil havebilleder og start forfra'}
          </button>
        )}
      </section>
    );
  }

  const positionedStations = session.stations.filter((station) => station.latitude !== null && station.longitude !== null).length;
  const linkedObjects = new Set(session.frames.flatMap((frame) => frame.hotspots.map((hotspot) => hotspot.featureId))).size;

  return (
    <>
      <section className="mapping-assistant-card virtual-tour spatial-tour-entry">
        <div className="mapping-card-heading">
          <div>
            <p className="eyebrow">Rumlig virtuel rundtur</p>
            <h2>Gå gennem haven og kortet samtidig</h2>
            <p>{session.stations.length} station{session.stations.length === 1 ? '' : 'er'} · {positionedStations} placeret på kortet · {linkedObjects} kortobjekt{linkedObjects === 1 ? '' : 'er'} knyttet til billeder.</p>
          </div>
          <span className="tour-count">{session.frames.length} billeder</span>
        </div>
        {message && <StatusMessage>{message}</StatusMessage>}
        <button type="button" className="primary-button open-spatial-tour" onClick={() => setViewerIndex(0)}>Åbn rumlig rundtur</button>
        <div className="tour-strip spatial-tour-preview">
          {session.frames.slice(0, 8).map((previewFrame, frameIndex) => {
            const label = frameLabel(previewFrame);
            return (
              <button key={previewFrame.id} type="button" className={`tour-frame quality-${previewFrame.qualityStatus}`} onClick={() => setViewerIndex(frameIndex)}>
                <img src={previewFrame.contentUrl} alt={`Station ${label.stationNo}, billede ${label.shotNo}`} />
                <div><strong>{label.stationNo}.{label.shotNo}</strong><span>{previewFrame.hotspots.length} objekter</span></div>
              </button>
            );
          })}
        </div>
        <div className="spatial-tour-management">
          <p>Træk stationer på plads i rundturen og knyt fx træer og bede direkte til det, du ser i billedet.</p>
          <button type="button" className="danger-link" disabled={busy} onClick={() => void resetCapture()}>
            {busy ? 'Nulstiller…' : 'Nulstil havebilleder'}
          </button>
        </div>
      </section>

      {viewerIndex !== null && (
        <SpatialTourViewer
          garden={garden}
          workspace={workspace}
          initialIndex={viewerIndex}
          onWorkspace={onWorkspace}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </>
  );
}
