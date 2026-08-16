# AGENTS.md

## Project purpose

Have Guide is a mobile-first digital garden model and planning assistant.

The product should help a normal garden owner turn a real physical garden into a persistent digital model that can later support understanding, maintenance, problem solving, redesign and planning.

The central product idea is:

1. Capture the real garden.
2. Build a trustworthy spatial model.
3. Let the user review and correct what the system inferred.
4. Persist the accepted result as normal garden data.
5. Build recommendations, plans and future design tooling on top of that shared model.

Do not treat Have Guide as merely a plant-identification app, a map editor, or an AR demo. Smart Garden Scan, manual mapping, observations, media, understanding and design are different input/output paths around the same persistent garden model.

## Product principles

- Mobile-first and Danish-first.
- One clear primary action per screen where practical.
- Powerful features are welcome; the UI should not feel like GIS software.
- Automation/AI proposes and structures evidence. The user remains the final authority on uncertain inferred garden data.
- Preserve editable/reversible intermediate state instead of making uncertain automated decisions destructive.
- Manual mapping remains a fallback and precision-editing path even as Smart Garden Scan becomes the primary automated capture path.

## Current architecture

### Frontend

- React 19 + TypeScript + Vite.
- Mobile-first responsive UI.
- MapLibre GL JS for maps and aerial alignment/editing.
- The web application also runs inside Capacitor on Android.
- Native-safe API URLs must go through `runtimeUrl(...)` when requests can run in Capacitor.

Primary client code lives in:

- `src/client/`
- `src/client/components/`
- `src/client/native/`

### Backend

- Cloudflare Worker.
- Hono API.
- Zod validation at API boundaries.
- D1 for persistent relational/application data.
- R2 for private media.
- Workers AI for targeted Smart Scan image understanding.

Primary server code lives in:

- `src/server/`
- `src/server/routes/`
- `src/server/repositories/`
- `src/shared/`

### Android / native scanning

The Android application uses Capacitor plus the local plugin:

- `native/garden-scan/`

The Smart Garden Scan pipeline uses ARCore capabilities including camera tracking, pose, depth and scene semantics where supported.

The important architectural split is:

- ARCore establishes **where** observations are in the local scan frame.
- RGB/image understanding helps determine **what** objects are.
- Fusion connects observations that likely belong to the same physical feature.
- User review is the trust boundary before inferred features become normal garden data.

Raw scan data and reviewed/published garden features are intentionally separate concepts.

## Smart Garden Scan pipeline

Smart Scan is the primary automated mapping path. Manual mapping remains a fallback and precision-editing path.

The pipeline currently includes:

1. Native ARCore capture.
2. Keyframes, tracking, depth and scene-semantics capture.
3. Spatial reconstruction into voxels/clusters.
4. Targeted RGB crop classification.
5. Draft feature generation and footprint refinement.
6. User review: accept, reject or correct feature type/footprint.
7. Alignment of the local scan frame to the real garden/aerial map.
8. Boundary-constrained diagnostics.
9. Local AR-drift correction using a reversible segmented warp.
10. Promotion of reviewed/aligned features into normal `garden_features` with Smart Scan provenance.

### Important Smart Scan invariants

Do not violate these without an explicit architectural decision:

- Raw ARCore geometry must remain recoverable. Do not destructively rewrite the original scan merely to improve visual fit.
- Alignment, drift correction and review edits are overlays/derived state.
- A global optimizer must never select a result with a worse primary boundary error than its input.
- Local drift correction must not make the primary boundary metric worse.
- The existing `garden_boundary` is a strong physical constraint when available.
- Features outside a known hard garden boundary must not silently become normal garden features.
- Pending or rejected scan candidates must not be promoted to the main garden model.
- Promotion must be idempotent. Re-running publication for the same scan candidate should update the existing promoted feature rather than create duplicates.
- Preserve provenance (`source_kind`, scan session, source feature id) for promoted Smart Scan features.
- Do not present scanner geometry as survey-grade precision.

### Current calibration lesson

A real garden test scan showed that simple global placement was insufficient. Boundary error improved approximately:

- default: 18%
- after global alignment: 11%
- after local drift correction: 8%

This is evidence that local AR drift is real and that reversible local correction is worthwhile. Future changes should improve this pipeline rather than hide residual error through unconstrained scaling or aggressive geometry warping.

## Garden model

`garden_features` is the durable user-visible model of the garden.

Known feature types are defined centrally in `src/shared/constants.ts`. Reuse those types rather than inventing arbitrary new strings in user-facing persisted data.

Examples include:

- `garden_boundary`
- `building`
- `lawn`
- `bed`
- `slope`
- `terrace`
- `path`
- `tree`
- `shrub`
- `hedge`
- `other_area`
- `other_point`

Smart Scan may use richer/intermediate labels internally, but promotion into the normal garden model must map conservatively to supported feature types.

If an intermediate classification is uncertain, prefer preserving it as draft/review state or mapping conservatively rather than pretending confidence.

## Security and trust boundaries

