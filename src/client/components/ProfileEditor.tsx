import { useEffect, useState } from 'react';
import type { AreaProfile } from '../../shared/types';
import { isProfileComplete } from '../../shared/profile';

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

const GOALS = ['Lav vedligeholdelse', 'Bestøvere', 'Farve', 'Spiseligt', 'Privatliv', 'Helårsinteresse', 'Tørketålende'];

type ProfileKey = keyof typeof OPTIONS;

export function ProfileEditor({ profile, onSave }: { profile: AreaProfile; onSave: (profile: AreaProfile) => Promise<void> }) {
  const [draft, setDraft] = useState(profile);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => setDraft(profile), [profile]);

  function setOption(key: ProfileKey, value: string) {
    setSaved(false);
    setDraft((current) => ({ ...current, [key]: value } as AreaProfile));
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
      setError(err instanceof Error ? err.message : 'Kunne ikke gemme forholdene.');
    } finally {
      setBusy(false);
    }
  }

  const complete = isProfileComplete(draft);

  return (
    <section className="panel profile-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Områdeforhold</p>
          <h2>Hvad arbejder vi med?</h2>
        </div>
        <span className={`status-pill ${complete ? 'complete' : ''}`}>{complete ? 'Klar til forslag' : 'Mangler forhold'}</span>
      </div>
      <p className="muted">Sol, fugt, jord og dræn er minimum for gode plante- og ændringsforslag. Vind og noter er bonus.</p>
      <div className="condition-grid">
        {(Object.keys(OPTIONS) as ProfileKey[]).map((key) => (
          <fieldset key={key}>
            <legend>{{ sun: 'Sol', moisture: 'Fugt', soil: 'Jord', drainage: 'Dræn', wind: 'Vind' }[key]}</legend>
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
        <legend>Hvad vil du gerne have ud af området?</legend>
        <div className="chip-row">
          {GOALS.map((goal) => (
            <button key={goal} type="button" className={`choice-chip ${draft.goals.includes(goal) ? 'selected' : ''}`} onClick={() => toggleGoal(goal)}>{goal}</button>
          ))}
        </div>
      </fieldset>
      <label>
        <span>Ekstra noter</span>
        <textarea value={draft.notes} onChange={(event) => { setSaved(false); setDraft((current) => ({ ...current, notes: event.target.value })); }} placeholder="Fx står under et æbletræ, børn leger her, må ikke blive højere end 80 cm…" rows={3} />
      </label>
      {error && <p className="error-box">{error}</p>}
      <div className="button-row left">
        <button className="primary" onClick={save} disabled={busy}>{busy ? 'Gemmer…' : 'Gem forhold'}</button>
        {saved && <span className="saved-note">Gemt</span>}
      </div>
    </section>
  );
}
