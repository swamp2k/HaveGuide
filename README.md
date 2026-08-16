# Have Guide

Have Guide er en mobil-first digital haveguide og en vedvarende **digital model af den virkelige have**.

Målet er, at brugeren kan gå ud i haven, kortlægge eller scanne den, registrere planter, områder, billeder og observationer og derefter bruge den samme model til forståelse, vedligeholdelse, problemløsning og senere redesign.

Projektets vigtigste princip er, at manuel kortlægning, Smart Garden Scan, billeder, planter, observationer og design ikke er separate datasiloer. De er forskellige måder at læse og skrive den samme have-model på.

## Hvor projektet er nu

Have Guide har i dag både web/PWA- og Android-fundament og omfatter blandt andet:

- dansk mobil-first React-grænseflade
- username/password-login med serverstyrede sessioner
- flere haver pr. bruger
- MapLibre-baseret kort og luftfoto-editor
- manuel oprettelse og redigering af havegrænser, bygninger, græs, bede, stier, træer, buske, hække m.m.
- private billeduploads til Cloudflare R2
- planter, observationer, guidet kortlægning og haveforståelse
- design-/planlægningsfundament oven på den vedvarende have-model
- Capacitor-baseret Android-app
- native ARCore Smart Garden Scan med Depth og Scene Semantics
- Cloudflare Workers AI til målrettet RGB-billedforståelse
- review, typekorrektion og footprint-redigering af scan-resultater
- georeferering af scan-modellen mod den kendte have og luftfoto
- boundary-kontrolleret global alignment og lokal AR-drift-korrektion
- promotion af godkendte Smart Scan-features til normale `garden_features` med provenance

## Produktmodel

Den centrale domænemodel er haven og dens features.

Eksempler på almindelige feature-typer:

- `garden_boundary`
- `building`
- `lawn`
- `bed`
- `slope`
- `terrace`
- `path`
- `tree`
- `shrub`
- `hedge`
- `other_area`
- `other_point`

Smart Scan-resultater lever først som reviewbare kladder i Smart Scan-tabellerne. De bliver ikke en del af den almindelige have-model, før de er reviewet, georefereret og eksplicit godkendt.

## Smart Garden Scan

Smart Garden Scan bruger flere datakilder med forskellige roller:

**ARCore fortæller primært hvor noget er.**

Android-pluginet indsamler blandt andet:

- kamera-keyframes
- ARCore tracking/pose
- kameraintrinsics
- Depth
- Scene Semantics og confidence
- valgfri grov GPS

**RGB-billedforståelse hjælper med hvad noget er.**

Kun et begrænset antal målrettede crops sendes til Workers AI. Resultater caches pr. scan, så almindelig gentagelse ikke starter ny billedanalyse.

**Fusionen bygger kandidaterne.**

Depth, pose og semantik rekonstrueres i et fælles lokalt 3D-koordinatsystem, voxeliseres og grupperes. RGB-resultater bruges derefter til at forbedre klassifikationen af de rumlige kandidater.

**Brugeren er sidste autoritet.**

Scan-kandidater kan accepteres, afvises, omklassificeres og få korrigeret footprint. AI og AR-data må foreslå; de må ikke lydløst overskrive brugerens have-model.

### Alignment og drift

ARCore-data behandles som metrisk nyttige, men ikke som landmålingspræcise.

Smart Scan-alignment består af:

1. global translation/rotation og en begrænset global scale
2. sammenligning mod den eksisterende `garden_boundary`
3. visualisering af konkrete boundary violations
4. reversibel, segmenteret lokal drift-korrektion når et rigid globalt fit ikke er tilstrækkeligt

Rå ARCore-geometri overskrives aldrig af drift-korrektionen.

Den kendte havegrænse fungerer som en fysisk constraint. Features, der stadig krydser den kendte grænse, må ikke automatisk publiceres som almindelige have-features.

## Teknisk stack

### Klient

- React 19
- TypeScript
- Vite
- MapLibre GL JS
- Zod
- PWA/web-app
- Capacitor 8

### Android / native

- Capacitor Android
- lokal plugin: `@have-guide/garden-scan`
- ARCore
- Depth API
- Scene Semantics
- native kamera-/scan-sessioner i app-private filer

### Backend

- Cloudflare Worker
- Hono
- Cloudflare D1
- Cloudflare R2
- Cloudflare Workers AI
- Cloudflare static assets

### Test og tooling

