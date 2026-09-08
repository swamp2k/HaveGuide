import { useEffect, useRef, useState } from 'react';
import type { PlantIdentification, PlantOrgan } from '../../shared/types';
import { plantCardTitle, selectedSuggestion } from '../../shared/plants';
import { LeafIcon } from './icons';

const ORGANS: Array<[PlantOrgan, string]> = [
  ['auto', 'Auto'],
  ['flower', 'Blomst'],
  ['leaf', 'Blad'],
  ['fruit', 'Frugt'],
  ['bark', 'Bark'],
  ['habit', 'Hele planten'],
];

type Stage = 'pick' | 'working' | 'result';

export function PlantCaptureDialog({
  onClose,
  onIdentify,
  onSaveLabels,
}: {
  onClose: () => void;
  onIdentify: (file: File, organ: PlantOrgan) => Promise<PlantIdentification>;
  onSaveLabels: (id: string, patch: { nickname: string; note: string }) => Promise<void>;
}) {
  const [stage, setStage] = useState<Stage>('pick');
  const [organ, setOrgan] = useState<PlantOrgan>('auto');
  const [preview, setPreview] = useState('');
  const [result, setResult] = useState<PlantIdentification | null>(null);
  const [nickname, setNickname] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function run(file: File | undefined) {
    if (!file) return;
    setError('');
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
    setStage('working');
    try {
      const identification = await onIdentify(file, organ);
      setResult(identification);
      setStage('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Planten kunne ikke slås op.');
      setStage('pick');
    }
  }

  async function finish() {
    if (result && (nickname.trim() || note.trim())) {
      try {
        await onSaveLabels(result.id, { nickname: nickname.trim(), note: note.trim() });
      } catch {
        /* the card exists either way; labels can be edited on the card itself */
      }
    }
    onClose();
  }

  const best = result ? selectedSuggestion(result) : null;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && stage !== 'working' && onClose()}
    >
      <section className="modal-card sheet-card" role="dialog" aria-modal="true" aria-labelledby="plant-capture-title">
        {stage !== 'working' && (
          <button className="icon-button modal-close" onClick={onClose} aria-label="Luk">×</button>
        )}

        {stage === 'pick' && (
          <>
            <h2 id="plant-capture-title">Tilføj plante</h2>
            <p className="muted">Tag et nærfoto af planten.</p>

            <div className="organ-chips">
              <span className="field-label">Hvad fylder mest på fotoet?</span>
              <div className="chip-row">
                {ORGANS.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`choice-chip ${organ === value ? 'selected' : ''}`}
                    onClick={() => setOrgan(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="error-box">{error}</p>}

            <div className="capture-actions">
              <label className="primary file-button">
                <input
                  ref={cameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void run(file); }}
                />
                Tag foto
              </label>
              <label className="secondary file-button">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void run(file); }}
                />
                Vælg foto
              </label>
            </div>
          </>
        )}

        {stage === 'working' && (
          <div className="capture-working">
            {preview && <img src={preview} alt="" />}
            <div className="capture-spinner" aria-hidden="true"><LeafIcon size={26} /></div>
            <strong>Kigger på planten…</strong>
          </div>
        )}

        {stage === 'result' && result && (
          <>
            <div className="capture-result">
              {(result.image?.url || preview) && <img src={result.image?.url || preview} alt="" />}
              <div>
                <h2 id="plant-capture-title">{plantCardTitle(result)}</h2>
                {best && (
                  <p className="muted">
                    {best.commonName ? `${best.scientificName} · ` : ''}
                    {Math.round(best.score * 100)} % sikker
                  </p>
                )}
                {!best && <p className="muted">Intet sikkert bud. Prøv et tættere foto.</p>}
              </div>
            </div>

            <label>
              <span>Kaldenavn (valgfrit)</span>
              <input value={nickname} maxLength={60} placeholder="Fx den lilla bagest" onChange={(event) => setNickname(event.target.value)} />
            </label>
            <label>
              <span>Hvor står den? (valgfrit)</span>
              <input value={note} maxLength={240} placeholder="Fx ved stenen" onChange={(event) => setNote(event.target.value)} />
            </label>

            <div className="button-row">
              <button className="primary" onClick={finish}>Gem plante</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
