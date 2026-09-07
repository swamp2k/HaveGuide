import { useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api';
import { prepareGardenImage } from '../image-tools';
import type { GardenScene } from '../../shared/types';

export function NewSceneDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (scene: GardenScene) => void }) {
  const [title, setTitle] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    let createdSceneId: string | null = null;
    try {
      let image: File | null = null;
      if (files.length > 0) {
        setStatus(files.length > 1 ? 'Samler billeder lodret…' : 'Gør billedet klar…');
        image = await prepareGardenImage(files);
      }

      setStatus('Opretter område…');
      const { scene } = await api.createScene(title);
      createdSceneId = scene.id;
      if (!image) {
        onCreated(scene);
        return;
      }

      setStatus('Uploader billede…');
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

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="new-scene-title">
        <button className="icon-button modal-close" onClick={onClose} disabled={busy} aria-label="Luk">×</button>
        <p className="eyebrow">Nyt område</p>
        <h2 id="new-scene-title">Start med et foto</h2>
        <p className="muted">Ét billede er fint. Vælger du flere, samler HaveGuide dem lodret til ét langt oversigtsfoto.</p>
        <form className="stack" onSubmit={submit}>
          <label>
            <span>Navn på området</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Fx skråningen ved æbletræet" maxLength={120} required autoFocus />
          </label>
          <div className="photo-picker">
            <label className="secondary file-button">
              <input type="file" accept="image/*" capture="environment" onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 1))} />
              Tag foto
            </label>
            <label className="secondary file-button">
              <input type="file" accept="image/*" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 6))} />
              Vælg foto(s)
            </label>
          </div>
          <p className="picker-help">{files.length ? `${files.length} billede${files.length === 1 ? '' : 'r'} valgt${files.length > 1 ? ' — de samles lodret i den valgte rækkefølge.' : '.'}` : 'Du kan også oprette området uden foto og tilføje det bagefter.'}</p>
          {files.length > 0 && <div className="file-list">{files.map((file) => <span key={`${file.name}-${file.lastModified}`}>{file.name}</span>)}</div>}
          {status && <p className="status-box">{status}</p>}
          {error && <p className="error-box">{error}</p>}
          <div className="button-row">
            <button type="button" className="secondary" onClick={onClose} disabled={busy}>Annuller</button>
            <button className="primary" disabled={busy || !title.trim()}>{busy ? 'Arbejder…' : 'Opret område'}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
