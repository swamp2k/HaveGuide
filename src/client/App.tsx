import { useCallback, useEffect, useState } from 'react';
import type { BootstrapResponse, Garden, GardenDetail } from '../shared/types';
import { api, ApiError } from './api';
import { AppShell } from './components/AppShell';
import { AuthScreen } from './components/AuthScreen';
import { CreateGarden } from './components/CreateGarden';
import { StatusMessage } from './components/StatusMessage';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { platform } from './platform';

export function App() {
  const [bootstrap, setBootstrap] = useState<BootstrapResponse | null>(null);
  const [gardens, setGardens] = useState<Garden[]>([]);
  const [garden, setGarden] = useState<GardenDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const online = useOnlineStatus();

  const loadGarden = useCallback(async (gardenId: string) => {
    const response = await api.getGarden(gardenId);
    setGarden(response.garden);
    platform.preferences.set('selectedGardenId', gardenId);
  }, []);

  const loadAuthenticatedApp = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const [bootstrapResponse, gardensResponse] = await Promise.all([api.bootstrap(), api.listGardens()]);
      setBootstrap(bootstrapResponse);
      setGardens(gardensResponse.gardens);
      if (gardensResponse.gardens.length > 0) {
        const preferred = platform.preferences.get('selectedGardenId');
        const selected = gardensResponse.gardens.find((candidate) => candidate.id === preferred) ?? gardensResponse.gardens[0];
        if (selected) await loadGarden(selected.id);
      } else {
        setGarden(null);
      }
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        setBootstrap((current) => ({ setupRequired: current?.setupRequired ?? false, authenticated: false, user: null }));
      } else {
        setMessage(caught instanceof ApiError ? caught.message : 'Appen kunne ikke startes.');
      }
    } finally {
      setLoading(false);
    }
  }, [loadGarden]);

  useEffect(() => {
    api
      .bootstrap()
      .then(async (response) => {
        setBootstrap(response);
        if (response.authenticated) await loadAuthenticatedApp();
      })
      .catch((caught: unknown) => setMessage(caught instanceof ApiError ? caught.message : 'Appen kunne ikke startes.'))
      .finally(() => setLoading(false));
  }, [loadAuthenticatedApp]);

  function onGardenCreated(created: Garden) {
    setGardens([created]);
    void loadGarden(created.id);
  }

  function onGardenChanged(updated: GardenDetail) {
    setGarden(updated);
    setGardens((current) => current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
  }

  if (loading && !bootstrap) {
    return <main className="center-state"><div className="spinner" /><p>Starter Have Guide…</p></main>;
  }

  if (message && !bootstrap) {
    return <main className="center-state"><StatusMessage kind="error">{message}</StatusMessage><button className="primary-button" type="button" onClick={() => window.location.reload()}>Prøv igen</button></main>;
  }

  if (bootstrap?.setupRequired) {
    return <AuthScreen mode="setup" onAuthenticated={loadAuthenticatedApp} />;
  }

  if (!bootstrap?.authenticated || !bootstrap.user) {
    return <AuthScreen mode="login" onAuthenticated={loadAuthenticatedApp} />;
  }

  if (gardens.length === 0) return <CreateGarden onCreated={onGardenCreated} />;

  if (!garden) {
    return <main className="center-state"><div className="spinner" /><p>Henter haven…</p></main>;
  }

  return (
    <>
      {!online && <div className="offline-banner" role="status">Du er offline. Kortdata og ændringer kræver forbindelse i denne udgave.</div>}
      <AppShell
        user={bootstrap.user}
        gardens={gardens}
        garden={garden}
        onSelectGarden={(gardenId) => void loadGarden(gardenId)}
        onGardenChanged={onGardenChanged}
        onLogout={() => {
          platform.preferences.remove('selectedGardenId');
          setBootstrap({ setupRequired: false, authenticated: false, user: null });
          setGardens([]);
          setGarden(null);
        }}
      />
    </>
  );
}
