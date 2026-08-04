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

interface DrawingVertex {
  id: string;
  label: number;
  position: Position;
}

interface DrawingState {
  type: FeatureType;
  kind: DrawingKind;
  name: string;
  vertices: DrawingVertex[];
  featureId?: string;
}

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

function positionsOf(drawing: DrawingState): Position[] {
  return drawing.vertices.map((vertex) => vertex.position);
}

function geometryFromDrawing(drawing: DrawingState): GardenGeometry | null {
  const positions = positionsOf(drawing);
  if (drawing.kind === 'Point') {
    return positions[0] ? { type: 'Point', coordinates: positions[0] } : null;
  }
  if (drawing.kind === 'LineString') {
    return positions.length >= 2 ? { type: 'LineString', coordinates: positions } : null;
  }
  return positions.length >= 3
    ? { type: 'Polygon', coordinates: [closePolygon(positions)] }
    : null;
}

function makeVertices(positions: Position[]): DrawingVertex[] {
  return positions.map((position, index) => ({
    id: crypto.randomUUID(),
    label: index + 1,
    position,
  }));
}

function drawingFromFeature(feature: GardenFeature): DrawingState {
  if (feature.geometry.type === 'Point') {
    return {
      type: feature.type,
      kind: 'Point',
      name: feature.name,
      vertices: makeVertices([feature.geometry.coordinates]),
      featureId: feature.id,
    };
  }
  if (feature.geometry.type === 'LineString') {
    return {
      type: feature.type,
      kind: 'LineString',
      name: feature.name,
      vertices: makeVertices(feature.geometry.coordinates),
      featureId: feature.id,
    };
  }
  return {
    type: feature.type,
    kind: 'Polygon',
    name: feature.name,
    vertices: makeVertices(feature.geometry.coordinates[0]?.slice(0, -1) ?? []),
    featureId: feature.id,
  };
}

function previewCollection(drawing: DrawingState | null) {
  if (!drawing || drawing.vertices.length === 0) return emptyCollection;
  const positions = positionsOf(drawing);

  let geometry: GardenGeometry;
  if (drawing.kind === 'Point' || positions.length === 1) {
    geometry = { type: 'Point', coordinates: positions[0] };
  } else if (drawing.kind === 'LineString' || positions.length === 2) {
    geometry = { type: 'LineString', coordinates: positions };
  } else {
    geometry = { type: 'Polygon', coordinates: [closePolygon(positions)] };
  }

  return {
    type: 'FeatureCollection' as const,
    features: [{ type: 'Feature' as const, id: 'drawing-preview', geometry, properties: {} }],
  };
}

