# Have Guide agentregler

## Produktprincipper

- Mobile-first og dansk først.
- Én tydelig primær handling pr. skærm.
- Funktioner må gerne være kraftige; UI'et må ikke føles som GIS-software.
- AI foreslår. Brugeren bekræfter.
- Ingen AR eller fuld 3D før 2D-kortlægning og redesign er valideret.
- Bevar Capacitor-kompatibilitet gennem platform-adapterne.

## Arbejdsform

Arbejd en hel milepæl igennem uden at stoppe ved små tekniske valg. Vælg den enkleste forsvarlige løsning og dokumentér væsentlige beslutninger.

Stop kun hvis der kræves:

- et ukendt eksternt resource-navn, domæne eller API-key
- en destruktiv handling mod eksisterende data
- en væsentlig ændring af designbiblens retning
- et sikkerhedsvalg, der ikke kan træffes ansvarligt uden ejeren

## Kvalitetsport

Før aflevering:

1. Kør lint, typecheck, unit tests og production build.
2. Kør relevante Playwright-flows ved ændringer i kritiske brugerrejser.
3. Kontrollér Android-mobilbredde og tastaturnavigation.
4. Opdatér migrationer og dokumentation sammen med kodeændringer.
5. Angiv kendte begrænsninger ærligt.
