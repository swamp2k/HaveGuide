import { useMemo, useState } from 'react';
import type { GardenScanDraftFeature, GardenScanUnderstandingSummary } from '../native/garden-scan';
import { smartScanApi, type SmartScanStoredSession } from '../smart-scan-api';

interface SmartScanPreviewProps {
  gardenId: string;
  understanding: GardenScanUnderstandingSummary;
  storedSession: SmartScanStoredSession;
  onStoredSession: (session: SmartScanStoredSession) => void;
}

const typeLabels: Record<string, string> = {
  tree: 'Træ',
  bush: 'Busk',
  hedge: 'Hæk',
  lawn: 'Græs',
  bed: 'Bed',
  path: 'Sti/trin',
  patio: 'Terrasse',
  building: 'Bygning',
  fence: 'Hegn',
  play_equipment: 'Legeredskab',
  water: 'Vand',
  terrain: 'Terræn',
  object: 'Objekt',
  vegetation: 'Vegetation',
  structure: 'Struktur',
  unknown: 'Ukendt',
};

function typeLabel(type: string): string {
  return typeLabels[type] ?? type.replaceAll('_', ' ');
}

function typeClass(type: string): string {
  return type.replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
}

function layerOrder(feature: GardenScanDraftFeature): number {
  switch (feature.layer) {
    case 'surface': return 0;
    case 'vegetation': return 1;
    case 'structure': return 2;
    default: return 3;
  }
}

function featureBounds(features: GardenScanDraftFeature[]) {
  const minX = Math.min(...features.map((feature) => feature.bounds.min[0]));
  const maxX = Math.max(...features.map((feature) => feature.bounds.max[0]));
  const minZ = Math.min(...features.map((feature) => feature.bounds.min[2]));
  const maxZ = Math.max(...features.map((feature) => feature.bounds.max[2]));
  return { minX, maxX, minZ, maxZ };
}

