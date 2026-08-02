import { useState } from 'react';
import { api, ApiError } from '../api';
import { StatusMessage } from './StatusMessage';

interface AuthScreenProps {
  mode: 'setup' | 'login';
  onAuthenticated: () => void;
}

export function AuthScreen({ mode, onAuthenticated }: AuthScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'setup') await api.setup({ username, password });
      else await api.login({ username, password });
      onAuthenticated();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Login mislykkedes.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="brand-mark" aria-hidden="true">🌱</div>
        <h1 id="auth-title">Have Guide</h1>
        <p className="lead">
          {mode === 'setup'
            ? 'Opret den første bruger. Herefter lukkes offentlig registrering.'
            : 'Log ind for at fortsætte med din have.'}
        </p>
        {error && <StatusMessage kind="error">{error}</StatusMessage>}
        <form onSubmit={submit} className="form-stack">
          <label>
            Brugernavn
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              minLength={3}
              maxLength={64}
              required
              autoFocus
            />
          </label>
          <label>
            Adgangskode
            <input
              type="password"
              autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={10}
              maxLength={256}
              required
            />
          </label>
          {mode === 'setup' && <p className="field-help">Brug mindst 10 tegn.</p>}
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? 'Arbejder…' : mode === 'setup' ? 'Opret bruger' : 'Log ind'}
          </button>
        </form>
      </section>
    </main>
  );
}
