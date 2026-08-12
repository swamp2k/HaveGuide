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

export function SmartScanPreview({ understanding }: SmartScanPreviewProps) {
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

  function mapPoint(point: [number, number]): string {
    const x = pad + ((point[0] - bounds.minX) / rangeX) * usable;
    const y = pad + ((bounds.maxZ - point[1]) / rangeZ) * usable;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }

  return (
    <div className="smart-scan-preview">
      <div className="smart-scan-preview-heading">
        <div>
          <strong>4.2C.3 · Refined garden footprints</strong>
          <span>{understanding.features} kandidater · {footprintCount} voxel-footprints · {understanding.reviewRequired} kræver review{suppressed > 0 ? ` · ${suppressed} generiske dubletter fjernet` : ''}</span>
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
          const footprint = feature.footprint && feature.footprint.length >= 3 ? feature.footprint.map(mapPoint).join(' ') : null;
          const title = `${typeLabel(feature.type)} · ${Math.round(feature.confidence * 100)}% · ${feature.samples.toLocaleString('da-DK')} samples${feature.footprintAreaM2 ? ` · ${feature.footprintAreaM2.toFixed(1)} m² footprint` : ''}`;
          return (
            <g key={feature.id} className={`smart-scan-feature smart-scan-feature-${cssType} smart-scan-layer-${feature.layer ?? 'object'}${feature.reviewRequired ? ' review' : ''}`}>
              {footprint ? (
                <polygon points={footprint}>
                  <title>{title}</title>
                </polygon>
              ) : (
                <rect x={x} y={y} width={width} height={height} rx={Math.min(3, Math.min(width, height) / 3)}>
                  <title>{title}</title>
                </rect>
              )}
            </g>
          );
        })}
      </svg>

      <div className="smart-scan-preview-legend">
        {counts.map(([type, count]) => <span key={type}><i className={`smart-scan-legend-swatch smart-scan-feature-${typeClass(type)}`} />{typeLabel(type)} {count}</span>)}
      </div>
      <p className="field-help">Polygonerne følger nu de observerede voxel-footprints i stedet for kun cluster-bokse. Stiplede områder er stadig usikre. Kortet er scannerens lokale X/Z-plan og er endnu ikke georefereret til luftfoto.</p>
    </div>
  );
}
