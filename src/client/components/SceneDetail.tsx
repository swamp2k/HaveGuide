import { useMemo, useRef, useState } from 'react';
import type { AreaProfile, GardenScene } from '../../shared/types';
import { isProfileComplete } from '../../shared/profile';
import { api } from '../api';
import { prepareGardenImage } from '../image-tools';
import { ProfileEditor } from './ProfileEditor';

interface Capabilities {
  plantIdentification: boolean;
  aiAnalysis: boolean;
  imageEditing: boolean;
  imageEditingReason: string;
}

function AnalysisCard({ analysis }: { analysis: GardenScene['analyses'][number] }) {
  const modeLabel = { overview: 'Analyse', ideas: 'Forslag', problem: 'Problemhjælp' }[analysis.mode];
  return (
    <article className="result-card">
      <div className="result-meta"><span>{modeLabel}</span><time>{new Date(analysis.createdAt).toLocaleString('da-DK')}</time></div>
      <h3>{analysis.payload.summary}</h3>
      {analysis.payload.observations.length > 0 && <div><h4>Det jeg ser</h4><ul>{analysis.payload.observations.map((item) => <li key={item}>{item}</li>)}</ul></div>}
      {analysis.payload.recommendations.length > 0 && <div><h4>Forslag</h4><ul>{analysis.payload.recommendations.map((item) => <li key={item}>{item}</li>)}</ul></div>}
      {analysis.payload.cautions.length > 0 && <div><h4>Vær opmærksom på</h4><ul>{analysis.payload.cautions.map((item) => <li key={item}>{item}</li>)}</ul></div>}
      {analysis.payload.followUpQuestions.length > 0 && <div><h4>Hvis vi skal længere</h4><ul>{analysis.payload.followUpQuestions.map((item) => <li key={item}>{item}</li>)}</ul></div>}
    </article>
  );
}

