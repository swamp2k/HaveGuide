import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, type StyleSpecification } from 'maplibre-gl';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import {
  ASSESSMENT_CATEGORIES,
  ASSESSMENT_CATEGORY_LABELS,
  OBSERVATION_KINDS,
  OBSERVATION_KIND_LABELS,
  PLANT_ORGANS,
  PLANT_ORGAN_LABELS,
  WALK_STEPS,
} from '../../shared/constants';
import type {
  AssessmentCategory,
  GardenDetail,
  GardenPlant,
  GardenUnderstanding,
  MediaItem,
  ObservationKind,
  PlantOrgan,
} from '../../shared/types';
import { api, ApiError } from '../api';
import { StatusMessage } from './StatusMessage';
import './UnderstandingPage.css';

interface UnderstandingPageProps { garden: GardenDetail; }
type MapCategory = 'features' | 'plants' | 'photos' | 'problems';

const mapStyle: StyleSpecification = {
  version: 8,
  sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap-bidragsydere', maxzoom: 19 } },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

function markerFeature(id: string, coordinates: [number, number], category: MapCategory, label: string): Feature<Geometry> {
  return { type: 'Feature', id, geometry: { type: 'Point', coordinates }, properties: { category, label } };
}

function UnderstandingMap({ garden, understanding, media, filters }: { garden: GardenDetail; understanding: GardenUnderstanding; media: MediaItem[]; filters: Set<MapCategory>; }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const data = useMemo<FeatureCollection<Geometry>>(() => {
    const features: Feature<Geometry>[] = [];
    if (filters.has('features')) for (const item of garden.features) features.push({ type: 'Feature', id: item.id, geometry: item.geometry, properties: { category: 'features', label: item.name } });
    if (filters.has('plants')) for (const plant of understanding.plants) if (plant.latitude != null && plant.longitude != null) features.push(markerFeature(plant.id, [plant.longitude, plant.latitude], 'plants', plant.commonName || plant.scientificName || 'Ukendt plante'));
    if (filters.has('photos')) for (const item of media) if (item.latitude != null && item.longitude != null) features.push(markerFeature(item.id, [item.longitude, item.latitude], 'photos', item.note || item.originalFilename));
    if (filters.has('problems')) for (const item of understanding.observations) if (item.kind === 'problem' && item.latitude != null && item.longitude != null) features.push(markerFeature(item.id, [item.longitude, item.latitude], 'problems', item.title));
    return { type: 'FeatureCollection', features };
  }, [filters, garden.features, media, understanding.observations, understanding.plants]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({ container: containerRef.current, style: mapStyle, center: [garden.centerLng, garden.centerLat], zoom: 18, maxZoom: 22 });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => {
      map.addSource('understanding', { type: 'geojson', data });
      map.addLayer({ id: 'understanding-fill', type: 'fill', source: 'understanding', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#3f795b', 'fill-opacity': 0.2 } });
      map.addLayer({ id: 'understanding-line', type: 'line', source: 'understanding', filter: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]], paint: { 'line-color': '#28543d', 'line-width': 2 } });
      map.addLayer({ id: 'understanding-points', type: 'circle', source: 'understanding', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 8, 'circle-color': ['match', ['get', 'category'], 'plants', '#2f684c', 'photos', '#356fa1', 'problems', '#b44a3d', '#d69935'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } });
    });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [garden.centerLat, garden.centerLng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    (map.getSource('understanding') as GeoJSONSource | undefined)?.setData(data);
  }, [data]);

  return <div ref={containerRef} className="understanding-map" aria-label="Kort med registreringer" />;
}

function positionFromBrowser(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Placering understøttes ikke.')); return; }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => reject(new Error('Placeringen kunne ikke hentes.')),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  });
}

