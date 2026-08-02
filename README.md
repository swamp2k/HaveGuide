# Have Guide

Have Guide er en mobil-first digital haveguide: kortlæg haven, registrér planter og områder, gem billeder og byg senere velbegrundede redesigns oven på en vedvarende digital havemodel.

Dette repository indeholder Milestone 1-fundamentet:

- første-bruger-setup og username/password-login
- serverstyrede sessioner og login-ratebegrænsning
- haveoprettelse med manuel placering
- mobil MapLibre-editor til punkter, linjer og områder
- redigering, fortrydelse og arkivering af kortobjekter
- private billeduploads til R2 med metadata i D1
- dansk, tilgængelig PWA-grænseflade
- platform-adaptere, så Capacitor kan tilføjes senere

## Stack

- React + TypeScript + Vite
- Cloudflare Vite plugin og Worker
- Hono API
- Cloudflare D1
- Cloudflare R2
- MapLibre GL JS
- Zod
- Vitest og Playwright

## Lokal opstart

Krav: Node.js 22+ og en npm-version, der matcher projektet.

```bash
npm install
npm run typegen
npm run db:migrate:local
npm run dev
```

Åbn den viste Vite-adresse. Ved første opstart opretter du installationens første bruger.

De lokale bindings i `wrangler.jsonc` bruger kun lokale placeholder-navne og et nulstillet D1-ID. De opretter ikke Cloudflare-ressourcer.

## Kontrol

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

## Produktion

Opret først de rigtige ressourcer i den ønskede Cloudflare-konto. Repositoryet gætter bevidst ikke deres navne.

```bash
npx wrangler d1 create <database-name>
npx wrangler r2 bucket create <bucket-name>
```

Erstat derefter de lokale D1/R2-værdier i en produktionskonfiguration eller et eksplicit Wrangler environment, kør migrationerne og deploy:

```bash
npx wrangler d1 migrations apply <database-name> --remote
npm run deploy
```

R2-bucketen skal forblive privat.

## Struktur

```text
src/client/       React, korteditor og platform-adaptere
src/server/       Worker API, auth og repositories
src/shared/       delte typer og Zod/GeoJSON-validering
migrations/       D1-migrationer
tests/unit/       domæne- og sikkerhedstests
tests/e2e/        kritisk første-bruger-flow
docs/             arkitektur, sikkerhed og beslutninger
```

## Kendte afgrænsninger

- Adresseopslag er endnu manuelt; en provider tilføjes i Milestone 2.
- OpenStreetMap-rasterkortet er en udviklingsvenlig standard. En produktionsinstallation bør vælge en tile-provider med passende driftsvilkår.
- Offline understøtter app-skallen, men ikke endnu offline redigering eller synkronisering.
- Billeder transkodes og malware-scannes ikke i denne milepæl.
- Der er endnu ingen AI, planteidentifikation, solmodel, 3D eller AR.

Se [arkitekturen](docs/architecture.md), [sikkerhedsnoterne](docs/security.md) og [beslutningsloggen](docs/decisions.md).
