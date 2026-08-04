import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, {
  type GeoJSONSource,
  type Map as MapLibreMap,
  type Marker,
  type StyleSpecification,
} from 'maplibre-gl';
import { FEATURE_TYPE_LABELS, FEATURE_TYPES } from '../../shared/constants';
import { closePolygon, type GardenGeometry, type Position } from '../../shared/geojson';
import type { FeatureType, GardenDetail, GardenFeature } from '../../shared/types';
import { api, ApiError } from '../api';
import { StatusMessage } from './StatusMessage';
import './AerialEditor.css';

interface AerialEditorProps {
  garden: GardenDetail;
  onGardenChanged: (garden: GardenDetail) => void;
}

type DrawingKind = 'Point' | 'LineString' | 'Polygon';
type BaseLayer = 'map' | 'aerial';
interface DrawingState { type: FeatureType; kind: DrawingKind; coordinates: Position[]; featureId?: string; }

const emptyCollection = { type: 'FeatureCollection' as const, features: [] };
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
      tiles: ['/api/map/orthophoto/{z}/{x}/{y}.jpg'],
      tileSize: 256,
      maxzoom: 21,
      attribution: 'GeoDanmark Ortofoto · Datafordeleren',
    },
  },
  layers: [
    { id: 'aerial-editor-osm', type: 'raster', source: 'osm' },
    { id: 'aerial-editor-orthophoto', type: 'raster', source: 'orthophoto', layout: { visibility: 'none' } },
  ],
};

function toFeatureCollection(features: GardenFeature[], hiddenId?: string) {
  return {
    type: 'FeatureCollection' as const,
    features: features.filter((feature) => feature.id !== hiddenId).map((feature) => ({
      type: 'Feature' as const,
      id: feature.id,
      geometry: feature.geometry,
      properties: { id: feature.id, name: feature.name, type: feature.type },
    })),
  };
}

function geometryFromDrawing(drawing: DrawingState): GardenGeometry | null {
  if (drawing.kind === 'Point') {
    return drawing.coordinates[0] ? { type: 'Point', coordinates: drawing.coordinates[0] } : null;
  }
  if (drawing.kind === 'LineString') {
    return drawing.coordinates.length >= 2 ? { type: 'LineString', coordinates: drawing.coordinates } : null;
  }
  return drawing.coordinates.length >= 3
    ? { type: 'Polygon', coordinates: [closePolygon(drawing.coordinates)] }
    : null;
}

function drawingFromFeature(feature: GardenFeature): DrawingState {
  if (feature.geometry.type === 'Point') {
    return { type: feature.type, kind: 'Point', coordinates: [feature.geometry.coordinates], featureId: feature.id };
  }
  if (feature.geometry.type === 'LineString') {
    return { type: feature.type, kind: 'LineString', coordinates: feature.geometry.coordinates, featureId: feature.id };
  }
  return {
    type: feature.type,
    kind: 'Polygon',
    coordinates: feature.geometry.coordinates[0]?.slice(0, -1) ?? [],
    featureId: feature.id,
  };
}

function previewCollection(drawing: DrawingState | null) {
  if (!drawing) return emptyCollection;
  const geometry = geometryFromDrawing(drawing);
  if (geometry) {
    return {
      type: 'FeatureCollection' as const,
      features: [{ type: 'Feature' as const, id: 'drawing-preview', geometry, properties: {} }],
    };
  }
  return {
    type: 'FeatureCollection' as const,
    features: drawing.coordinates.map((coordinates, index) => ({
      type: 'Feature' as const,
      id: `vertex-${index}`,
      geometry: { type: 'Point' as const, coordinates },
      properties: {},
    })),
  };
}

