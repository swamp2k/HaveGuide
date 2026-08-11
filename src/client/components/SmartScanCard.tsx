import { useEffect, useState } from 'react';
import {
  ensureGardenScanArCore,
  getGardenScanCapabilities,
  requestGardenScanPermission,
  type GardenScanCapabilities,
} from '../native/garden-scan';
import { StatusMessage } from './StatusMessage';
import './SmartScanCard.css';

function capabilityLabel(value: boolean): string {
  return value ? 'Klar' : 'Ikke tilgængelig';
}

export function SmartScanCard() {
  const [capabilities, setCapabilities] = useState<GardenScanCapabilities | null>(null);
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

  return (
    <section className="mapping-assistant-card smart-scan-card">
      <div className="smart-scan-heading">
        <div>
          <p className="eyebrow">Smart Garden Scan · Android</p>
          <h2>Gå rundt. Have Guide bygger haven.</h2>
          <p>Den nye scanner bliver hovedvejen til kortlægning: automatisk capture, rumlig tracking og maskinforståelse. Manuel tegning bliver korrektionsværktøjet.</p>
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
            <div className="smart-scan-next">
              <strong>Native scannerfundament er klar</strong>
              <span>Næste scannerlag bruger kontinuerlig AR-pose, automatiske keyframes, depth og semantik i samme gåtur.</span>
            </div>
          )}

          {!capabilities.arCoreSupported && (
            <StatusMessage kind="error">Denne telefon understøtter ikke ARCore. Have Guide kan stadig bruges med luftfoto og manuel korrektion.</StatusMessage>
          )}
        </>
      ) : capabilities ? (
        <div className="smart-scan-web-note">
          <strong>Smart Scan flytter til Android-appen</strong>
          <span>PWA'en beholder luftfoto og manuel redigering som fallback. Selve scanningen bygges native, så vi kan bruge ARCore frem for upræcis browser-GPS.</span>
        </div>
      ) : null}

      {message && <StatusMessage>{message}</StatusMessage>}
    </section>
  );
}
