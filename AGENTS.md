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

## Not the task

The guided panorama camera joins photos horizontally and crops the overlap. It is deliberately
**not** computer-vision stitching — no feature matching, homography or blending. Leave it working
and secondary; do not spend a pass turning it into OpenCV. Manual capture/upload is the preferred
path.

## Storage

- Images: R2 `MEDIA`.
- Metadata and history: D1 `DB`.
- Never put API keys in client code.
- Preserve existing auth compatibility unless a migration plan is explicitly approved.
- Every scene-scoped endpoint verifies the scene belongs to the user, and every nested object
  (image, identification) belongs to that scene. Never trust an id from the client.
- Deleting a plant card removes only that plant's close-up from R2. Overview photos are untouched.
