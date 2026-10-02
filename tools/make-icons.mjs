// Builds icons/defaults/**.webp (512x512) from the source PNGs and writes icons/index.json.
// Source folder: env ICON_SRC (default below). Re-runnable.
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = process.env.ICON_SRC || 'C:/Users/johnb/Downloads/icons/shadowrun-gen';
const map = JSON.parse(fs.readFileSync(path.join(root, 'tools/icon-defaults.json'), 'utf8'));

for (const [key, name] of Object.entries(map)) {
  const out = path.join(root, 'icons/defaults', key + '.webp');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await sharp(path.join(src, name + '.png')).resize(512, 512, { fit: 'cover' }).webp({ quality: 82 }).toFile(out);
}

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.webp') ? [path.relative(root, path.join(d, e.name)).split(path.sep).join('/')] : []);
const index = walk(path.join(root, 'icons')).sort();
fs.writeFileSync(path.join(root, 'icons/index.json'), JSON.stringify(index, null, 1) + '\n');
console.log(`${index.length} icons`);