export function UnderstandingPage({ garden }: UnderstandingPageProps) {
  const [understanding, setUnderstanding] = useState<GardenUnderstanding | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [filters, setFilters] = useState<Set<MapCategory>>(new Set(['features', 'plants', 'photos', 'problems']));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [position, setPosition] = useState<{ latitude: number; longitude: number } | null>(null);
  const [observationKind, setObservationKind] = useState<ObservationKind>('problem');
  const [observationTitle, setObservationTitle] = useState('');
  const [observationNotes, setObservationNotes] = useState('');
  const [assessmentCategory, setAssessmentCategory] = useState<AssessmentCategory>('sun');
  const [assessmentValue, setAssessmentValue] = useState('');
  const [assessmentNotes, setAssessmentNotes] = useState('');
  const [plantName, setPlantName] = useState('');
  const [plantScientificName, setPlantScientificName] = useState('');
  const [plantNotes, setPlantNotes] = useState('');
  const [plantOrgan, setPlantOrgan] = useState<PlantOrgan>('auto');
  const [plantPhoto, setPlantPhoto] = useState<File | null>(null);

  const load = useCallback(async () => {
    setMessage('');
    try {
      const [understandingResponse, mediaResponse] = await Promise.all([api.getUnderstanding(garden.id), api.listMedia(garden.id)]);
      setUnderstanding(understandingResponse.understanding);
      setMedia(mediaResponse.media);
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Kortlægningen kunne ikke hentes.');
    }
  }, [garden.id]);
  useEffect(() => { void load(); }, [load]);

  async function withBusy(action: () => Promise<void>) {
    setBusy(true); setMessage('');
    try { await action(); await load(); }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : 'Handlingen mislykkedes.'); }
    finally { setBusy(false); }
  }

  async function useCurrentPosition() {
    try { setPosition(await positionFromBrowser()); setMessage('Placeringen er klar til næste registrering.'); }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : 'Placeringen kunne ikke hentes.'); }
  }

  async function startOrAdvanceWalk() {
    if (!understanding?.walk) { await withBusy(async () => { await api.startWalk(garden.id); }); return; }
    const last = understanding.walk.currentStep >= WALK_STEPS.length - 1;
    await withBusy(async () => { await api.updateWalk(garden.id, understanding.walk!.id, last ? { status: 'completed', currentStep: WALK_STEPS.length - 1 } : { currentStep: understanding.walk!.currentStep + 1 }); });
  }

  async function submitObservation(event: React.FormEvent) {
    event.preventDefault();
    await withBusy(async () => { await api.createObservation(garden.id, { kind: observationKind, title: observationTitle, notes: observationNotes, ...(position ?? {}), environment: {} }); setObservationTitle(''); setObservationNotes(''); setPosition(null); });
  }

  async function submitAssessment(event: React.FormEvent) {
    event.preventDefault();
    await withBusy(async () => { await api.createAssessment(garden.id, { category: assessmentCategory, value: assessmentValue, notes: assessmentNotes, geometry: null }); setAssessmentValue(''); setAssessmentNotes(''); });
  }

  async function submitPlant(event: React.FormEvent) {
    event.preventDefault();
    await withBusy(async () => {
      const response = await api.createPlant(garden.id, { commonName: plantName, scientificName: plantScientificName, identificationStatus: plantScientificName ? 'manual' : 'unidentified', confidence: plantScientificName ? 'likely' : 'unknown', notes: plantNotes, ...(position ?? {}) });
      if (plantPhoto) {
        const form = new FormData(); form.set('gardenId', garden.id); form.set('file', plantPhoto); form.set('note', `Billede af ${plantName || 'ukendt plante'}`);
        if (position) { form.set('latitude', String(position.latitude)); form.set('longitude', String(position.longitude)); }
        const uploaded = await api.uploadMedia(form);
        await api.linkPlantMedia(garden.id, response.plant.id, { mediaId: uploaded.media.id, organ: plantOrgan });
      }
      setPlantName(''); setPlantScientificName(''); setPlantNotes(''); setPlantPhoto(null); setPosition(null);
    });
  }

  async function attachPhoto(plant: GardenPlant, file: File) {
    await withBusy(async () => {
      const form = new FormData(); form.set('gardenId', garden.id); form.set('file', file); form.set('note', `Ekstra billede af ${plant.commonName || plant.scientificName || 'plante'}`);
      const uploaded = await api.uploadMedia(form);
      await api.linkPlantMedia(garden.id, plant.id, { mediaId: uploaded.media.id, organ: 'auto' });
    });
  }

  function toggleFilter(category: MapCategory) {
    setFilters((current) => { const next = new Set(current); if (next.has(category)) next.delete(category); else next.add(category); return next; });
  }

  if (!understanding) return <main className="page"><div className="spinner" /><p>Henter kortlægningen…</p>{message && <StatusMessage kind="error">{message}</StatusMessage>}</main>;
  const walkStep = understanding.walk ? WALK_STEPS[understanding.walk.currentStep] : null;

  return (
    <main className="page understanding-page">
      <header className="page-heading"><div><p className="eyebrow">Kortlægning</p><h1>Forstå din have</h1><p className="lead">Tag ét område ad gangen. Du kan altid rette det senere.</p></div><div className="completion-ring" aria-label={`${understanding.completeness.percent} procent kortlagt`}><strong>{understanding.completeness.percent}%</strong><span>kortlagt</span></div></header>
      {message && <StatusMessage kind={message.includes('klar') ? 'success' : 'error'}>{message}</StatusMessage>}

      <section className="understanding-card walk-card"><div className="card-heading"><div><p className="eyebrow">Guidet tur</p><h2>{understanding.walk?.status === 'completed' ? 'Havevandringen er gennemført' : walkStep?.title ?? 'Tag en tur gennem haven'}</h2></div><span aria-hidden="true">🚶</span></div><p>{understanding.walk?.status === 'completed' ? 'Du kan stadig tilføje planter og forhold nedenfor.' : walkStep?.description ?? 'Vi guider dig gennem seks korte stop og viser løbende, hvad der mangler.'}</p>{understanding.walk?.status === 'active' && <div className="walk-progress"><span style={{ width: `${((understanding.walk.currentStep + 1) / WALK_STEPS.length) * 100}%` }} /></div>}{understanding.walk?.status !== 'completed' && <button type="button" className="primary-button" disabled={busy} onClick={() => void startOrAdvanceWalk()}>{understanding.walk ? (understanding.walk.currentStep === WALK_STEPS.length - 1 ? 'Afslut havevandring' : 'Næste stop') : 'Start havevandring'}</button>}</section>

      <section className="understanding-card"><div className="card-heading"><div><p className="eyebrow">Overblik</p><h2>Registreringer på kortet</h2></div></div><div className="filter-chips" aria-label="Filtrér kort">{([['features', 'Havekort'], ['plants', 'Planter'], ['photos', 'Billeder'], ['problems', 'Problemer']] as const).map(([id, label]) => <button key={id} type="button" className={filters.has(id) ? 'active' : ''} onClick={() => toggleFilter(id)} aria-pressed={filters.has(id)}>{label}</button>)}</div><UnderstandingMap garden={garden} understanding={understanding} media={media} filters={filters} /></section>

      <section className="registration-grid">
        <details className="understanding-card" open={understanding.plants.length === 0}><summary><span>🌿</span><strong>Registrér en plante</strong></summary><form className="form-stack compact-form" onSubmit={(event) => void submitPlant(event)}><label>Navn, hvis du kender det<input value={plantName} onChange={(event) => setPlantName(event.target.value)} placeholder="Fx syren eller ukendt busk" /></label><label>Botanisk navn <span className="optional">valgfrit</span><input value={plantScientificName} onChange={(event) => setPlantScientificName(event.target.value)} /></label><label>Foto<input type="file" accept="image/*" capture="environment" onChange={(event) => setPlantPhoto(event.target.files?.[0] ?? null)} /></label><label>Hvad viser billedet?<select value={plantOrgan} onChange={(event) => setPlantOrgan(event.target.value as PlantOrgan)}>{PLANT_ORGANS.map((organ) => <option key={organ} value={organ}>{PLANT_ORGAN_LABELS[organ]}</option>)}</select></label><label>Noter<textarea rows={2} value={plantNotes} onChange={(event) => setPlantNotes(event.target.value)} /></label><button type="button" className="secondary-button" onClick={() => void useCurrentPosition()}>⌖ Brug min placering</button><button type="submit" className="primary-button" disabled={busy || (!plantName.trim() && !plantPhoto)}>Gem plante</button></form></details>
        <details className="understanding-card"><summary><span>📍</span><strong>Registrér observation</strong></summary><form className="form-stack compact-form" onSubmit={(event) => void submitObservation(event)}><label>Type<select value={observationKind} onChange={(event) => setObservationKind(event.target.value as ObservationKind)}>{OBSERVATION_KINDS.map((kind) => <option key={kind} value={kind}>{OBSERVATION_KIND_LABELS[kind]}</option>)}</select></label><label>Hvad ser du?<input required value={observationTitle} onChange={(event) => setObservationTitle(event.target.value)} placeholder="Fx meget vådt efter regn" /></label><label>Noter<textarea rows={2} value={observationNotes} onChange={(event) => setObservationNotes(event.target.value)} /></label><button type="button" className="secondary-button" onClick={() => void useCurrentPosition()}>⌖ Brug min placering</button><button type="submit" className="primary-button" disabled={busy}>Gem observation</button></form></details>
        <details className="understanding-card"><summary><span>☀️</span><strong>Registrér haveforhold</strong></summary><form className="form-stack compact-form" onSubmit={(event) => void submitAssessment(event)}><label>Område<select value={assessmentCategory} onChange={(event) => setAssessmentCategory(event.target.value as AssessmentCategory)}>{ASSESSMENT_CATEGORIES.map((category) => <option key={category} value={category}>{ASSESSMENT_CATEGORY_LABELS[category]}</option>)}</select></label><label>Beskrivelse<input required value={assessmentValue} onChange={(event) => setAssessmentValue(event.target.value)} placeholder="Fx sol fra middag til aften" /></label><label>Noter<textarea rows={2} value={assessmentNotes} onChange={(event) => setAssessmentNotes(event.target.value)} /></label><button type="submit" className="primary-button" disabled={busy}>Gem haveforhold</button></form></details>
      </section>

      <section className="understanding-card"><div className="card-heading"><div><p className="eyebrow">Planteinventar</p><h2>{understanding.plants.length} registrerede planter</h2></div></div>{understanding.plants.length === 0 ? <div className="empty-state"><strong>Ingen planter endnu</strong><p>Start med den plante, du er mest nysgerrig på.</p></div> : <div className="plant-list">{understanding.plants.map((plant) => <article className="plant-card" key={plant.id}><div className="plant-card-title"><div><strong>{plant.commonName || plant.scientificName || 'Ukendt plante'}</strong>{plant.scientificName && <em>{plant.scientificName}</em>}</div><span>{plant.media.length} foto</span></div>{plant.media.length > 0 && <div className="plant-photos">{plant.media.slice(0, 4).map((item) => <img key={item.mediaId} src={item.contentUrl} alt={item.originalFilename} />)}</div>}{plant.suggestions.filter((item) => !item.rejectedAt && !item.acceptedAt).slice(0, 3).map((suggestion) => <div className="suggestion-row" key={suggestion.id}><div><strong>{suggestion.commonName || suggestion.scientificName}</strong><span>{suggestion.scientificName} · {Math.round(suggestion.score * 100)}%</span></div><div><button type="button" className="primary-small" onClick={() => void withBusy(async () => { await api.decideSuggestion(garden.id, suggestion.id, 'accept'); })}>Brug</button><button type="button" className="text-button" onClick={() => void withBusy(async () => { await api.decideSuggestion(garden.id, suggestion.id, 'reject'); })}>Afvis</button></div></div>)}<div className="plant-actions"><label className="file-action">+ Ekstra foto<input type="file" accept="image/*" capture="environment" onChange={(event) => { const file = event.target.files?.[0]; if (file) void attachPhoto(plant, file); event.target.value = ''; }} /></label><button type="button" className="secondary-button" disabled={busy || !understanding.plantIdentificationAvailable || plant.media.length === 0} onClick={() => void withBusy(async () => { await api.identifyPlant(garden.id, plant.id); })}>Identificér</button><button type="button" className="text-button danger-text" onClick={() => void withBusy(async () => { await api.deletePlant(garden.id, plant.id); })}>Fjern</button></div>{!understanding.plantIdentificationAvailable && <p className="field-help">Plante-ID er klar, men kræver en Pl@ntNet API-nøgle.</p>}</article>)}</div>}</section>

      {understanding.duplicateCandidates.length > 0 && <section className="understanding-card"><p className="eyebrow">Mulige dubletter</p><h2>Er disse den samme plante?</h2>{understanding.duplicateCandidates.map((candidate) => <div className="duplicate-row" key={`${candidate.plantId}-${candidate.possibleDuplicateId}`}><span>{candidate.reason}</span><button type="button" className="secondary-button" onClick={() => void withBusy(async () => { await api.mergePlants(garden.id, candidate.plantId, candidate.possibleDuplicateId); })}>Saml billederne</button></div>)}</section>}
      <section className="understanding-card checklist-card"><p className="eyebrow">Det næste gode skridt</p><h2>Hvad mangler?</h2><ul>{understanding.completeness.missing.map((item) => <li key={item}>{item}</li>)}</ul>{understanding.completeness.missing.length === 0 && <StatusMessage kind="success">Haven er godt nok kortlagt til de første redesignforslag.</StatusMessage>}</section>
    </main>
  );
}
