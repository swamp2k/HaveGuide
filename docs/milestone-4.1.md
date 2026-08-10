# Milestone 4.1 – Luftfoto, guidet opmåling og rumlig rundtur

## Formål

Kortlægning skal ikke begynde med en tom GIS-flade. Brugeren starter med havens synlige grundstruktur på et kort eller luftfoto og beriger derefter modellen gennem en guidet billedtur. Milestone 4.1.2 binder de to verdener sammen, så kortobjekter, optagelsesstationer og billeder kan opleves som samme have.

## 4.1 – Grundlag

### Luftfoto som kortlag

- almindeligt OpenStreetMap-kort er sikker fallback
- GeoDanmark Ortofoto forår kan vælges som luftfotolag
- luftfoto hentes gennem Worker-ruten `/api/map/orthophoto/{z}/{x}/{y}.jpg`
- Datafordeler-nøglen bliver på serveren og sendes aldrig til browseren
- eksisterende haveobjekter vises oven på begge baggrunde

Provider: GeoDanmark Ortofoto forår Web Mercator WMTS via Datafordeleren. Det kræver runtime-secreten `DATAFORDELER_API_KEY`.

### Guidet opmåling

- brugeren starter eller fortsætter én aktiv opmåling
- direkte kameravisning bruger som udgangspunkt bagsidekameraet
- seks billeder udgør én station
- billeder ved samme station guides med cirka 60 graders drejning og visuelt overlap
- efter en station guides brugeren videre langs havens kant
- native kameravælger er fallback, hvis direkte kamera ikke kan bruges

Hvert billede gemmes med sessions-id, sekvensnummer, privat medie-id, GPS, GPS-nøjagtighed, kompasretning, afstand/retningsændring, estimeret overlap og kvalitetsstatus.

Kvalitetskontrollen er konservativ: manglende eller upræcise sensorer stopper ikke turen, og overlap er et estimat ud fra retning – ikke computer vision.

## 4.1.2 – Rumlig virtuel rundtur

### Stationer og rute på kortet

- billeder samles i stationer efter optagelsesrækkefølgen
- stationernes position udledes som udgangspunkt af billedernes GPS-data
- stationerne vises oven på luftfotoet sammen med havens kortobjekter
- ruten mellem positionerede stationer vises
- aktivt billede fremhæver den tilsvarende station
- billedets kompasretning vises som en retningslinje fra stationen
- stationer kan trækkes manuelt på plads, hvis telefonens GPS ligger forkert
- den manuelle korrektion gemmes og erstatter den afledte stationsposition i rundturen

### Kortobjekter som hotspots i billeder

Et kortobjekt og et billede bindes sammen gennem et hotspot med normaliseret X/Y-position i billedet.

- samme kortobjekt kan optræde i flere billeder
- samme billede kan indeholde flere objekter
- hotspot peger direkte på det eksisterende `garden_features`-objekt; der oprettes ikke en separat kopi
- hotspots vises som klikbare navne oven på rundtursbilledet
- valg af et hotspot fremhæver samme objekt på kortet
- valg af et kortobjekt hopper til et billede, hvor objektet er knyttet, når en kobling findes
- koblinger kan fjernes igen fra det enkelte billede

### Assisteret kobling

Appen kan foreslå kortobjekter, der geografisk kan være synlige fra billedets position og retning. Forslaget er kun hjælp og bliver aldrig automatisk til en bekræftet kobling.

Brugeren vælger objektet og trykker derefter på det faktiske objekt i billedet. Det gemmer hotspot-positionen.

### Nulstil havebilleder

Brugeren kan nulstille den guidede opmåling og starte forfra.

Reset skal:

- kræve eksplicit bekræftelse
- slette aktive og tidligere capture-sessioner for haven
- slette stationkorrektioner og hotspots via relationernes cascade-regler
- markere de tilhørende capture-medier som slettet i D1
- fjerne deres billedobjekter fra det private R2-lager
- bevare kortobjekter, planter og andre havebilleder, der ikke indgår i den guidede opmåling

### Mobil viewport

Den rumlige rundtur er en ægte fuldskærmsvisning.

- app-header og bundnavigation skjules under rundturen
- viewer er låst til `100dvh` og viewportens bredde
- hovedindhold har `min-width: 0` og må ikke udvide siden
- filmstrippen har fast viewportbredde og scroller vandret inde i visningen
- thumbnails må aldrig presse browserens layout ud over skærmbredden
- aktiv thumbnail scrolles ind i den synlige del af filmstrippen

## Datamodel

Migration `0005_guided_capture.sql` opretter:

- `capture_sessions`
- `capture_frames`

Migration `0006_spatial_tour.sql` tilføjer:

- `capture_station_positions` til manuelle stationskorrektioner
- `capture_feature_links` til billed-hotspots og kobling til `garden_features`

Begge migrationer er additive i forhold til eksisterende have-, plante- og design-data.

## Backup

JSON-eksporten bruger den samme `CaptureWorkspace` som klienten. Derfor følger stationer og hotspot-koblinger med i metadata-backuppen. Selve billedfilerne ligger fortsat privat i R2.

## Acceptkriterier for 4.1.2

Milestonen er funktionelt opfyldt, når brugeren kan:

1. åbne rundturen og se det aktuelle billede sammen med luftfotokortet
2. se og vælge de stationer, billederne blev taget fra
3. rette en stations placering ved at trække den på kortet
4. se det aktuelle billedes kameraretning på kortet
5. vælge et eksisterende kortobjekt, fx et træ, og placere det som hotspot i billedet
6. klikke på hotspottet og få samme træ fremhævet på luftfotoet
7. klikke på et knyttet kortobjekt og hoppe til et relevant rundtursbillede
8. nulstille alle guidede havebilleder og starte forfra uden at slette den øvrige have
9. bruge hele rundturen på mobil uden at filmstrip eller app-navigation går uden for eller oven på viewporten

## Begrænsninger

- GPS i en almindelig telefon er ikke egnet til centimeteropmåling; derfor kan stationer rettes manuelt
- kompasadgang og absolut retning varierer mellem Android-, iOS- og desktopbrowsere
- forslag til synlige objekter er geometriske hints, ikke automatisk billedgenkendelse
- hotspots placeres manuelt og er ikke feature-matched mellem billeder endnu
- billederne er stadig separate perspektiver; de er ikke sammensyet til et 360-graders panorama
- photogrammetry, visuel feature matching og ægte AR-opmåling ligger i en senere fase
