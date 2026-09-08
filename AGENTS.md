# HaveGuide development notes

## Product boundary

HaveGuide is photo-first. Do not reintroduce maps, geospatial grids, AR scanning, GPS-bound photos, or garden-layout editors unless the product direction is explicitly changed.

The primary entity is a **scene**: one garden area, one current overview image (older images may remain in history), growing conditions, plant cards, and AI analyses.

Plant identifications are **first-class objects**, not history log entries. A bed with five plants in
it is the normal case, and the user must never have to match a timestamp to a physical plant.

## UX rules

- Mobile/Android first. The user is standing outside holding a phone.
- The app should read as a garden notebook, not a dashboard or admin console. No dense metadata,
  no settings-heavy surfaces, no provider internals in the UI.
- Photos dominate. Scene cards and the scene header are photo-led.
- Soft shapes: generous radii, pill chips, spacing instead of borders, few hard separators.
- Copy stays short and non-technical. User-facing vocabulary is Foto, Forhold, Planter, Forslag,
  Analyse, Historik. Never explain the image pipeline, the provider, the model or the API in the UI.
  PlantNet may appear discreetly as attribution.
- Themes are an intentional product feature, not a debug toggle. Four polished themes, each
  redefining the full token set — never just an accent swap.
- A user must be able to create a scene with a name and photo in under a minute.
- AI plant/change suggestions require sun + moisture + soil + drainage.
- Only plant cards with `includeInAnalysis` reach the model, capped at five, using the suggestion
  the user selected. Close-up plant photos are never sent to Anthropic — only their metadata.
- Do not pretend PlantNet is reliable on a wide garden overview. Prefer a dedicated close-up flow.
- Do not infer soil type, pH, drainage, or moisture from a photo as if it were measured data.
- Keep image editing provider-independent. Anthropic analysis is not image generation.

## Panorama

Panorama stitching is real: ORB features, BFMatcher + Lowe ratio, RANSAC homographies, cumulative
transforms, feather blending, crop. It lives in `src/client/panorama/` and runs **client-side** —
never move it to the Worker. Photos stay on the device, Worker CPU/memory limits do not apply, and
PWA and APK behave the same.

Rules for anyone touching it:

- Every OpenCV object (`Mat`, `KeyPointVector`, `DMatchVectorVector`, `BFMatcher`, `ORB`,
  homography, mask) must be released in a `finally`. Android pays for leaks first.
- Never resolve or return the OpenCV module from a promise. Emscripten makes it thenable, so the
  promise adopts it and re-enters `then` forever, freezing the tab. `opencv-loader.ts` boxes it and
  deletes `then`; keep it that way.
- Keep `geometry.ts` free of OpenCV. It holds the parts worth unit testing.
- A pair that cannot be aligned must surface as a failure naming the two photos. Never fall back to
  the fixed-overlap join silently — the user chooses that explicitly, and it is labelled
  "Saml uden billedtilpasning" because it is not stitching.
- Multiple selected photos are never assumed to be a panorama; ask.
- Normalise EXIF orientation before OpenCV sees a frame.

Multi-band blending and a Web Worker are both reasonable future work. Neither is required, and
neither is worth breaking reliability for.

## Storage

- Images: R2 `MEDIA`.
- Metadata and history: D1 `DB`.
- Never put API keys in client code.
- Preserve existing auth compatibility unless a migration plan is explicitly approved.
- Every scene-scoped endpoint verifies the scene belongs to the user, and every nested object
  (image, identification) belongs to that scene. Never trust an id from the client.
- Deleting a plant card removes only that plant's close-up from R2. Overview photos are untouched.
