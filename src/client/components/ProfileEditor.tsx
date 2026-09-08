import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { AreaProfile } from '../../shared/types';
import { isProfileComplete } from '../../shared/profile';
import { DrainIcon, DropletIcon, SoilIcon, SunIcon, WindIcon } from './icons';

const OPTIONS = {
  sun: [
    ['full_sun', 'Fuld sol'],
    ['part_sun', 'Halvsol'],
    ['shade', 'Skygge'],
  ],
  moisture: [
    ['dry', 'Tørt'],
    ['normal', 'Normalt'],
    ['moist', 'Fugtigt'],
    ['wet', 'Vådt'],
  ],
  soil: [
    ['sand', 'Sandet'],
    ['loam', 'Muldjord'],
    ['clay', 'Leret'],
    ['mixed', 'Blandet'],
    ['unknown', 'Ved ikke'],
  ],
  drainage: [
    ['fast', 'Dræner hurtigt'],
    ['normal', 'Normalt dræn'],
    ['slow', 'Holder på vand'],
    ['unknown', 'Ved ikke'],
  ],
  wind: [
    ['sheltered', 'Læ'],
    ['normal', 'Normalt'],
    ['exposed', 'Vindudsat'],
    ['unknown', 'Ved ikke'],
  ],
} as const;

const FIELD_LABEL: Record<ProfileKey, string> = {
  sun: 'Sol',
  moisture: 'Fugt',
  soil: 'Jord',
  drainage: 'Dræn',
  wind: 'Vind',
};

const FIELD_ICON: Record<ProfileKey, ReactNode> = {
  sun: <SunIcon size={17} />,
  moisture: <DropletIcon size={17} />,
  soil: <SoilIcon size={17} />,
  drainage: <DrainIcon size={17} />,
  wind: <WindIcon size={17} />,
};

const GOALS = ['Lav vedligeholdelse', 'Bestøvere', 'Farve', 'Spiseligt', 'Privatliv', 'Helårsinteresse', 'Tørketålende'];

type ProfileKey = keyof typeof OPTIONS;

export function ProfileEditor({ profile, onSave }: { profile: AreaProfile; onSave: (profile: AreaProfile) => Promise<void> }) {
  const [draft, setDraft] = useState(profile);
  const [open, setOpen] = useState(!isProfileComplete(profile));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => setDraft(profile), [profile]);

  function setOption(key: ProfileKey, value: string) {
    setSaved(false);
    setDraft((current) => ({ ...current, [key]: value }) as AreaProfile);
  }

  function toggleGoal(goal: string) {
    setSaved(false);
    setDraft((current) => ({
      ...current,
      goals: current.goals.includes(goal) ? current.goals.filter((item) => item !== goal) : [...current.goals, goal],
    }));
  }

  async function save() {
    setBusy(true);
    setError('');
    try {
      await onSave(draft);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Forholdene blev ikke gemt.');
    } finally {
      setBusy(false);
    }
  }

  const complete = isProfileComplete(draft);
  const summary = (Object.keys(OPTIONS) as ProfileKey[]).flatMap((key) => {
    const value = draft[key];
    if (!value) return [];
    const label = OPTIONS[key].find(([option]) => option === value)?.[1];
    return label ? [{ key, label }] : [];
  });

  return (
    <section className="panel profile-panel">
      <div className="section-heading">
        <h2>Forhold</h2>
        <button className="secondary compact" onClick={() => setOpen((value) => !value)}>
          {open ? 'Færdig' : 'Ret'}
        </button>
      </div>

      {!open && (
        summary.length > 0 ? (
          <div className="condition-summary">
            {summary.map(({ key, label }) => (
              <span className="condition-chip" key={key}>
                {FIELD_ICON[key]}
                {label}
              </span>
            ))}
            {!complete && <span className="condition-chip warn">Mangler forhold</span>}
          </div>
        ) : (
          <button className="condition-empty" onClick={() => setOpen(true)}>Vælg sol, fugt, jord og dræn.</button>
        )
      )}

      {open && (
        <>
          <div className="condition-grid">
            {(Object.keys(OPTIONS) as ProfileKey[]).map((key) => (
              <fieldset key={key}>
                <legend>
                  <span className="legend-icon">{FIELD_ICON[key]}</span>
                  {FIELD_LABEL[key]}
                </legend>
                <div className="chip-row">
                  {OPTIONS[key].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={`choice-chip ${draft[key] === value ? 'selected' : ''}`}
                      onClick={() => setOption(key, value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>

          <fieldset>
            <legend>Ønsker</legend>
            <div className="chip-row">
              {GOALS.map((goal) => (
                <button
                  key={goal}
                  type="button"
                  className={`choice-chip ${draft.goals.includes(goal) ? 'selected' : ''}`}
                  onClick={() => toggleGoal(goal)}
                >
                  {goal}
                </button>
              ))}
            </div>
          </fieldset>

          <label>
            <span>Noter</span>
            <textarea
              value={draft.notes}
              onChange={(event) => { setSaved(false); setDraft((current) => ({ ...current, notes: event.target.value })); }}
              placeholder="Fx står under et æbletræ, må ikke blive højere end 80 cm…"
              rows={3}
            />
          </label>

          {error && <p className="error-box">{error}</p>}

          <div className="button-row left">
            <button className="primary" onClick={save} disabled={busy}>{busy ? 'Gemmer…' : 'Gem'}</button>
            {saved && <span className="saved-note">Gemt</span>}
          </div>
        </>
      )}
    </section>
  );
}
