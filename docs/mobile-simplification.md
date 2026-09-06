# Mobile simplification

The original HaveGuide remains the application and data source. No database migration is required.

- Daily navigation: Min have, Planter, Rundtur, Opgaver, Mere.
- The home map uses the existing authenticated orthophoto proxy when configured, with a map fallback and layer switch.
- Planter provides a camera/gallery-first flow over existing plant, media and identification APIs. Photos are resized before upload. Position is explicitly requested at the plant, never inferred from the current location for a gallery image.
- Completed create/upload/link steps are retained in the active form on an API error. Identification failure leaves the saved plant available. This is not an offline queue or server-side idempotency guarantee for a lost create response.
- Existing detailed registration, design, native scanning and aerial editing remain accessible under Mere. Existing records and scan review rules are preserved.
- Screens load on demand. The guided tour no longer mounts a redundant aerial map; its filmstrip uses lazy image loading. Existing originals are still used: dedicated thumbnail storage and paginated capture metadata remain follow-up work.
- TypeScript checks no longer emit JS/declaration siblings into the source tree; Vite owns application output. ESLint excludes generated Capacitor web assets so checks also work after Android sync.

## Validation results

- `npm run check`: passed (lint, TypeScript, 26 unit tests and production build); existing hook warnings remain.
- `tests/e2e/simple-garden.spec.ts` adds coverage for mobile navigation, retained upload/link progress and saved plants after an identification error. The original full-stack journey uses the new navigation. These browser tests could not execute in this environment: Chromium download is blocked, and local Wrangler also fails while enumerating network interfaces.
- Capacitor Android asset sync succeeded. `assembleDebug` could not download Gradle, so no updated APK was built or tested.
- Visual mobile checks and a physical Android test remain required. Native capture precision requires a physical device; web tests do not establish ARCore accuracy.

The main JavaScript entry is now approximately 226 kB (72 kB gzip), with separate page chunks. The home screen still loads MapLibre (approximately 1.05 MB / 285 kB gzip); the entry reduction is not the total initial-page transfer reduction.
