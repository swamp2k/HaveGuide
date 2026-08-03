import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { GardenDetail } from '../../shared/types';
import type { GardenJourney } from '../../shared/journey-types';
import { ApiError } from '../api';
import { journeyApi } from '../journey-api';
import { StatusMessage } from './StatusMessage';
import '../journey.css';

interface JourneyPageProps { garden: GardenDetail; }

type Section = 'tasks' | 'changes' | 'shopping';

function kroner(minor: number): string {
  return new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK' }).format(minor / 100);
}

export function JourneyPage({ garden }: JourneyPageProps) {
  const [journey, setJourney] = useState<GardenJourney | null>(null);
  const [section, setSection] = useState<Section>('tasks');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [changeTitle, setChangeTitle] = useState('');
  const [changeNotes, setChangeNotes] = useState('');
  const [shoppingName, setShoppingName] = useState('');
  const [shoppingPrice, setShoppingPrice] = useState('');

  async function load() {
    setMessage('');
    try {
      const response = await journeyApi.get(garden.id);
      setJourney(response.journey);
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Haveforløbet kunne ikke hentes.');
    }
  }

  useEffect(() => { void load(); }, [garden.id]);

  const openTasks = useMemo(() => journey?.tasks.filter((task) => task.status === 'open') ?? [], [journey]);
  const doneTasks = useMemo(() => journey?.tasks.filter((task) => task.status === 'done') ?? [], [journey]);

  async function addTask(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await journeyApi.createTask(garden.id, {
        title: taskTitle,
        description: '',
        season: 'any',
        priority: 'normal',
        ...(taskDueDate ? { dueDate: taskDueDate } : {}),
      });
      setJourney(response.journey);
      setTaskTitle('');
      setTaskDueDate('');
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Opgaven kunne ikke gemmes.');
    } finally { setBusy(false); }
  }

  async function toggleTask(taskId: string, done: boolean) {
    setBusy(true);
    try {
      const response = await journeyApi.updateTask(garden.id, taskId, { status: done ? 'done' : 'open' });
      setJourney(response.journey);
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Opgaven kunne ikke opdateres.');
    } finally { setBusy(false); }
  }

  async function addChange(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await journeyApi.createChange(garden.id, {
        title: changeTitle,
        notes: changeNotes,
        occurredOn: new Date().toISOString().slice(0, 10),
        costMinor: 0,
      });
      setJourney(response.journey);
      setChangeTitle('');
      setChangeNotes('');
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Ændringen kunne ikke gemmes.');
    } finally { setBusy(false); }
  }

  async function addShopping(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await journeyApi.createShopping(garden.id, {
        name: shoppingName,
        quantity: 1,
        unit: 'stk',
        estimatedUnitPriceMinor: Math.round((Number(shoppingPrice.replace(',', '.')) || 0) * 100),
        supplier: '',
        url: '',
      });
      setJourney(response.journey);
      setShoppingName('');
      setShoppingPrice('');
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Indkøbet kunne ikke gemmes.');
    } finally { setBusy(false); }
  }

  async function markBought(itemId: string) {
    setBusy(true);
    try {
      const item = journey?.shopping.find((candidate) => candidate.id === itemId);
      const response = await journeyApi.updateShopping(garden.id, itemId, {
        status: 'bought',
        actualUnitPriceMinor: item?.estimatedUnitPriceMinor ?? 0,
      });
      setJourney(response.journey);
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Indkøbet kunne ikke opdateres.');
    } finally { setBusy(false); }
  }

  return (
    <main className="page journey-page">
      <p className="eyebrow">Privat beta</p>
      <h1>Opgaver og haveforløb</h1>
      <p className="lead">Hold styr på næste skridt, hvad der er ændret, og hvad projektet forventes at koste.</p>
      {message && <StatusMessage kind="error">{message}</StatusMessage>}

      {journey && <div className="journey-summary">
        <span><strong>{journey.summary.openTasks}</strong> åbne</span>
        <span><strong>{journey.summary.completedTasks}</strong> færdige</span>
        <span><strong>{kroner(journey.summary.estimatedBudgetMinor)}</strong> planlagt</span>
        <span><strong>{kroner(journey.summary.actualBudgetMinor)}</strong> købt</span>
      </div>}

      <div className="journey-tabs" role="tablist">
        <button className={section === 'tasks' ? 'active' : ''} onClick={() => setSection('tasks')} type="button">Opgaver</button>
        <button className={section === 'changes' ? 'active' : ''} onClick={() => setSection('changes')} type="button">Historik</button>
        <button className={section === 'shopping' ? 'active' : ''} onClick={() => setSection('shopping')} type="button">Indkøb</button>
      </div>

      {section === 'tasks' && <section className="journey-section">
        <form className="journey-quick-form" onSubmit={addTask}>
          <label>Ny opgave<input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} required placeholder="Fx beskær hækken" /></label>
          <label>Dato <span className="optional">valgfrit</span><input type="date" value={taskDueDate} onChange={(event) => setTaskDueDate(event.target.value)} /></label>
          <button className="primary-button" disabled={busy}>Tilføj opgave</button>
        </form>
        <div className="journey-list">{openTasks.map((task) => <label className="journey-row" key={task.id}><input type="checkbox" checked={false} disabled={busy} onChange={() => void toggleTask(task.id, true)} /><span><strong>{task.title}</strong>{task.dueDate && <small>{task.dueDate}</small>}</span></label>)}</div>
        {doneTasks.length > 0 && <details><summary>Færdige opgaver ({doneTasks.length})</summary><div className="journey-list done">{doneTasks.map((task) => <label className="journey-row" key={task.id}><input type="checkbox" checked disabled={busy} onChange={() => void toggleTask(task.id, false)} /><span><strong>{task.title}</strong></span></label>)}</div></details>}
      </section>}

      {section === 'changes' && <section className="journey-section">
        <form className="journey-quick-form" onSubmit={addChange}>
          <label>Hvad ændrede du?<input value={changeTitle} onChange={(event) => setChangeTitle(event.target.value)} required placeholder="Fx anlagde nyt bed" /></label>
          <label>Noter<textarea value={changeNotes} onChange={(event) => setChangeNotes(event.target.value)} rows={2} /></label>
          <button className="primary-button" disabled={busy}>Gem ændring</button>
        </form>
        <div className="journey-list">{journey?.changes.map((change) => <article className="journey-card" key={change.id}><small>{change.occurredOn}</small><h3>{change.title}</h3>{change.notes && <p>{change.notes}</p>}</article>)}</div>
      </section>}

      {section === 'shopping' && <section className="journey-section">
        <form className="journey-quick-form" onSubmit={addShopping}>
          <label>Vare<input value={shoppingName} onChange={(event) => setShoppingName(event.target.value)} required placeholder="Fx 6 lavendler" /></label>
          <label>Forventet pris i kr.<input inputMode="decimal" value={shoppingPrice} onChange={(event) => setShoppingPrice(event.target.value)} /></label>
          <button className="primary-button" disabled={busy}>Tilføj indkøb</button>
        </form>
        <div className="journey-list">{journey?.shopping.map((item) => <article className="journey-card shopping-card" key={item.id}><div><h3>{item.name}</h3><p>{item.quantity} {item.unit} · {kroner(item.estimatedUnitPriceMinor * item.quantity)}</p></div>{item.status === 'planned' ? <button className="secondary-button" type="button" disabled={busy} onClick={() => void markBought(item.id)}>Markér købt</button> : <span className="selected-badge">Købt</span>}</article>)}</div>
      </section>}

      <section className="journey-export">
        <h2>Backup</h2>
        <p>Eksportér opgaver, historik og indkøb som JSON. Billeder eksporteres ikke endnu.</p>
        <a className="secondary-button export-link" href={`/api/gardens/${garden.id}/export`} download>Hent dataeksport</a>
      </section>
    </main>
  );
}
