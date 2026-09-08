/**
 * Development-only harness for the panorama stitcher. Not referenced by the app; it exists so
 * the stitching pipeline can be exercised in a real browser against synthetic garden scenes.
 * Served at /panorama-harness.html by `npm run dev`.
 */
import { PanoramaStitchError, stitchPanorama } from './panorama/stitch-panorama';

const log = (message: string) => {
  const el = document.getElementById('log')!;
  el.textContent += `${message}\n`;
  console.log('[harness]', message);
};

/** Paints a wide, textured pseudo-garden so ORB has real features to latch onto. */
function paintScene(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#bcd6e8');
  sky.addColorStop(0.45, '#e6ecd8');
  sky.addColorStop(1, '#5d7444');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  // Deterministic pseudo-random so runs are comparable.
  let seed = 20260908;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  for (let i = 0; i < 2600; i += 1) {
    const x = rnd() * width;
    const y = height * 0.35 + rnd() * height * 0.65;
    const r = 4 + rnd() * 26;
    ctx.fillStyle = `hsl(${70 + rnd() * 70}, ${30 + rnd() * 45}%, ${18 + rnd() * 40}%)`;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.5 + rnd()), rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // A few hard-edged landmarks: stones, posts, flowers.
  for (let i = 0; i < 40; i += 1) {
    const x = rnd() * width;
    const y = height * 0.5 + rnd() * height * 0.45;
    ctx.fillStyle = ['#d9d2c4', '#8a6f52', '#c86a86', '#e8d267', '#7d4b8c'][Math.floor(rnd() * 5)];
    ctx.fillRect(x, y, 12 + rnd() * 46, 12 + rnd() * 60);
    ctx.strokeStyle = 'rgba(20,25,18,.7)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, 12 + rnd() * 46, 12 + rnd() * 60);
  }

  return canvas;
}

/** Extra scene painted around the frame area so bleed and tilt never run off the edge. */
const SCENE_MARGIN = 1.3;

interface SliceOptions {
  count: number;
  overlap: number;
  /** Degrees of hand-held tilt applied to each frame after the first. */
  jitterDeg?: number;
  /** Vertical wobble in pixels. */
  jitterY?: number;
}

/**
 * Cuts overlapping portrait frames out of the wide scene, the way a pan would.
 * The scene is painted taller and wider than the frames so tilt and bleed always sample real
 * pixels — a frame with black edges would put fake seams into the input rather than test the
 * stitcher.
 */
async function sliceFrames(scene: HTMLCanvasElement, options: SliceOptions): Promise<File[]> {
  const { count, overlap } = options;
  const frameHeight = Math.round(scene.height / SCENE_MARGIN);
  const frameWidth = Math.round(frameHeight * 0.75);
  const step = Math.round(frameWidth * (1 - overlap));
  const originY = Math.round((scene.height - frameHeight) / 2);
  const originX = Math.round((scene.width - (step * (count - 1) + frameWidth)) / 2);

  const files: File[] = [];
  for (let i = 0; i < count; i += 1) {
    const canvas = document.createElement('canvas');
    canvas.width = frameWidth;
    canvas.height = frameHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, frameWidth, frameHeight);

    const tilt = i === 0 ? 0 : ((options.jitterDeg ?? 0) * (i % 2 === 0 ? 1 : -1) * Math.PI) / 180;
    const dy = i === 0 ? 0 : (options.jitterY ?? 0) * (i % 2 === 0 ? 1 : -1);

    // Over-draw so the tilt never exposes canvas background: a real photo has no black corners,
    // and letting them in would put fake seams into the input rather than testing the stitcher.
    const bleed = 1.15;
    const drawW = frameWidth * bleed;
    const drawH = frameHeight * bleed;
    ctx.save();
    ctx.translate(frameWidth / 2, frameHeight / 2);
    ctx.rotate(tilt);
    ctx.drawImage(
      scene,
      originX + i * step - (drawW - frameWidth) / 2,
      originY + dy - (drawH - frameHeight) / 2,
      drawW,
      drawH,
      -drawW / 2,
      -drawH / 2,
      drawW,
      drawH,
    );
    ctx.restore();

    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.92),
    );
    files.push(new File([blob], `frame-${i + 1}.jpg`, { type: 'image/jpeg' }));
  }
  return files;
}

function show(container: string, file: File, label: string) {
  const img = document.createElement('img');
  img.src = URL.createObjectURL(file);
  img.alt = label;
  document.getElementById(container)!.appendChild(img);
}

async function run(name: string, files: File[], expectFailure = false) {
  log(`\n=== ${name} (${files.length} fotos) ===`);
  const started = performance.now();
  try {
    const result = await stitchPanorama(files, {
      onProgress: (p) => log(`  ${p.message}`),
    });
    const elapsed = Math.round(performance.now() - started);
    const bitmap = await createImageBitmap(result);
    log(`  OK: ${bitmap.width}x${bitmap.height}px, ${(result.size / 1024).toFixed(0)} kB, ${elapsed} ms`);
    bitmap.close();
    show('out', result, name);
    (window as unknown as Record<string, unknown>)[`result_${name}`] = {
      ok: true,
      width: bitmap.width,
      height: bitmap.height,
      ms: elapsed,
    };
    if (expectFailure) log('  !! expected this to FAIL');
    return { ok: true, width: bitmap.width, height: bitmap.height, ms: elapsed };
  } catch (error) {
    const elapsed = Math.round(performance.now() - started);
    const detail =
      error instanceof PanoramaStitchError
        ? `${error.code}${error.reason ? `/${error.reason}` : ''} pair=${error.pairIndex} — ${error.message}`
        : String(error);
    log(`  ${expectFailure ? 'OK (rejected)' : 'FAILED'}: ${detail} (${elapsed} ms)`);
    return { ok: false, detail, ms: elapsed };
  }
}

async function main() {
  const scene = paintScene(5200, 1820);
  log(`scene ${scene.width}x${scene.height}`);

  const two = await sliceFrames(scene, { count: 2, overlap: 0.35 });
  const four = await sliceFrames(scene, { count: 4, overlap: 0.35, jitterDeg: 2.5, jitterY: 18 });
  two.forEach((f, i) => show('inputs', f, `A${i}`));

  const results: Record<string, unknown> = {};
  results.A_two = await run('A_two', two);
  if (new URLSearchParams(location.search).has('quick')) {
    (window as unknown as Record<string, unknown>).HARNESS_RESULTS = results;
    (window as unknown as Record<string, unknown>).HARNESS_DONE = true;
    log('DONE (quick)');
    return;
  }
  results.B_four = await run('B_four', four);

  // C: a frame from the far side of the garden with no overlap at all.
  const stranger = (await sliceFrames(scene, { count: 6, overlap: 0.35 }))[5];
  results.C_bad = await run('C_bad', [two[0], stranger], true);

  // D: gallery-style selection of three frames taken with wider spacing.
  const three = await sliceFrames(scene, { count: 3, overlap: 0.3, jitterDeg: 1.5, jitterY: 10 });
  results.D_gallery = await run('D_gallery', three);

  // E: run twice more to watch memory behaviour across repeats.
  results.E_repeat1 = await run('E_repeat1', four);
  results.E_repeat2 = await run('E_repeat2', four);

  const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  if (memory) log(`\nJS heap after runs: ${(memory.usedJSHeapSize / 1024 / 1024).toFixed(1)} MB`);

  (window as unknown as Record<string, unknown>).HARNESS_RESULTS = results;
  (window as unknown as Record<string, unknown>).HARNESS_DONE = true;
  log('\nDONE');
}

void main();
