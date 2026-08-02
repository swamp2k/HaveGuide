# Arkitektur

Have Guide er en samlet TypeScript-applikation, der kører som en Cloudflare Worker med statiske Vite-assets.

```text
React PWA
  ├─ kort og enkel editor (MapLibre)
  ├─ platform-adaptere (placering, deling, præferencer)
  └─ /api
       └─ Hono Worker
            ├─ D1: brugere, sessions, haver, objekter og mediemetadata
            └─ R2: private originalbilleder
```

## Vigtige grænser

- `src/client` må ikke tilgå D1 eller R2 direkte.
- `src/server` er eneste autoritative adgang til private data.
- `src/shared` indeholder kontrakter og validering, der kan deles uden Worker-afhængigheder.
- Telefonfunktioner tilgås gennem `src/client/platform`. En senere Capacitor-udgave erstatter adapterne uden at ændre skærmene.
- Geometri gemmes som valideret GeoJSON bag repository-laget. Det holder en senere flytning til PostGIS mulig.

## Provider-retning

Adresseopslag, kortbaggrund, plantegenkendelse og AI bliver udskiftelige providers. Milestone 1 bruger manuel placering og OpenStreetMap-rasterkort, så appens kerne ikke afhænger af en bestemt kommerciel leverandør.