export function SmartScanPreview({ gardenId, understanding, storedSession, onStoredSession }: SmartScanPreviewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const reviewMap = useMemo(
    () => new Map(storedSession.reviews.map((review) => [review.featureId, review])),
    [storedSession.reviews],
  );
  const features = [...understanding.draftFeatures]
    .sort((left, right) => layerOrder(left) - layerOrder(right) || right.samples - left.samples)
    .slice(0, 64);
  if (features.length === 0) return null;

  const bounds = featureBounds(features);
  const rangeX = Math.max(1, bounds.maxX - bounds.minX);
  const rangeZ = Math.max(1, bounds.maxZ - bounds.minZ);
  const pad = 5;
  const usable = 100 - pad * 2;
  const counts = Object.entries(understanding.typeCounts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8);
  const footprintCount = understanding.featuresWithVoxelFootprints ?? features.filter((feature) => (feature.footprint?.length ?? 0) >= 3).length;
  const suppressed = understanding.suppressedGenericDuplicates ?? 0;
  const reviewedCount = storedSession.reviews.filter((review) => review.decision !== 'pending').length;
  const acceptedCount = storedSession.reviews.filter((review) => review.decision === 'accepted').length;
  const rejectedCount = storedSession.reviews.filter((review) => review.decision === 'rejected').length;
  const selected = selectedId ? features.find((feature) => feature.id === selectedId) ?? null : null;
  const selectedReview = selected ? reviewMap.get(selected.id) : undefined;
  const effectiveSelectedType = selectedType || selectedReview?.typeOverride || selected?.type || 'unknown';

  function mapPoint(point: [number, number]): string {
    const x = pad + ((point[0] - bounds.minX) / rangeX) * usable;
    const y = pad + ((bounds.maxZ - point[1]) / rangeZ) * usable;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }

  function chooseFeature(feature: GardenScanDraftFeature) {
    const review = reviewMap.get(feature.id);
    setSelectedId(feature.id);
    setSelectedType(review?.typeOverride || feature.type);
    setMessage('');
  }

  async function saveDecision(decision: 'pending' | 'accepted' | 'rejected') {
    if (!selected) return;
    setSaving(true);
    setMessage('Gemmer review…');
    try {
      const response = await smartScanApi.reviewFeature(gardenId, storedSession.sessionId, selected.id, {
        decision,
        typeOverride: effectiveSelectedType === selected.type ? null : effectiveSelectedType,
      });
      onStoredSession(response.session);
      setMessage(decision === 'accepted' ? 'Området er godkendt.' : decision === 'rejected' ? 'Området er afvist.' : 'Review er nulstillet.');
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Reviewet kunne ikke gemmes.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="smart-scan-preview">
      <div className="smart-scan-preview-heading">
        <div>
          <strong>4.2C.4 · Review garden model</strong>
          <span>{understanding.features} kandidater · {footprintCount} voxel-footprints · {reviewedCount}/{features.length} reviewet · {acceptedCount} godkendt · {rejectedCount} afvist{suppressed > 0 ? ` · ${suppressed} dubletter fjernet` : ''}</span>
        </div>
        <span className={`smart-scan-preview-badge ${storedSession.reviewStatus}`}>{storedSession.reviewStatus === 'reviewed' ? 'Reviewet' : 'Top-down'}</span>
      </div>

      <svg className="smart-scan-preview-map" viewBox="0 0 100 100" role="img" aria-label="Klikbar top-down rekonstruktion af haven">
        <rect className="smart-scan-preview-ground" x="1" y="1" width="98" height="98" rx="5" />
        {features.map((feature) => {
          const review = reviewMap.get(feature.id);
          const effectiveType = review?.typeOverride || feature.type;
          const x = pad + ((feature.bounds.min[0] - bounds.minX) / rangeX) * usable;
          const y = pad + ((bounds.maxZ - feature.bounds.max[2]) / rangeZ) * usable;
          const width = Math.max(1.5, ((feature.bounds.max[0] - feature.bounds.min[0]) / rangeX) * usable);
          const height = Math.max(1.5, ((feature.bounds.max[2] - feature.bounds.min[2]) / rangeZ) * usable);
          const cssType = typeClass(effectiveType);
          const footprintSource = review?.footprint && review.footprint.length >= 3 ? review.footprint : feature.footprint;
          const footprint = footprintSource && footprintSource.length >= 3 ? footprintSource.map(mapPoint).join(' ') : null;
          const title = `${typeLabel(effectiveType)} · ${Math.round(feature.confidence * 100)}% · ${feature.samples.toLocaleString('da-DK')} samples`;
          return (
            <g
              key={feature.id}
              className={`smart-scan-feature smart-scan-feature-${cssType} smart-scan-layer-${feature.layer ?? 'object'}${feature.reviewRequired ? ' review' : ''}${selectedId === feature.id ? ' selected' : ''}${review?.decision ? ` decision-${review.decision}` : ''}`}
              onClick={() => chooseFeature(feature)}
              onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') chooseFeature(feature); }}
              tabIndex={0}
              role="button"
              aria-label={`${typeLabel(effectiveType)}, ${review?.decision === 'accepted' ? 'godkendt' : review?.decision === 'rejected' ? 'afvist' : 'ikke reviewet'}`}
            >
              {footprint ? (
                <polygon points={footprint}><title>{title}</title></polygon>
              ) : (
                <rect x={x} y={y} width={width} height={height} rx={Math.min(3, Math.min(width, height) / 3)}><title>{title}</title></rect>
              )}
            </g>
          );
        })}
      </svg>

      <div className="smart-scan-preview-legend">
        {counts.map(([type, count]) => <span key={type}><i className={`smart-scan-legend-swatch smart-scan-feature-${typeClass(type)}`} />{typeLabel(type)} {count}</span>)}
      </div>

      {selected ? (
        <div className="smart-scan-review-panel">
          <div className="smart-scan-review-title">
            <div><strong>{typeLabel(selectedReview?.typeOverride || selected.type)}</strong><span>{Math.round(selected.confidence * 100)}% confidence · {selected.samples.toLocaleString('da-DK')} samples</span></div>
            <span>{selectedReview?.decision === 'accepted' ? '✓ Godkendt' : selectedReview?.decision === 'rejected' ? '× Afvist' : 'Kræver valg'}</span>
          </div>
          <label>
            Hvad er området?
            <select value={effectiveSelectedType} onChange={(event) => setSelectedType(event.target.value)} disabled={saving}>
              {Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <div className="smart-scan-review-actions">
            <button type="button" className="primary-button" disabled={saving} onClick={() => void saveDecision('accepted')}>
              {effectiveSelectedType === selected.type ? 'Godkend' : 'Godkend med rettelse'}
            </button>
            <button type="button" className="smart-scan-secondary-button" disabled={saving} onClick={() => void saveDecision('rejected')}>Afvis område</button>
            {selectedReview?.decision && selectedReview.decision !== 'pending' && (
              <button type="button" className="smart-scan-tertiary-button" disabled={saving} onClick={() => void saveDecision('pending')}>Fortryd review</button>
            )}
          </div>
          {message && <p className="field-help">{message}</p>}
        </div>
      ) : (
        <p className="field-help smart-scan-review-hint">Tryk på et område i kortet for at kontrollere typen, godkende det eller afvise det.</p>
      )}

      <p className="field-help">Reviewet gemmes på haven og overlever app-genstart. Geometrien er stadig scannerens lokale X/Z-plan; georeferering til luftfoto kommer senere.</p>
    </div>
  );
}
