import { useState } from 'react';
import type { Garden, GardenDetail, UserSummary } from '../../shared/types';
import '../design.css';
import { AerialEditor } from './AerialEditor';
import { DesignPage } from './DesignPage';
import { GardenMap } from './GardenMap';
import { JourneyPage } from './JourneyPage';
import { MappingAssistant } from './MappingAssistant';
import { UnderstandingPage } from './UnderstandingPage';
import { SettingsPage } from './SettingsPage';

interface AppShellProps {
  user: UserSummary;
  gardens: Garden[];
  garden: GardenDetail;
  onSelectGarden: (gardenId: string) => void;
  onGardenChanged: (garden: GardenDetail) => void;
  onLogout: () => void;
}

type Tab = 'garden' | 'understanding' | 'design' | 'journey' | 'settings';

export function AppShell({ user, gardens, garden, onSelectGarden, onGardenChanged, onLogout }: AppShellProps) {
  const [tab, setTab] = useState<Tab>('garden');
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-brand"><span aria-hidden="true">🌱</span><strong>Have Guide</strong></div>
        {gardens.length > 1 ? (
          <label className="garden-picker"><span className="sr-only">Vælg have</span><select value={garden.id} onChange={(event) => onSelectGarden(event.target.value)}>{gardens.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        ) : <span className="garden-name">{garden.name}</span>}
      </header>

      <div className="app-content">
        {tab === 'garden' && <><GardenMap garden={garden} onGardenChanged={onGardenChanged} /><AerialEditor garden={garden} onGardenChanged={onGardenChanged} /></>}
        {tab === 'understanding' && <><MappingAssistant garden={garden} /><UnderstandingPage garden={garden} /></>}
        {tab === 'design' && <DesignPage garden={garden} />}
        {tab === 'journey' && <JourneyPage garden={garden} />}
        {tab === 'settings' && <SettingsPage user={user} garden={garden} onGardenChanged={onGardenChanged} onLogout={onLogout} />}
      </div>

      <nav className="bottom-nav" aria-label="Hovednavigation">
        <button className={tab === 'garden' ? 'active' : ''} type="button" onClick={() => setTab('garden')} aria-current={tab === 'garden' ? 'page' : undefined}><span aria-hidden="true">⌖</span><span>Min have</span></button>
        <button className={tab === 'understanding' ? 'active' : ''} type="button" onClick={() => setTab('understanding')} aria-current={tab === 'understanding' ? 'page' : undefined}><span aria-hidden="true">◎</span><span>Kortlæg</span></button>
        <button className={tab === 'design' ? 'active' : ''} type="button" onClick={() => setTab('design')} aria-current={tab === 'design' ? 'page' : undefined}><span aria-hidden="true">✦</span><span>Planer</span></button>
        <button className={tab === 'journey' ? 'active' : ''} type="button" onClick={() => setTab('journey')} aria-current={tab === 'journey' ? 'page' : undefined}><span aria-hidden="true">✓</span><span>Opgaver</span></button>
        <button className={tab === 'settings' ? 'active' : ''} type="button" onClick={() => setTab('settings')} aria-current={tab === 'settings' ? 'page' : undefined}><span aria-hidden="true">⚙</span><span>Indstillinger</span></button>
      </nav>
    </div>
  );
}
