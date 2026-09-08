#!/usr/bin/env node
/**
 * Copies the OpenCV.js build out of node_modules into public/vendor/ so it ships as a
 * plain static asset instead of going through the bundler.
 *
 * It is one ~11 MB file with the WASM embedded as a data URI, which means:
 * - no separate .wasm fetch and no cross-origin CDN, so the APK and an offline PWA both work
 * - it stays out of the app bundle and is only fetched when someone actually stitches
 *
 * public/vendor/ is gitignored; this script runs before dev and build.
 */
import { copyFile, mkdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(projectRoot, 'public/vendor/opencv.js');

async function sizeOf(path) {
  try {
    return (await stat(path)).size;
  } catch {
    return -1;
  }
}

async function main() {
  let source;
  try {
    source = require.resolve('@techstark/opencv-js/dist/opencv.js');
  } catch {
    console.error('[vendor-opencv] @techstark/opencv-js is not installed. Run npm install first.');
    process.exit(1);
  }

  const [sourceSize, targetSize] = await Promise.all([sizeOf(source), sizeOf(target)]);
  if (sourceSize === targetSize) {
    console.log('[vendor-opencv] public/vendor/opencv.js is up to date.');
    return;
  }

  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
  console.log(`[vendor-opencv] copied opencv.js (${(sourceSize / 1024 / 1024).toFixed(1)} MB) to public/vendor/.`);
}

await main();
