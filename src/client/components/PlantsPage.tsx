import { useCallback, useEffect, useRef, useState } from 'react';
import type { GardenDetail, GardenPlant } from '../../shared/types';
import { api } from '../api';
import { StatusMessage } from './StatusMessage';
import './PlantsPage.css';

interface Props { garden: GardenDetail; initialCapture: boolean; onDirtyChange: (dirty: boolean) => void; }
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Der opstod en fejl. Prøv igen.';

async function preparePhoto(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Billedet kunne ikke åbnes.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Billedet kunne ikke klargøres.')), 'image/jpeg', .86));
    return new File([blob], 'plante.jpg', { type: 'image/jpeg' });
  } finally { bitmap.close(); }
}

export function PlantsPage({ garden, initialCapture, onDirtyChange }: Props) {
  const [plants, setPlants] = useState<GardenPlant[]>([]);
  const [ready, setReady] = useState(false);
  const [canIdentify, setCanIdentify] = useState(false);
  const [capture, setCapture] = useState(initialCapture);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [featureId, setFeatureId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  // Keep completed steps when upload/link fails so retry does not create another plant.
  const progress = useRef<{ plantId?: string; mediaId?: string; linked?: boolean }>({});
  const lock = useRef(false);
  const locationRequest = useRef(0);
  useEffect(() => () => { locationRequest.current++; }, []);
  const [started, setStarted] = useState(false);
  const [position, setPosition] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    const response = await api.getUnderstanding(garden.id);
    setPlants(response.understanding.plants);
    setCanIdentify(response.understanding.plantIdentificationAvailable);
    setReady(true);
  }, [garden.id]);
  useEffect(() => { void load().catch((error: unknown) => setMessage(errorText(error))); }, [load]);
  const dirty = capture && Boolean(file || name || notes || featureId || position || started);
  useEffect(() => {
    onDirtyChange(dirty || busy);
    const preventClose = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    if (dirty || busy) window.addEventListener('beforeunload', preventClose);
    return () => { window.removeEventListener('beforeunload', preventClose); onDirtyChange(false); };
  }, [dirty, busy, onDirtyChange]);
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function choosePhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0]; event.target.value = '';
    if (!next || lock.current) return;
    lock.current = true; setBusy(true); setMessage('');
    try { setFile(await preparePhoto(next)); locationRequest.current++; setLocationBusy(false); setPosition(null); }
    catch { setMessage('Billedet kunne ikke åbnes. Prøv et nyt foto eller et JPG-billede.'); }
    finally { lock.current = false; setBusy(false); }
  }
  function locate() {
    if (!navigator.geolocation) { setMessage('Placering er ikke tilgængelig. Vælg eventuelt et område nedenfor.'); return; }
    const request = ++locationRequest.current;
    setLocationBusy(true);
    navigator.geolocation.getCurrentPosition((result) => {
      if (request !== locationRequest.current) return;
      setPosition({ latitude: result.coords.latitude, longitude: result.coords.longitude, accuracy: result.coords.accuracy }); setLocationBusy(false);
    }, () => { if (request !== locationRequest.current) return; setMessage('Placeringen kunne ikke hentes. Du kan stadig gemme planten.'); setLocationBusy(false); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 });
  }
  function reset() {
    locationRequest.current++; setLocationBusy(false);
    setCapture(false); setFile(null); setName(''); setNotes(''); setFeatureId(''); setPosition(null); progress.current = {}; setStarted(false);
  }
  async function closeCapture() {
    if (dirty && !window.confirm('Luk registreringen? En eventuelt allerede oprettet plante bliver i haven.')) return;
    const partiallySaved = Boolean(progress.current.plantId);
    reset();
    if (partiallySaved) await load().catch((error: unknown) => setMessage(errorText(error)));
  }
  async function save(identify: boolean) {
    if (lock.current || locationBusy || (!file && !name.trim())) return;
    lock.current = true; setBusy(true); setMessage(''); setStarted(true);
    let savedId: string | undefined;
    try {
      if (!progress.current.plantId) {
        const response = await api.createPlant(garden.id, {
          commonName: name.trim() || 'Ukendt plante', scientificName: '', identificationStatus: 'unidentified', confidence: 'unknown', notes,
          ...(featureId ? { featureId } : {}),
          ...(position ? { latitude: position.latitude, longitude: position.longitude } : {}),
        });
        progress.current.plantId = response.plant.id;
      }
      const plantId = progress.current.plantId;
      if (file && !progress.current.mediaId) {
        const form = new FormData(); form.set('gardenId', garden.id); form.set('file', file); form.set('note', notes);
        if (featureId) form.set('featureId', featureId);
        const uploaded = await api.uploadMedia(form); progress.current.mediaId = uploaded.media.id;
      }
      if (progress.current.mediaId && !progress.current.linked) {
        await api.linkPlantMedia(garden.id, plantId, { mediaId: progress.current.mediaId, organ: 'auto' }); progress.current.linked = true;
      }
      savedId = plantId;
      reset(); setSelected(plantId);
      if (identify) {
        try { await api.identifyPlant(garden.id, plantId); }
        catch (error) { setMessage(`Planten og billedet er gemt. Genkendelsen lykkedes ikke: ${errorText(error)}`); }
      }
    } catch (error) { if (!progress.current.plantId) setStarted(false); setMessage(`${errorText(error)} Dine valg er her stadig. Tryk på gem igen for at fortsætte.`); }
    finally {
      if (savedId) await load().catch(() => setMessage('Planten er gemt, men listen kunne ikke opdateres. Tryk på Hent igen.'));
      lock.current = false; setBusy(false);
    }
  }
  async function identifyPlant(plant: GardenPlant) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage('');
    try { await api.identifyPlant(garden.id, plant.id); await load(); }
    catch (error) { setMessage(errorText(error)); }
    finally { lock.current = false; setBusy(false); }
  }
  async function accept(id: string) {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try { await api.decideSuggestion(garden.id, id, 'accept'); await load(); }
    catch (error) { setMessage(errorText(error)); }
    finally { lock.current = false; setBusy(false); }
  }
  const active = plants.find((plant) => plant.id === selected);
  const visible = plants.filter((plant) => `${plant.commonName} ${plant.scientificName}`.toLocaleLowerCase('da').includes(search.toLocaleLowerCase('da')));
  return <main className="page simple-plants">
    <header className="page-heading"><div><p className="eyebrow">Din samling</p><h1>{capture ? 'Tilføj en plante' : 'Planter i haven'}</h1><p>Start med den, du er nysgerrig på. Navnet kan vi finde bagefter.</p></div>{!capture && <button className="primary-button" disabled={busy} onClick={() => { setCapture(true); setSelected(null); setMessage(''); }}>📷 Tilføj plante</button>}</header>
    {message && <StatusMessage kind="error">{message}</StatusMessage>}
    {!ready && !capture && <button className="secondary-button" onClick={() => void load().catch((error: unknown) => setMessage(errorText(error)))}>Hent igen</button>}
    {ready && !capture && message && <button className="text-button" onClick={() => void load().catch((error: unknown) => setMessage(errorText(error)))}>Hent igen</button>}
    {capture ? <section className="plant-capture-card">
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void choosePhoto(e)} />
      <input ref={gallery} type="file" accept="image/*" hidden onChange={(e) => void choosePhoto(e)} />
      {preview && <img className="capture-photo" src={preview} alt="Dit foto af planten" />}
      <div className="button-row"><button className="primary-button" disabled={busy || started} onClick={() => camera.current?.click()}>📷 {file ? 'Tag et andet foto' : 'Tag et foto'}</button><button className="secondary-button" disabled={busy || started} onClick={() => gallery.current?.click()}>Vælg fra galleri</button></div>
      <p className="field-help">Tag gerne hele planten og tydelige blade med.</p>
      <fieldset disabled={busy || started} className="capture-fields">
        <label>Navn, hvis du kender det<input maxLength={160} value={name} onChange={(e) => setName(e.target.value)} placeholder="Fx syren — eller lad feltet være tomt" /></label>
        <label>Hvor står den?<select value={featureId} onChange={(e) => setFeatureId(e.target.value)}><option value="">Vælg eventuelt et område</option>{garden.features.map((feature) => <option key={feature.id} value={feature.id}>{feature.name}</option>)}</select></label>
        <details><summary>Tilføj en note eller placering</summary><label>Note<textarea maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} /></label><button className="secondary-button" disabled={locationBusy} onClick={locate}>{locationBusy ? 'Henter placering…' : 'Brug hvor jeg står nu'}</button>{position && <p>Placering hentet, cirka ±{Math.round(position.accuracy)} m.</p>}<p className="field-help">Brug kun din placering, hvis du står ved planten.</p></details>
      </fieldset>
      <div className="capture-save-actions">
        {canIdentify && <button className="primary-button" disabled={busy || locationBusy || !file} onClick={() => void save(true)}>{busy ? 'Arbejder…' : 'Gem og find planten'}</button>}
        <button className={canIdentify ? 'secondary-button' : 'primary-button'} disabled={busy || locationBusy || (!file && !name.trim())} onClick={() => void save(false)}>{busy ? 'Arbejder…' : 'Gem plante'}</button>
        <button className="text-button" disabled={busy} onClick={() => void closeCapture()}>Luk</button>
      </div>
    </section> : <>
      {active && <section className="plant-capture-card" aria-label="Valgt plante"><button className="text-button" onClick={() => setSelected(null)}>← Alle planter</button><h2>{active.commonName || 'Ukendt plante'}</h2>{active.scientificName && <p><i>{active.scientificName}</i></p>}{active.media[0] && <img className="capture-photo" src={active.media[0].contentUrl} alt={active.commonName || 'Plante'} />}{active.notes && <p>{active.notes}</p>}
        {active.suggestions.filter((suggestion) => !suggestion.acceptedAt && !suggestion.rejectedAt).slice(0, 3).map((suggestion) => <div className="species-choice" key={suggestion.id}><div><strong>{suggestion.commonName || suggestion.scientificName}</strong><p>{suggestion.scientificName} · {Math.round(suggestion.score * 100)}% match</p></div><button className="secondary-button" disabled={busy} onClick={() => void accept(suggestion.id)}>Det er den</button></div>)}
        {canIdentify && <button className="primary-button" disabled={busy || !active.media.length} onClick={() => void identifyPlant(active)}>{busy ? 'Finder forslag…' : 'Find planten'}</button>}
      </section>}
      <label className="plant-search">Find i dine planter<input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Søg på navn" /></label>
      {ready && !visible.length && <div className="empty-state"><strong>{plants.length ? 'Ingen planter matcher' : 'Hvilken plante skal vi starte med?'}</strong><p>{plants.length ? 'Prøv et andet navn.' : 'Tag et foto. Du behøver ikke kende navnet.'}</p></div>}
      <div className="simple-plant-grid">{visible.map((plant) => <button className="simple-plant-card" key={plant.id} onClick={() => { setSelected(plant.id); window.scrollTo(0, 0); }}>
        {plant.media[0] ? <img src={plant.media[0].contentUrl} alt="" loading="lazy" decoding="async" /> : <span className="plant-placeholder" aria-hidden="true">🌿</span>}
        <strong>{plant.commonName || plant.scientificName || 'Ukendt plante'}</strong><span>{plant.identificationStatus === 'confirmed' ? 'Navn bekræftet' : 'Se plante og forslag'}</span>
      </button>)}</div>
    </>}
  </main>;
}
