# Milestone 3 – Råd, inspiration og redesign

Milestone 3 gør den kortlagte have handlingsbar. Den nuværende have ændres aldrig direkte af et forslag; hver plan gemmes som en separat version med tre alternativer.

## Brugerflow

Fanen **Planer** lader brugeren:

1. vælge hele haven eller et registreret kortområde
2. vælge mål, arbejdsniveau, budget, højde, farver og sikkerhedshensyn
3. tilføje et inspirationsbillede, en webkilde og de elementer, der ønskes eller fravælges
4. generere tre alternativer med planteforslag, arbejdsrækkefølge og begrundelser
5. sammenligne vedligeholdelse, budget og biodiversitet
6. vælge én aktuel plan uden at slette de andre versioner
7. vise konceptet oven på et privat havefoto

## Beslutningsrækkefølge

Forslagsmotoren er deterministisk og følger denne rækkefølge:

1. fravælg planter, der bryder hårde begrænsninger
2. sammenhold planter med registreret sol, fugt, jord og hældning
3. vægt mål og strategi
4. opbyg tre forskellige, forklarlige alternativer
5. gem regelsporet sammen med resultatet

Inspirationsdata påvirker stil, farvepalet og ønskede elementer. Inspiration kan ikke tilsidesætte vækstkrav eller sikkerhedsfiltre.

## Startkatalog

Migration `0003_design_planning.sql` opretter et lille kildeangivet startkatalog. Det er bevidst ikke et komplet planteleksikon. Hver anbefaling viser:

- videnskabeligt navn
- hvorfor planten indgår
- sikkerhedsklasse og note
- kilde eller markering som foreløbig startkatalogdata

`low_risk` betyder ikke en universel garanti. Plantesort, allergi, lokal dyrkning og konkrete børn eller dyr skal stadig vurderes før køb og indtagelse.

## Visualisering

Milestone 3 leverer en konceptvisning, ikke en fotorealistisk garanti. Den kan bruge et privat billede fra R2 som baggrund og placerer planens vigtigste lag ovenpå. Den gemte visualisering er struktureret JSON, så en senere billedmodel eller native app kan erstatte rendereren uden at ændre planens data.

## Deployment

```bash
npx wrangler d1 migrations apply DB --remote
npm run deploy
```

Migrationen er additiv og opretter `plant_catalog`, `design_inspirations`, `design_projects` og `design_options`.
