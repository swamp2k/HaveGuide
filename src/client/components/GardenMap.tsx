import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, {
  type GeoJSONSource,
  type Map as MapLibreMap,
  type Marker,
  type StyleSpecification,
} from 'maplibre-gl';
import {
  CONFIDENCE_LABELS,
  FEATURE_TYPE_LABELS,
  FEATURE_TYPES,
} from '../../shared/constants';
import { closePolygon, type GardenGeometry, type Position } from '../../shared/geojson';
import type { Confidence, FeatureType, GardenDetail, GardenFeature } from '../../shared/types';
import { api, ApiError } from '../api';
import { StatusMessage } from './StatusMessage';

const mapStyle: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap-bidragsydere',
      maxzoom: 19,
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

type DrawingKind = 'Point' | 'LineString' | 'Polygon';

interface GardenMapProps {
  garden: GardenDetail;
  onGardenChanged: (garden: GardenDetail) => void;
}

interface DrawingState {
  type: FeatureType;
  kind: DrawingKind;
  coordinates: Position[];
}

function featureCollection(features: GardenFeature[]) {
  return {
    type: 'FeatureCollection' as const,
    features: features.map((feature) => ({
      type: 'Feature' as const,
      id: feature.id,
      geometry: feature.geometry,
      properties: { id: feature.id, type: feature.type, name: feature.name },
    })),
  };
}

function drawingGeometry(state: DrawingState): GardenGeometry | null {
  if (state.kind === 'Point') return state.coordinates[0] ? { type: 'Point', coordinates: state.coordinates[0] } : null;
  if (state.kind === 'LineString') {
    return state.coordinates.length >= 2 ? { type: 'LineString', coordinates: state.coordinates } : null;
  }
  return state.coordinates.length >= 3
    ? { type: 'Polygon', coordinates: [closePolygon(state.coordinates)] }
    : null;
}

function markerPositions(geometry: GardenGeometry): Position[] {
  if (geometry.type === 'Point') return [geometry.coordinates];
  if (geometry.type === 'LineString') return geometry.coordinates;
  return geometry.coordinates[0]?.slice(0, -1) ?? [];
}

function replacePosition(geometry: GardenGeometry, index: number, next: Position): GardenGeometry {
  if (geometry.type === 'Point') return { type: 'Point', coordinates: next };
  if (geometry.type === 'LineString') {
    return {
      type: 'LineString',
      coordinates: geometry.coordinates.map((position: Position, current: number) =>
        current === index ? next : position,
      ),
    };
  }
  const openRing = geometry.coordinates[0]?.slice(0, -1) ?? [];
  const updated = openRing.map((position: Position, current: number) =>
    current === index ? next : position,
  );
  return { type: 'Polygon', coordinates: [closePolygon(updated)] };
}

