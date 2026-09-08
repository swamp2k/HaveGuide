import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api';
import { prepareGardenImage } from '../image-tools';
import { MAX_PANORAMA_PHOTOS } from '../panorama/stitch-panorama';
import type { GardenScene } from '../../shared/types';
import { GuidedCamera } from './GuidedCamera';
import { PanoramaBuilder, type PanoramaOutcome } from './PanoramaBuilder';
import { PhotoModeChoice } from './PhotoModeChoice';

/**
 * How the chosen photos should become scene images.
 * `choose` is the deliberate pause where the user says whether a multi-photo selection is a
 * panorama or a vertical strip — we never guess.
 */
export type PhotoSelection =
  | { kind: 'none' }
  | { kind: 'choose'; files: File[] }
  | { kind: 'single'; files: File[] }
  | { kind: 'vertical'; files: File[] }
  | { kind: 'prepared'; file: File; label: string }
  | { kind: 'separate'; files: File[] };

export function selectionSummary(selection: PhotoSelection): string {
  switch (selection.kind) {
    case 'none':
      return 'Du kan også tilføje fotoet senere.';
    case 'choose':
      return `${selection.files.length} fotos valgt.`;
    case 'single':
      return '1 foto valgt.';
    case 'vertical':
      return `${selection.files.length} fotos samles lodret.`;
    case 'prepared':
      return selection.label;
    case 'separate':
      return `${selection.files.length} fotos gemmes hver for sig.`;
  }
}

export function NewSceneDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (scene: GardenScene) => void }) {
  const [title, setTitle] = useState('');
  const [selection, setSelection] = useState<PhotoSelection>({ kind: 'none' });
  const [stitching, setStitching] = useState<File[] | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const fallbackCameraRef = useRef<HTMLInputElement>(null);

  function choose(files: File[]) {
    if (files.length === 0) return setSelection({ kind: 'none' });
    if (files.length === 1) return setSelection({ kind: 'single', files });
    setSelection({ kind: 'choose', files });
  }

  function acceptPanorama(outcome: PanoramaOutcome) {
    setStitching(null);
    if (outcome.kind === 'separate') {
      setSelection({ kind: 'separate', files: outcome.files });
      return;
    }
    setSelection({
      kind: 'prepared',
      file: outcome.file,
      label: outcome.kind === 'stitched' ? 'Panorama klar.' : 'Billederne er samlet uden tilpasning.',
    });
  }

  async function uploadInto(sceneId: string): Promise<GardenScene | null> {
    if (selection.kind === 'none') return null;

    if (selection.kind === 'prepared') {
      setStatus('Gemmer foto…');
      return (await api.uploadImage(sceneId, selection.file, 'scene')).scene;
    }

    if (selection.kind === 'separate') {
      let latest: GardenScene | null = null;
      for (let index = 0; index < selection.files.length; index += 1) {
        setStatus(`Gemmer foto ${index + 1}/${selection.files.length}…`);
        const prepared = await prepareGardenImage([selection.files[index]]);
        latest = (await api.uploadImage(sceneId, prepared, 'scene')).scene;
      }
      return latest;
    }

    setStatus(selection.files.length > 1 ? 'Samler fotos…' : 'Gør fotoet klar…');
    const prepared = await prepareGardenImage(selection.files);
    setStatus('Gemmer foto…');
    return (await api.uploadImage(sceneId, prepared, 'scene')).scene;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (selection.kind === 'choose') {
      setError('Vælg hvordan fotoene skal bruges.');
      return;
    }
    setBusy(true);
    setError('');
    let createdSceneId: string | null = null;

    try {
      setStatus('Opretter…');
      const { scene } = await api.createScene(title);
      createdSceneId = scene.id;

      const withPhotos = await uploadInto(scene.id);
      onCreated(withPhotos ?? scene);
    } catch (err) {
      if (createdSceneId) {
        try { await api.deleteScene(createdSceneId); } catch { /* best-effort cleanup */ }
      }
      setError(err instanceof Error ? err.message : 'Kunne ikke oprette området.');
    } finally {
      setBusy(false);
      setStatus('');
    }
  }

  function useFallbackCamera() {
    setCameraOpen(false);
    fallbackCameraRef.current?.click();
  }

  return (
    <>
      <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
        <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="new-scene-title">
          <button className="icon-button modal-close" onClick={onClose} disabled={busy} aria-label="Luk">×</button>
          <h2 id="new-scene-title">Nyt område</h2>
          <p className="muted">Tag et foto af stedet, eller vælg et du har.</p>
          <form className="stack" onSubmit={submit}>
            <label>
              <span>Navn</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Fx skråningen" maxLength={120} required autoFocus />
            </label>

            <div className="photo-picker">
              <button type="button" className="secondary file-button" onClick={() => setCameraOpen(true)}>
                Tag foto
              </button>

              <input
                ref={fallbackCameraRef}
                className="hidden-file-input"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) => {
                  choose(Array.from(event.target.files ?? []).slice(0, 1));
                  event.target.value = '';
                }}
              />

              <label className="secondary file-button">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => {
                    choose(Array.from(event.target.files ?? []).slice(0, MAX_PANORAMA_PHOTOS));
                    event.target.value = '';
                  }}
                />
                Vælg foto(s)
              </label>
            </div>

            {selection.kind === 'choose' && (
              <PhotoModeChoice
                count={selection.files.length}
                onPanorama={() => setStitching(selection.files)}
                onVertical={() => setSelection({ kind: 'vertical', files: selection.files })}
              />
            )}

            <p className="picker-help">{selectionSummary(selection)}</p>

            {status && <p className="status-box">{status}</p>}
            {error && <p className="error-box">{error}</p>}

            <div className="button-row">
              <button type="button" className="secondary" onClick={onClose} disabled={busy}>Annuller</button>
              <button className="primary" disabled={busy || !title.trim()}>{busy ? 'Arbejder…' : 'Opret område'}</button>
            </div>
          </form>
        </section>
      </div>

      {cameraOpen && (
        <GuidedCamera
          onCancel={() => setCameraOpen(false)}
          onFallback={useFallbackCamera}
          onComplete={(capturedFiles, panorama) => {
            setCameraOpen(false);
            if (panorama && capturedFiles.length > 1) {
              setStitching(capturedFiles);
              return;
            }
            choose(capturedFiles);
          }}
        />
      )}

      {stitching && (
        <PanoramaBuilder
          files={stitching}
          onDone={acceptPanorama}
          onRetake={() => {
            setStitching(null);
            setSelection({ kind: 'none' });
            setCameraOpen(true);
          }}
          onCancel={() => {
            setStitching(null);
            setSelection({ kind: 'none' });
          }}
        />
      )}
    </>
  );
}
