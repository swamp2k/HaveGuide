import { readFile, writeFile } from 'node:fs/promises';

const manifestPath = new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url);
const cameraPermission = '<uses-permission android:name="android.permission.CAMERA" />';
const cameraFeature = '<uses-feature android:name="android.hardware.camera" android:required="false" />';

let xml;
try {
  xml = await readFile(manifestPath, 'utf8');
} catch {
  console.warn('AndroidManifest.xml findes ikke endnu; springer kamera-permission over.');
  process.exit(0);
}

let updated = xml;
if (!updated.includes(cameraPermission)) {
  updated = updated.replace(
    '</manifest>',
    `  ${cameraPermission}\n  ${cameraFeature}\n\n</manifest>`,
  );
} else if (!updated.includes(cameraFeature)) {
  updated = updated.replace(cameraPermission, `${cameraPermission}\n  ${cameraFeature}`);
}

if (updated !== xml) {
  await writeFile(manifestPath, updated, 'utf8');
  console.log('Tilføjede Android CAMERA permission til Capacitor-projektet.');
}
