import type { PlantOrgan, PlantSuggestion } from '../../shared/types';

interface PlantNetSpecies {
  scientificNameWithoutAuthor?: string;
  scientificName?: string;
  commonNames?: string[];
  gbif?: { id?: string | number };
}
interface PlantNetResult { score?: number; species?: PlantNetSpecies; }
interface PlantNetResponse { results?: PlantNetResult[]; }

const ORGAN_MAP: Record<PlantOrgan, string> = {
  auto: 'auto',
  leaf: 'leaf',
  flower: 'flower',
  fruit: 'fruit',
  bark: 'bark',
  habit: 'habit',
  other: 'other',
};

export class PlantNetProvider {
  constructor(private readonly apiKey: string, private readonly project = 'all') {}

  async identify(input: { blob: Blob; filename: string; organ: PlantOrgan }): Promise<PlantSuggestion[]> {
    const form = new FormData();
    form.append('images', input.blob, input.filename);
    form.append('organs', ORGAN_MAP[input.organ]);

    const url = new URL(`https://my-api.plantnet.org/v2/identify/${encodeURIComponent(this.project)}`);
    url.searchParams.set('api-key', this.apiKey);
    url.searchParams.set('include-related-images', 'false');
    url.searchParams.set('lang', 'da');

    const response = await fetch(url, { method: 'POST', body: form });
    if (!response.ok) throw new Error(`PlantNet svarede med status ${response.status}.`);
    const body = (await response.json()) as PlantNetResponse;
    return (body.results ?? []).slice(0, 5).flatMap((result) => {
      const scientificName = result.species?.scientificNameWithoutAuthor ?? result.species?.scientificName ?? '';
      if (!scientificName) return [];
      return [{
        scientificName,
        commonName: result.species?.commonNames?.[0] ?? '',
        score: Math.max(0, Math.min(1, result.score ?? 0)),
        gbifId: result.species?.gbif?.id == null ? null : String(result.species.gbif.id),
      }];
    });
  }
}
