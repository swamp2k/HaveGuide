import type { GardenScanDraftFeature, GardenScanUnderstandingSummary } from '../native/garden-scan';

interface SmartScanPreviewProps {
  understanding: GardenScanUnderstandingSummary;
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

function featureBounds(features: GardenScanDraftFeature[]) {
  const minX = Math.min(...features.map((feature) => feature.bounds.min[0]));
  const maxX = Math.max(...features.map((feature) => feature.bounds.max[0]));
  const minZ = Math.min(...features.map((feature) => feature.bounds.min[2]));
  const maxZ = Math.max(...features.map((feature) => feature.bounds.max[2]));
  return { minX, maxX, minZ, maxZ };
}

export function SmartScanPreview({ understanding }: SmartScanPreviewProps) {
  const features = [...understanding.draftFeatures]
    .sort((left, right) => right.samples - left.samples)
    .slice(0, 48);
  if (features.length === 0) return null;

  const bounds = featureBounds(features);
  const rangeX = Math.max(1, bounds.maxX - bounds.minX);
  const rangeZ = Math.max(1, bounds.maxZ - bounds.minZ);
  const pad = 5;
  const usable = 100 - pad * 2;
  const counts = Object.entries(understanding.typeCounts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8);

  return (
    <div className="smart-scan-preview">
      <div className="smart-scan-preview-heading">
        <div>
          <strong>4.2C.2 · Draft garden features</strong>
          <span>{understanding.features} kandidater · {understanding.visionClassifiedClusters} RGB-klassificerede clusters · {understanding.reviewRequired} kræver review</span>
        </div>
        <span className="smart-scan-preview-badge">Top-down</span>
      </div>

      <svg className="smart-scan-preview-map" viewBox="0 0 100 100" role="img" aria-label="Foreløbig top-down rekonstruktion af haven">
        <rect className="smart-scan-preview-ground" x="1" y="1" width="98" height="98" rx="5" />
        {features.map((feature) => {
          const x = pad + ((feature.bounds.min[0] - bounds.minX) / rangeX) * usable;
          const y = pad + ((bounds.maxZ - feature.bounds.max[2]) / rangeZ) * usable;
          const width = Math.max(1.5, ((feature.bounds.max[0] - feature.bounds.min[0]) / rangeX) * usable);
          const height = Math.max(1.5, ((feature.bounds.max[2] - feature.bounds.min[2]) / rangeZ) * usable);
          const cssType = typeClass(feature.type);
          return (
            <g key={feature.id} className={`smart-scan-feature smart-scan-feature-${cssType}${feature.reviewRequired ? ' review' : ''}`}>
              <rect x={x} y={y} width={width} height={height} rx={Math.min(3, Math.min(width, height) / 3)}>
                <title>{typeLabel(feature.type)} · {Math.round(feature.confidence * 100)}% · {feature.samples.toLocaleString('da-DK')} samples</title>
              </rect>
            </g>
          );
        })}
      </svg>

      <div className="smart-scan-preview-legend">
        {counts.map(([type, count]) => <span key={type}><i className={`smart-scan-legend-swatch smart-scan-feature-${typeClass(type)}`} />{typeLabel(type)} {count}</span>)}
      </div>
      <p className="field-help">Stiplede områder er stadig usikre. Kortet er scannerens lokale X/Z-plan og er endnu ikke georefereret til luftfoto.</p>
    </div>
  );
}