export function GardenMap({ garden, onGardenChanged }: GardenMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const editMarkersRef = useRef<Marker[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawing, setDrawing] = useState<DrawingState | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [pendingGeometry, setPendingGeometry] = useState<GardenGeometry | null>(null);
  const [pendingType, setPendingType] = useState<FeatureType>('lawn');
  const [pendingKind, setPendingKind] = useState<DrawingKind>('Polygon');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [confidence, setConfidence] = useState<Confidence>('unknown');
  const [editingGeometry, setEditingGeometry] = useState(false);
  const [geometryDraft, setGeometryDraft] = useState<GardenGeometry | null>(null);
  const [geometryOriginal, setGeometryOriginal] = useState<GardenGeometry | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const selected = garden.features.find((feature) => feature.id === selectedId) ?? null;
  const displayFeatures = useMemo(
    () =>
      garden.features.map((feature) =>
        feature.id === selectedId && geometryDraft ? { ...feature, geometry: geometryDraft } : feature,
      ),
    [garden.features, geometryDraft, selectedId],
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle,
      center: [garden.centerLng, garden.centerLat],
      zoom: 18,
      maxZoom: 22,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    mapRef.current = map;

    map.on('load', () => {
      map.addSource('garden-features', { type: 'geojson', data: featureCollection(garden.features) });
      map.addLayer({
        id: 'garden-fill',
        type: 'fill',
        source: 'garden-features',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': '#3f795b', 'fill-opacity': 0.3 },
      });
      map.addLayer({
        id: 'garden-lines',
        type: 'line',
        source: 'garden-features',
        filter: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]],
        paint: { 'line-color': '#28543d', 'line-width': 3 },
      });
      map.addLayer({
        id: 'garden-points',
        type: 'circle',
        source: 'garden-features',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 8,
          'circle-color': '#f4f6f1',
          'circle-stroke-color': '#28543d',
          'circle-stroke-width': 3,
        },
      });
      map.addSource('drawing-preview', { type: 'geojson', data: featureCollection([]) });
      map.addLayer({
        id: 'drawing-fill',
        type: 'fill',
        source: 'drawing-preview',
        paint: { 'fill-color': '#d69935', 'fill-opacity': 0.25 },
      });
      map.addLayer({
        id: 'drawing-line',
        type: 'line',
        source: 'drawing-preview',
        paint: { 'line-color': '#9a6110', 'line-width': 3, 'line-dasharray': [2, 1] },
      });
      map.addLayer({
        id: 'drawing-point',
        type: 'circle',
        source: 'drawing-preview',
        paint: { 'circle-radius': 7, 'circle-color': '#d69935' },
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [garden.centerLat, garden.centerLng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    (map.getSource('garden-features') as GeoJSONSource | undefined)?.setData(featureCollection(displayFeatures));
  }, [displayFeatures]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onClick = (event: maplibregl.MapMouseEvent) => {
      if (drawing) {
        const position: Position = [event.lngLat.lng, event.lngLat.lat];
        if (drawing.kind === 'Point') {
          const geometry: GardenGeometry = { type: 'Point', coordinates: position };
          setPendingGeometry(geometry);
          setDrawing(null);
          setName(FEATURE_TYPE_LABELS[drawing.type]);
          return;
        }
        setDrawing((current) => (current ? { ...current, coordinates: [...current.coordinates, position] } : current));
        return;
      }
      if (editingGeometry) return;
      const hits = map.queryRenderedFeatures(event.point, {
        layers: ['garden-fill', 'garden-lines', 'garden-points'].filter((layer) => map.getLayer(layer)),
      });
      const id = hits[0]?.properties?.id;
      setSelectedId(typeof id === 'string' ? id : null);
    };
    map.on('click', onClick);
    return () => {
      map.off('click', onClick);
    };
  }, [drawing, editingGeometry]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    const geometry = drawing ? drawingGeometry(drawing) : null;
    const preview = geometry
      ? featureCollection([
          {
            id: 'preview',
            gardenId: garden.id,
            type: drawing?.type ?? 'other_area',
            name: 'Preview',
            description: '',
            confidence: 'unknown',
            geometry,
            createdAt: '',
            updatedAt: '',
          },
        ])
      : featureCollection([]);
    (map.getSource('drawing-preview') as GeoJSONSource | undefined)?.setData(preview);
  }, [drawing, garden.id]);

  useEffect(() => {
    for (const marker of editMarkersRef.current) marker.remove();
    editMarkersRef.current = [];
    const map = mapRef.current;
    if (!editingGeometry || !geometryDraft || !map) return;

    editMarkersRef.current = markerPositions(geometryDraft).map((position, index) => {
      const element = document.createElement('button');
      element.className = 'vertex-marker';
      element.type = 'button';
      element.setAttribute('aria-label', `Flyt punkt ${index + 1}`);
      const marker = new maplibregl.Marker({ element, draggable: true })
        .setLngLat(position)
        .addTo(map);
      marker.on('dragend', () => {
        const lngLat = marker.getLngLat();
        setGeometryDraft((current) =>
          current ? replacePosition(current, index, [lngLat.lng, lngLat.lat]) : current,
        );
      });
      return marker;
    });

    return () => {
      for (const marker of editMarkersRef.current) marker.remove();
      editMarkersRef.current = [];
    };
  }, [editingGeometry, geometryDraft?.type, selectedId]);

  useEffect(() => {
    if (!selected) return;
    setName(selected.name);
    setDescription(selected.description);
    setConfidence(selected.confidence);
    setEditingGeometry(false);
    setGeometryDraft(null);
    setGeometryOriginal(null);
    setMessage('');
  }, [selected?.id]);

  function startDrawing() {
    setDrawing({ type: pendingType, kind: pendingKind, coordinates: [] });
    setShowAdd(false);
    setSelectedId(null);
    setMessage('Tryk på kortet for at placere objektet.');
  }

  function finishDrawing() {
    if (!drawing) return;
    const geometry = drawingGeometry(drawing);
    if (!geometry) {
      setMessage(drawing.kind === 'LineString' ? 'En linje kræver mindst to punkter.' : 'Et område kræver mindst tre punkter.');
      return;
    }
    setPendingGeometry(geometry);
    setName(FEATURE_TYPE_LABELS[drawing.type]);
    setPendingType(drawing.type);
    setDrawing(null);
  }

  async function saveNewFeature(event: React.FormEvent) {
    event.preventDefault();
    if (!pendingGeometry) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await api.createFeature(garden.id, {
        type: pendingType,
        name,
        description,
        confidence,
        geometry: pendingGeometry,
      });
      onGardenChanged({ ...garden, features: [...garden.features, response.feature] });
      setPendingGeometry(null);
      setSelectedId(response.feature.id);
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Objektet kunne ikke gemmes.');
    } finally {
      setBusy(false);
    }
  }

  async function saveSelected(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await api.updateFeature(garden.id, selected.id, {
        name,
        description,
        confidence,
        ...(geometryDraft ? { geometry: geometryDraft } : {}),
      });
      if (!response.feature) throw new Error('Tomt svar');
      onGardenChanged({
        ...garden,
        features: garden.features.map((feature) =>
          feature.id === selected.id ? response.feature : feature,
        ),
      });
      setEditingGeometry(false);
      setGeometryDraft(null);
      setGeometryOriginal(null);
      setMessage('Ændringerne er gemt.');
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Objektet kunne ikke gemmes.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelected() {
    if (!selected || !window.confirm(`Slet “${selected.name}”?`)) return;
    setBusy(true);
    try {
      await api.deleteFeature(garden.id, selected.id);
      onGardenChanged({ ...garden, features: garden.features.filter((feature) => feature.id !== selected.id) });
      setSelectedId(null);
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Objektet kunne ikke slettes.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="map-page" aria-label="Kort over haven">
      <div ref={containerRef} className="map-container" />
      {!drawing && !selected && !pendingGeometry && (
        <button className="map-primary-action" type="button" onClick={() => setShowAdd(true)}>
          + Tilføj på kortet
        </button>
      )}

      {message && <div className="map-message"><StatusMessage>{message}</StatusMessage></div>}

      {drawing && (
        <div className="map-action-bar" aria-live="polite">
          <span>{drawing.coordinates.length} punkt{drawing.coordinates.length === 1 ? '' : 'er'}</span>
          <button
            type="button"
            className="text-button"
            disabled={drawing.coordinates.length === 0}
            onClick={() => setDrawing((current) => current ? { ...current, coordinates: current.coordinates.slice(0, -1) } : current)}
          >
            Fortryd
          </button>
          <button type="button" className="text-button" onClick={() => setDrawing(null)}>Annuller</button>
          {drawing.kind !== 'Point' && <button type="button" className="primary-small" onClick={finishDrawing}>Færdig</button>}
        </div>
      )}

      {showAdd && (
        <div className="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="add-map-title">
          <div className="sheet-handle" />
          <h2 id="add-map-title">Hvad vil du tilføje?</h2>
          <label>
            Type
            <select value={pendingType} onChange={(event) => setPendingType(event.target.value as FeatureType)}>
              {FEATURE_TYPES.map((type) => <option key={type} value={type}>{FEATURE_TYPE_LABELS[type]}</option>)}
            </select>
          </label>
          <fieldset className="choice-group">
            <legend>Form på kortet</legend>
            {([
              ['Point', 'Punkt'],
              ['LineString', 'Linje'],
              ['Polygon', 'Område'],
            ] as const).map(([value, label]) => (
              <label key={value} className="choice-card">
                <input
                  type="radio"
                  name="geometry-kind"
                  value={value}
                  checked={pendingKind === value}
                  onChange={() => setPendingKind(value)}
                />
                {label}
              </label>
            ))}
          </fieldset>
          <div className="button-row">
            <button className="secondary-button" type="button" onClick={() => setShowAdd(false)}>Luk</button>
            <button className="primary-button" type="button" onClick={startDrawing}>Tegn på kortet</button>
          </div>
        </div>
      )}

      {pendingGeometry && (
        <div className="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="new-feature-title">
          <div className="sheet-handle" />
          <h2 id="new-feature-title">Beskriv objektet</h2>
          <form className="form-stack compact-form" onSubmit={saveNewFeature}>
            <label>Navn<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} /></label>
            <label>Hvor sikker er du?<select value={confidence} onChange={(event) => setConfidence(event.target.value as Confidence)}>{Object.entries(CONFIDENCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>Noter <span className="optional">(valgfrit)</span><textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} /></label>
            <div className="button-row">
              <button type="button" className="secondary-button" onClick={() => setPendingGeometry(null)}>Annuller</button>
              <button type="submit" className="primary-button" disabled={busy}>{busy ? 'Gemmer…' : 'Gem'}</button>
            </div>
          </form>
        </div>
      )}

      {selected && (
        <div className="bottom-sheet feature-sheet" role="dialog" aria-labelledby="feature-title">
          <div className="sheet-handle" />
          <button className="sheet-close" type="button" aria-label="Luk" onClick={() => setSelectedId(null)}>×</button>
          <h2 id="feature-title">{FEATURE_TYPE_LABELS[selected.type]}</h2>
          <form className="form-stack compact-form" onSubmit={saveSelected}>
            <label>Navn<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} /></label>
            <label>Sikkerhed<select value={confidence} onChange={(event) => setConfidence(event.target.value as Confidence)}>{Object.entries(CONFIDENCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>Noter<textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} /></label>
            {!editingGeometry ? (
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setGeometryOriginal(selected.geometry);
                  setGeometryDraft(selected.geometry);
                  setEditingGeometry(true);
                }}
              >
                Rediger placering og form
              </button>
            ) : (
              <div className="inline-actions">
                <span className="field-help">Træk de markerede punkter på kortet.</span>
                <button type="button" className="text-button" onClick={() => setGeometryDraft(geometryOriginal)}>Fortryd geometri</button>
              </div>
            )}
            <div className="button-row">
              <button type="button" className="danger-button" onClick={deleteSelected} disabled={busy}>Slet</button>
              <button type="submit" className="primary-button" disabled={busy}>{busy ? 'Gemmer…' : 'Gem ændringer'}</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
