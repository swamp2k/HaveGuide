import { useEffect, useState } from 'react';
import type { GardenDetail } from '../../shared/types';
import { runtimeUrl } from '../runtime-url';
import { StatusMessage } from './StatusMessage';

interface Props {
  garden: GardenDetail;
  onGardenChanged: (garden: GardenDetail) => void;
}

type Status = {
  available: boolean;
  sessionId?: string;
  alignmentStatus?: 'unplaced' | 'draft' | 'aligned';
  accepted?: number;
  total?: number;
};

type Summary = {
  promoted: number;
  skippedBoundary: number;
  skippedMissing: number;
};

async function read<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error || 'Forespørgslen mislykkedes.');
  return body;
}

export function SmartScanPublishCard({ garden, onGardenChanged }: Props) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function refresh() {
    const response = await fetch(runtimeUrl(`/api/gardens/${garden.id}/smart-scan/promotion-status`), { credentials: 'include' });
    setStatus(await read<Status>(response));
  }

  useEffect(() => { void refresh().catch(() => setMessage('Smart Scan-status kunne ikke hentes.')); }, [garden.id]);

  async function publish() {
    if (!status?.sessionId) return;
    setBusy(true);
    setMessage('Gemmer godkendte scan-områder i Min have…');
    try {
      const response = await fetch(runtimeUrl(`/api/gardens/${garden.id}/smart-scan/sessions/${encodeURIComponent(status.sessionId)}/promote`), { method: 'POST', credentials: 'include' });
      const result = await read<{ garden: GardenDetail; summary: Summary }>(response);
      onGardenChanged(result.garden);
      const skipped = result.summary.skippedBoundary + result.summary.skippedMissing;
      setMessage(`Havekort opdateret: ${result.summary.promoted} områder synkroniseret${skipped ? ` · ${skipped} sprunget over` : ''}.`);
      await refresh();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Områderne kunne ikke gemmes.');
    } finally {
      setBusy(false);
    }
  }

  if (status && !status.available) return null;
  const accepted = status?.accepted ?? 0;
  const ready = status?.alignmentStatus === 'aligned' && accepted > 0;

  return (
    <section className="mapping-assistant-card smart-scan-publish-card">
      <p className="eyebrow">4.2C.8 · Gem den forståede have</p>
      <h2>Fra scan til Min have</h2>
      <p className="field-help">Kun godkendte områder publiceres. Pending og afviste områder bliver i scan-kladden, og boundary-konflikter springes over.</p>
      {status?.available && <div className="smart-scan-next"><strong>{accepted} godkendte områder klar</strong><span>{status.total ?? 0} kandidater · placering {status.alignmentStatus === 'aligned' ? 'godkendt' : 'ikke godkendt'}</span></div>}
      <button type="button" className="primary-button" disabled={busy || !ready} onClick={() => void publish()}>{busy ? 'Gemmer…' : 'Gem godkendte områder i Min have'}</button>
      {status?.available && status.alignmentStatus !== 'aligned' && <p className="field-help">Godkend først scan-placeringen ovenfor.</p>}
      {status?.available && accepted === 0 && <p className="field-help">Godkend mindst ét område i review-kortet først.</p>}
      {message && <StatusMessage>{message}</StatusMessage>}
    </section>
  );
}