- Vitest
- Playwright
- ESLint
- Prettier
- Wrangler

## Repository-struktur

```text
src/client/                 React UI, kort, Smart Scan review/alignment og API-klienter
src/client/native/          Capacitor/native bridges
src/server/                 Cloudflare Worker, Hono routes, auth og repositories
src/shared/                 delte typer, constants, GeoJSON og Zod-schemas
native/garden-scan/         lokal Capacitor Android-plugin til ARCore scanning
android/                    genereret/konfigureret Capacitor Android-projekt
migrations/                 D1-migrationer
tests/                      unit- og end-to-end-tests
docs/                       arkitektur, sikkerhed og beslutninger
AGENTS.md                   arbejdsregler og arkitektoniske invariants for coding-agenter
```

## Lokal web-udvikling

Krav: Node.js 22+.

```bash
npm install
npm run typegen
npm run db:migrate:local
npm run dev
```

Ved første lokale opstart oprettes installationens første bruger gennem appen.

## Kvalitetskontrol

De vigtigste checks er:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Den samlede standard-check kan køres med:

```bash
npm run check
```

Ved ændringer i native/Android-kode bør web-build og Android-build begge valideres.

## Android-build

Efter checkout eller ændringer i web/native integration:

```bash
npm install
npm run native:sync:android

cd android
./gradlew assembleDebug
```

Debug-APK findes typisk her:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Installation på en tilsluttet Android-enhed:

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

`native:sync:android` kører web-build før Capacitor sync. Hvis TypeScript/build fejler, bliver de nye web-assets derfor ikke synced til Android, selv om en efterfølgende Gradle-build isoleret set kan være grøn.

## Cloudflare

Den aktuelle deployment bruger:

- Worker: `have-guide`
- D1 binding: `DB`
- D1 database: `haveguide`
- R2 binding: `MEDIA`
- R2 bucket: `haveguide`
- Workers AI binding: `AI`
- static assets binding: `ASSETS`

D1-migrationer ligger i `migrations/` og skal følge kodeændringer, der kræver schemaændringer.

Manuel remote migration:

```bash
npm run db:migrate:remote
```

Manuel deployment:

```bash
npm run deploy
```

R2-bucketen skal forblive privat. Medier leveres gennem autentificerede backend-flows, ikke som offentlige bucket-URLs.

## Data- og sikkerhedsprincipper

- Have-data er bruger-ejet og servervalideres.
- Smart Scan-promotion udføres server-side.
- Klienten må ikke selv kunne publicere vilkårlig lokal scan-geometri som trusted garden geometry.
- Smart Scan-import skal være idempotent og bevare provenance til session og source feature.
- Pending og rejected scan-features publiceres ikke.
- Boundary-conflicting scan-features publiceres ikke automatisk.
- Rå scan-data og korrigerede/georefererede data skal kunne skelnes.
- Migrationer skal være additive og sikre for eksisterende haver, medmindre en eksplicit migration kræver andet.

Se også [`AGENTS.md`](AGENTS.md) for de mere detaljerede arbejds- og arkitekturregler.

## Retning fremad

Næste større produktlag er ikke en separat desktop-applikation, men en mere præcis desktop/web-editor oven på samme datamodel. Den kan senere give:

- stor kortflade
- præcis polygon- og vertex-redigering
- snapping
- merge/split af features
- bedre værktøjer til scan-review og efterkorrektion

Android forbliver den naturlige platform for selve haven-scanningen, mens desktop/web kan blive den stærkere præcisionseditor.

På længere sigt skal den digitale have-model danne grundlag for mere intelligent haveforståelse og design: planteidentifikation, forhold som sol/fugt/jord, vedligeholdelse, forslag, redesigns og andre værktøjer, der kan arbejde oven på den samme vedvarende geometri og historik.

## Aktuelle begrænsninger

- Smart Scan er ikke landmåling og kan have AR-drift.
- Scene Semantics er grov og kan eksempelvis forveksle buske/hække med træer.
- RGB-klassifikation er hjælpedata, ikke facit.
- Ikke alle scan-kategorier har endnu en sikker direkte mapping til almindelige garden feature-typer.
- Alignment kræver stadig brugerreview.
- Offline app-shell betyder ikke endnu fuld offline redigering/synkronisering.
- Adresse-/providerfunktioner og flere analysemodeller er stadig under udvikling.

Have Guide skal hellere vise usikkerhed og bede om review end gemme en overbevisende, men forkert have-model.
