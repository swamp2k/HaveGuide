import { useState } from 'react';
import { api, ApiError } from '../api';
import { DEFAULT_MAP_CENTER } from '../../shared/constants';
import type { Garden } from '../../shared/types';
import { platform } from '../platform';
import { StatusMessage } from './StatusMessage';

interface CreateGardenProps {
  onCreated: (garden: Garden) => void;
}

export function CreateGarden({ onCreated }: CreateGardenProps) {
  const [name, setName] = useState('Min have');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [center, setCenter] = useState(DEFAULT_MAP_CENTER);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState('');

  async function useLocation() {
    setLocating(true);
    setMessage('');
    try {
      const position = await platform.location.getCurrentPosition();
      setCenter({ lat: position.latitude, lng: position.longitude });
      setMessage('Placeringen er fundet. Du kan finjustere den på kortet bagefter.');
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Placeringen kunne ikke hentes.');
    } finally {
      setLocating(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const response = await api.createGarden({
        name,
        address,
        notes,
        centerLat: center.lat,
        centerLng: center.lng,
      });
      onCreated(response.garden);
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Haven kunne ikke oprettes.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page narrow-page">
      <section>
        <p className="eyebrow">Første skridt</p>
        <h1>Opret din have</h1>
        <p className="lead">Vi starter kun med navn og placering. Resten kan registreres lidt ad gangen.</p>
        {message && <StatusMessage>{message}</StatusMessage>}
        <form onSubmit={submit} className="form-stack">
          <label>
            Navn
            <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} />
          </label>
          <label>
            Adresse <span className="optional">(valgfrit)</span>
            <input value={address} onChange={(event) => setAddress(event.target.value)} maxLength={300} />
          </label>
          <label>
            Noter <span className="optional">(valgfrit)</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} maxLength={2000} />
          </label>
          <button type="button" className="secondary-button" onClick={useLocation} disabled={locating}>
            {locating ? 'Finder placering…' : 'Brug min placering'}
          </button>
          <div className="coordinate-row" aria-label="Valgt kortcentrum">
            <label>
              Breddegrad
              <input
                type="number"
                step="any"
                value={center.lat}
                onChange={(event) => setCenter((current) => ({ ...current, lat: Number(event.target.value) }))}
                required
              />
            </label>
            <label>
              Længdegrad
              <input
                type="number"
                step="any"
                value={center.lng}
                onChange={(event) => setCenter((current) => ({ ...current, lng: Number(event.target.value) }))}
                required
              />
            </label>
          </div>
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? 'Opretter…' : 'Opret have'}
          </button>
        </form>
      </section>
    </main>
  );
}
