# Milestone 2 – Kortlægning og forståelse

Milestone 2 udvider den vedvarende havemodel uden at ændre data fra Milestone 1.

## Brugerflow

Den nye fane **Kortlæg** samler:

- en seks-trins guidet havevandring
- planter med flere billeder og angivelse af plantedelen på billedet
- observationer, problemzoner og mobil GPS-position
- sol, fugt, jord, hældning, vind og vedligeholdelse
- et filtrerbart oversigtskort
- komplethedsstatus og konkrete mangler
- bekræftelse eller afvisning af planteforslag
- sammenlægning af sandsynlige plantedubletter

## Plantegenkendelse

Plantegenkendelse ligger bag `PlantIdentificationProvider`. Første adapter er Pl@ntNet. Appen fungerer fuldt manuelt uden API-nøgle.

Aktivér provider på den deployede Worker:

```bash
npx wrangler secret put PLANTNET_API_KEY
npm run deploy
```

`PLANTNET_PROJECT` er valgfri. Uden en værdi bruges projektet `all`.

API-nøglen sendes aldrig til klienten. Billeder læses fra den private R2-binding og sendes server-side til provideren. Højst fem billeder bruges pr. forespørgsel. Resultater gemmes som forslag og ændrer først planten, når brugeren accepterer et forslag.

## Offentlige kort- og terrændata

`GardenDataProvider` er etableret som integrationsgrænse. Milestone 2 viser datakilders status, men aktiverer ikke en national leverandør endnu. Det undgår at binde produktet til en API, før pilotland, licens, datakvalitet og adresseflow er afklaret.

## Migration

```bash
npx wrangler d1 migrations apply DB --remote
```

Migrationen er additiv og opretter `garden_walks`, `observations`, `plants`, `plant_media`, `identification_requests`, `identification_suggestions` og `garden_assessments`.