export function AerialEditor({ garden, onGardenChanged }: AerialEditorProps) {
  const [open, setOpen] = useState(false);
  const [aerialAvailable, setAerialAvailable] = useState(false);
  const [baseLayer, setBaseLayer] = useState<BaseLayer>('map');
  const [featureType, setFeatureType] = useState<FeatureType>('garden_boundary');
  const [drawingKind, setDrawingKind] = useState<DrawingKind>('Polygon');
  const [newObjectName, setNewObjectName] = useState(FEATURE_TYPE_LABELS.garden_boundary);
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
  const selectedFeature = garden.features.find((feature) => feature.id === selectedFeatureId) ?? null;
  const gardenData = useMemo(
    () => toFeatureCollection(garden.features, hiddenFeatureId),
    [garden.features, hiddenFeatureId],
  );
  const selectedData = useMemo(
    () => toFeatureCollection(!drawing && selectedFeature ? [selectedFeature] : []),
    [drawing, selectedFeature],
  );
  const previewData = useMemo(() => previewCollection(drawing), [drawing]);
  const vertexSignature = drawing?.vertices.map((vertex) => vertex.id).join('|') ?? '';
  const gardenDataRef = useRef(gardenData);
  const selectedDataRef = useRef(selectedData);
  const previewDataRef = useRef(previewData);

  useEffect(() => { drawingRef.current = drawing; }, [drawing]);
  useEffect(() => { baseLayerRef.current = baseLayer; }, [baseLayer]);
  useEffect(() => { gardenDataRef.current = gardenData; }, [gardenData]);
  useEffect(() => { selectedDataRef.current = selectedData; }, [selectedData]);
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
        id: 'aerial-existing-fill',
        type: 'fill',
        source: 'aerial-editor-garden',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': '#3f795b', 'fill-opacity': 0.22 },
      });
      map.addLayer({
        id: 'aerial-existing-line',
        type: 'line',
        source: 'aerial-editor-garden',
        filter: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]],
        paint: { 'line-color': '#ffffff', 'line-width': 3 },
      });
      map.addLayer({
        id: 'aerial-existing-point',
        type: 'circle',
        source: 'aerial-editor-garden',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 7,
          'circle-color': '#d69935',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });

      map.addSource('aerial-editor-selected', { type: 'geojson', data: selectedDataRef.current });
      map.addLayer({
        id: 'aerial-selected-fill',
        type: 'fill',
        source: 'aerial-editor-selected',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': '#ffd56c', 'fill-opacity': 0.42 },
      });
      map.addLayer({
        id: 'aerial-selected-line',
        type: 'line',
        source: 'aerial-editor-selected',
        filter: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]],
        paint: { 'line-color': '#ffd56c', 'line-width': 7 },
      });
      map.addLayer({
        id: 'aerial-selected-point',
        type: 'circle',
        source: 'aerial-editor-selected',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 12,
          'circle-color': '#ffd56c',
          'circle-stroke-color': '#173e2b',
          'circle-stroke-width': 4,
        },
      });

      map.addSource('aerial-editor-preview', { type: 'geojson', data: previewDataRef.current });
      map.addLayer({
        id: 'aerial-preview-fill',
        type: 'fill',
        source: 'aerial-editor-preview',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': '#d69935', 'fill-opacity': 0.34 },
      });
      map.addLayer({
        id: 'aerial-preview-line',
        type: 'line',
        source: 'aerial-editor-preview',
        filter: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]],
        paint: { 'line-color': '#ffd56c', 'line-width': 4, 'line-dasharray': [2, 1] },
      });
      map.addLayer({
        id: 'aerial-preview-point',
        type: 'circle',
        source: 'aerial-editor-preview',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 7,
          'circle-color': '#ffd56c',
          'circle-stroke-color': '#173e2b',
          'circle-stroke-width': 2,
        },
      });
    });

    map.on('click', (event) => {
      const current = drawingRef.current;
      if (current) {
        if (current.featureId) return;
        const position: Position = [event.lngLat.lng, event.lngLat.lat];
        if (current.kind === 'Point') {
          const existingVertex = current.vertices[0];
          setDrawing({
            ...current,
            vertices: [{
              id: existingVertex?.id ?? crypto.randomUUID(),
              label: existingVertex?.label ?? 1,
              position,
            }],
          });
          return;
        }
        const nextLabel = current.vertices.reduce((maximum, vertex) => Math.max(maximum, vertex.label), 0) + 1;
        setDrawing({
          ...current,
          vertices: [...current.vertices, { id: crypto.randomUUID(), label: nextLabel, position }],
        });
        return;
      }

      const selectableLayers = [
        'aerial-existing-point',
        'aerial-existing-line',
        'aerial-existing-fill',
      ].filter((layerId) => map.getLayer(layerId));
      const padding = 12;
      const hitBox: [[number, number], [number, number]] = [
        [event.point.x - padding, event.point.y - padding],
        [event.point.x + padding, event.point.y + padding],
      ];
      const hit = map.queryRenderedFeatures(hitBox, { layers: selectableLayers })
        .find((feature) => typeof feature.properties?.id === 'string');
      const featureId = typeof hit?.properties?.id === 'string' ? hit.properties.id : '';
      setSelectedFeatureId(featureId);
      setMessage(featureId ? 'Objektet er valgt. Tryk Rediger for at ændre form eller navn.' : '');
    });

    map.on('mousemove', (event) => {
      if (drawingRef.current) {
        map.getCanvas().style.cursor = drawingRef.current.featureId ? '' : 'crosshair';
        return;
      }
      const padding = 8;
      const hitBox: [[number, number], [number, number]] = [
        [event.point.x - padding, event.point.y - padding],
        [event.point.x + padding, event.point.y + padding],
      ];
      const selectableLayers = [
        'aerial-existing-point',
        'aerial-existing-line',
        'aerial-existing-fill',
      ].filter((layerId) => map.getLayer(layerId));
      map.getCanvas().style.cursor = map.queryRenderedFeatures(hitBox, { layers: selectableLayers }).length > 0
        ? 'pointer'
        : '';
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
    (map.getSource('aerial-editor-selected') as GeoJSONSource | undefined)?.setData(selectedData);
  }, [selectedData]);

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

    markersRef.current = drawing.vertices.map((vertex) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'aerial-vertex-marker';
      element.textContent = String(vertex.label);
      element.setAttribute('aria-label', `Flyt punkt ${vertex.label}`);
      const marker = new maplibregl.Marker({ element, draggable: true }).setLngLat(vertex.position).addTo(map);
      marker.on('dragend', () => {
        const next = marker.getLngLat();
        setDrawing((current) => current ? {
          ...current,
          vertices: current.vertices.map((candidate) =>
            candidate.id === vertex.id
              ? { ...candidate, position: [next.lng, next.lat] }
              : candidate,
          ),
        } : current);
      });
      return marker;
    });

    return () => {
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];
    };
  }, [vertexSignature, drawing?.featureId]);

  function changeFeatureType(nextType: FeatureType) {
    setFeatureType(nextType);
    setNewObjectName((currentName) => {
      const currentDefault = FEATURE_TYPE_LABELS[featureType];
      return !currentName.trim() || currentName === currentDefault
        ? FEATURE_TYPE_LABELS[nextType]
        : currentName;
    });
  }

  function startDrawing() {
    const name = newObjectName.trim();
    if (!name) {
      setMessage('Giv objektet et navn først.');
      return;
    }
    setSelectedFeatureId('');
    setMessage('Tryk på luftfotoet for at placere punkter. Området vises løbende, og punkterne kan trækkes bagefter.');
    setDrawing({ type: featureType, kind: drawingKind, name, vertices: [] });
  }

  function editExisting() {
    if (!selectedFeature) return;
    const feature = selectedFeature;
    setFeatureType(feature.type);
    setDrawingKind(feature.geometry.type);
    setDrawing(drawingFromFeature(feature));
    setSelectedFeatureId('');
    setMessage(`Redigerer ${feature.name}. Træk eller slet punkter, ret navnet og gem ændringerne.`);
    const geometry = feature.geometry;
    const first = geometry.type === 'Point'
      ? geometry.coordinates
      : geometry.type === 'LineString'
        ? geometry.coordinates[0]
        : geometry.coordinates[0]?.[0];
    if (first) mapRef.current?.easeTo({ center: first, zoom: Math.max(mapRef.current.getZoom(), 19) });
  }

  async function removeVertex(vertexId: string) {
    if (!drawing || busy) return;

    if (drawing.vertices.length > 1) {
      setDrawing({
        ...drawing,
        vertices: drawing.vertices.filter((vertex) => vertex.id !== vertexId),
      });
      return;
    }

    if (!drawing.featureId) {
      setDrawing(null);
      setMessage('Den tomme tegning blev fjernet.');
      return;
    }

    const existing = garden.features.find((feature) => feature.id === drawing.featureId);
    if (!existing) return;
    if (!window.confirm(`Slet hele “${existing.name}”?`)) return;

    setBusy(true);
    setMessage('Sletter objektet…');
    try {
      await api.deleteFeature(garden.id, existing.id);
      onGardenChanged({
        ...garden,
        features: garden.features.filter((feature) => feature.id !== existing.id),
      });
      setDrawing(null);
      setSelectedFeatureId('');
      setMessage(`${existing.name} er slettet.`);
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Objektet kunne ikke slettes.');
    } finally {
      setBusy(false);
    }
  }

  async function finishDrawing() {
    if (!drawing || busy) return;
    const name = drawing.name.trim();
    if (!name) {
      setMessage('Objektet skal have et navn.');
      return;
    }
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
          name,
          description: existing.description,
          confidence: existing.confidence,
          geometry,
        });
        onGardenChanged({
          ...garden,
          features: garden.features.map((item) => item.id === existing.id ? response.feature : item),
        });
        setSelectedFeatureId(existing.id);
        setMessage(`${name} er opdateret.`);
      } else {
        const response = await api.createFeature(garden.id, {
          type: drawing.type,
          name,
          description: '',
          confidence: 'unknown',
          geometry,
        });
        onGardenChanged({ ...garden, features: [...garden.features, response.feature] });
        setSelectedFeatureId(response.feature.id);
        setNewObjectName(FEATURE_TYPE_LABELS[drawing.type]);
        setMessage(`${name} er gemt.`);
      }
      setDrawing(null);
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Objektet kunne ikke gemmes.');
    } finally {
      setBusy(false);
    }
  }

  function cancelDrawing() {
    if (busy) return;
    const previousFeatureId = drawing?.featureId ?? '';
    setDrawing(null);
    setSelectedFeatureId(previousFeatureId);
    setMessage('Redigeringen blev annulleret.');
  }

  function undoLastVertex() {
    if (!drawing || drawing.vertices.length === 0) return;
    const lastVertex = drawing.vertices[drawing.vertices.length - 1];
    void removeVertex(lastVertex.id);
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
                  <label>Objekt<select value={featureType} onChange={(event) => changeFeatureType(event.target.value as FeatureType)}>{FEATURE_TYPES.map((type) => <option key={type} value={type}>{FEATURE_TYPE_LABELS[type]}</option>)}</select></label>
                  <label>Form<select value={drawingKind} onChange={(event) => setDrawingKind(event.target.value as DrawingKind)}><option value="Polygon">Område</option><option value="LineString">Linje</option><option value="Point">Punkt</option></select></label>
                  <label className="aerial-name-field">Navn<input required maxLength={120} value={newObjectName} onChange={(event) => setNewObjectName(event.target.value)} placeholder="Fx Det gamle æbletræ" /></label>
                  <button className="primary-button" type="button" onClick={startDrawing}>Tegn nyt</button>
                </div>

                <div className={`aerial-selection-card${selectedFeature ? ' selected' : ''}`} aria-live="polite">
                  {selectedFeature ? (
                    <>
                      <div>
                        <span>Valgt på kortet</span>
                        <strong>{selectedFeature.name}</strong>
                        <small>{FEATURE_TYPE_LABELS[selectedFeature.type]}</small>
                      </div>
                      <button className="secondary-button" type="button" onClick={editExisting}>Rediger</button>
                    </>
                  ) : (
                    <p>Tryk direkte på et eksisterende område, en linje eller et punkt på kortet for at vælge det.</p>
                  )}
                </div>
              </div>
            )}
            {drawing && (
              <div className="aerial-edit-workspace">
                <label className="aerial-edit-name">Navn<input required maxLength={120} value={drawing.name} onChange={(event) => setDrawing((current) => current ? { ...current, name: event.target.value } : current)} /></label>
                <div className="aerial-drawing-actions">
                  <strong>{drawing.featureId ? 'Redigerer eksisterende objekt' : 'Nyt objekt'} · {drawing.vertices.length} punkt{drawing.vertices.length === 1 ? '' : 'er'}</strong>
                  {!drawing.featureId && <button type="button" className="secondary-button" disabled={busy || drawing.vertices.length === 0} onClick={undoLastVertex}>Fortryd sidste</button>}
                  <button type="button" className="secondary-button" disabled={busy} onClick={cancelDrawing}>Annuller</button>
                  <button type="button" className="primary-button" disabled={busy} onClick={() => void finishDrawing()}>{busy ? 'Gemmer…' : drawing.featureId ? 'Gem ændringer' : 'Færdig'}</button>
                </div>
                {drawing.vertices.length > 0 && (
                  <div className="aerial-vertex-list" aria-label="Punkter i objektet">
                    {drawing.vertices.map((vertex) => (
                      <div key={vertex.id}><span>Punkt {vertex.label}</span><button type="button" disabled={busy} onClick={() => void removeVertex(vertex.id)}>Slet</button></div>
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
