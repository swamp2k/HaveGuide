import { useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api';
import { derivePasswordProof, newPasswordChallenge } from '../auth/password';

export function AuthScreen({ setupRequired, onAuthenticated }: { setupRequired: boolean; onAuthenticated: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (setupRequired) {
        const challenge = newPasswordChallenge();
        const proof = await derivePasswordProof(password, challenge);
        await api.setup({ username, proof, ...challenge });
      } else {
        const { challenge } = await api.challenge(username);
        const proof = await derivePasswordProof(password, challenge);
        await api.login({ username, proof });
      }
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login fejlede.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand-mark">HG</div>
        <p className="eyebrow">HaveGuide</p>
        <h1>{setupRequired ? 'Opret første bruger' : 'Velkommen tilbage'}</h1>
        <p className="muted">Foto først. Havehjælp bagefter.</p>
        <form onSubmit={submit} className="stack">
          <label>
            <span>Brugernavn</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
          </label>
          <label>
            <span>Adgangskode</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={setupRequired ? 'new-password' : 'current-password'} minLength={8} required />
          </label>
          {error && <p className="error-box">{error}</p>}
          <button className="primary" disabled={busy}>{busy ? 'Arbejder…' : setupRequired ? 'Opret og fortsæt' : 'Log ind'}</button>
        </form>
      </section>
    </main>
  );
}
