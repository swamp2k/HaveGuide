# Milestone 4.1 – Luftfoto og guidet billedtur

## Formål

Kortlægning skal ikke begynde med en tom GIS-flade. Brugeren starter med havens synlige grundstruktur på et kort eller luftfoto og beriger derefter modellen gennem en guidet billedtur.

## Implementeret arbejdsplan

### 1. Luftfoto som kortlag

- almindeligt OpenStreetMap-kort er fortsat sikker fallback
- GeoDanmark Ortofoto forår kan vælges som luftfotolag
- luftfoto hentes gennem Worker-ruten `/api/map/orthophoto/{z}/{x}/{y}.jpg`
- Datafordeler-nøglen bliver på serveren og sendes aldrig til browseren
- eksisterende haveobjekter vises oven på begge baggrunde

Provider: GeoDanmark Ortofoto forår Web Mercator WMTS via Datafordeleren. Det kræver runtime-secreten `DATAFORDELER_API_KEY`.

### 2. Guidet billedtur

- brugeren starter eller fortsætter én aktiv tur
- direkte kameravisning bruger som udgangspunkt bagsidekameraet
- et gennemsigtigt udsnit af forrige billede vises i venstre side
- standardmålet er 35 procent overlap
- native kameravælger er fallback, hvis direkte kamera ikke kan bruges

### 3. Billedkæde

Hvert billede gemmes med:

- sessions-id og sekvensnummer
- privat medie-id i R2/D1
- GPS-position og nøjagtighed, når den er tilgængelig
- kompasretning, når browseren giver adgang
- beregnet afstand og retningsændring fra forrige billede
- estimeret overlap og kvalitetsbeskeder

### 4. Kvalitetskontrol

Kvalitetskontrollen er forklarlig og konservativ:

- overlap estimeres fra retningsændringen og et vejledende vandret synsfelt
- store afstandsspring markeres
- manglende GPS eller kompas stopper ikke turen, men vises som en advarsel
- billeder klassificeres som `good`, `review` eller `retake`

Det er ikke computer-vision-baseret panorama-syning endnu. Metadata og rækkefølge er bevidst struktureret, så egentlig feature matching eller fotogrammetri kan tilføjes senere.

### 5. Virtuel rundtur

Seneste aktive eller gennemførte tur vises som en vandret sekvens. Billederne står i den rækkefølge, de blev taget, og hvert billede viser sin kvalitetsstatus.

## Datamodel

Migration `0005_guided_capture.sql` opretter:

- `capture_sessions`
- `capture_frames`

Migrationen er additiv og ændrer ikke eksisterende have-, plante- eller mediedata.

## Aktivering af luftfoto

Opret en API-nøgle hos Datafordeleren og gem den som Worker-secret:

```bash
npx wrangler secret put DATAFORDELER_API_KEY
```

Da GitHub/Cloudflare deployment allerede er tilsluttet, kræver en secretændring normalt blot en ny deployment eller et nyt push til `main`.

## Begrænsninger

- kompasadgang og absolut retning varierer mellem Android-, iOS- og desktopbrowsere
- GPS i en almindelig telefon er ikke egnet til centimeteropmåling
- overlap er et estimat, ikke visuel feature matching
- luftfotoets aktualitet og opløsning bestemmes af den valgte offentlige provider
- ægte AR-opmåling kræver senere en native Capacitor/ARCore/ARKit-fase
