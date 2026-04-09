/**
 * Generate PNG icons from TripNest brand source image.
 *
 * Source: client/public/icons/favicon-source.jpg
 * Output: client/public/icons/*.png
 *
 * Run:
 *   node scripts/generate-icons.js
 */
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const iconsDir = join(__dirname, '..', 'public', 'icons')

const faviconSource = join(iconsDir, 'favicon-source.jpg')
if (!existsSync(faviconSource)) {
  console.error(`Missing source image: ${faviconSource}`)
  process.exit(1)
}

const pwaSource = join(__dirname, '..', 'public', 'logo-dark.png')
if (!existsSync(pwaSource)) {
  console.error(`Missing source logo-dark.png: ${pwaSource}`)
  process.exit(1)
}

const faviconSrc = readFileSync(faviconSource)
const pwaSrc = readFileSync(pwaSource)

// Favicons (tab icons) — from brand JPEG, normalized for contrast
for (const size of [32, 48]) {
  await sharp(faviconSrc)
    .normalise()
    .resize(size, size, {
      fit: 'contain',
      position: 'center',
      background: { r: 9, g: 9, b: 11, alpha: 1 },
    })
    .png({ compressionLevel: 9 })
    .toFile(join(iconsDir, `favicon-${size}.png`))
  console.log(`✓ favicon-${size}.png (${size}x${size})`)
}

// PWA / iOS icons — from logo-dark.png (requested brand source)
const pwaTargets = [
  { name: 'apple-touch-icon-180x180.png', size: 180 },
  { name: 'icon-192x192.png', size: 192 },
  { name: 'icon-512x512.png', size: 512 },
  { name: 'apple-touch-icon-180x180-v2.png', size: 180 },
  { name: 'icon-192x192-v2.png', size: 192 },
  { name: 'icon-512x512-v2.png', size: 512 },
]

for (const { name, size } of pwaTargets) {
  await sharp(pwaSrc)
    .normalise()
    .resize(size, size, {
      fit: 'contain',
      position: 'center',
      background: { r: 9, g: 9, b: 11, alpha: 1 },
    })
    .png({ compressionLevel: 9 })
    .toFile(join(iconsDir, name))
  console.log(`✓ ${name} (${size}x${size})`)
}

