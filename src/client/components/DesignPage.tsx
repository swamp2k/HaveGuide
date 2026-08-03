import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import {
  DESIGN_BUDGET_LABELS,
  DESIGN_COLOR_LABELS,
  DESIGN_COLORS,
  DESIGN_EFFORT_LABELS,
  DESIGN_GOAL_LABELS,
  DESIGN_GOALS,
} from '../../shared/constants';
import type {
  DesignBudget,
  DesignColor,
  DesignEffort,
  DesignGoal,
  DesignOption,
  DesignProject,
  DesignWorkspace,
  GardenDetail,
  MediaItem,
} from '../../shared/types';
import { api, ApiError } from '../api';
import { StatusMessage } from './StatusMessage';

interface DesignPageProps { garden: GardenDetail; }

function splitList(value: string): string[] {
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))].slice(0, 20);
}

function scoreLabel(score: number): string {
  return `${score} af 5`;
}

function budgetLabel(value: DesignOption['budgetBand']): string {
  return value === 'low' ? 'Lavt' : value === 'medium' ? 'Mellem' : 'Højere';
}

function projectStatus(project: DesignProject): string {
  return project.status === 'selected' ? 'Valgt plan' : project.status === 'archived' ? 'Arkiveret' : 'Kladde';
}

function VisualBoard({ option, media }: { option: DesignOption; media: MediaItem[] }) {
  const background = media.find((item) => item.id === option.visual.backgroundMediaId);
  const style: CSSProperties = background
    ? { backgroundImage: `linear-gradient(rgb(23 62 43 / 18%), rgb(23 62 43 / 32%)), url("${background.contentUrl}")` }
    : { backgroundImage: `linear-gradient(145deg, ${option.visual.palette.join(', ')})` };
  return (
    <div className="design-visual" style={style} aria-label={`Konceptvisning for ${option.name}`}>
      {option.visual.layers.map((layer, index) => (
        <span
          className={`visual-layer visual-${layer.kind}`}
          style={{ left: `${layer.x}%`, top: `${layer.y}%` }}
          key={`${layer.label}-${index}`}
        >
          {layer.label}
        </span>
      ))}
      <small>{option.visual.disclaimer}</small>
    </div>
  );
}

