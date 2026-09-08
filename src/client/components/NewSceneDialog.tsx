import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api';
import { PANORAMA_OVERLAP_RATIO, prepareGardenImage } from '../image-tools';
import type { GardenScene } from '../../shared/types';
import { GuidedCamera } from './GuidedCamera';

type ImageMode = 'standard' | 'panorama';

export function NewSceneDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (scene: GardenScene) => void }) {
  const [title, setTitle] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [imageMode, setImageMode] = useState<ImageMode>('standard');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const fallbackCameraRef = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    let createdSceneId: string | null = null;

    try {
      let image: File | null = null;
      if (files.length > 0) {
        setStatus(files.length > 1 ? 'Samler fotos…' : 'Gør fotoet klar…');
        image = await prepareGardenImage(
          files,
          imageMode === 'panorama'
            ? { layout: 'horizontal', overlapRatio: PANORAMA_OVERLAP_RATIO }
            : undefined,
        );
      }

      setStatus('Opretter…');
      const { scene } = await api.createScene(title);
      createdSceneId = scene.id;
      if (!image) {
        onCreated(scene);
        return;
      }

      setStatus('Gemmer foto…');
      const uploaded = await api.uploadImage(scene.id, image, 'scene');
      onCreated(uploaded.scene);
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
                  setFiles(Array.from(event.target.files ?? []).slice(0, 1));
                  setImageMode('standard');
                  event.target.value = '';
                }}
              />

              <label className="secondary file-button">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => {
                    setFiles(Array.from(event.target.files ?? []).slice(0, 6));
                    setImageMode('standard');
                  }}
                />
                Vælg foto(s)
              </label>
            </div>

            <p className="picker-help">
              {files.length
                ? imageMode === 'panorama'
                  ? `${files.length} fotos samles til ét bredt billede.`
                  : `${files.length} foto${files.length === 1 ? '' : 's'} valgt${files.length > 1 ? ' — de samles til ét billede.' : '.'}`
                : 'Du kan også tilføje fotoet senere.'}
            </p>

            {files.length > 0 && (
              <div className="file-list">
                {files.map((file, index) => (
                  <span key={`${file.name}-${file.lastModified}-${index}`}>
                    {imageMode === 'panorama' ? `Foto ${index + 1}` : file.name}
                  </span>
                ))}
              </div>
            )}

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
            setFiles(capturedFiles);
            setImageMode(panorama ? 'panorama' : 'standard');
            setCameraOpen(false);
          }}
        />
      )}
    </>
  );
}
