import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = path.join(import.meta.dirname, '..');
const index = JSON.parse(fs.readFileSync(path.join(root, 'icons/index.json'), 'utf8'));
const map = JSON.parse(fs.readFileSync(path.join(root, 'tools/icon-defaults.json'), 'utf8'));
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.webp') ? [path.relative(root, path.join(d, e.name)).split(path.sep).join('/')] : []);

describe('icons', () => {
  it('index matches the files on disk', () => expect(index).toEqual(walk(path.join(root, 'icons')).sort()));
  it('every map key has its file', () => {
    for (const k of Object.keys(map)) expect(index).toContain(`icons/defaults/${k}.webp`);
  });
  it('files are 512x512 webp', async () => {
    for (const f of index) {
      const m = await sharp(path.join(root, f)).metadata();
      expect([f, m.format, m.width, m.height]).toEqual([f, 'webp', 512, 512]);
    }
  });
});
