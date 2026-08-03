import type { PlantOrgan } from '../../shared/types';

export interface IdentificationImage { blob: Blob; filename: string; organ: PlantOrgan; }
export interface PlantIdentificationResult {
  scientificName: string;
  commonName: string;
  score: number;
  gbifId: string | null;
  raw: unknown;
}
export interface PlantIdentificationProvider {
  readonly id: string;
  identify(images: IdentificationImage[]): Promise<PlantIdentificationResult[]>;
}

interface PlantNetSpecies {
  scientificNameWithoutAuthor?: string;
  scientificName?: string;
  commonNames?: string[];
  gbif?: { id?: string | number };
}
interface PlantNetResult { score?: number; species?: PlantNetSpecies; }
interface PlantNetResponse { results?: PlantNetResult[]; }

const ORGAN_MAP: Record<PlantOrgan, string> = {
  auto: 'auto', leaf: 'leaf', flower: 'flower', fruit: 'fruit', bark: 'bark', habit: 'habit', other: 'other',
};

export class PlantNetProvider implements PlantIdentificationProvider {
  readonly id = 'plantnet';
  constructor(private readonly apiKey: string, private readonly project = 'all') {}

  async identify(images: IdentificationImage[]): Promise<PlantIdentificationResult[]> {
    const selected = images.slice(0, 5);
    if (selected.length === 0) throw new Error('Der er ingen plantebilleder at analysere.');
    const form = new FormData();
    for (const image of selected) {
      form.append('images', image.blob, image.filename);
      form.append('organs', ORGAN_MAP[image.organ]);
    }
    const url = new URL(`https://my-api.plantnet.org/v2/identify/${encodeURIComponent(this.project)}`);
    url.searchParams.set('api-key', this.apiKey);
    url.searchParams.set('include-related-images', 'false');
    url.searchParams.set('lang', 'da');
    const response = await fetch(url, { method: 'POST', body: form });
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`Plantegenkendelsen svarede med status ${response.status}.`);
    const body = await response.json() as PlantNetResponse;
    return (body.results ?? []).slice(0, 5).flatMap((result) => {
      const scientificName = result.species?.scientificNameWithoutAuthor ?? result.species?.scientificName ?? '';
      if (!scientificName) return [];
      return [{
        scientificName,
        commonName: result.species?.commonNames?.[0] ?? '',
        score: Math.max(0, Math.min(1, result.score ?? 0)),
        gbifId: result.species?.gbif?.id == null ? null : String(result.species.gbif.id),
        raw: result,
      }];
    });
  }
}
