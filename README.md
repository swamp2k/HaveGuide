# HaveGuide

HaveGuide er genstartet som en foto-først haveassistent. Ingen kort, geofelter eller opmåling: hvert haveområde tager udgangspunkt i et eller flere fotos og en enkel beskrivelse af vækstforholdene.

## Produktidé

1. Opret et område og tag/vælg et foto.
2. Flere fotos kan samles **lodret** i browseren til ét oversigtsfoto.
3. Angiv sol, fugt, jord og dræn. Vind, mål og noter er valgfrie ekstra oplysninger.
4. Brug AI til at analysere området eller få forslag, der tager forholdene med i vurderingen.
5. Tag et separat nærfoto, når en plante skal identificeres med PlantNet.

AI-forslag er låst, indtil sol, fugt, jord og dræn er angivet. Det er bevidst: et flot foto er ikke nok til at vælge planter fornuftigt.

## Hvad der ikke er med

- Intet kort eller GPS-layout.
- Ingen binding mellem fotos og geo-grids.
- Ingen AR/3D-scanning.
- Ingen automatisk “gæt jordtype fra foto”.
- Ingen billedredigering endnu. Anthropic kan analysere billeder, men genererer ikke et redigeret foto. Billedredigering skal have sin egen provider senere.

## Stack

- React + Vite
- Cloudflare Worker (Hono)
- D1 til metadata/analyser
- R2 til billeder
- PlantNet til planteidentifikation
- Anthropic Messages API til visuel haveanalyse
- Capacitor kan bruges til Android-shell, men den genererede Android-mappe er ikke committed

## Cloudflare bindings

Eksisterende ressourcer genbruges:

- D1 binding: `DB` (`haveguide`)
- R2 binding: `MEDIA` (`haveguide`)
- Secret: `PLANTNET_API_KEY`
- Secret: `ANTHROPIC_API_KEY`
- Text var: `ANTHROPIC_MODEL` (default i `wrangler.jsonc`: `claude-sonnet-5`)

`DATAFORDELER_API_KEY` bruges ikke længere af den nye app og kan fjernes fra Worker-konfigurationen senere, når den gamle løsning er helt udfaset.

## Database

Den nye kode bruger `*_v2`-tabeller fra migration `0010_photo_first_rebuild.sql`. Den migration opretter også auth-tabeller med `IF NOT EXISTS`, så:

- eksisterende brugere/sessions kan fortsætte,
- gamle have-/geo-tabeller bliver liggende men bruges ikke,
- en helt frisk D1 kan startes direkte fra den nye migration.

Der slettes **ikke** automatisk gamle D1-data eller R2-filer i denne første rebuild.

## Udvikling

```bash
npm install
npm run db:migrate:local
npm run dev
```

Før deployment:

```bash
npm run check
npm run db:migrate:remote
npm run deploy
```

## Sikkerhed / dataflow

Oversigtsfotos sendes kun til Anthropic, når brugeren aktivt starter en AI-analyse. Plantenærfotos sendes kun til PlantNet, når brugeren aktivt vælger plantegenkendelse. API-nøglerne ligger kun som Worker-secrets og eksponeres ikke til klienten.
