# Mobile simplification

The original HaveGuide remains the application and data source. No database migration is required.

- Daily navigation: Min have, Planter, Rundtur, Opgaver, Mere.
- The home map uses the existing authenticated orthophoto proxy when configured, with a map fallback and layer switch.
- Planter provides a camera/gallery-first flow over existing plant, media and identification APIs. Photos are resized before upload. Position is explicitly requested at the plant, never inferred from the current location for a gallery image.
- Completed create/upload/link steps are retained in the active form on an API error. Identification failure leaves the saved plant available. This is not an offline queue or server-side idempotency guarantee for a lost create response.
- Existing detailed registration, design, native scanning and aerial editing remain accessible under Mere. Existing records and scan review rules are preserved.
- Screens load on demand. The guided tour no longer mounts a redundant aerial map; its filmstrip uses lazy image loading. Existing originals are still used: dedicated thumbnail storage and paginated capture metadata remain follow-up work.
- TypeScript checks no longer emit JS/declaration siblings into the source tree; Vite owns application output. ESLint excludes generated Capacitor web assets so checks also work after Android sync.

## Review and local E2E isolation

The PR's 17 original changed files were reviewed against the current API client, shared schemas and scan pipeline. No server API, database migration, scan geometry, alignment or promotion rules changed.

- Playwright starts Vite in `e2e` mode with `tests/e2e/wrangler.jsonc`. D1 and R2 are local, AI is omitted, and `remoteBindings: false` prevents a Cloudflare proxy session. Normal development and production still use the original configuration.
- Each run uses a fresh `.wrangler/e2e-*` state directory for both migrations and Vite. It never reuses a running development server or the developer's local database. The test config lives separately from project `.dev.vars`, dotenv secret loading is disabled, and no production token is required.
- Real browser testing exposed page CSS overriding the five-column navigation, horizontal overflow in detailed registration, and a submit button obstructed by navigation. Page styles no longer change the application shell; scroll padding keeps controls reachable.
- Lazy page navigation now resets scroll and focuses the heading after the page mounts. Leaving a partially saved photo registration refreshes the plant list, and tour retry clears its stale error.

## Validation results — 2026-09-07

- `npm run check`: passed (lint, TypeScript, 26 unit tests and production build); existing hook warnings remain.
- GitHub Actions [run 179](https://github.com/swamp2k/HaveGuide/actions/runs/34094690360) passed for code commit `f75d1ebb6e0c28ad2f2e1700694f20e1bacdfab0`, including all E2E tests and diagnostic artifact upload.
- `npm install` and `npx playwright install --with-deps chromium`: passed on Windows. npm reported one moderate dependency advisory; no unrelated dependency upgrades were applied.
- `npm run test:e2e`: all 4 Pixel 7 Chromium tests passed. Coverage includes the real local Worker/D1 first-user journey, retained upload/link progress, closing a partial save, failed identification, gallery without GPS, cancelled navigation, overflow, five navigation columns, and focus/scroll after lazy navigation.
- Screenshots visually inspected: home, photo registration, saved plant, tour, More, detailed registration, design and tasks. Screenshots are retained in `test-results/` and uploaded by CI on successful as well as failed runs. This is browser emulation, not physical Android validation.
- `npm run native:sync:android`: passed with the final application code (`f75d1eb`).
- `android/gradlew.bat assembleDebug`: passed with Java 21, SDK 36 and Gradle 8.14.3. APK exists at `android/app/build/outputs/apk/debug/app-debug.apk` (6,939,103 bytes); its bundled entry is the current `index-Cx7AcW-0.js`.
  SHA-256: `a5c6168e588f5554a15127467062ae10dfe25ea8e755a360c3469fc6b9a9476e`.
- Java and Android command-line tools were downloaded into ignored `.wrangler/android-tools/` because the machine had no Android toolchain. Gradle also populated its normal user cache. Generated native plugin build output is ignored.
- `adb devices`: no devices attached. APK installation, camera/gallery in Android WebView, login/session behaviour and physical smoke testing remain unverified. Native capture precision requires a physical device; web tests do not establish ARCore accuracy.
- No Cloudflare deployment, remote D1 migration or merge to main. PR #6 remains draft pending physical Android testing.

The main JavaScript entry is now approximately 226 kB (72 kB gzip), with separate page chunks. The home screen still loads MapLibre (approximately 1.05 MB / 285 kB gzip); the entry reduction is not the total initial-page transfer reduction.
