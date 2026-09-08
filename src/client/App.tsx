import { useCallback, useEffect, useState } from 'react';
import type { GardenScene, SceneSummary } from '../shared/types';
import { api } from './api';
import { applyTheme, readStoredTheme, storeTheme, type ThemeId } from './theme';
import { AuthScreen } from './components/AuthScreen';
import { NewSceneDialog } from './components/NewSceneDialog';
import { SceneDetail } from './components/SceneDetail';
import { ThemeSelector } from './components/ThemeSelector';
import { LeafIcon, PlusIcon } from './components/icons';

interface BootstrapState {
  loading: boolean;
  setupRequired: boolean;
  authenticated: boolean;
  username: string;
}

interface Capabilities {
  plantIdentification: boolean;
  aiAnalysis: boolean;
  imageEditing: boolean;
  imageEditingReason: string;
}

const EMPTY_CAPABILITIES: Capabilities = {
  plantIdentification: false,
  aiAnalysis: false,
  imageEditing: false,
  imageEditingReason: '',
};

export default function App() {
  const [bootstrap, setBootstrap] = useState<BootstrapState>({
    loading: true,
    setupRequired: false,
    authenticated: false,
    username: '',
  });
  const [scenes, setScenes] = useState<SceneSummary[]>([]);
  const [selected, setSelected] = useState<GardenScene | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [capabilities, setCapabilities] = useState<Capabilities>(EMPTY_CAPABILITIES);
  const [loadingScenes, setLoadingScenes] = useState(false);
  const [theme, setTheme] = useState<ThemeId>(() => readStoredTheme());
  const [error, setError] = useState('');

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const changeTheme = useCallback((next: ThemeId) => {
    setTheme(next);
    storeTheme(next);
  }, []);

  const loadHome = useCallback(async () => {
    setLoadingScenes(true);
    setError('');
    try {
      const [sceneResult, capabilityResult] = await Promise.all([api.listScenes(), api.capabilities()]);
      setScenes(sceneResult.scenes);
      setCapabilities(capabilityResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke hente haven.');
    } finally {
      setLoadingScenes(false);
    }
  }, []);

  const loadBootstrap = useCallback(async () => {
    try {
      const result = await api.bootstrap();
      setBootstrap({
        loading: false,
        setupRequired: result.setupRequired,
        authenticated: result.authenticated,
        username: result.user?.username ?? '',
      });
      if (result.authenticated) await loadHome();
    } catch (err) {
      setBootstrap((current) => ({ ...current, loading: false }));
      setError(err instanceof Error ? err.message : 'Kunne ikke starte HaveGuide.');
    }
  }, [loadHome]);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  async function openScene(id: string) {
    setError('');
    try {
      const { scene } = await api.getScene(id);
      setSelected(scene);
      window.scrollTo({ top: 0, behavior: 'instant' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke åbne området.');
    }
  }

  async function logout() {
    await api.logout().catch(() => undefined);
    setScenes([]);
    setSelected(null);
    setBootstrap({ loading: false, setupRequired: false, authenticated: false, username: '' });
  }

  if (bootstrap.loading) {
    return (
      <main className="loading-page">
        <div className="brand-mark"><LeafIcon size={26} /></div>
        <span>Åbner haven…</span>
      </main>
    );
  }

  if (!bootstrap.authenticated) {
    return <AuthScreen setupRequired={bootstrap.setupRequired} onAuthenticated={() => void loadBootstrap()} />;
  }

  if (selected) {
    return (
      <SceneDetail
        initialScene={selected}
        capabilities={capabilities}
        theme={theme}
        onThemeChange={changeTheme}
        onBack={() => {
          setSelected(null);
          void loadHome();
        }}
        onDeleted={() => {
          setSelected(null);
          void loadHome();
        }}
      />
    );
  }

  return (
    <main className="app-page home-page">
      <header className="topbar">
        <div className="brand-inline">
          <span className="brand-mark small"><LeafIcon size={20} /></span>
          <strong>HaveGuide</strong>
        </div>
        <div className="topbar-actions">
          <ThemeSelector theme={theme} onChange={changeTheme} />
          <button className="secondary compact" onClick={logout}>Log ud</button>
        </div>
      </header>

      <section className="home-hero">
        <h1>Hvad skal vi kigge på i haven?</h1>
        <button className="primary hero-button" onClick={() => setNewOpen(true)}>
          <PlusIcon size={18} /> Nyt område
        </button>
      </section>

      {error && <p className="error-box wide-error">{error}</p>}

      {loadingScenes ? (
        <div className="empty-results"><span>Henter haven…</span></div>
      ) : scenes.length === 0 ? (
        <button className="empty-scene" onClick={() => setNewOpen(true)}>
          <span className="empty-plus"><PlusIcon size={22} /></span>
          <strong>Opret dit første område</strong>
          <span>Et navn og et foto er nok.</span>
        </button>
      ) : (
        <div className="scene-grid">
          {scenes.map((scene) => (
            <button className="scene-card" key={scene.id} onClick={() => void openScene(scene.id)}>
              <div className="scene-thumb">
                {scene.image ? <img src={scene.image.url} alt="" loading="lazy" /> : <LeafIcon size={26} />}
              </div>
              <div className="scene-card-body">
                <h3>{scene.title}</h3>
                <span className={`status-pill ${scene.profileComplete ? 'complete' : ''}`}>
                  {scene.profileComplete ? 'Klar til idéer' : 'Tilføj forhold'}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      <footer className="home-footer">
        <span>Planteopslag med PlantNet</span>
        {!capabilities.aiAnalysis && <span>AI-svar er ikke klar</span>}
      </footer>

      {newOpen && (
        <NewSceneDialog
          onClose={() => setNewOpen(false)}
          onCreated={(scene) => {
            setNewOpen(false);
            setSelected(scene);
          }}
        />
      )}
    </main>
  );
}
