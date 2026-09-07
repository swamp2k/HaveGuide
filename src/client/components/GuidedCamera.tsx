import { useEffect, useRef, useState } from 'react';
import { PANORAMA_OVERLAP_RATIO } from '../image-tools';

type CameraStage = 'shoot' | 'first-choice' | 'panorama-review';

interface GuidedCameraProps {
  onCancel: () => void;
  onComplete: (files: File[], panorama: boolean) => void;
  onFallback: () => void;
}

function frameToFile(video: HTMLVideoElement, index: number): Promise<File> {
  if (!video.videoWidth || !video.videoHeight) {
    return Promise.reject(new Error('Kameraet er ikke klar endnu.'));
  }

  const maxWidth = 2200;
  const scale = Math.min(1, maxWidth / video.videoWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));

  const context = canvas.getContext('2d');
  if (!context) return Promise.reject(new Error('Kunne ikke oprette billedfladen.'));

  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('Kunne ikke gemme fotoet.'));
      resolve(new File([blob], `haveguide-capture-${index + 1}.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now(),
      }));
    }, 'image/jpeg', 0.92);
  });
}

export function GuidedCamera({ onCancel, onComplete, onFallback }: GuidedCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [captures, setCaptures] = useState<File[]>([]);
  const [stage, setStage] = useState<CameraStage>('shoot');
  const [panorama, setPanorama] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [lastPreviewUrl, setLastPreviewUrl] = useState('');

  useEffect(() => {
    let active = true;
    let stream: MediaStream | null = null;

    async function openCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Denne browser giver ikke adgang til guidekameraet.');
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 2560 },
          },
        });

        if (!active || !videoRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        if (active) setReady(true);
      } catch (error) {
        if (!active) return;
        const message = error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'HaveGuide fik ikke adgang til kameraet.'
          : 'Guidekameraet kunne ikke åbnes på denne enhed.';
        setCameraError(message);
      }
    }

    void openCamera();

    return () => {
      active = false;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    const last = captures.at(-1);
    if (!last) {
      setLastPreviewUrl('');
      return undefined;
    }

    const url = URL.createObjectURL(last);
    setLastPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [captures]);

  async function takePhoto() {
    if (!videoRef.current || !ready || capturing) return;
    setCapturing(true);
    setCameraError('');

    try {
      const file = await frameToFile(videoRef.current, captures.length);
      setCaptures((current) => [...current, file]);
      setStage(captures.length === 0 ? 'first-choice' : 'panorama-review');
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : 'Kunne ikke tage fotoet.');
    } finally {
      setCapturing(false);
    }
  }

  function retake() {
    setCaptures((current) => current.slice(0, -1));
    setStage('shoot');
    if (!panorama) setPanorama(false);
  }

  const guideActive = stage === 'shoot' && panorama && captures.length > 0 && lastPreviewUrl;
  const reviewActive = stage !== 'shoot' && lastPreviewUrl;
  const overlapPercent = PANORAMA_OVERLAP_RATIO * 100;

  return (
    <section className="guided-camera" role="dialog" aria-modal="true" aria-label="Guidekamera">
      <div className="camera-topbar">
        <button type="button" className="camera-text-button" onClick={onCancel}>Luk</button>
        <strong>{panorama ? `Panorama → · ${captures.length}/6` : 'Tag foto'}</strong>
        <span className="camera-topbar-spacer" aria-hidden="true" />
      </div>

      <div className="camera-stage">
        <video ref={videoRef} className="camera-video" playsInline muted />

        {guideActive && (
          <>
            <div
              className="camera-overlap-guide"
              style={{ width: `${overlapPercent}%` }}
              aria-hidden="true"
            >
              <img src={lastPreviewUrl} alt="" />
            </div>
            <div
              className="camera-guide-line"
              style={{ left: `${overlapPercent}%` }}
              aria-hidden="true"
            />
            <div
              className="camera-overlap-label"
              style={{ left: `calc(${overlapPercent}% + 10px)` }}
              aria-hidden="true"
            >
              ← MATCH FORRIGE FOTO
            </div>
          </>
        )}

        {reviewActive && (
          <div className="camera-review">
            <img src={lastPreviewUrl} alt="Senest tagne foto" />
          </div>
        )}

        {!reviewActive && !cameraError && (
          <div className="camera-instruction">
            {guideActive ? (
              <>
                <strong>Panorér mod højre →</strong>
                <span>Match den gennemsigtige venstre stribe med højre kant fra forrige foto.</span>
              </>
            ) : (
              <>
                <strong>Start i venstre side af området</strong>
                <span>Hold telefonen lodret og nogenlunde samme afstand, mens du bevæger dig mod højre.</span>
              </>
            )}
          </div>
        )}

        {cameraError && (
          <div className="camera-error-card">
            <strong>Kamera ikke tilgængeligt</strong>
            <span>{cameraError}</span>
            <button type="button" className="secondary" onClick={onFallback}>
              Brug telefonens kamera
            </button>
          </div>
        )}
      </div>

      <div className="camera-controls">
        {stage === 'shoot' && !cameraError && (
          <>
            <span className="camera-control-hint">
              {guideActive ? 'Ca. 24 % overlap giver en stabil samling.' : 'Tag første billede i venstre side.'}
            </span>
            <button
              type="button"
              className="camera-shutter"
              onClick={() => void takePhoto()}
              disabled={!ready || capturing}
              aria-label="Tag foto"
            >
              <span />
            </button>
            <span className="camera-control-hint">{capturing ? 'Gemmer…' : panorama ? 'Fortsæt mod højre →' : ''}</span>
          </>
        )}

        {stage === 'first-choice' && (
          <div className="camera-choice-card">
            <div>
              <strong>Vil du lave et vandret panorama?</strong>
              <span>Behold telefonen lodret. HaveGuide guider dig mod højre med overlap fra foto til foto.</span>
            </div>
            <div className="camera-choice-actions">
              <button type="button" className="secondary" onClick={retake}>Tag om</button>
              <button type="button" className="secondary" onClick={() => onComplete(captures, false)}>
                Nej, brug dette
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  setPanorama(true);
                  setStage('shoot');
                }}
              >
                Ja, lav panorama
              </button>
            </div>
          </div>
        )}

        {stage === 'panorama-review' && (
          <div className="camera-choice-card">
            <div>
              <strong>{captures.length} billeder klar</strong>
              <span>Færdig nu, eller fortsæt længere mod højre gennem området.</span>
            </div>
            <div className="camera-choice-actions">
              <button type="button" className="secondary" onClick={retake}>Tag om</button>
              <button type="button" className="primary" onClick={() => onComplete(captures, true)}>
                Færdig
              </button>
              {captures.length < 6 && (
                <button type="button" className="secondary" onClick={() => setStage('shoot')}>
                  Tag næste →
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
