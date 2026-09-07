import { useEffect, useState } from 'react';
import type { GardenScene, SceneSummary } from '../shared/types';
import { api } from './api';
import { AuthScreen } from './components/AuthScreen';
import { NewSceneDialog } from './components/NewSceneDialog';
import { SceneDetail } from './components/SceneDetail';

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
  const [bootstrap, setBootstrap] = useState<BootstrapState>({ loading: true, setupRequired: false, authenticated: false, username: '' });
  const [scenes, setScenes] = useState<SceneSummary[]>([]);
  const [selected, setSelected] = useState<GardenScene | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [capabilities, setCapabilities] = useState<Capabilities>(EMPTY_CAPABILITIES);
  const [loadingScenes, setLoadingScenes] = useState(false);
  const [error, setError] = useState('');

  async function loadBootstrap() {
    try {
      const result = await api.bootstrap();
      setBootstrap({ loading: false, setupRequired: result.setupRequired, authenticated: result.authenticated, username: result.user?.username ?? '' });
      if (result.authenticated) await loadHome();
    } catch (err) {
      setBootstrap((current) => ({ ...current, loading: false }));
      setError(err instanceof Error ? err.message : 'Kunne ikke starte HaveGuide.');
    }
  }

  async function loadHome() {
    setLoadingScenes(true);
    setError('');
    try {
      const [sceneResult, capabilityResult] = await Promise.all([api.listScenes(), api.capabilities()]);
      setScenes(sceneResult.scenes);
      setCapabilities(capabilityResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke hente områderne.');
    } finally {
      setLoadingScenes(false);
    }
  }

  useEffect(() => { void loadBootstrap(); }, []);

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

  if (bootstrap.loading) return <main className="loading-page"><div className="brand-mark">HG</div><span>Starter HaveGuide…</span></main>;
  if (!bootstrap.authenticated) return <AuthScreen setupRequired={bootstrap.setupRequired} onAuthenticated={() => void loadBootstrap()} />;

  if (selected) {
    return <SceneDetail initialScene={selected} capabilities={capabilities} onBack={() => { setSelected(null); void loadHome(); }} onDeleted={() => { setSelected(null); void loadHome(); }} />;
  }

  return (
    <main className="app-page home-page">
      <header className="topbar">
        <div className="brand-inline"><span className="brand-mark small">HG</span><div><strong>HaveGuide</strong><small>Foto først</small></div></div>
        <div className="topbar-actions"><span className="user-name">{bootstrap.username}</span><button className="secondary compact" onClick={logout}>Log ud</button></div>
      </header>

      <section className="home-hero">
        <div>
          <p className="eyebrow">Din have i billeder</p>
          <h1>Ét område.<br />Ét foto. <em>Gode beslutninger.</em></h1>
          <p>Ingen kort, GPS-felter eller kompliceret opmåling. Tag et billede af det sted, du vil arbejde med, og byg viden op omkring netop dét foto.</p>
        </div>
        <button className="primary hero-button" onClick={() => setNewOpen(true)}>＋ Nyt område</button>
      </section>

      <section className="workflow-strip">
        <span><b>1</b> Foto</span><i>→</i><span><b>2</b> Forhold</span><i>→</i><span><b>3</b> Analyse & forslag</span>
      </section>

      {error && <p className="error-box wide-error">{error}</p>}

      <section className="scene-section">
        <div className="section-heading"><div><p className="eyebrow">Områder</p><h2>Dine fotos</h2></div><button className="secondary" onClick={() => setNewOpen(true)}>Nyt område</button></div>
        {loadingScenes ? <div className="empty-results"><span>Henter områder…</span></div> : scenes.length === 0 ? (
          <button className="empty-scene" onClick={() => setNewOpen(true)}><span className="empty-plus">＋</span><strong>Opret dit første område</strong><span>Et navn og et foto er nok til at starte.</span></button>
        ) : (
          <div className="scene-grid">
            {scenes.map((scene) => (
              <button className="scene-card" key={scene.id} onClick={() => void openScene(scene.id)}>
                <div className="scene-thumb">{scene.image ? <img src={scene.image.url} alt="" /> : <span>Intet foto</span>}</div>
                <div className="scene-card-body"><div><h3>{scene.title}</h3><p>{scene.notes || 'Ingen noter endnu'}</p></div><span className={`status-pill ${scene.profileComplete ? 'complete' : ''}`}>{scene.profileComplete ? 'Klar til forslag' : 'Tilføj forhold'}</span></div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="provider-note">
        <div><strong>PlantNet</strong><span>{capabilities.plantIdentification ? 'Klar til nærbilleder af planter' : 'API-nøgle mangler'}</span></div>
        <div><strong>AI-analyse</strong><span>{capabilities.aiAnalysis ? 'Klar til oversigtsfoto og forslag' : 'Anthropic API-nøgle mangler'}</span></div>
        <div><strong>Billedredigering</strong><span>Ikke koblet på endnu</span></div>
      </section>

      {newOpen && <NewSceneDialog onClose={() => setNewOpen(false)} onCreated={(scene) => { setNewOpen(false); setSelected(scene); }} />}
    </main>
  );
}
