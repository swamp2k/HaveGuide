import { useCallback, useEffect, useRef, useState } from 'react';
import { PANORAMA_OVERLAP_RATIO, prepareGardenImage } from '../image-tools';
import {
  PanoramaStitchError,
  stitchPanorama,
  type PanoramaProgress,
} from '../panorama/stitch-panorama';
import { LeafIcon } from './icons';

export type PanoramaOutcome =
  | { kind: 'stitched'; file: File }
  | { kind: 'joined'; file: File }
  | { kind: 'separate'; files: File[] };

interface Failure {
  message: string;
  /** Zero-based index of the first photo in the pair that could not be aligned. */
  pairIndex?: number;
  canJoin: boolean;
}

/**
 * Runs real panorama stitching over the captured frames, showing progress while it works and
 * offering honest choices when alignment fails. A failed stitch is never quietly downgraded to
 * the fixed-overlap join — the user has to pick that.
 */
export function PanoramaBuilder({
  files,
  onDone,
  onRetake,
  onCancel,
}: {
  files: File[];
  onDone: (outcome: PanoramaOutcome) => void;
  onRetake: () => void;
  onCancel: () => void;
}) {
  const [progress, setProgress] = useState<PanoramaProgress>({ stage: 'engine', message: 'Gør klar…' });
  const [failure, setFailure] = useState<Failure | null>(null);
  const [joining, setJoining] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // Held in a ref so a parent re-render cannot change the callback identity and restart a
  // stitch that is already running.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const run = useCallback(async () => {
    setFailure(null);
    setProgress({ stage: 'engine', message: 'Gør klar…' });
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const file = await stitchPanorama(files, {
        signal: controller.signal,
        onProgress: (value) => {
          if (!controller.signal.aborted) setProgress(value);
        },
      });
      if (!controller.signal.aborted) onDoneRef.current({ kind: 'stitched', file });
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof PanoramaStitchError) {
        setFailure({
          message: error.message,
          pairIndex: error.pairIndex,
          canJoin: files.length >= 2,
        });
        return;
      }
      setFailure({
        message: 'Panoramaet kunne ikke samles.',
        canJoin: files.length >= 2,
      });
    }
  }, [files]);

  useEffect(() => {
    void run();
    return () => abortRef.current?.abort();
  }, [run]);

  async function joinWithoutAlignment() {
    setJoining(true);
    try {
      const file = await prepareGardenImage(files, {
        layout: 'horizontal',
        overlapRatio: PANORAMA_OVERLAP_RATIO,
      });
      onDoneRef.current({ kind: 'joined', file });
    } catch {
      setFailure((current) => current && { ...current, message: 'Billederne kunne ikke samles.' });
      setJoining(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card panorama-card" role="dialog" aria-modal="true" aria-live="polite">
        {!failure ? (
          <div className="panorama-working">
            <div className="capture-spinner" aria-hidden="true"><LeafIcon size={26} /></div>
            <strong>{progress.message}</strong>
            {progress.total ? (
              <div className="panorama-track" aria-hidden="true">
                <span style={{ width: `${((progress.current ?? 0) / progress.total) * 100}%` }} />
              </div>
            ) : null}
            <button type="button" className="link-button" onClick={() => { abortRef.current?.abort(); onCancel(); }}>
              Annuller
            </button>
          </div>
        ) : (
          <>
            <h2>Panoramaet passer ikke sammen</h2>
            <p className="muted">{failure.message}</p>
            <div className="panorama-choices">
              <button type="button" className="primary" onClick={onRetake} disabled={joining}>
                {failure.pairIndex === undefined
                  ? 'Tag fotoene om'
                  : `Tag foto ${failure.pairIndex + 2} om`}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={joining}
                onClick={() => onDoneRef.current({ kind: 'separate', files })}
              >
                Brug billederne hver for sig
              </button>
              {failure.canJoin && (
                <button
                  type="button"
                  className="secondary"
                  disabled={joining}
                  onClick={() => void joinWithoutAlignment()}
                >
                  {joining ? 'Samler…' : 'Saml uden billedtilpasning'}
                </button>
              )}
            </div>
            <button type="button" className="link-button" onClick={onCancel} disabled={joining}>
              Fortryd
            </button>
          </>
        )}
      </section>
    </div>
  );
}
