import { useMemo, useRef, useState } from 'react';
import type { AreaProfile, GardenScene, PlantIdentification, PlantOrgan } from '../../shared/types';
import { isProfileComplete } from '../../shared/profile';
import { api } from '../api';
import { prepareGardenImage } from '../image-tools';
import type { ThemeId } from '../theme';
import { MAX_PANORAMA_PHOTOS } from '../panorama/stitch-panorama';
import { AnalysisSection } from './AnalysisSection';
import { PanoramaBuilder, type PanoramaOutcome } from './PanoramaBuilder';
import { PhotoModeChoice } from './PhotoModeChoice';
import { PlantCaptureDialog } from './PlantCaptureDialog';
import { PlantCardsSection } from './PlantCardsSection';
import { ProfileEditor } from './ProfileEditor';
import { ThemeSelector } from './ThemeSelector';
import { ChatIcon, EyeIcon, SparkIcon } from './icons';

interface Capabilities {
  plantIdentification: boolean;
  aiAnalysis: boolean;
  imageEditing: boolean;
  imageEditingReason: string;
}

export function SceneDetail({
  initialScene,
  capabilities,
  theme,
  onThemeChange,
  onBack,
  onDeleted,
}: {
  initialScene: GardenScene;
  capabilities: Capabilities;
  theme: ThemeId;
  onThemeChange: (theme: ThemeId) => void;
  onBack: () => void;
  onDeleted: () => void;
}) {
  const [scene, setScene] = useState(initialScene);
  const [busyAction, setBusyAction] = useState('');
  const [busyPlantId, setBusyPlantId] = useState('');
  const [error, setError] = useState('');
  const [question, setQuestion] = useState('');
  const [askOpen, setAskOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [pendingPhotos, setPendingPhotos] = useState<File[] | null>(null);
  const [stitching, setStitching] = useState<File[] | null>(null);
  const sceneFileRef = useRef<HTMLInputElement>(null);

  const sceneImages = useMemo(() => scene.images.filter((image) => image.kind === 'scene'), [scene.images]);
  const primaryImage = sceneImages[0] ?? null;
  const profileComplete = isProfileComplete(scene.profile);
  const busy = Boolean(busyAction);

  async function refresh() {
    const { scene: updated } = await api.getScene(scene.id);
    setScene(updated);
  }

  function mergeIdentification(identification: PlantIdentification) {
    setScene((current) => ({
      ...current,
      identifications: current.identifications.map((item) => (item.id === identification.id ? identification : item)),
    }));
  }

  async function saveProfile(profile: AreaProfile) {
    await api.saveProfile(scene.id, profile);
    setScene((current) => ({ ...current, profile }));
  }

  /** Uploads an image that has already been prepared (a finished panorama, say). */
  async function uploadPrepared(file: File) {
    setBusyAction('photo');
    setError('');
    try {
      const { scene: updated } = await api.uploadImage(scene.id, file, 'scene');
      setScene(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke gemme fotoet.');
    } finally {
      setBusyAction('');
    }
  }

  async function uploadScenePhotos(files: File[], layout: 'vertical' | 'each' = 'vertical') {
    if (files.length === 0) return;
    setBusyAction('photo');
    setError('');
    try {
      if (layout === 'each') {
        let latest = scene;
        for (const file of files) {
          const prepared = await prepareGardenImage([file]);
          latest = (await api.uploadImage(scene.id, prepared, 'scene')).scene;
        }
        setScene(latest);
      } else {
        const prepared = await prepareGardenImage(files);
        const { scene: updated } = await api.uploadImage(scene.id, prepared, 'scene');
        setScene(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke gemme fotoet.');
    } finally {
      setBusyAction('');
      if (sceneFileRef.current) sceneFileRef.current.value = '';
    }
  }

  function acceptPanorama(outcome: PanoramaOutcome) {
    setStitching(null);
    setPendingPhotos(null);
    if (outcome.kind === 'separate') {
      void uploadScenePhotos(outcome.files, 'each');
      return;
    }
    void uploadPrepared(outcome.file);
  }

  function pickPhotos(files: File[]) {
    if (files.length === 0) return;
    if (files.length === 1) {
      void uploadScenePhotos(files);
      return;
    }
    setPendingPhotos(files);
  }

  async function identifyPlant(file: File, organ: PlantOrgan): Promise<PlantIdentification> {
    const prepared = await prepareGardenImage([file]);
    const uploaded = await api.uploadImage(scene.id, prepared, 'plant');
    const { identification } = await api.identify(scene.id, uploaded.imageId, organ);
    if (!identification) throw new Error('Planten kunne ikke gemmes.');
    setScene((current) => ({ ...current, identifications: [identification, ...current.identifications] }));
    return identification;
  }

  async function patchPlant(
    id: string,
    patch: { nickname?: string; note?: string; includeInAnalysis?: boolean; selectedSuggestionIndex?: number },
  ) {
    setBusyPlantId(id);
    setError('');
    try {
      const { identification } = await api.updateIdentification(scene.id, id, patch);
      mergeIdentification(identification);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ændringen blev ikke gemt.');
    } finally {
      setBusyPlantId('');
    }
  }

  async function rescanPlant(id: string, file: File) {
    setBusyPlantId(id);
    setError('');
    try {
      const existing = scene.identifications.find((item) => item.id === id);
      const prepared = await prepareGardenImage([file]);
      const uploaded = await api.uploadImage(scene.id, prepared, 'plant');
      const { identification } = await api.rescanIdentification(
        scene.id,
        id,
        uploaded.imageId,
        existing?.organ ?? 'auto',
      );
      mergeIdentification(identification);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Planten kunne ikke scannes igen.');
      await refresh().catch(() => undefined);
    } finally {
      setBusyPlantId('');
    }
  }

  async function removePlant(id: string) {
    setBusyPlantId(id);
    setError('');
    try {
      await api.deleteIdentification(scene.id, id);
      setScene((current) => ({
        ...current,
        identifications: current.identifications.filter((item) => item.id !== id),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Planten kunne ikke fjernes.');
    } finally {
      setBusyPlantId('');
    }
  }

  async function analyze(mode: 'overview' | 'ideas' | 'problem') {
    if (!primaryImage) return;
    setBusyAction(mode);
    setError('');
    try {
      await api.analyze(scene.id, primaryImage.id, mode, mode === 'problem' ? question : '');
      await refresh();
      if (mode === 'problem') { setQuestion(''); setAskOpen(false); }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Det virkede ikke lige nu.');
    } finally {
      setBusyAction('');
    }
  }

  async function remove() {
    if (!window.confirm(`Slet "${scene.title}" med fotos og svar?`)) return;
    setBusyAction('delete');
    setError('');
    try {
      await api.deleteScene(scene.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Området kunne ikke slettes.');
      setBusyAction('');
    }
  }

  return (
    <main className="app-page detail-page">
      <header className="topbar detail-topbar">
        <button className="back-button" onClick={onBack}>← Have</button>
        <div className="topbar-actions">
          <ThemeSelector theme={theme} onChange={onThemeChange} />
          <button className="danger-quiet compact" onClick={remove} disabled={busy}>
            {busyAction === 'delete' ? 'Sletter…' : 'Slet'}
          </button>
        </div>
      </header>

      <section className="scene-stage">
        {primaryImage ? (
          <img src={primaryImage.url} alt={scene.title} />
        ) : (
          <div className="scene-stage-empty"><span>Intet foto endnu</span></div>
        )}
        <div className="scene-stage-overlay">
          <h1>{scene.title}</h1>
          <label className="ghost-button file-button">
            <input
              ref={sceneFileRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => {
                pickPhotos(Array.from(event.target.files ?? []).slice(0, MAX_PANORAMA_PHOTOS));
                event.target.value = '';
              }}
            />
            {busyAction === 'photo' ? 'Arbejder…' : primaryImage ? 'Nyt foto' : 'Tilføj foto'}
          </label>
        </div>
      </section>

      {scene.notes && <p className="scene-notes">{scene.notes}</p>}
      {error && <p className="error-box wide-error">{error}</p>}

      <ProfileEditor profile={scene.profile} onSave={saveProfile} />

      <PlantCardsSection
        identifications={scene.identifications}
        busyId={busyPlantId}
        canIdentify={capabilities.plantIdentification && !busy}
        onAdd={() => setCaptureOpen(true)}
        handlers={{ onPatch: patchPlant, onRescan: rescanPlant, onRemove: removePlant }}
      />

      <section className="panel tools-panel">
        <div className="section-heading"><h2>Spørg haven</h2></div>
        <div className="tool-grid">
          <button
            className="tool-card"
            onClick={() => analyze('overview')}
            disabled={!primaryImage || !capabilities.aiAnalysis || busy}
          >
            <span className="tool-icon"><EyeIcon /></span>
            <strong>Se på området</strong>
            <small>{busyAction === 'overview' ? 'Kigger…' : 'Se hvad der vokser og trives her.'}</small>
          </button>
          <button
            className="tool-card"
            onClick={() => analyze('ideas')}
            disabled={!primaryImage || !profileComplete || !capabilities.aiAnalysis || busy}
          >
            <span className="tool-icon"><SparkIcon /></span>
            <strong>Få idéer</strong>
            <small>
              {busyAction === 'ideas'
                ? 'Tænker…'
                : profileComplete
                  ? 'Få idéer til netop dette sted.'
                  : 'Vælg sol, fugt, jord og dræn først.'}
            </small>
          </button>
          <button
            className="tool-card"
            onClick={() => setAskOpen((value) => !value)}
            disabled={!primaryImage || !capabilities.aiAnalysis || busy}
          >
            <span className="tool-icon"><ChatIcon /></span>
            <strong>Spørg om noget</strong>
            <small>Skriv hvad du undrer dig over.</small>
          </button>
        </div>

        {askOpen && (
          <div className="ask-box">
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={3}
              placeholder="Fx hvorfor mistrives planterne i højre side?"
              autoFocus
            />
            <button
              className="primary"
              disabled={!primaryImage || !question.trim() || busy}
              onClick={() => analyze('problem')}
            >
              {busyAction === 'problem' ? 'Tænker…' : 'Spørg'}
            </button>
          </div>
        )}

        {!capabilities.imageEditing && (
          <p className="tools-footnote">Ændring af selve fotoet kommer senere.</p>
        )}
      </section>

      <AnalysisSection analyses={scene.analyses} />

      {scene.analyses.length === 0 && (
        <div className="empty-results">
          <strong>Ingen svar endnu</strong>
          <span>Start med “Se på området”.</span>
        </div>
      )}

      {pendingPhotos && !stitching && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setPendingPhotos(null)}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-label="Vælg billedtype">
            <button className="icon-button modal-close" onClick={() => setPendingPhotos(null)} aria-label="Luk">×</button>
            <PhotoModeChoice
              count={pendingPhotos.length}
              onPanorama={() => setStitching(pendingPhotos)}
              onVertical={() => {
                const files = pendingPhotos;
                setPendingPhotos(null);
                void uploadScenePhotos(files);
              }}
            />
          </section>
        </div>
      )}

      {stitching && (
        <PanoramaBuilder
          files={stitching}
          onDone={acceptPanorama}
          onRetake={() => { setStitching(null); setPendingPhotos(null); }}
          onCancel={() => { setStitching(null); setPendingPhotos(null); }}
        />
      )}

      {captureOpen && (
        <PlantCaptureDialog
          onClose={() => setCaptureOpen(false)}
          onIdentify={identifyPlant}
          onSaveLabels={(id, patch) => patchPlant(id, patch)}
        />
      )}
    </main>
  );
}
