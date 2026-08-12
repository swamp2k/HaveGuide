import { useEffect, useState } from 'react';
import { api } from '../api';
import {
  applyLatestGardenScanVisionClassifications,
  ensureGardenScanArCore,
  getGardenScanCapabilities,
  prepareLatestGardenScanVisionCandidates,
  reconstructLatestGardenScan,
  requestGardenScanPermission,
  startGardenScan,
  type GardenScanCapabilities,
  type GardenScanReconstructionSummary,
  type GardenScanSummary,
  type GardenScanUnderstandingSummary,
  type GardenScanVisionClassification,
} from '../native/garden-scan';
import { SmartScanPreview } from './SmartScanPreview';
import { StatusMessage } from './StatusMessage';
import './SmartScanCard.css';

interface SmartScanCardProps {
  gardenId: string;
}

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

export function SmartScanCard({ gardenId }: SmartScanCardProps) {
  const [capabilities, setCapabilities] = useState<GardenScanCapabilities | null>(null);
  const [lastScan, setLastScan] = useState<GardenScanSummary | null>(null);
  const [reconstruction, setReconstruction] = useState<GardenScanReconstructionSummary | null>(null);
  const [understanding, setUnderstanding] = useState<GardenScanUnderstandingSummary | null>(null);
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
      setUnderstanding(null);
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
      setUnderstanding(null);
      setMessage(`4.2C.1 færdig: ${result.clusters} spatial clusters fra ${result.voxels.toLocaleString('da-DK')} voxels.`);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Den seneste scanning kunne ikke rekonstrueres.');
    } finally {
      setBusy(false);
    }
  }

  async function understandLatest() {
    setBusy(true);
    setMessage('4.2C.3: rekonstruerer geometri og vælger RGB-udsnit…');
    try {
      const spatial = await reconstructLatestGardenScan();
      setReconstruction(spatial);
      const batch = await prepareLatestGardenScanVisionCandidates(20);

      let classifications: GardenScanVisionClassification[] = [];
      let visionFailed = false;
      if (batch.candidates.length > 0) {
        setMessage(`4.2C.3: analyserer ${batch.candidates.length} målrettede haveudsnit…`);
        try {
          const vision = await api.classifySmartScanCandidates(gardenId, batch.sessionId, batch.candidates);
          classifications = vision.classifications;
        } catch {
          visionFailed = true;
        }
      }

      setMessage('4.2C.3: fusionerer observationer og udleder voxel-footprints…');
      const result = await applyLatestGardenScanVisionClassifications(batch.sessionId, classifications);
      setUnderstanding(result);
      const footprintText = result.featuresWithVoxelFootprints == null ? '' : `, ${result.featuresWithVoxelFootprints} med voxel-footprint`;
      const suppressedText = result.suppressedGenericDuplicates ? `, ${result.suppressedGenericDuplicates} generiske dubletter fjernet` : '';
      setMessage(visionFailed
        ? `4.2C.3 byggede ${result.features} feature-kandidater${footprintText}. Cloudflare Vision svarede ikke, så RGB-klasser kan prøves igen senere.`
        : `4.2C.3 færdig: ${result.features} draft features${footprintText}${suppressedText}.`);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Objektforståelsen kunne ikke gennemføres.');
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
          <p>ARCore bygger geometrien. RGB-udsnit hjælper med klassifikation, og voxel-footprints omsætter de rå clusters til mere realistiske former i haven.</p>
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
                {busy ? 'Arbejder…' : 'Spatial rekonstruktion'}
              </button>
              <button type="button" className="smart-scan-secondary-button" disabled={busy} onClick={() => void understandLatest()}>
                {busy ? 'Arbejder…' : 'Forstå haven · 4.2C.3'}
              </button>
              <p className="field-help">Objektforståelsen sender kun små målrettede crops til Cloudflare Vision. Hele scan-sessionen, Depth og voxel-geometrien bliver på telefonen.</p>
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
                <span>Den eksisterende testscan bruger 4.2B's oprindelige ARCore-koordinater. Resultatet er egnet til fusionstest, men betragtes endnu ikke som landmålingspræcist.</span>
              )}
            </div>
          )}

          {understanding && <SmartScanPreview understanding={understanding} />}

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
