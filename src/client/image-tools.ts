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

export async function prepareGardenImage(files: File[]): Promise<File> {
  if (files.length === 0) throw new Error('Vælg mindst ét billede.');
  const bitmaps = await Promise.all(files.slice(0, 6).map(bitmapFor));
  try {
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
    return canvasToFile(canvas, files.length > 1 ? 'haveomraade-stitch.jpg' : 'haveomraade.jpg');
  } finally {
    bitmaps.forEach((bitmap) => bitmap.close());
  }
}
