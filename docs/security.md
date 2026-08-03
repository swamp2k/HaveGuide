# Sikkerhedsnoter

- Første opstart kan oprette én bruger. Derefter er offentlig registrering lukket.
- Brugernavne normaliseres før opslag.
- Adgangskoden forlader ikke browseren. Browseren udfører PBKDF2-HMAC-SHA-256 med individuel salt og 600.000 iterationer og sender et afledt passwordbevis over HTTPS.
- Worker-requesten gemmer ikke det genanvendelige browserbevis. Den gemmer en domæneadskilt SHA-256-verifikator af beviset, så en D1-kopi ikke kan bruges direkte som logininput.
- Login starter med en challenge, der altid returnerer samme svarform, også når brugernavnet ikke findes. Eksisterende hashes fra den tidligere server-side PBKDF2-model opgraderes automatisk efter et gyldigt login.
- Den beregningstunge PBKDF2-del ligger i klienten, fordi Cloudflare Workers Free har en meget lav CPU-grænse pr. request. Worker-siden bruger kun hurtige Web Crypto-digests og konstant-tids-sammenligning.
- Sessiontokenet er 256 bit tilfældigt. Kun SHA-256-hashen gemmes i D1.
- Sessionen transporteres i en `HttpOnly`, `SameSite=Lax` cookie og er `Secure` på HTTPS.
- Login begrænses til fem fejlslagne forsøg pr. kombination af IP og brugernavn inden for 15 minutter.
- Skrivende browserforespørgsler kontrollerer `Origin`.
- Hver have-, objekt- og medieforespørgsel kontrollerer ejerskab server-side.
- R2-bucketen skal forblive privat. Medier leveres kun gennem en autoriseret Worker-route.
- Filtype og størrelse valideres. Milestone 1 foretager endnu ikke malware-scanning eller billedtranskodning.
- Produktionshemmeligheder må ikke ligge i `wrangler.jsonc`; brug `wrangler secret put`.
