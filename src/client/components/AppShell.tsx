import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import type { Garden, GardenDetail, UserSummary } from '../../shared/types';
import './AppShell.css';

const GardenMap = lazy(() => import('./GardenMap').then((m) => ({ default: m.GardenMap })));
const PlantsPage = lazy(() => import('./PlantsPage').then((m) => ({ default: m.PlantsPage })));
const MappingAssistant = lazy(() => import('./MappingAssistant').then((m) => ({ default: m.MappingAssistant })));
const JourneyPage = lazy(() => import('./JourneyPage').then((m) => ({ default: m.JourneyPage })));
const DesignPage = lazy(() => import('./DesignPage').then((m) => ({ default: m.DesignPage })));
const SettingsPage = lazy(() => import('./SettingsPage').then((m) => ({ default: m.SettingsPage })));
const UnderstandingPage = lazy(() => import('./UnderstandingPage').then((m) => ({ default: m.UnderstandingPage })));
const AerialEditor = lazy(() => import('./AerialEditor').then((m) => ({ default: m.AerialEditor })));
const SmartScanCard = lazy(() => import('./SmartScanCard').then((m) => ({ default: m.SmartScanCard })));
const SmartScanPublishCard = lazy(() => import('./SmartScanPublishCard').then((m) => ({ default: m.SmartScanPublishCard })));

interface AppShellProps {
  user: UserSummary;
  gardens: Garden[];
  garden: GardenDetail;
  onSelectGarden: (gardenId: string) => void;
  onGardenChanged: (garden: GardenDetail) => void;
  onLogout: () => void;
}
type Tab = 'garden' | 'plants' | 'tour' | 'journey' | 'more' | 'design' | 'settings' | 'scan' | 'understanding' | 'edit';
const navigation: { id: Tab; icon: string; label: string }[] = [
  { id: 'garden', icon: '⌖', label: 'Min have' },
  { id: 'plants', icon: '🌿', label: 'Planter' },
  { id: 'tour', icon: '◎', label: 'Rundtur' },
  { id: 'journey', icon: '✓', label: 'Opgaver' },
  { id: 'more', icon: '☰', label: 'Mere' },
];
class PageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override render() {
    if (this.state.failed) return <div className="page" role="alert"><h1>Siden kunne ikke åbnes</h1><p>Prøv igen, når du har forbindelse.</p><button className="primary-button" onClick={() => window.location.reload()}>Prøv igen</button></div>;
    return this.props.children;
  }
}

function PageStart() {
  // Run after the lazy page commits, so scroll anchoring cannot retain the old page's position.
  useEffect(() => {
    window.scrollTo(0, 0);
    const heading = document.querySelector<HTMLElement>('.app-content h1, .app-content h2');
    heading?.setAttribute('tabindex', '-1');
    heading?.focus({ preventScroll: true });
  }, []);
  return null;
}

export function AppShell({ user, gardens, garden, onSelectGarden, onGardenChanged, onLogout }: AppShellProps) {
  const [tab, setTab] = useState<Tab>('garden');
  const [capture, setCapture] = useState(false);
  const [navigationBlocked, setNavigationBlocked] = useState(false);
  function go(next: Tab, takePhoto = false) {
    if (next === tab && !takePhoto) return;
    if (navigationBlocked && !window.confirm('Du har et foto eller ændringer, som ikke er færdige. Forlad siden?')) return;
    setNavigationBlocked(false);
    setCapture(takePhoto);
    setTab(next);
    window.scrollTo(0, 0);
  }
  const secondary = !navigation.some((item) => item.id === tab);
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-brand"><span aria-hidden="true">🌱</span><strong>Have Guide</strong></div>
        <div className="header-garden-actions">
          {gardens.length > 1 ? <label className="garden-picker"><span className="sr-only">Vælg have</span><select value={garden.id} onChange={(e) => {
            if (navigationBlocked && !window.confirm('Forlad den igangværende registrering?')) return;
            onSelectGarden(e.target.value);
          }}>{gardens.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : <span className="garden-name">{garden.name}</span>}
          <button className="header-settings-button" onClick={() => go('settings')} aria-label="Åbn indstillinger">⚙</button>
        </div>
      </header>
      <div className="app-content">
        {secondary && <button className="text-button section-back" onClick={() => go('more')}>← Tilbage til Mere</button>}
        <PageBoundary key={`${garden.id}:${tab}`}><Suspense fallback={<div className="page" role="status"><div className="spinner" /><p>Åbner siden…</p></div>}>
          {tab === 'garden' && <>
            <div className="garden-welcome"><div><p className="eyebrow">Lidt ad gangen</p><h1>Hvad vil du i haven?</h1></div><button className="primary-button" onClick={() => go('plants', true)}>📷 Tilføj plante</button></div>
            <GardenMap garden={garden} onGardenChanged={onGardenChanged} />
            <div className="garden-shortcuts"><button onClick={() => go('tour')}>◎ Se din rundtur</button><button onClick={() => go('edit')}>✎ Ret havens grænse</button><button onClick={() => go('scan')}>📷 Scan et område</button></div>
          </>}
          {tab === 'plants' && <PlantsPage garden={garden} initialCapture={capture} onDirtyChange={setNavigationBlocked} />}
          {tab === 'tour' && <MappingAssistant garden={garden} />}
          {tab === 'journey' && <JourneyPage garden={garden} />}
          {tab === 'design' && <DesignPage garden={garden} />}
          {tab === 'understanding' && <UnderstandingPage garden={garden} />}
          {tab === 'edit' && <AerialEditor garden={garden} onGardenChanged={onGardenChanged} />}
          {tab === 'scan' && <div className="page"><h1>Scan et område</h1><p className="lead">Gå langsomt rundt om et lille område. Bagefter kan du rette og godkende det, appen har fundet.</p><SmartScanCard garden={garden} /><SmartScanPublishCard garden={garden} onGardenChanged={onGardenChanged} /></div>}
          {tab === 'settings' && <SettingsPage user={user} garden={garden} onGardenChanged={onGardenChanged} onLogout={onLogout} />}
          {tab === 'more' && <main className="page"><h1>Mere til din have</h1><p className="lead">Vælg det, du har brug for.</p><div className="garden-tool-grid">
            {([{ id: 'design', title: 'Idéer og planer', text: 'Undersøg muligheder for at ændre haven.' }, { id: 'scan', title: 'Scan et område', text: 'Lad telefonen hjælpe med at kortlægge haven.' }, { id: 'edit', title: 'Redigér havekort', text: 'Ret grænser, bede og andre områder på luftfotoet.' }, { id: 'understanding', title: 'Observationer og detaljer', text: 'Notér jord, lys og problemer. Redigér dine planter.' }, { id: 'settings', title: 'Indstillinger', text: 'Have, konto og billeder.' }] as const).map((item) => <button key={item.id} onClick={() => go(item.id)}><strong>{item.title}</strong><span>{item.text}</span><span aria-hidden="true">→</span></button>)}
          </div></main>}
          <PageStart />
        </Suspense></PageBoundary>
      </div>
      <nav className="bottom-nav" aria-label="Hovednavigation">{navigation.map((item) => <button key={item.id} className={tab === item.id || (item.id === 'more' && secondary) ? 'active' : ''} aria-current={tab === item.id ? 'page' : undefined} onClick={() => go(item.id)}><span aria-hidden="true">{item.icon}</span><span>{item.label}</span></button>)}</nav>
    </div>
  );
}