export function AerialEditor({ garden, onGardenChanged }: AerialEditorProps) {
  const [open, setOpen] = useState(false);
  const [aerialAvailable, setAerialAvailable] = useState(false);
  const [baseLayer, setBaseLayer] = useState<BaseLayer>('map');
  const [featureType, setFeatureType] = useState<FeatureType>('garden_boundary');
  const [drawingKind, setDrawingKind] = useState<DrawingKind>('Polygon');
  const [drawing, setDrawing] = useState<DrawingState | null>(null);
  const [selectedFeatureId, setSelectedFeatureId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const drawingRef = useRef<DrawingState | null>(null);
  const baseLayerRef = useRef<BaseLayer>('map');
  const hiddenFeatureId = drawing?.featureId;
  const gardenData = useMemo(() => toFeatureCollection(garden.features, hiddenFeatureId), [garden.features, hiddenFeatureId]);
  const previewData = useMemo(() => previewCollection(drawing), [drawing]);
  const gardenDataRef = useRef(gardenData);
  const previewDataRef = useRef(previewData);

  useEffect(() => { drawingRef.current = drawing; }, [drawing]);
  useEffect(() => { baseLayerRef.current = baseLayer; }, [baseLayer]);
  useEffect(() => { gardenDataRef.current = gardenData; }, [gardenData]);
  useEffect(() => { previewDataRef.current = previewData; }, [previewData]);

  useEffect(() => {
    if (!open) return;
    document.body.classList.add('aerial-editor-open');
    return () => { document.body.classList.remove('aerial-editor-open'); };
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/map/config', { credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Kortkonfiguration kunne ikke hentes.');
        return response.json() as Promise<{ aerialAvailable: boolean }>;
      })
      .then((config) => {
        if (cancelled) return;
        setAerialAvailable(config.aerialAvailable);
        if (config.aerialAvailable) setBaseLayer('aerial');
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!open || !containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle,
      center: [garden.centerLng, garden.centerLat],
      zoom: 19,
      maxZoom: 22,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    map.on('load', () => {
      const layer = baseLayerRef.current;
      map.setLayoutProperty('aerial-editor-osm', 'visibility', layer === 'map' ? 'visible' : 'none');
      map.setLayoutProperty('aerial-editor-orthophoto', 'visibility', layer === 'aerial' ? 'visible' : 'none');
      map.addSource('aerial-editor-garden', { type: 'geojson', data: gardenDataRef.current });
      map.addLayer({ id: 'aerial-existing-fill', type: 'fill', source: 'aerial-editor-garden', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#3f795b', 'fill-opacity': 0.22 } });
      map.addLayer({ id: 'aerial-existing-line', type: 'line', source: 'aerial-editor-garden', filter: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]], paint: { 'line-color': '#ffffff', 'line-width': 3 } });
      map.addLayer({ id: 'aerial-existing-point', type: 'circle', source: 'aerial-editor-garden', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 7, 'circle-color': '#d69935', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } });
      map.addSource('aerial-editor-preview', { type: 'geojson', data: previewDataRef.current });
      map.addLayer({ id: 'aerial-preview-fill', type: 'fill', source: 'aerial-editor-preview', paint: { 'fill-color': '#d69935', 'fill-opacity': 0.3 } });
      map.addLayer({ id: 'aerial-preview-line', type: 'line', source: 'aerial-editor-preview', paint: { 'line-color': '#ffd56c', 'line-width': 4, 'line-dasharray': [2, 1] } });
      map.addLayer({ id: 'aerial-preview-point', type: 'circle', source: 'aerial-editor-preview', paint: { 'circle-radius': 7, 'circle-color': '#ffd56c', 'circle-stroke-color': '#173e2b', 'circle-stroke-width': 2 } });
    });
    map.on('click', (event) => {
      const current = drawingRef.current;
      if (!current || current.featureId) return;
      const position: Position = [event.lngLat.lng, event.lngLat.lat];
      if (current.kind === 'Point') {
        setDrawing({ ...current, coordinates: [position] });
        return;
      }
      setDrawing((latest) => latest ? { ...latest, coordinates: [...latest.coordinates, position] } : latest);
    });
    mapRef.current = map;
    return () => {
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [garden.centerLat, garden.centerLng, open]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    map.setLayoutProperty('aerial-editor-osm', 'visibility', baseLayer === 'map' ? 'visible' : 'none');
    map.setLayoutProperty('aerial-editor-orthophoto', 'visibility', baseLayer === 'aerial' ? 'visible' : 'none');
  }, [baseLayer]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    (map.getSource('aerial-editor-garden') as GeoJSONSource | undefined)?.setData(gardenData);
  }, [gardenData]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    (map.getSource('aerial-editor-preview') as GeoJSONSource | undefined)?.setData(previewData);
  }, [previewData]);

  useEffect(() => {
    for (const marker of markersRef.current) marker.remove();
    markersRef.current = [];
    const map = mapRef.current;
    if (!map || !drawing) return;

    markersRef.current = drawing.coordinates.map((position, index) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'aerial-vertex-marker';
      element.textContent = String(index + 1);
      element.setAttribute('aria-label', `Flyt punkt ${index + 1}`);
      const marker = new maplibregl.Marker({ element, draggable: true }).setLngLat(position).addTo(map);
      marker.on('dragend', () => {
        const next = marker.getLngLat();
        setDrawing((current) => current ? {
          ...current,
          coordinates: current.coordinates.map((coordinate, currentIndex) =>
            currentIndex === index ? [next.lng, next.lat] : coordinate,
          ),
        } : current);
      });
      return marker;
    });

    return () => {
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];
    };
  }, [drawing?.coordinates.length, drawing?.featureId]);

  function startDrawing() {
    setSelectedFeatureId('');
    setMessage('Tryk på luftfotoet for at placere punkter. Punkterne kan trækkes bagefter.');
    setDrawing({ type: featureType, kind: drawingKind, coordinates: [] });
  }

  function editExisting() {
    const feature = garden.features.find((item) => item.id === selectedFeatureId);
    if (!feature) return;
    setFeatureType(feature.type);
    setDrawingKind(feature.geometry.type);
    setDrawing(drawingFromFeature(feature));
    setMessage(`Redigerer ${feature.name}. Træk eller slet punkter og tryk Gem ændringer.`);
    const geometry = feature.geometry;
    const first = geometry.type === 'Point' ? geometry.coordinates : geometry.type === 'LineString' ? geometry.coordinates[0] : geometry.coordinates[0]?.[0];
    if (first) mapRef.current?.easeTo({ center: first, zoom: Math.max(mapRef.current.getZoom(), 19) });
  }

  function removeVertex(index: number) {
    if (busy) return;
    setDrawing((current) => current ? {
      ...current,
      coordinates: current.coordinates.filter((_, currentIndex) => currentIndex !== index),
    } : current);
  }

  async function finishDrawing() {
    if (!drawing || busy) return;
    const geometry = geometryFromDrawing(drawing);
    if (!geometry) {
      setMessage(drawing.kind === 'Point'
        ? 'Placér punktet på kortet først.'
        : drawing.kind === 'LineString'
          ? 'En linje kræver mindst to punkter.'
          : 'Et område kræver mindst tre punkter.');
      return;
    }

    setBusy(true);
    setMessage(drawing.featureId ? 'Gemmer ændringer…' : 'Gemmer markeringen…');
    try {
      if (drawing.featureId) {
        const existing = garden.features.find((item) => item.id === drawing.featureId);
        if (!existing) throw new Error('Objektet findes ikke længere.');
        const response = await api.updateFeature(garden.id, existing.id, {
          name: existing.name,
          description: existing.description,
          confidence: existing.confidence,
          geometry,
        });
        onGardenChanged({ ...garden, features: garden.features.map((item) => item.id === existing.id ? response.feature : item) });
        setMessage(`${existing.name} er opdateret.`);
      } else {
        const response = await api.createFeature(garden.id, {
          type: drawing.type,
          name: FEATURE_TYPE_LABELS[drawing.type],
          description: '',
          confidence: 'unknown',
          geometry,
        });
        onGardenChanged({ ...garden, features: [...garden.features, response.feature] });
        setMessage(`${FEATURE_TYPE_LABELS[drawing.type]} er gemt.`);
      }
      setDrawing(null);
      setSelectedFeatureId('');
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Objektet kunne ikke gemmes.');
    } finally {
      setBusy(false);
    }
  }

  function cancelDrawing() {
    if (busy) return;
    setDrawing(null);
    setMessage('Redigeringen blev annulleret.');
  }

  function closeEditor() {
    if (busy) return;
    setDrawing(null);
    setSelectedFeatureId('');
    setMessage('');
    setOpen(false);
  }

  return (
    <>
      <button className="aerial-editor-launch" type="button" onClick={() => setOpen(true)}>◫ Tegn på luftfoto</button>
      {open && (
        <div className="aerial-editor" role="dialog" aria-modal="true" aria-label="Tegn haven på luftfoto">
          <header className="aerial-editor-header">
            <div><p className="eyebrow">Assisteret kortlægning</p><strong>Tegn og ret haven</strong></div>
            <button type="button" onClick={closeEditor} disabled={busy} aria-label="Luk luftfotoeditor">×</button>
          </header>
          <div ref={containerRef} className="aerial-editor-map" />
          <div className="aerial-editor-layer-toggle" aria-label="Vælg kortbaggrund">
            <button type="button" className={baseLayer === 'map' ? 'active' : ''} onClick={() => setBaseLayer('map')}>Kort</button>
            <button type="button" className={baseLayer === 'aerial' ? 'active' : ''} disabled={!aerialAvailable} onClick={() => setBaseLayer('aerial')}>Luftfoto</button>
          </div>
          <section className="aerial-editor-panel">
            {message && <StatusMessage>{message}</StatusMessage>}
            {!aerialAvailable && <p className="field-help">Luftfoto kræver Datafordeler-nøglen. Du kan stadig tegne på standardkortet.</p>}
            {!drawing && (
              <div className="aerial-editor-home">
                <div className="aerial-editor-controls">
                  <label>Objekt<select value={featureType} onChange={(event) => setFeatureType(event.target.value as FeatureType)}>{FEATURE_TYPES.map((type) => <option key={type} value={type}>{FEATURE_TYPE_LABELS[type]}</option>)}</select></label>
                  <label>Form<select value={drawingKind} onChange={(event) => setDrawingKind(event.target.value as DrawingKind)}><option value="Polygon">Område</option><option value="LineString">Linje</option><option value="Point">Punkt</option></select></label>
                  <button className="primary-button" type="button" onClick={startDrawing}>Tegn nyt</button>
                </div>
                {garden.features.length > 0 && (
                  <div className="aerial-existing-editor">
                    <label>Rediger tidligere objekt<select value={selectedFeatureId} onChange={(event) => setSelectedFeatureId(event.target.value)}><option value="">Vælg objekt…</option>{garden.features.map((feature) => <option key={feature.id} value={feature.id}>{feature.name} · {FEATURE_TYPE_LABELS[feature.type]}</option>)}</select></label>
                    <button className="secondary-button" type="button" disabled={!selectedFeatureId} onClick={editExisting}>Rediger</button>
                  </div>
                )}
              </div>
            )}
            {drawing && (
              <div className="aerial-edit-workspace">
                <div className="aerial-drawing-actions">
                  <strong>{drawing.featureId ? 'Redigerer eksisterende objekt' : 'Nyt objekt'} · {drawing.coordinates.length} punkt{drawing.coordinates.length === 1 ? '' : 'er'}</strong>
                  {!drawing.featureId && <button type="button" className="secondary-button" disabled={busy || drawing.coordinates.length === 0} onClick={() => setDrawing((current) => current ? { ...current, coordinates: current.coordinates.slice(0, -1) } : current)}>Fortryd sidste</button>}
                  <button type="button" className="secondary-button" disabled={busy} onClick={cancelDrawing}>Annuller</button>
                  <button type="button" className="primary-button" disabled={busy} onClick={() => void finishDrawing()}>{busy ? 'Gemmer…' : drawing.featureId ? 'Gem ændringer' : 'Færdig'}</button>
                </div>
                {drawing.coordinates.length > 0 && (
                  <div className="aerial-vertex-list" aria-label="Punkter i objektet">
                    {drawing.coordinates.map((_, index) => (
                      <div key={index}><span>Punkt {index + 1}</span><button type="button" disabled={busy} onClick={() => removeVertex(index)}>Slet</button></div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