export function DesignPage({ garden }: DesignPageProps) {
  const [workspace, setWorkspace] = useState<DesignWorkspace | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [showForm, setShowForm] = useState(false);

  const [title, setTitle] = useState('Ny plan for haven');
  const [targetFeatureId, setTargetFeatureId] = useState('');
  const [goal, setGoal] = useState<DesignGoal>('low_maintenance');
  const [effort, setEffort] = useState<DesignEffort>('low');
  const [budget, setBudget] = useState<DesignBudget>('flexible');
  const [childrenUseGarden, setChildrenUseGarden] = useState(false);
  const [petsUseGarden, setPetsUseGarden] = useState(false);
  const [avoidPotentiallyHarmful, setAvoidPotentiallyHarmful] = useState(true);
  const [colors, setColors] = useState<DesignColor[]>([]);
  const [maxHeight, setMaxHeight] = useState('');
  const [winterInterest, setWinterInterest] = useState(false);
  const [constraintNotes, setConstraintNotes] = useState('');

  const [useInspiration, setUseInspiration] = useState(false);
  const [inspirationTitle, setInspirationTitle] = useState('Mit inspirationsbillede');
  const [inspirationMediaId, setInspirationMediaId] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [inspirationNotes, setInspirationNotes] = useState('');
  const [styleTags, setStyleTags] = useState('');
  const [desiredElements, setDesiredElements] = useState('');
  const [avoidedElements, setAvoidedElements] = useState('');

  async function load() {
    setLoading(true);
    setMessage('');
    try {
      const [designResponse, mediaResponse] = await Promise.all([
        api.getDesignWorkspace(garden.id),
        api.listMedia(garden.id),
      ]);
      setWorkspace(designResponse.workspace);
      setMedia(mediaResponse.media);
      setShowForm(designResponse.workspace.projects.length === 0);
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Planerne kunne ikke hentes.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [garden.id]);

  const currentProject = useMemo(() => {
    if (!workspace) return null;
    return workspace.projects.find((project) => project.id === workspace.currentProjectId) ?? workspace.projects[0] ?? null;
  }, [workspace]);

  function toggleColor(color: DesignColor) {
    setColors((current) => current.includes(color) ? current.filter((item) => item !== color) : [...current, color]);
  }

  async function createProject(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const response = await api.createDesignProject(garden.id, {
        ...(targetFeatureId ? { targetFeatureId } : {}),
        title,
        goal,
        constraints: {
          effort,
          budget,
          childrenUseGarden,
          petsUseGarden,
          avoidPotentiallyHarmful,
          colors,
          maxHeightCm: maxHeight ? Number(maxHeight) : null,
          winterInterest,
          notes: constraintNotes,
        },
        ...(useInspiration ? {
          inspiration: {
            ...(inspirationMediaId ? { mediaId: inspirationMediaId } : {}),
            sourceUrl,
            title: inspirationTitle,
            notes: inspirationNotes,
            styleTags: splitList(styleTags),
            desiredElements: splitList(desiredElements),
            avoidedElements: splitList(avoidedElements),
          },
        } : {}),
      });
      setWorkspace(response.workspace);
      setShowForm(false);
      setMessage('Tre forslag er klar. De kan sammenlignes og ændres uden at ændre selve haven.');
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Forslagene kunne ikke oprettes.');
    } finally {
      setBusy(false);
    }
  }

  async function selectOption(projectId: string, optionId: string) {
    setBusy(true);
    setMessage('');
    try {
      const response = await api.selectDesignOption(garden.id, projectId, optionId);
      setWorkspace(response.workspace);
      setMessage('Forslaget er valgt som den aktuelle plan.');
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Forslaget kunne ikke vælges.');
    } finally {
      setBusy(false);
    }
  }

  async function updateVisual(optionId: string, backgroundMediaId: string | null) {
    setBusy(true);
    setMessage('');
    try {
      const response = await api.updateDesignVisual(garden.id, optionId, { backgroundMediaId });
      setWorkspace(response.workspace);
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Konceptvisningen kunne ikke opdateres.');
    } finally {
      setBusy(false);
    }
  }

  async function archiveProject(projectId: string) {
    if (!window.confirm('Arkivér denne planversion?')) return;
    setBusy(true);
    try {
      const response = await api.archiveDesignProject(garden.id, projectId);
      setWorkspace(response.workspace);
      setShowForm(response.workspace.projects.length === 0);
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Planversionen kunne ikke arkiveres.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main className="center-state"><div className="spinner" /><p>Henter planer…</p></main>;

  return (
    <main className="page design-page">
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Råd og redesign</p>
          <h1>Planlæg din have</h1>
          <p className="lead">Vælg et område og et mål. Have Guide filtrerer først efter forhold og begrænsninger og viser derefter tre forklarlige muligheder.</p>
        </div>
        {!showForm && <button className="primary-button" type="button" onClick={() => setShowForm(true)}>Ny version</button>}
      </div>

      {message && <StatusMessage kind={message.includes('kunne ikke') ? 'error' : 'info'}>{message}</StatusMessage>}

      {workspace && <p className="catalog-note">Startkatalog: {workspace.catalogSize} planter. Det er et forsigtigt beslutningsgrundlag, ikke en købsgaranti.</p>}

      {showForm && (
        <form className="design-brief form-stack" onSubmit={createProject}>
          <section className="design-form-section">
            <p className="eyebrow">1. Opgaven</p>
            <label>Planens navn<input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={160} /></label>
            <label>Område<select value={targetFeatureId} onChange={(event) => setTargetFeatureId(event.target.value)}>
              <option value="">Hele haven</option>
              {garden.features.map((feature) => <option value={feature.id} key={feature.id}>{feature.name}</option>)}
            </select></label>
            <label>Mål<select value={goal} onChange={(event) => setGoal(event.target.value as DesignGoal)}>
              {DESIGN_GOALS.map((item) => <option value={item} key={item}>{DESIGN_GOAL_LABELS[item]}</option>)}
            </select></label>
          </section>

          <section className="design-form-section">
            <p className="eyebrow">2. Rammerne</p>
            <div className="two-column-fields">
              <label>Arbejde<select value={effort} onChange={(event) => setEffort(event.target.value as DesignEffort)}>
                {Object.entries(DESIGN_EFFORT_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select></label>
              <label>Budget<select value={budget} onChange={(event) => setBudget(event.target.value as DesignBudget)}>
                {Object.entries(DESIGN_BUDGET_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select></label>
            </div>
            <div className="check-grid">
              <label className="check-row"><input type="checkbox" checked={childrenUseGarden} onChange={(event) => setChildrenUseGarden(event.target.checked)} />Børn bruger området</label>
              <label className="check-row"><input type="checkbox" checked={petsUseGarden} onChange={(event) => setPetsUseGarden(event.target.checked)} />Dyr bruger området</label>
              <label className="check-row"><input type="checkbox" checked={avoidPotentiallyHarmful} onChange={(event) => setAvoidPotentiallyHarmful(event.target.checked)} />Fravælg katalogets “undgå”-planter</label>
              <label className="check-row"><input type="checkbox" checked={winterInterest} onChange={(event) => setWinterInterest(event.target.checked)} />Prioritér vinterstruktur</label>
            </div>
            <label>Maksimal plantehøjde <span className="optional">valgfrit, cm</span><input type="number" min="10" max="1000" value={maxHeight} onChange={(event) => setMaxHeight(event.target.value)} /></label>
            <fieldset className="color-picker"><legend>Foretrukne farver <span className="optional">valgfrit</span></legend>
              {DESIGN_COLORS.map((color) => <label className="color-choice" key={color}><input type="checkbox" checked={colors.includes(color)} onChange={() => toggleColor(color)} /><span style={{ background: `var(--design-${color})` }} />{DESIGN_COLOR_LABELS[color]}</label>)}
            </fieldset>
            <label>Andre krav<textarea rows={3} value={constraintNotes} onChange={(event) => setConstraintNotes(event.target.value)} placeholder="For eksempel adgang med trillebør, bestemt udsigt eller planter der skal bevares" /></label>
          </section>

          <section className="design-form-section">
            <label className="check-row inspiration-toggle"><input type="checkbox" checked={useInspiration} onChange={(event) => setUseInspiration(event.target.checked)} /><strong>Tilpas et inspirationsbillede eller en idé</strong></label>
            {useInspiration && <div className="inspiration-fields">
              <label>Titel<input value={inspirationTitle} onChange={(event) => setInspirationTitle(event.target.value)} required={useInspiration} /></label>
              <label>Billede fra Have Guide<select value={inspirationMediaId} onChange={(event) => setInspirationMediaId(event.target.value)}><option value="">Intet billede valgt</option>{media.map((item) => <option value={item.id} key={item.id}>{item.originalFilename}</option>)}</select></label>
              <label>Kildelink <span className="optional">valgfrit</span><input type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://…" /></label>
              <label>Stilord <span className="optional">adskilt med komma</span><input value={styleTags} onChange={(event) => setStyleTags(event.target.value)} placeholder="naturpræget, rolig, moderne" /></label>
              <label>Elementer du vil låne <span className="optional">adskilt med komma</span><input value={desiredElements} onChange={(event) => setDesiredElements(event.target.value)} placeholder="gentagne græsser, buet kant" /></label>
              <label>Elementer du ikke vil have <span className="optional">adskilt med komma</span><input value={avoidedElements} onChange={(event) => setAvoidedElements(event.target.value)} /></label>
              <label>Noter<textarea rows={3} value={inspirationNotes} onChange={(event) => setInspirationNotes(event.target.value)} /></label>
            </div>}
          </section>

          <div className="button-row"><button className="secondary-button" type="button" onClick={() => setShowForm(false)} disabled={!workspace?.projects.length}>Annuller</button><button className="primary-button" type="submit" disabled={busy}>{busy ? 'Udarbejder forslag…' : 'Lav tre forslag'}</button></div>
        </form>
      )}

      {!showForm && currentProject && (
        <section className="current-design">
          <div className="project-heading">
            <div><p className="eyebrow">Version {currentProject.versionNo} · {projectStatus(currentProject)}</p><h2>{currentProject.title}</h2><p>{DESIGN_GOAL_LABELS[currentProject.goal]}</p></div>
            <button className="text-button danger-text" type="button" disabled={busy} onClick={() => void archiveProject(currentProject.id)}>Arkivér</button>
          </div>

          <div className="design-options">
            {currentProject.options.map((option) => (
              <article className={`design-option ${option.status === 'selected' ? 'selected' : ''}`} key={option.id}>
                <div className="option-heading"><div><p className="eyebrow">Forslag {option.position}</p><h3>{option.name}</h3></div>{option.status === 'selected' && <span className="selected-badge">Valgt</span>}</div>
                <p>{option.summary}</p><p className="strategy-copy">{option.strategy}</p>
                <div className="score-grid"><span><strong>Vedligehold</strong>{scoreLabel(option.maintenanceScore)}</span><span><strong>Budget</strong>{budgetLabel(option.budgetBand)}</span><span><strong>Biodiversitet</strong>{scoreLabel(option.biodiversityScore)}</span></div>

                <VisualBoard option={option} media={media} />
                <label className="visual-select">Vis på havefoto<select value={option.visual.backgroundMediaId ?? ''} disabled={busy} onChange={(event) => void updateVisual(option.id, event.target.value || null)}><option value="">Neutral konceptbaggrund</option>{media.map((item) => <option value={item.id} key={item.id}>{item.originalFilename}</option>)}</select></label>

                <h4>Planter</h4>
                <div className="recommendation-list">{option.plants.map((plant) => <div className="recommendation" key={plant.catalogId}><div><strong>{plant.commonName}</strong><em>{plant.scientificName}</em></div><p>{plant.reason}. {plant.quantityHint}.</p><p className={`safety-note safety-${plant.safety}`}>{plant.safety === 'low_risk' ? 'Lav risiko i startkataloget' : plant.safety === 'avoid' ? 'Undgå ved valgt sikkerhedsfilter' : 'Kræver kontrol'}: {plant.safetyNote}</p>{plant.sourceUrl ? <a href={plant.sourceUrl} target="_blank" rel="noreferrer">Kilde: {plant.sourceLabel}</a> : <span className="source-label">{plant.sourceLabel}</span>}</div>)}</div>

                <details><summary>Arbejdsrækkefølge</summary><ol className="work-list">{option.workItems.map((item) => <li key={item.order}><strong>{item.title}</strong><p>{item.description}</p><span>{item.effort === 'small' ? 'Mindre opgave' : item.effort === 'medium' ? 'Mellem opgave' : 'Større opgave'}</span></li>)}</ol></details>
                <details><summary>Hvorfor dette forslag?</summary><ul>{option.ruleTrace.map((rule) => <li key={rule}>{rule}</li>)}</ul></details>
                {option.status !== 'selected' && <button className="primary-button" type="button" disabled={busy} onClick={() => void selectOption(currentProject.id, option.id)}>Vælg dette forslag</button>}
              </article>
            ))}
          </div>
        </section>
      )}

      {!showForm && workspace && workspace.projects.length > 1 && (
        <section className="design-history"><h2>Tidligere versioner</h2>{workspace.projects.filter((project) => project.id !== currentProject?.id).map((project) => <button type="button" className="history-row" key={project.id} onClick={() => setWorkspace({ ...workspace, currentProjectId: project.id })}><span>Version {project.versionNo}: {project.title}</span><small>{projectStatus(project)}</small></button>)}</section>
      )}
    </main>
  );
}
