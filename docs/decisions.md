# Beslutningslog

## ADR-001: PWA først, Capacitor-klar

UI'et bygges som en mobil-first PWA. Telefonfunktioner isoleres bag platform-adaptere. Android- og iOS-projekter tilføjes først, når kortlægningsflowet er stabilt.

## ADR-002: Én Worker

Frontend-assets og API leveres af samme Worker. Det forenkler cookies, same-origin-sikkerhed og deployment.

## ADR-003: D1 + GeoJSON

D1 gemmer den strukturerede have og valideret GeoJSON. Avanceret spatial søgning er ikke nødvendig i første udgave.

## ADR-004: AI må ikke eje havemodellen

AI-resultater bliver forslag med kilde og sikkerhed. Kun bekræftede data bliver en del af den autoritative have.

## ADR-005: Manuel placering før automatisk adresseimport

Have Guide kan bruges uden adresseprovider. Det beskytter kernen mod leverandørskift og udfasning af offentlige tjenester.
