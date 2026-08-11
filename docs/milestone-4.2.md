# Milestone 4.2 – Android Smart Garden Scan

## Produktbeslutning

Have Guide går Android-native først. iOS er eksplicit udskudt.

Den eksisterende React/PWA, Cloudflare Worker, D1, R2, login, luftfoto, planer og manuelle editor bevares. Android-appen bygges med Capacitor omkring samme React-klient, mens den del der kræver kamera, tracking, depth og scene-forståelse implementeres native mod ARCore.

Den manuelle 4.1/4.1.2-kortlægning er ikke længere den primære onboarding. Den bevares som fallback, review og præcisionskorrektion.

## Nyt produktprincip

> Brugeren går rundt i haven. Have Guide bygger haven. Brugeren retter kun det, systemet er usikkert på eller tager fejl af.

Brugeren må fortsat angive havens omtrentlige ydre grænse på luftfoto. Derefter skal scanning og analyse automatiseres så langt som teknisk forsvarligt.

## 4.2A – Native Android foundation

- Capacitor 8 omkring den eksisterende React-app
- Android application id: `dev.srgoodjob.haveguide`
- Android er eneste native platform i denne milestone
- web-assets bundtes lokalt i appen; produktion bruger ikke Capacitor `server.url`
- native HTTPS/cookie bridge taler med den eksisterende Cloudflare Worker
- eksisterende HttpOnly sessionmodel bevares
- lokal Capacitor-plugin `@have-guide/garden-scan`
- ARCore er optional capability, så Have Guide kan installeres på telefoner uden ARCore
- plugin kan kontrollere ARCore-installation samt støtte for Depth og Scene Semantics
- Smart Scan er den øverste kortlægningsindgang; manuel mapping står tilbage som fallback

## 4.2B – Continuous native scanner

Brugeren trykker **Scan haven** og går langsomt rundt i haven med telefonen. Oplevelsen skal føles som video, men scannerens datasæt består af automatisk udvalgte keyframes og sensor/AR-metadata.

Scannerlaget skal indsamle:

- ARCore camera pose løbende
- camera intrinsics
- tracking state og tracking-kvalitet
- automatisk udvalgte keyframes frem for manuel shutter-knap
- RGB-frame eller komprimeret keyframe
- Depth image når enheden understøtter det
- Scene Semantics når enheden understøtter det
- telefonens globale GPS som grov georeference, ikke som lokal sandhed
- tidsstempel og relation mellem frames

Keyframes vælges efter bevægelse, rotation, tid, skarphed og sceneændring. Målet er typisk et begrænset sæt gode observationer, ikke en rå videofil med tusindvis af frames.

## 4.2C – Scene understanding og spatial fusion

Første analysemål er grove, robuste kategorier – ikke artsbestemmelse.

Have Guide skal forsøge at registrere og fusionere blandt andet:

- træ
- busk
- hæk
- græs
- bed/beplantet område
- blomstrende vegetation
- terrasse/hård belægning
- sti
- bygning/skur/legehus
- terræn/skråning

Samme fysiske objekt set fra flere vinkler skal samles til ét kandidatobjekt. AR-pose, depth, semantiske pixels og billedfeatures bruges samlet til at estimere objektets placering i scannerens lokale koordinatsystem.

Resultatet er **draft garden features** med confidence og evidens, ikke skjulte automatiske ændringer i den godkendte have.

## 4.2D – Review og georeference

Efter scanning viser Have Guide sit forslag til haven oven på luftfotoet.

Brugeren skal primært:

- godkende fundne objekter
- flytte eller ændre fejlplacerede objekter
- slå fejlagtige dubletter sammen eller splitte dem
- besvare korte spørgsmål om usikre fund
- hjælpe med detaljer, som modellen ikke sikkert kan bestemme

Eksempler:

- “Jeg har fundet et træ her. Er det korrekt?”
- “Er disse observationer samme træ?”
- “Dette er sandsynligvis et bed. Skal det registreres som bed?”
- “Jeg kan ikke sikkert bestemme trætypen. Vil du tage et nærbillede af blad/frugt?”

Planteartsbestemmelse ligger oven på den rumlige model og kan bruge eksisterende Pl@ntNet-integration eller senere modeller. Artsbestemmelse må aldrig være nødvendig for at registrere, at et fysisk træ eller en busk findes.

## Relation til 4.1.2

Følgende genbruges:

- `garden_features` som godkendt rumlig sandhed
- luftfotoeditoren som review/korrektionslag
- private billeder i R2
- capture metadata og billedrelationer, hvor de fortsat giver mening
- spatial tour som inspektionsvisning

Følgende nedprioriteres som primært flow:

- seks manuelle billeder pr. station
- manuel positionering af hvert billede
- manuel kobling af hvert haveobjekt til hvert billede

De eksisterende funktioner slettes ikke endnu; de fungerer som fallback, diagnostik og migrationssti mens Smart Scan modnes.

## Capability degradation

Smart Scan skal have tydelige niveauer:

1. **ARCore + Depth + Scene Semantics** – bedste automatiske scan
2. **ARCore + Scene Semantics** – tracking og semantik uden metric depth på alle frames
3. **ARCore only** – pose/keyframes og egen billedanalyse
4. **Ingen ARCore** – luftfoto + manuel mapping/review

Appen må aldrig præsentere en dårlig sensorbaseret position som præcis. Confidence og fallback skal være eksplicitte.

## Privatliv og data

- scanning startes eksplicit af brugeren
- kamera bruges kun mens scanneroplevelsen er aktiv
- rå frames/keyframes behandles efter en dokumenteret retention-politik
- ARCore-brug og Googles relevante privacy-oplysninger skal fremgå i appens privacy/notice-visning før distribution
- automatisk analyse producerer forslag; brugeren kan reviewe og korrigere resultatet

## Acceptkriterier – 4.2A

4.2A er færdig, når:

1. eksisterende webapp stadig kan bygges og deployes uændret til Cloudflare
2. `npx cap add android` og `npx cap sync android` kan generere/synkronisere Android-projektet
3. Android-webview kan bruge den eksisterende Cloudflare-login/session
4. Android-klienten kan kalde `GardenScan.getCapabilities()`
5. understøttet Android-enhed kan skelne mellem ARCore, Depth og Scene Semantics
6. ARCore er optional og ikke et installationskrav for resten af Have Guide
7. Kortlæg viser Smart Scan som primær retning uden at påstå, at 4.2B-scanneren allerede er færdig

## Acceptkriterier – samlet 4.2

Milestonen er først produktmæssigt færdig, når en bruger kan:

1. markere cirka hvor haven ligger
2. trykke **Scan haven**
3. gå naturligt rundt uden manuel foto-for-foto-procedure
4. få et automatisk forslag til havens større objekter og arealer
5. se confidence/usikre fund
6. rette resultatet på luftfotoet
7. få godkendte fund overført til den samme `garden_features`-model som resten af Have Guide bruger

## Bevidst udskudt

- iOS/ARKit
- fotorealistisk 3D-model som produktmål i sig selv
- centimeternøjagtig landmåling
- automatisk artsbestemmelse som forudsætning for mapping
- automatisk accept af usikre objekter uden review
