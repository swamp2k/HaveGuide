import { useEffect, useRef, useState } from 'react';
import type { PlantIdentification } from '../../shared/types';
import { plantCardSubtitle, plantCardTitle, selectedSuggestion } from '../../shared/plants';
import { LeafIcon } from './icons';

export interface PlantCardHandlers {
  onPatch: (
    id: string,
    patch: { nickname?: string; note?: string; includeInAnalysis?: boolean; selectedSuggestionIndex?: number },
  ) => Promise<void>;
  onRescan: (id: string, file: File) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

export function PlantCard({
  identification,
  busy,
  canRescan,
  handlers,
}: {
  identification: PlantIdentification;
  busy: boolean;
  canRescan: boolean;
  handlers: PlantCardHandlers;
}) {
  const [open, setOpen] = useState(false);
  const [nickname, setNickname] = useState(identification.nickname);
  const [note, setNote] = useState(identification.note);
  const rescanRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setNickname(identification.nickname);
    setNote(identification.note);
  }, [identification.nickname, identification.note]);

  const best = selectedSuggestion(identification);
  const title = plantCardTitle(identification);
  const subtitle = plantCardSubtitle(identification);
  const alternatives = identification.suggestions.slice(0, 3);
  const labelsDirty = nickname !== identification.nickname || note !== identification.note;

  async function saveLabels() {
    if (!labelsDirty) return;
    await handlers.onPatch(identification.id, { nickname, note });
  }

  return (
    <article className={`plant-card ${identification.includeInAnalysis ? '' : 'muted-card'}`}>
      <div className="plant-card-main">
        <div className="plant-card-photo">
          {identification.image ? (
            <img src={identification.image.url} alt={title} loading="lazy" />
          ) : (
            <span aria-hidden="true"><LeafIcon /></span>
          )}
        </div>
        <div className="plant-card-text">
          <h3>{title}</h3>
          {subtitle && <p className="plant-card-sub">{subtitle}</p>}
          <div className="plant-card-facts">
            {best && <span className="score-pill">{Math.round(best.score * 100)} %</span>}
            {identification.note && <span className="plant-card-note">{identification.note}</span>}
          </div>
        </div>
        <button
          type="button"
          className={`toggle-pill ${identification.includeInAnalysis ? 'on' : ''}`}
          disabled={busy}
          aria-pressed={identification.includeInAnalysis}
          title={identification.includeInAnalysis ? 'Med i idéer' : 'Ikke med i idéer'}
          onClick={() => handlers.onPatch(identification.id, { includeInAnalysis: !identification.includeInAnalysis })}
        >
          <span />
        </button>
      </div>

      <button type="button" className="plant-card-more" onClick={() => setOpen((value) => !value)}>
        {open ? 'Skjul' : 'Rediger'}
      </button>

      {open && (
        <div className="plant-card-edit">
          <label>
            <span>Navn</span>
            <input
              value={nickname}
              maxLength={60}
              placeholder="Fx den lilla bagest"
              onChange={(event) => setNickname(event.target.value)}
              onBlur={saveLabels}
            />
          </label>
          <label>
            <span>Hvor står den?</span>
            <input
              value={note}
              maxLength={240}
              placeholder="Fx ved stenen"
              onChange={(event) => setNote(event.target.value)}
              onBlur={saveLabels}
            />
          </label>

          {alternatives.length > 1 && (
            <div className="suggestion-picker">
              <span className="field-label">Er det en anden?</span>
              <div className="chip-row">
                {alternatives.map((suggestion, index) => (
                  <button
                    key={`${suggestion.scientificName}-${index}`}
                    type="button"
                    className={`choice-chip ${identification.selectedSuggestionIndex === index ? 'selected' : ''}`}
                    disabled={busy}
                    onClick={() => handlers.onPatch(identification.id, { selectedSuggestionIndex: index })}
                  >
                    {suggestion.commonName || suggestion.scientificName}
                    <small>{Math.round(suggestion.score * 100)} %</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="plant-card-actions">
            <label className={`secondary compact file-button ${busy || !canRescan ? 'disabled' : ''}`}>
              <input
                ref={rescanRef}
                type="file"
                accept="image/*"
                capture="environment"
                disabled={busy || !canRescan}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void handlers.onRescan(identification.id, file);
                }}
              />
              Scan igen
            </label>
            <button
              type="button"
              className="danger-quiet compact"
              disabled={busy}
              onClick={() => handlers.onRemove(identification.id)}
            >
              Fjern
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
