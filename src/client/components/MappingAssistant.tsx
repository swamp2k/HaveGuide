import { useCallback, useEffect, useState } from 'react';
import type { CaptureWorkspace } from '../../shared/capture-types';
import type { GardenDetail } from '../../shared/types';
import { ApiError } from '../api';
import { captureApi } from '../capture-api';
import { GuidedCapture } from './GuidedCapture';
import { MappingAerialOverview } from './MappingAerialOverview';
import { SpatialTour } from './SpatialTour';
import { StatusMessage } from './StatusMessage';
import './MappingAssistant.css';
import './MappingTour.css';

interface MappingAssistantProps {
  garden: GardenDetail;
}

const SHOTS_PER_STATION = 6;

export function MappingAssistant({ garden }: MappingAssistantProps) {
  const [workspace, setWorkspace] = useState<CaptureWorkspace | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [targetFeatureId, setTargetFeatureId] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await captureApi.getWorkspace(garden.id);
      setWorkspace(response.workspace);
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Billedturen kunne ikke hentes.');
    }
  }, [garden.id]);

  useEffect(() => { void load(); }, [load]);

  async function startCapture() {
    setBusy(true);
    setMessage('');
    try {
      const response = await captureApi.startSession(garden.id, {
        title: 'Guidet opmåling af haven',
        mode: 'perimeter',
        targetOverlapPercent: 35,
        ...(targetFeatureId ? { targetFeatureId } : {}),
      });
      setWorkspace(response.workspace);
      setCameraOpen(true);
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : 'Opmålingen kunne ikke startes.');
    } finally {
      setBusy(false);
    }
  }

  if (!workspace) {
    return <section className="mapping-assistant-loading"><div className="spinner" /><span>Forbereder assisteret kortlægning…</span></section>;
  }

  const activeFrames = workspace.activeSession?.frames.length ?? 0;
  const activeStations = activeFrames === 0 ? 1 : Math.floor(activeFrames / SHOTS_PER_STATION) + 1;

  return (
    <div className="mapping-assistant">
      <section className="mapping-assistant-card capture-entry-card">
        <div className="mapping-card-heading">
          <div>
            <p className="eyebrow">Guidet opmåling</p>
            <h2>Gå haven rundt station for station</h2>
            <p>Appen guider dig gennem seks overlappende billeder på hvert sted og beder dig derefter gå videre langs kanten.</p>
          </div>
          <span className="capture-icon" aria-hidden="true">◎</span>
        </div>
        {message && <StatusMessage kind="error">{message}</StatusMessage>}
        {!workspace.activeSession && (
          <label>Område <span className="optional">valgfrit</span>
            <select value={targetFeatureId} onChange={(event) => setTargetFeatureId(event.target.value)}>
              <option value="">Hele haven</option>
              {garden.features.map((feature) => <option value={feature.id} key={feature.id}>{feature.name}</option>)}
            </select>
          </label>
        )}
        <div className="survey-plan">
          <div><strong>1</strong><span>Tag seks billeder rundt om dig</span></div>
          <div><strong>2</strong><span>Gå 4–6 skridt langs kanten</span></div>
          <div><strong>3</strong><span>Gentag til haven er dækket</span></div>
        </div>
        {workspace.activeSession && <p className="active-survey-status">Aktiv opmåling: station {activeStations} · {activeFrames} billeder gemt</p>}
        <button type="button" className="primary-button" disabled={busy} onClick={() => void (workspace.activeSession ? setCameraOpen(true) : startCapture())}>
          {workspace.activeSession ? `Fortsæt opmåling · ${activeFrames} billeder` : 'Start guidet opmåling'}
        </button>
      </section>

      <SpatialTour garden={garden} workspace={workspace} onWorkspace={setWorkspace} />
      <MappingAerialOverview garden={garden} aerialAvailable={workspace.aerialAvailable} />

      {cameraOpen && workspace.activeSession && (
        <GuidedCapture
          garden={garden}
          workspace={workspace}
          onWorkspace={setWorkspace}
          onClose={() => setCameraOpen(false)}
        />
      )}
    </div>
  );
}
