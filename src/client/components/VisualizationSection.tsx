import { useEffect, useRef, useState } from 'react';
import type { SceneVisualization } from '../../shared/types';
import { PaletteIcon, PlusIcon } from './icons';

const QUICK_IDEAS = ['Mere farve', 'Flere blomster', 'Lav vedligeholdelse', 'Mere bunddække'];

/** The three visible phases of a generation, so the wait never looks like a frozen screen. */
const STEPS = ['Forbereder billede…', 'Laver visualisering…', 'Gemmer resultat…'] as const;

export function VisualizationSection({
  visualizations,
  canEdit,
  unavailableReason,
  hasPhoto,
  busy,
  onCreate,
  onDelete,
}: {
  visualizations: SceneVisualization[];
  canEdit: boolean;
  unavailableReason: string;
  hasPhoto: boolean;
  busy: boolean;
  onCreate: (instruction: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [instruction, setInstruction] = useState('');
  const [step, setStep] = useState(0);
  const [preview, setPreview] = useState<SceneVisualization | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);

  useEffect(() => {
    if (!busy) {
      timers.current.forEach((id) => window.clearTimeout(id));
      timers.current = [];
      setStep(0);
      return;
    }
    // Generation gives no partial signal, so the phases advance on a timer that stops at the last
    // one and waits there rather than pretending to finish.
    setStep(0);
    timers.current = [
      window.setTimeout(() => setStep(1), 1200),
      window.setTimeout(() => setStep(2), 18000),
    ];
  }, [busy]);

  async function submit() {
    const text = instruction.trim();
    if (!text) return;
    await onCreate(text);
    setInstruction('');
  }

  const disabled = !canEdit || !hasPhoto || busy;

  return (
    <section className="panel visualization-panel">
      <div className="section-heading">
        <h2>Se ændringen</h2>
      </div>

      {!canEdit ? (
        <p className="muted">{unavailableReason || 'Visualisering er ikke klar endnu.'}</p>
      ) : !hasPhoto ? (
        <p className="muted">Tilføj et foto af området først.</p>
      ) : (
        <>
          <label>
            <span>Hvad vil du ændre?</span>
            <textarea
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              rows={2}
              maxLength={600}
              placeholder="Fx flere stauder i det bare hjørne"
              disabled={busy}
            />
          </label>

          <div className="chip-row">
            {QUICK_IDEAS.map((idea) => (
              <button
                key={idea}
                type="button"
                className="choice-chip"
                disabled={busy}
                onClick={() => setInstruction((current) => (current.trim() ? current : idea))}
              >
                {idea}
              </button>
            ))}
          </div>

          <button className="primary" onClick={submit} disabled={disabled || !instruction.trim()}>
            <PlusIcon size={16} /> Lav visualisering
          </button>

          {busy && (
            <div className="visualization-progress" aria-live="polite">
              <span className="capture-spinner" aria-hidden="true"><PaletteIcon size={22} /></span>
              <strong>{STEPS[step]}</strong>
              <small>Det tager typisk under et minut.</small>
            </div>
          )}
        </>
      )}

      {visualizations.length > 0 && (
        <div className="visualization-list">
          {visualizations.map((item) => (
            <article className="visualization-card" key={item.id}>
              <button
                type="button"
                className="visualization-thumb"
                onClick={() => setPreview(item)}
                aria-label={`Vis ${item.instruction}`}
              >
                <img src={item.url} alt={item.instruction} loading="lazy" />
              </button>
              <div className="visualization-meta">
                <strong>{item.instruction}</strong>
                <time dateTime={item.createdAt}>
                  {new Date(item.createdAt).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' })}
                </time>
              </div>
              <button
                type="button"
                className="danger-quiet compact"
                disabled={busy}
                onClick={() => onDelete(item.id)}
              >
                Fjern
              </button>
            </article>
          ))}
        </div>
      )}

      {preview && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setPreview(null)}>
          <section className="modal-card preview-card" role="dialog" aria-modal="true" aria-label={preview.instruction}>
            <button className="icon-button modal-close" onClick={() => setPreview(null)} aria-label="Luk">×</button>
            <img src={preview.url} alt={preview.instruction} />
            <p className="muted">{preview.instruction}</p>
          </section>
        </div>
      )}
    </section>
  );
}
