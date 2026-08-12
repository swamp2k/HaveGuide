import { useEffect, useState } from 'react';
import {
  ensureGardenScanArCore,
  getGardenScanCapabilities,
  reconstructLatestGardenScan,
  requestGardenScanPermission,
  startGardenScan,
  type GardenScanCapabilities,
  type GardenScanReconstructionSummary,
  type GardenScanSummary,
} from '../native/garden-scan';
import { StatusMessage } from './StatusMessage';
import './SmartScanCard.css';

function capabilityLabel(value: boolean): string {
  return value ? 'Klar' : 'Ikke tilgængelig';
}

function durationLabel(durationMs: number): string {
  const seconds = Math.max(0, Math.round(durationMs / 1000));
  if (seconds < 60) return `${seconds} sek.`;
  return `${Math.floor(seconds / 60)} min. ${seconds % 60} sek.`;
}

function semanticSummary(samples: Record<string, number>): string {
  return Object.entries(samples)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([label, count]) => `${label.toLowerCase()} ${count.toLocaleString('da-DK')}`)
    .join(' · ');
}

export function SmartScanCard() {
  const [capabilities, setCapabilities] = useState<GardenScanCapabilities | null>(null);
  const [lastScan, setLastScan] = useState<GardenScanSummary | null>(null);
  const [reconstruction, setReconstruction] = useState<GardenScanReconstructionSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function refresh() {
    try {
      setCapabilities(await getGardenScanCapabilities());
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Telefonens scan-funktioner kunne ikke kontrolleres.');
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function allowCamera() {
    setBusy(true);
    setMessage('Beder om kameraadgang…');
    try {
      const next = await requestGardenScanPermission();
      setCapabilities(next);
      setMessage('Kameraadgang er klar. Telefonens AR-funktioner er nu kontrolleret.');
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Kameraadgang blev ikke givet.');
    } finally {
      setBusy(false);
    }
  }

  async function prepareArCore() {
    setBusy(true);
    setMessage('Klargør Google Play Services for AR…');
    try {
      const result = await ensureGardenScanArCore();
      setMessage(result.status === 'INSTALLED'
        ? 'ARCore er klar.'
        : 'Android har åbnet installationen af Google Play Services for AR.');
      await refresh();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'ARCore kunne ikke klargøres.');
    } finally {
      setBusy(false);
    }
  }

  async function scanGarden() {
    setBusy(true);
    setMessage('Åbner den native scanner…');
    try {
      const summary = await startGardenScan();
      setLastScan(summary);
      setReconstruction(null);
      setMessage(`Scan gemt: ${summary.keyframes} keyframes på ${durationLabel(summary.durationMs)}.`);
      await refresh();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Scanningen kunne ikke gennemføres.');
    } finally {
      setBusy(false);
    }
  }

  async function reconstructLatest() {
    setBusy(true);
    setMessage('Bygger den rumlige model fra Depth, pose og semantik…');
    try {
      const result = await reconstructLatestGardenScan();
      setReconstruction(result);
      setMessage(`4.2C.1 færdig: ${result.clusters} spatial clusters fra ${result.voxels.toLocaleString('da-DK')} voxels.`);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Den seneste scanning kunne ikke rekonstrueres.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mapping-assistant-card smart-scan-card">
      <div className="smart-scan-heading">
        <div>
          <p className="eyebrow">Smart Garden Scan · Android</p>
          <h2>Gå rundt. Have Guide bygger haven.</h2>
          <p>Scanneroplevelsen bruger ARCore til løbende tracking og vælger selv de keyframes, som analyselaget kan fusionere til en rumlig model.</p>
        </div>
        <span className="smart-scan-icon" aria-hidden="true">⌾</span>
      </div>

      {!capabilities && !message && <p className="field-help">Kontrollerer scan-muligheder…</p>}

      {capabilities?.native ? (
        <>
          <div className="smart-scan-capabilities">
            <div className={capabilities.cameraPermissionGranted ? 'ready' : 'optional'}>
              <span>Kamera</span><strong>{capabilities.cameraPermissionGranted ? 'Tilladt' : 'Mangler tilladelse'}</strong>
            </div>
            <div className={capabilities.arCoreSupported ? 'ready' : 'missing'}>
              <span>ARCore</span><strong>{capabilityLabel(capabilities.arCoreSupported)}</strong>
            </div>
            <div className={capabilities.depthSupported ? 'ready' : 'optional'}>
              <span>Dybde</span><strong>{capabilities.cameraPermissionGranted ? capabilityLabel(capabilities.depthSupported) : 'Kontrolleres efter kamera'}</strong>
            </div>
            <div className={capabilities.sceneSemanticsSupported ? 'ready' : 'optional'}>
              <span>Scene-forståelse</span><strong>{capabilities.cameraPermissionGranted ? capabilityLabel(capabilities.sceneSemanticsSupported) : 'Kontrolleres efter kamera'}</strong>
            </div>
          </div>

          {!capabilities.cameraPermissionGranted && capabilities.arCoreSupported && (
            <button type="button" className="primary-button" disabled={busy} onClick={() => void allowCamera()}>
              {busy ? 'Klargør…' : 'Tillad kamera og kontrollér Smart Scan'}
            </button>
          )}

          {capabilities.cameraPermissionGranted && capabilities.arCoreSupported && !capabilities.arCoreInstalled && (
            <button type="button" className="primary-button" disabled={busy} onClick={() => void prepareArCore()}>
              {busy ? 'Klargør…' : 'Installer/klargør ARCore'}
            </button>
          )}

          {capabilities.cameraPermissionGranted && capabilities.arCoreInstalled && (
            <div className="smart-scan-actions">
              <button type="button" className="primary-button" disabled={busy} onClick={() => void scanGarden()}>
                {busy ? 'Arbejder…' : 'Scan haven'}
              </button>
              <button type="button" className="smart-scan-secondary-button" disabled={busy} onClick={() => void reconstructLatest()}>
                {busy ? 'Arbejder…' : 'Analyser seneste scan'}
              </button>
              <p className="field-help">Analysen kører lokalt på telefonen og bygger først geometri og grove ARCore-klasser. RGB/AI-klassifikation kommer ovenpå senere.</p>
            </div>
          )}

          {lastScan && (
            <div className="smart-scan-next">
              <strong>Seneste scan er gemt</strong>
              <span>
                {lastScan.keyframes} keyframes · {durationLabel(lastScan.durationMs)} · Depth {lastScan.depthEnabled ? 'til' : 'fra'} · Semantik {lastScan.sceneSemanticsEnabled ? 'til' : 'fra'} · GPS {lastScan.locationCaptured ? 'gemt' : 'ikke gemt'}
              </span>
            </div>
          )}

          {reconstruction && (
            <div className="smart-scan-next">
              <strong>4.2C.1 · Spatial reconstruction</strong>
              <span>
                {reconstruction.keyframesProcessed} keyframes · {reconstruction.acceptedSamples.toLocaleString('da-DK')} brugbare depth/semantic samples · {reconstruction.voxels.toLocaleString('da-DK')} voxels · {reconstruction.clusters} clusters
              </span>
              <span>{semanticSummary(reconstruction.semanticSamples)}</span>
              {reconstruction.coordinateFrame === 'legacy-arcore-world' && (
                <span>Den eksisterende testscan bruger 4.2B's oprindelige ARCore-koordinater. Resultatet er egnet til første fusionstest, men betragtes endnu ikke som landmålingspræcist.</span>
              )}
            </div>
          )}

          {!capabilities.arCoreSupported && (
            <StatusMessage kind="error">Denne telefon understøtter ikke ARCore. Have Guide kan stadig bruges med luftfoto og manuel korrektion.</StatusMessage>
          )}
        </>
      ) : capabilities ? (
        <div className="smart-scan-web-note">
          <strong>Smart Scan ligger i Android-appen</strong>
          <span>PWA'en beholder luftfoto og manuel redigering som fallback. Den kontinuerlige AR-scanner kræver Android-appen.</span>
        </div>
      ) : null}

      {message && <StatusMessage>{message}</StatusMessage>}
    </section>
  );
}
