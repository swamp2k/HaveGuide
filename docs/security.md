# Sikkerhedsnoter

- Første opstart kan oprette én bruger. Derefter er offentlig registrering lukket.
- Brugernavne normaliseres før opslag.
- Adgangskoder hashes med PBKDF2-HMAC-SHA-256, individuel salt og 600.000 iterationer.
- Sessiontokenet er 256 bit tilfældigt. Kun SHA-256-hashen gemmes i D1.
- Sessionen transporteres i en `HttpOnly`, `SameSite=Lax` cookie og er `Secure` på HTTPS.
- Login begrænses til fem fejlslagne forsøg pr. kombination af IP og brugernavn inden for 15 minutter.
- Skrivende browserforespørgsler kontrollerer `Origin`.
- Hver have-, objekt- og medieforespørgsel kontrollerer ejerskab server-side.
- R2-bucketen skal forblive privat. Medier leveres kun gennem en autoriseret Worker-route.
- Filtype og størrelse valideres. Milestone 1 foretager endnu ikke malware-scanning eller billedtranskodning.
- Produktionshemmeligheder må ikke ligge i `wrangler.jsonc`; brug `wrangler secret put`.
