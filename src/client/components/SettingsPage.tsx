import { useEffect, useState } from 'react';
import type { GardenDetail, UserSummary } from '../../shared/types';
import { api, ApiError } from '../api';
import { StatusMessage } from './StatusMessage';

interface SettingsPageProps {
  user: UserSummary;
  garden: GardenDetail;
  onGardenChanged: (garden: GardenDetail) => void;
  onLogout: () => void;
}

export function SettingsPage({ user, garden, onGardenChanged, onLogout }: SettingsPageProps) {
  const [name, setName] = useState(garden.name);
  const [address, setAddress] = useState(garden.address);
  const [notes, setNotes] = useState(garden.notes);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setName(garden.name);
    setAddress(garden.address);
    setNotes(garden.notes);
  }, [garden.id, garden.name, garden.address, garden.notes]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const response = await api.updateGarden(garden.id, { name, address, notes });
      onGardenChanged({ ...garden, ...response.garden });
      setMessage('Havens oplysninger er gemt.');
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Oplysningerne kunne ikke gemmes.');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await api.logout();
      onLogout();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page narrow-page settings-page">
      <section>
        <p className="eyebrow">Have</p>
        <h1>Indstillinger</h1>
        {message && <StatusMessage>{message}</StatusMessage>}
        <form className="form-stack" onSubmit={save}>
          <label>Navn<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} /></label>
          <label>Adresse<input value={address} onChange={(event) => setAddress(event.target.value)} maxLength={300} /></label>
          <label>Noter<textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} /></label>
          <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Gemmer…' : 'Gem ændringer'}</button>
        </form>
      </section>
      <section className="settings-section">
        <h2>Bruger</h2>
        <p>Logget ind som <strong>{user.username}</strong>.</p>
        <button className="secondary-button" type="button" onClick={logout} disabled={busy}>Log ud</button>
      </section>
      <section className="settings-section">
        <h2>Om denne udgave</h2>
        <p>Have Guide Milestone 1. Kort, billeder og registrering gemmes privat i din egen installation.</p>
      </section>
    </main>
  );
}
