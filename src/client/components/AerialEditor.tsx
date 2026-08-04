import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, {
  type GeoJSONSource,
  type Map as MapLibreMap,
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
interface DrawingState { type: FeatureType; kind: DrawingKind; coordinates: Position[]; }

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

function toFeatureCollection(features: GardenFeature[]) {
  return {
    type: 'FeatureCollection' as const,
    features: features.map((feature) => ({
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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const drawingRef = useRef<DrawingState | null>(null);
  const baseLayerRef = useRef<BaseLayer>('map');
  const gardenData = useMemo(() => toFeatureCollection(garden.features), [garden.features]);
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
      map.addLayer({
        id: 'aerial-existing-fill', type: 'fill', source: 'aerial-editor-garden',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': '#3f795b', 'fill-opacity': 0.22 },
      });
      map.addLayer({
        id: 'aerial-existing-line', type: 'line', source: 'aerial-editor-garden',
        filter: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]],
        paint: { 'line-color': '#ffffff', 'line-width': 3 },
      });
      map.addLayer({
        id: 'aerial-existing-point', type: 'circle', source: 'aerial-editor-garden',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-radius': 7, 'circle-color': '#d69935', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 },
      });
      map.addSource('aerial-editor-preview', { type: 'geojson', data: previewDataRef.current });
      map.addLayer({
        id: 'aerial-preview-fill', type: 'fill', source: 'aerial-editor-preview',
        paint: { 'fill-color': '#d69935', 'fill-opacity': 0.3 },
      });
      map.addLayer({
        id: 'aerial-preview-line', type: 'line', source: 'aerial-editor-preview',
        paint: { 'line-color': '#ffd56c', 'line-width': 4, 'line-dasharray': [2, 1] },
      });
      map.addLayer({
        id: 'aerial-preview-point', type: 'circle', source: 'aerial-editor-preview',
        paint: { 'circle-radius': 7, 'circle-color': '#ffd56c', 'circle-stroke-color': '#173e2b', 'circle-stroke-width': 2 },
      });
    });
    map.on('click', (event) => {
      const current = drawingRef.current;
      if (!current) return;
      const position: Position = [event.lngLat.lng, event.lngLat.lat];
      if (current.kind === 'Point') {
        setDrawing({ ...current, coordinates: [position] });
        return;
      }
      setDrawing((latest) => latest
        ? { ...latest, coordinates: [...latest.coordinates, position] }
        : latest);
    });
    mapRef.current = map;
    return () => {
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

  function startDrawing() {
    setMessage('Tryk på luftfotoet for at placere punkter.');
    setDrawing({ type: featureType, kind: drawingKind, coordinates: [] });
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
    setMessage('Gemmer markeringen…');
    try {
      const response = await api.createFeature(garden.id, {
        type: drawing.type,
        name: FEATURE_TYPE_LABELS[drawing.type],
        description: '',
        confidence: 'unknown',
        geometry,
      });
      onGardenChanged({ ...garden, features: [...garden.features, response.feature] });
      setDrawing(null);
      setMessage(`${FEATURE_TYPE_LABELS[drawing.type]} er gemt. Du kan tegne det næste objekt.`);
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Objektet kunne ikke gemmes.');
    } finally {
      setBusy(false);
    }
  }

  function cancelDrawing() {
    if (busy) return;
    setDrawing(null);
    setMessage('Tegningen blev annulleret.');
  }

  function closeEditor() {
    if (busy) return;
    setDrawing(null);
    setMessage('');
    setOpen(false);
  }

  return (
    <>
      <button className="aerial-editor-launch" type="button" onClick={() => setOpen(true)}>◫ Tegn på luftfoto</button>
      {open && (
        <div className="aerial-editor" role="dialog" aria-modal="true" aria-label="Tegn haven på luftfoto">
          <header className="aerial-editor-header">
            <div><p className="eyebrow">Assisteret kortlægning</p><strong>Tegn direkte på haven</strong></div>
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
              <div className="aerial-editor-controls">
                <label>Objekt<select value={featureType} onChange={(event) => setFeatureType(event.target.value as FeatureType)}>{FEATURE_TYPES.map((type) => <option key={type} value={type}>{FEATURE_TYPE_LABELS[type]}</option>)}</select></label>
                <label>Form<select value={drawingKind} onChange={(event) => setDrawingKind(event.target.value as DrawingKind)}><option value="Polygon">Område</option><option value="LineString">Linje</option><option value="Point">Punkt</option></select></label>
                <button className="primary-button" type="button" onClick={startDrawing}>Start tegning</button>
              </div>
            )}
            {drawing && (
              <div className="aerial-drawing-actions">
                <strong>{drawing.coordinates.length} punkt{drawing.coordinates.length === 1 ? '' : 'er'}</strong>
                <button type="button" className="secondary-button" disabled={busy || drawing.coordinates.length === 0} onClick={() => setDrawing((current) => current ? { ...current, coordinates: current.coordinates.slice(0, -1) } : current)}>Fortryd punkt</button>
                <button type="button" className="secondary-button" disabled={busy} onClick={cancelDrawing}>Annuller</button>
                <button type="button" className="primary-button" disabled={busy} onClick={() => void finishDrawing()}>{busy ? 'Gemmer…' : 'Færdig'}</button>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