- All private application API routes require authentication unless deliberately documented otherwise.
- Keep R2 media private.
- Validate all client input server-side.
- The client must not be trusted to decide that an inferred Smart Scan feature is safe to publish.
- Server-side promotion should reload persisted scan session, review and alignment data and derive final WGS84 geometry itself.
- Preserve same-origin protections for writes.
- Do not expose secrets, API keys, session material or internal Cloudflare credentials in client bundles or repository files.

## Workers AI usage

Workers AI is used for targeted Smart Scan visual understanding, not for indiscriminate full-scan processing.

Cost-control rules:

- Prefer small, high-value crops rather than uploading an entire scan/archive.
- Maximum normal classification batch is 16 crops.
- Cache classifications per scan session.
- Normal re-analysis should reuse the cache.
- Forced re-analysis must be an explicit action.
- Do not add noisy user-facing "AI cost" or "AI used" indicators unless the product requirement changes.

AI output is evidence, not ground truth. Geometry, AR semantics, image understanding and user review should be fused rather than allowing one signal to dominate blindly.

## Maps and coordinates

- Persist normal garden geometry as valid WGS84 GeoJSON.
- Local Smart Scan coordinates are not WGS84 and must not be written directly into normal garden features.
- Use the saved Smart Scan alignment transform before promotion.
- Respect any saved local drift correction during transformation.
- Keep polygon rings valid and closed.
- Use existing shared GeoJSON/Zod validation where practical.
- Aerial imagery/provider credentials must stay behind the server-side map proxy.

## Future desktop precision editor

A future desktop/web precision editor is expected to reuse the same persisted garden and Smart Scan data.

Likely capabilities include:

- larger aerial map workspace
- precise polygon/vertex editing
- snapping
- merge/split
- correcting Smart Scan footprints with mouse precision

Do not design mobile persistence in a way that blocks this. It should be another editor over the same canonical data, not a separate garden model or separate desktop product unless there is a future explicit architectural decision.

## Development workflow

This repository is currently developed directly on `main` unless the owner explicitly asks for a branch/PR workflow.

Work through a coherent milestone without stopping for every minor technical choice. Choose the simplest defensible solution and document consequential decisions.

Stop and ask when work requires:

- an unknown external resource/domain/API credential that cannot be discovered safely
- a destructive action against existing user/production data
- a major product-direction change
- an important security/trust decision that cannot responsibly be inferred

Before changing code:

1. Read the relevant current files; do not rely on stale milestone documentation alone.
2. Inspect existing shared types, schemas and routes before inventing parallel abstractions.
3. Preserve established data/API compatibility unless a migration/change is intentional.

## Database migrations

For schema changes:

- Add a new numbered migration under `migrations/`.
- Never rewrite an already-applied migration merely to change history.
- Keep migrations safe for the Cloudflare deployment path.
- Think through rollback/data compatibility even when D1 does not make rollback convenient.

## Validation

The normal quality gate is:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Or:

```bash
npm run check
```

Run relevant Playwright flows when critical user journeys change.

For Android/native changes or web changes that must be tested inside the APK:

```bash
npm run native:sync:android
cd android
./gradlew assembleDebug
```

Typical device install:

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Important: `npm run native:sync:android` runs the web build first. If TypeScript/build fails, a later successful Gradle build can still package old web assets. Do not report an Android test as current unless Capacitor sync completed successfully.

Native Java/Android changes should also get appropriate Gradle compile/lint/tests when relevant.

## Cloudflare deployment

The project uses Cloudflare Worker + D1 + R2 + Workers AI bindings from `wrangler.jsonc`.

Treat these binding names as architecture unless intentionally migrated:

- `DB`
- `MEDIA`
- `AI`
- `ASSETS`

When debugging production, distinguish between:

1. code committed/pushed to GitHub
2. D1 migration applied remotely
3. Worker deployment completed
4. Android web assets synced
5. APK rebuilt
6. APK installed on the test device

These are separate states and must not be conflated.

## Code style

- Prefer small cohesive functions and explicit types at trust boundaries.
- Keep shared domain constants/types in `src/shared` rather than duplicating them.
- Avoid `any` unless there is a strong interoperability reason.
- Preserve Danish user-facing language unless the surrounding UI deliberately uses another language.
- Internal code identifiers should generally remain English.
- Do not add a new dependency when the existing stack can solve the problem cleanly.
- Avoid large speculative refactors while a feature pipeline is still being validated against real-world scans.

## Decision quality

Think several steps ahead before implementing a requested solution.

Proactively consider:

- migration consequences
- backwards compatibility
- native/web differences
- Cloudflare runtime limitations
- Workers AI cost
- hidden persistence requirements
- failure/rollback behavior
- duplicate/idempotency problems
- coordinate-system mistakes
- user-review/trust boundaries
- future desktop editing needs

Do not merely implement the first plausible path if it creates avoidable future debt.

Clearly distinguish:

- facts from current code
- assumptions
- experimental behavior observed on real hardware
- future ideas not yet implemented

## Documentation

Repository documentation may lag the live product. Current code, migrations and deployed architecture are the source of truth when old milestone text conflicts with them.

When a milestone materially changes architecture or capability, update relevant documentation rather than allowing README/architecture notes to drift indefinitely.
