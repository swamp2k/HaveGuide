# HaveGuide development notes

## Product boundary

HaveGuide is photo-first. Do not reintroduce maps, geospatial grids, AR scanning, GPS-bound photos, or garden-layout editors unless the product direction is explicitly changed.

The primary entity is a **scene**: one garden area, one current overview image (older images may remain in history), growing conditions, plant identifications, and AI analyses.

## UX rules

- Mobile/Android first.
- A user must be able to create a scene with a name and photo in under a minute.
- AI plant/change suggestions require sun + moisture + soil + drainage.
- Do not pretend PlantNet is reliable on a wide garden overview. Prefer a dedicated close-up flow.
- Do not infer soil type, pH, drainage, or moisture from a photo as if it were measured data.
- Keep image editing provider-independent. Anthropic analysis is not image generation.

## Storage

- Images: R2 `MEDIA`.
- Metadata and history: D1 `DB`.
- Never put API keys in client code.
- Preserve existing auth compatibility unless a migration plan is explicitly approved.
