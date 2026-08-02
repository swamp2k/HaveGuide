import { useEffect, useState } from 'react';
import type { GardenDetail, MediaItem } from '../../shared/types';
import { api, ApiError } from '../api';
import { platform } from '../platform';
import { StatusMessage } from './StatusMessage';

interface MediaPageProps {
  garden: GardenDetail;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function MediaPage({ garden }: MediaPageProps) {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [featureId, setFeatureId] = useState('');
  const [includePosition, setIncludePosition] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listMedia(garden.id)
      .then((response) => {
        if (!cancelled) setMedia(response.media);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setMessage(caught instanceof ApiError ? caught.message : 'Billederne kunne ikke hentes.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [garden.id]);

  async function upload(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setMessage('');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('gardenId', garden.id);
      form.append('note', note);
      if (featureId) form.append('featureId', featureId);
      if (includePosition) {
        try {
          const position = await platform.location.getCurrentPosition();
          form.append('latitude', String(position.latitude));
          form.append('longitude', String(position.longitude));
        } catch {
          // Position is optional; upload continues without it.
        }
      }
      const response = await api.uploadMedia(form);
      setMedia((current) => [response.media, ...current]);
      setFile(null);
      setNote('');
      setFeatureId('');
      setMessage('Billedet er gemt.');
      const input = document.querySelector<HTMLInputElement>('#media-file');
      if (input) input.value = '';
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Billedet kunne ikke gemmes.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: MediaItem) {
    if (!window.confirm(`Slet billedet “${item.originalFilename}”?`)) return;
    try {
      await api.deleteMedia(item.id);
      setMedia((current) => current.filter((candidate) => candidate.id !== item.id));
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Billedet kunne ikke slettes.');
    }
  }

  return (
    <main className="page media-page">
      <section>
        <p className="eyebrow">Dokumentér lidt ad gangen</p>
        <h1>Billeder</h1>
        <p className="lead">Knyt oversigtsbilleder og nærbilleder til haven eller et bestemt objekt.</p>
        {message && <StatusMessage>{message}</StatusMessage>}
        <form className="upload-panel form-stack" onSubmit={upload}>
          <label>
            Vælg eller tag et billede
            <input
              id="media-file"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              capture="environment"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              required
            />
          </label>
          <label>
            Knyt til <span className="optional">(valgfrit)</span>
            <select value={featureId} onChange={(event) => setFeatureId(event.target.value)}>
              <option value="">Hele haven</option>
              {garden.features.map((feature) => <option key={feature.id} value={feature.id}>{feature.name}</option>)}
            </select>
          </label>
          <label>
            Note <span className="optional">(valgfrit)</span>
            <textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} />
          </label>
          <label className="check-row">
            <input type="checkbox" checked={includePosition} onChange={(event) => setIncludePosition(event.target.checked)} />
            Gem telefonens placering, hvis den er tilgængelig
          </label>
          <button className="primary-button" type="submit" disabled={!file || busy}>
            {busy ? 'Gemmer billede…' : 'Gem billede'}
          </button>
        </form>
      </section>

      <section aria-labelledby="gallery-title">
        <h2 id="gallery-title">Gemte billeder</h2>
        {loading ? (
          <p>Henter billeder…</p>
        ) : media.length === 0 ? (
          <div className="empty-state"><strong>Ingen billeder endnu</strong><p>Start med et oversigtsbillede fra terrassen eller indgangen.</p></div>
        ) : (
          <div className="media-grid">
            {media.map((item) => (
              <article className="media-card" key={item.id}>
                <img src={item.contentUrl} alt={item.note || `Havebillede: ${item.originalFilename}`} loading="lazy" />
                <div className="media-card-body">
                  <strong>{item.note || item.originalFilename}</strong>
                  <span>{formatBytes(item.sizeBytes)} · {new Date(item.createdAt).toLocaleDateString('da-DK')}</span>
                  <button type="button" className="text-button danger-text" onClick={() => remove(item)}>Slet</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
