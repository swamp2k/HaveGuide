export const PANORAMA_OVERLAP_RATIO = 0.24;

interface PrepareGardenImageOptions {
  overlapRatio?: number;
  layout?: 'vertical' | 'horizontal';
}

async function bitmapFor(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: 'from-image' });
}

function canvasToFile(canvas: HTMLCanvasElement, name: string, quality = 0.86): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('Kunne ikke behandle billedet.'));
      resolve(new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() }));
    }, 'image/jpeg', quality);
  });
}

function prepareVerticalCanvas(bitmaps: ImageBitmap[]): HTMLCanvasElement {
  let targetWidth = Math.min(1800, Math.max(...bitmaps.map((bitmap) => bitmap.width)));
  let heights = bitmaps.map((bitmap) => Math.round(bitmap.height * (targetWidth / bitmap.width)));

  const totalHeight = () => heights.reduce((sum, height) => sum + height, 0);
  if (totalHeight() > 7200) {
    const factor = 7200 / totalHeight();
    targetWidth = Math.max(640, Math.round(targetWidth * factor));
    heights = bitmaps.map((bitmap) => Math.round(bitmap.height * (targetWidth / bitmap.width)));
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = totalHeight();
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Browseren kunne ikke oprette billedfladen.');

  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let y = 0;
  bitmaps.forEach((bitmap, index) => {
    const height = heights[index] ?? 0;
    ctx.drawImage(bitmap, 0, y, targetWidth, height);
    y += height;
  });

  return canvas;
}

function prepareHorizontalPanoramaCanvas(
  bitmaps: ImageBitmap[],
  overlapRatio: number,
): HTMLCanvasElement {
  const slices = bitmaps.map((bitmap, index) => {
    const sourceX = index === 0 ? 0 : Math.round(bitmap.width * overlapRatio);
    return {
      bitmap,
      sourceX,
      sourceWidth: Math.max(1, bitmap.width - sourceX),
    };
  });

  let targetHeight = Math.min(1800, Math.max(...bitmaps.map((bitmap) => bitmap.height)));
  let widths = slices.map((slice) => (
    Math.round(slice.sourceWidth * (targetHeight / slice.bitmap.height))
  ));

  const totalWidth = () => widths.reduce((sum, width) => sum + width, 0);
  if (totalWidth() > 7200) {
    const factor = 7200 / totalWidth();
    targetHeight = Math.max(320, Math.floor(targetHeight * factor));
    widths = slices.map((slice) => (
      Math.round(slice.sourceWidth * (targetHeight / slice.bitmap.height))
    ));
  }

  const canvas = document.createElement('canvas');
  canvas.width = totalWidth();
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Browseren kunne ikke oprette billedfladen.');

  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let x = 0;
  slices.forEach((slice, index) => {
    const width = widths[index] ?? 0;
    ctx.drawImage(
      slice.bitmap,
      slice.sourceX,
      0,
      slice.sourceWidth,
      slice.bitmap.height,
      x,
      0,
      width,
      targetHeight,
    );
    x += width;
  });

  return canvas;
}

export async function prepareGardenImage(
  files: File[],
  options: PrepareGardenImageOptions = {},
): Promise<File> {
  if (files.length === 0) throw new Error('Vælg mindst ét billede.');

  const overlapRatio = Math.max(0, Math.min(0.45, options.overlapRatio ?? 0));
  const layout = options.layout ?? 'vertical';
  const bitmaps = await Promise.all(files.slice(0, 6).map(bitmapFor));

  try {
    const canvas = layout === 'horizontal'
      ? prepareHorizontalPanoramaCanvas(bitmaps, overlapRatio)
      : prepareVerticalCanvas(bitmaps);

    return canvasToFile(
      canvas,
      files.length > 1
        ? layout === 'horizontal'
          ? 'haveomraade-panorama.jpg'
          : 'haveomraade-stitch.jpg'
        : 'haveomraade.jpg',
    );
  } finally {
    bitmaps.forEach((bitmap) => bitmap.close());
  }
}
