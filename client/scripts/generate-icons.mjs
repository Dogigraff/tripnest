/**
 * Generates PNG icons for PWA from the master SVG icon.
 * Generates favicon PNGs from favicon-source.jpg when present (tab icon).
 * Run: node scripts/generate-icons.mjs
 * Called automatically via the "prebuild" npm script.
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '..', 'public', 'icons');
const svgBuffer = readFileSync(join(iconsDir, 'icon.svg'));

const sizes = [
  { name: 'apple-touch-icon-180x180.png', size: 180 },
  { name: 'icon-192x192.png', size: 192 },
  { name: 'icon-512x512.png', size: 512 },
];

for (const { name, size } of sizes) {
  await sharp(svgBuffer, { density: 300 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(join(iconsDir, name));
  console.log(`  \u2713 ${name} (${size}x${size})`);
}

// Favicon for browser tabs — from brand asset (JPEG/PNG), padded on #09090b
const faviconSource = join(iconsDir, 'favicon-source.jpg');
if (existsSync(faviconSource)) {
  const src = readFileSync(faviconSource);
  for (const size of [32, 48]) {
    await sharp(src)
      .resize(size, size, {
        fit: 'contain',
        position: 'center',
        background: { r: 9, g: 9, b: 11, alpha: 1 },
      })
      .png({ compressionLevel: 9 })
      .toFile(join(iconsDir, `favicon-${size}.png`));
    console.log(`  \u2713 favicon-${size}.png (${size}x${size})`);
  }
} else {
  console.log('  (skip favicon: no public/icons/favicon-source.jpg)');
}

console.log('PWA icons generated.');
