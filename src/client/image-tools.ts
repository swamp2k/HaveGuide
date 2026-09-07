export const PANORAMA_OVERLAP_RATIO = 0.24;

interface PrepareGardenImageOptions {
  overlapRatio?: number;
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

export async function prepareGardenImage(
  files: File[],
  options: PrepareGardenImageOptions = {},
): Promise<File> {
  if (files.length === 0) throw new Error('Vælg mindst ét billede.');

  const overlapRatio = Math.max(0, Math.min(0.45, options.overlapRatio ?? 0));
  const bitmaps = await Promise.all(files.slice(0, 6).map(bitmapFor));

  try {
    const slices = bitmaps.map((bitmap, index) => {
      const sourceY = index === 0 ? 0 : Math.round(bitmap.height * overlapRatio);
      return {
        bitmap,
        sourceY,
        sourceHeight: Math.max(1, bitmap.height - sourceY),
      };
    });

    let targetWidth = Math.min(1800, Math.max(...bitmaps.map((bitmap) => bitmap.width)));
    let heights = slices.map((slice) => (
      Math.round(slice.sourceHeight * (targetWidth / slice.bitmap.width))
    ));

    const totalHeight = () => heights.reduce((sum, height) => sum + height, 0);
    if (totalHeight() > 7200) {
      const factor = 7200 / totalHeight();
      targetWidth = Math.max(640, Math.round(targetWidth * factor));
      heights = slices.map((slice) => (
        Math.round(slice.sourceHeight * (targetWidth / slice.bitmap.width))
      ));
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = totalHeight();
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Browseren kunne ikke oprette billedfladen.');

    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let y = 0;
    slices.forEach((slice, index) => {
      const height = heights[index] ?? 0;
      ctx.drawImage(
        slice.bitmap,
        0,
        slice.sourceY,
        slice.bitmap.width,
        slice.sourceHeight,
        0,
        y,
        targetWidth,
        height,
      );
      y += height;
    });

    return canvasToFile(
      canvas,
      files.length > 1 ? 'haveomraade-panorama.jpg' : 'haveomraade.jpg',
    );
  } finally {
    bitmaps.forEach((bitmap) => bitmap.close());
  }
}
