/**
 * Several photos can mean two very different things, so we ask instead of guessing.
 * Panorama runs real alignment; the vertical strip is a plain top-to-bottom join.
 */
export function PhotoModeChoice({
  count,
  onPanorama,
  onVertical,
}: {
  count: number;
  onPanorama: () => void;
  onVertical: () => void;
}) {
  return (
    <div className="photo-mode-choice">
      <span className="field-label">{count} fotos — hvad skal de bruges til?</span>
      <div className="photo-mode-buttons">
        <button type="button" className="mode-card" onClick={onPanorama}>
          <strong>Lav panorama</strong>
          <small>Fotos taget fra venstre mod højre</small>
        </button>
        <button type="button" className="mode-card" onClick={onVertical}>
          <strong>Saml lodret</strong>
          <small>Fotos oven på hinanden</small>
        </button>
      </div>
    </div>
  );
}
