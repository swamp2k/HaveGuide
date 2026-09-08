# HaveGuide

HaveGuide er genstartet som en foto-først haveassistent. Ingen kort, geofelter eller opmåling: hvert haveområde tager udgangspunkt i et eller flere fotos og en enkel beskrivelse af vækstforholdene.

## Produktidé

1. Opret et område og tag/vælg et foto.
2. Angiv sol, fugt, jord og dræn. Vind, ønsker og noter er valgfrie.
3. Tilføj de planter, der står i bedet, som **plantekort** — ét nærfoto pr. plante.
4. Bed om et overblik eller idéer. Analysen bruger kun de plantekort, du har slået til.

AI-forslag er låst, indtil sol, fugt, jord og dræn er angivet. Det er bevidst: et flot foto er ikke nok til at vælge planter fornuftigt.

### Fotos

Vælger du flere fotos — fra guidekameraet eller fra galleriet — spørger HaveGuide, hvad de er:

- **Lav panorama:** fotos taget fra venstre mod højre samles med rigtig billedtilpasning.
- **Saml lodret:** fotos oven på hinanden, sat sammen uden tilpasning.

### Panorama

Panoramaer samles i browseren, ikke på serveren. Fotoene forlader aldrig telefonen for at blive
samlet, og en Worker skal hverken bruge CPU eller hukommelse på det. Det virker ens i PWA og APK.

Pipelinen (`src/client/panorama/`):

1. Fotos afkodes med EXIF-rotationen anvendt, så OpenCV ser dem som brugeren så dem.
   Der laves to kopier: en lille til matching (maks. 1200 px) og en større til selve samlingen
   (maks. 1600 px).
2. ORB finder op til 2000 features pr. foto på et histogram-udlignet gråtonebillede — løv er
   kontrastfattigt og gentager sig selv, så udligningen giver mærkbart flere brugbare features.
3. Nabopar matches med BFMatcher/Hamming, kNN og Lowes ratio-test.
4. `findHomography` med RANSAC estimerer sammenhængen for hvert par.
5. Parvise transformationer kædes sammen til fælles koordinater (`H_n = H_{n-1} · relation`),
   alle hjørner transformeres for at finde lærredets størrelse, og alt forskydes positivt.
6. Hvert foto warpes ind på lærredet med en feather-maske i alfakanalen. Farverne akkumuleres
   vægtet og divideres til sidst med den samlede vægt, så overlap krydsfader i stedet for at give
   en synlig lodret kant.
7. Tomme kanter beskæres væk, og resultatet gemmes som JPEG.

**Samlingen kan afvises.** Et par godkendes kun med nok gode matches, nok RANSAC-inliers, en
fornuftig inlier-andel og en realistisk geometri — og fordi optagelsen altid går fra venstre mod
højre, afvises løsninger, der flytter det næste foto den forkerte vej eller alt for langt. Slår det
fejl, får brugeren at vide hvilke to fotos der ikke passer sammen, og kan tage fotoet om, bruge
billederne hver for sig eller vælge *Saml uden billedtilpasning*. Der uploades aldrig et forvrænget
panorama, som app'en kalder samlet.

OpenCV.js ligger i `public/vendor/opencv.js` (kopieres fra `node_modules` af
`npm run vendor:opencv`, som `dev` og `build` kører automatisk). Filen er gitignored og hentes
først, når nogen faktisk laver et panorama — den er ikke en del af app-bundlen. WebAssembly kræver
`'wasm-unsafe-eval'` i CSP'en; det tillader kun WASM-kompilering, ikke `eval()` af JavaScript.

`panorama-harness.html` er et udviklingsværktøj: `npm run dev` og åbn `/panorama-harness.html` for
at køre samlingen mod syntetiske havebilleder. Den kommer ikke med i en build.

### Plantekort

Hvert område har en sektion **Planter i bedet**. Ét plantekort svarer til én fysisk plante og har
miniature, navnet fra planteopslaget, sikkerhed i procent, et valgfrit kaldenavn ("Den lilla bagest")
og en valgfri placering ("Ved stenen"). Er det bedste bud forkert, kan man vælge et af de næste bud.
Hvert kort kan slås fra, så det ikke indgår i AI-analysen, scannes igen med et nyt foto (kaldenavn og
note bevares) eller fjernes — og fjernes kortet, ryger nærfotoet med, både i D1 og R2.

### Temaer

Fire temaer — Salvie (standard), Rosenhave, Lavendel og Blomstereng — vælges via paletikonet i
toppen. Temaet er rene CSS-variabler på `document.documentElement.dataset.theme` og gemmes i
`localStorage` under `haveguide-theme`. Ingen migration, ingen serverstate.

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

Den nye kode bruger `*_v2`-tabeller fra migration `0010_photo_first_rebuild.sql`, udvidet med plantekort-felterne i `0011_plant_cards.sql`. Den migration opretter også auth-tabeller med `IF NOT EXISTS`, så:

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