export function SceneDetail({
  initialScene,
  capabilities,
  onBack,
  onDeleted,
}: {
  initialScene: GardenScene;
  capabilities: Capabilities;
  onBack: () => void;
  onDeleted: () => void;
}) {
  const [scene, setScene] = useState(initialScene);
  const [busyAction, setBusyAction] = useState('');
  const [error, setError] = useState('');
  const [question, setQuestion] = useState('');
  const [organ, setOrgan] = useState('auto');
  const sceneFileRef = useRef<HTMLInputElement>(null);
  const plantFileRef = useRef<HTMLInputElement>(null);

  const sceneImages = useMemo(() => scene.images.filter((image) => image.kind === 'scene'), [scene.images]);
  const primaryImage = sceneImages[0] ?? null;
  const profileComplete = isProfileComplete(scene.profile);

  async function refresh() {
    const { scene: updated } = await api.getScene(scene.id);
    setScene(updated);
  }

  async function saveProfile(profile: AreaProfile) {
    await api.saveProfile(scene.id, profile);
    setScene((current) => ({ ...current, profile }));
  }

  async function uploadScenePhotos(files: File[]) {
    if (files.length === 0) return;
    setBusyAction('photo');
    setError('');
    try {
      const prepared = await prepareGardenImage(files);
      const { scene: updated } = await api.uploadImage(scene.id, prepared, 'scene');
      setScene(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke uploade billedet.');
    } finally {
      setBusyAction('');
      if (sceneFileRef.current) sceneFileRef.current.value = '';
    }
  }

  async function identifyPlant(file: File | undefined) {
    if (!file) return;
    setBusyAction('identify');
    setError('');
    try {
      const prepared = await prepareGardenImage([file]);
      const uploaded = await api.uploadImage(scene.id, prepared, 'plant');
      await api.identify(scene.id, uploaded.imageId, organ);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Plantegenkendelsen fejlede.');
    } finally {
      setBusyAction('');
      if (plantFileRef.current) plantFileRef.current.value = '';
    }
  }

  async function analyze(mode: 'overview' | 'ideas' | 'problem') {
    if (!primaryImage) return;
    setBusyAction(mode);
    setError('');
    try {
      await api.analyze(scene.id, primaryImage.id, mode, mode === 'problem' ? question : '');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysen fejlede.');
    } finally {
      setBusyAction('');
    }
  }

  async function remove() {
    if (!window.confirm(`Slet "${scene.title}" og alle billeder/analyser knyttet til området?`)) return;
    setBusyAction('delete');
    setError('');
    try {
      await api.deleteScene(scene.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke slette området.');
      setBusyAction('');
    }
  }

  return (
    <main className="app-page detail-page">
      <header className="topbar detail-topbar">
        <button className="back-button" onClick={onBack}>← Områder</button>
        <div className="topbar-actions">
          <button className="danger-quiet" onClick={remove} disabled={Boolean(busyAction)}>{busyAction === 'delete' ? 'Sletter…' : 'Slet'}</button>
        </div>
      </header>

      <section className="detail-hero">
        <div>
          <p className="eyebrow">Haveområde</p>
          <h1>{scene.title}</h1>
          {scene.notes && <p className="muted">{scene.notes}</p>}
        </div>
        <label className="secondary file-button">
          <input ref={sceneFileRef} type="file" accept="image/*" multiple onChange={(event) => uploadScenePhotos(Array.from(event.target.files ?? []).slice(0, 6))} />
          {busyAction === 'photo' ? 'Behandler…' : primaryImage ? 'Nyt / stitch foto' : 'Tilføj / stitch foto'}
        </label>
      </section>

      {primaryImage ? (
        <section className="photo-stage">
          <img src={primaryImage.url} alt={`Oversigtsfoto af ${scene.title}`} />
          {sceneImages.length > 1 && <span className="photo-count">{sceneImages.length} oversigtsfotos</span>}
        </section>
      ) : (
        <section className="empty-photo"><strong>Intet oversigtsfoto endnu</strong><span>Tilføj ét billede eller flere, der skal stitches lodret.</span></section>
      )}

      {error && <p className="error-box wide-error">{error}</p>}

      <div className="detail-grid">
        <ProfileEditor profile={scene.profile} onSave={saveProfile} />

        <section className="panel action-panel">
          <div className="section-heading">
            <div><p className="eyebrow">Værktøjer</p><h2>Hvad skal vi gøre?</h2></div>
          </div>
          <div className="action-list">
            <button className="action-card" onClick={() => analyze('overview')} disabled={!primaryImage || !capabilities.aiAnalysis || Boolean(busyAction)}>
              <span className="action-icon">◎</span><span><strong>Analysér området</strong><small>Hvad ses på fotoet, hvad er usikkert, og hvad bør du lægge mærke til?</small></span><b>{busyAction === 'overview' ? '…' : '›'}</b>
            </button>
            <button className="action-card" onClick={() => analyze('ideas')} disabled={!primaryImage || !profileComplete || !capabilities.aiAnalysis || Boolean(busyAction)}>
              <span className="action-icon">✦</span><span><strong>Få forslag</strong><small>{profileComplete ? 'Konkrete ændringer og planter til netop forholdene.' : 'Angiv sol, fugt, jord og dræn først.'}</small></span><b>{busyAction === 'ideas' ? '…' : '›'}</b>
            </button>
            <label className={`action-card ${!capabilities.plantIdentification || Boolean(busyAction) ? 'disabled' : ''}`}>
              <input ref={plantFileRef} type="file" accept="image/*" capture="environment" disabled={!capabilities.plantIdentification || Boolean(busyAction)} onChange={(event) => identifyPlant(event.target.files?.[0])} />
              <span className="action-icon">⌕</span><span><strong>Genkend en plante</strong><small>Tag et nærfoto. PlantNet er langt bedre til nærbilleder end brede havefotos.</small></span><b>{busyAction === 'identify' ? '…' : '›'}</b>
            </label>
            <div className="organ-row">
              <span>På plantefotoet:</span>
              <select value={organ} onChange={(event) => setOrgan(event.target.value)}>
                <option value="auto">Auto</option><option value="flower">Blomst</option><option value="leaf">Blad</option><option value="fruit">Frugt</option><option value="bark">Bark</option><option value="habit">Hel plante</option>
              </select>
            </div>
            <button className="action-card" disabled title={capabilities.imageEditingReason}>
              <span className="action-icon">▧</span><span><strong>Visualisér ændring</strong><small>Kommer når vi kobler en rigtig billedmodel på. Anthropic kan analysere fotoet, men ikke redigere det.</small></span><span className="soon-badge">Senere</span>
            </button>
          </div>

          <div className="problem-box">
            <label><span>Har du et konkret problem?</span><textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={3} placeholder="Fx hvorfor mistrives planterne i højre side, eller hvad kan jeg gøre ved det bare område?" /></label>
            <button className="secondary" disabled={!primaryImage || !question.trim() || !capabilities.aiAnalysis || Boolean(busyAction)} onClick={() => analyze('problem')}>{busyAction === 'problem' ? 'Analyserer…' : 'Undersøg problemet'}</button>
          </div>
        </section>
      </div>

      <section className="results-section">
        <div className="section-heading"><div><p className="eyebrow">Historik</p><h2>Det vi har fundet</h2></div></div>
        {scene.identifications.length > 0 && (
          <div className="plant-results">
            {scene.identifications.map((identification) => (
              <article className="plant-result" key={identification.id}>
                <div><span className="result-label">PlantNet</span><time>{new Date(identification.createdAt).toLocaleString('da-DK')}</time></div>
                {identification.suggestions.length ? identification.suggestions.slice(0, 3).map((suggestion, index) => (
                  <p key={`${suggestion.scientificName}-${index}`}><strong>{index === 0 ? 'Bedste bud: ' : ''}{suggestion.commonName || suggestion.scientificName}</strong><span>{suggestion.scientificName} · {Math.round(suggestion.score * 100)}%</span></p>
                )) : <p>Ingen sikre forslag fundet.</p>}
              </article>
            ))}
          </div>
        )}
        <div className="analysis-results">
          {scene.analyses.map((analysis) => <AnalysisCard key={analysis.id} analysis={analysis} />)}
        </div>
        {scene.identifications.length === 0 && scene.analyses.length === 0 && <div className="empty-results"><strong>Ingen analyser endnu</strong><span>Start med “Analysér området” eller tag et nærfoto af en plante.</span></div>}
      </section>
    </main>
  );
}
