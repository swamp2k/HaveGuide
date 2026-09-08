import { z } from 'zod';
import type { AiAnalysisPayload, AnalysisMode, AreaProfile, PlantIdentification } from '../../shared/types';
import { knownPlantsForAnalysis } from '../../shared/plants';
import { describeProfile } from '../../shared/profile';
import { filterRedundantFollowUpQuestions } from './follow-up-questions';

const responseSchema = z.object({
  summary: z.string(),
  observations: z.array(z.string()).max(12),
  recommendations: z.array(z.string()).max(12),
  cautions: z.array(z.string()).max(8),
  followUpQuestions: z.array(z.string()).max(6),
});

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunk, bytes.length)));
  }
  return btoa(binary);
}

function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first >= 0 && last > first) return JSON.parse(trimmed.slice(first, last + 1));
    throw new Error('AI-svaret kunne ikke læses som JSON.');
  }
}

function modeInstruction(mode: AnalysisMode): string {
  switch (mode) {
    case 'overview':
      return 'Lav en nøgtern analyse af området: hvad kan du faktisk se, hvad er usikkert, og hvilke forhold er værd at være opmærksom på.';
    case 'ideas':
      return 'Foreslå konkrete, realistiske ændringer og planter, som matcher de angivne forhold og mål. Prioritér få gode forslag frem for en lang liste.';
    case 'problem':
      return 'Hjælp med at undersøge problemet brugeren beskriver. Skeln tydeligt mellem observation, sandsynlig forklaring og hvad der bør undersøges nærmere.';
  }
}

export class AnthropicGardenProvider {
  constructor(private readonly apiKey: string, readonly model: string) {}

  async analyze(input: {
    image: { bytes: ArrayBuffer; contentType: string };
    profile: AreaProfile;
    mode: AnalysisMode;
    question: string;
    identifications: PlantIdentification[];
  }): Promise<AiAnalysisPayload> {
    const mediaType = input.image.contentType;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mediaType)) {
      throw new Error('Billedformatet kan ikke analyseres af AI. Brug JPEG, PNG eller WebP.');
    }

    const knownPlants = knownPlantsForAnalysis(input.identifications);

    const prompt = `Du er HaveGuide, en dansk haveassistent. Du analyserer ét konkret foto af et haveområde.

Regler:
- Svar på dansk.
- Opfind ikke ting, som ikke kan ses eller udledes rimeligt.
- Skeln mellem det, der ses på billedet, og det brugeren selv har angivet om området.
- Hvis noget er usikkert, sig det direkte.
- Ved planteforslag skal lys, fugt, jord og dræn vægte højere end æstetik.
- Undgå at anbefale pesticider som standardløsning.
- Giv ikke falsk præcision om jordtype, pH eller planteart ud fra et oversigtsfoto.

Opgave:
${modeInstruction(input.mode)}

${describeProfile(input.profile)}

Sådan bruger du brugerens oplyste forhold:
- Spørg IKKE om oplysninger, brugeren allerede har oplyst ovenfor.
- Behandl udfyldte forhold som kendte brugerdata, ikke som noget du skal bekræfte.
- Forsøg ikke at genbestemme udfyldte forhold ud fra fotoet.
- Stil kun opfølgende spørgsmål om felter, der står som "Ikke oplyst" eller "Ved ikke".
- Hvis Sol, Fugt, Jord og Dræn er udfyldt, må followUpQuestions ikke spørge om dem igen.
- Hvis Ønsker er udfyldt, må followUpQuestions ikke spørge generelt om, hvad formålet med bedet er.
- Hvis Noter allerede besvarer et spørgsmål, så stil ikke det spørgsmål igen.
- Har du ingen reelle huller at spørge om, så returnér en tom followUpQuestions-liste.

Planter brugeren har markeret i området (kan være tom). "label" og "note" er brugerens egne ord om,
hvor planten står. "commonName"/"scientificName" kommer fra en billedbaseret planteopslagstjeneste
(PlantNet) og kan være forkerte — især ved lav confidence:
${JSON.stringify(knownPlants, null, 2)}

Om de markerede planter:
- Behandl dem som brugerens kontekst, ikke som facit.
- Hold dem adskilt fra det, du selv kan se på oversigtsfotoet.
- Ved confidence under ca. 0,5 skal du omtale arten som usikker eller lade den ligge.
- Brug brugerens label/note, når du henviser til en bestemt plante, så hun kan genkende den.

Brugerens ekstra spørgsmål:
${input.question || '(intet)'}

Returnér KUN valid JSON i præcis denne struktur:
{
  "summary": "kort samlet vurdering",
  "observations": ["..."],
  "recommendations": ["..."],
  "cautions": ["..."],
  "followUpQuestions": ["..."]
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1800,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: bytesToBase64(new Uint8Array(input.image.bytes)),
              },
            },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `Anthropic svarede med status ${response.status}${detail ? `: ${detail.slice(0, 240)}` : ''}`,
      );
    }

    const body = await response.json() as { content?: Array<{ type?: string; text?: string }> };
    const answer = body.content?.find((item) => item.type === 'text')?.text;
    if (!answer) throw new Error('Anthropic returnerede ikke et tekstsvar.');
    const payload = responseSchema.parse(extractJson(answer));
    return {
      ...payload,
      followUpQuestions: filterRedundantFollowUpQuestions(payload.followUpQuestions, input.profile),
    };
  }
}
