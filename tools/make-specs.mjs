// Prints the SPECS and skill tables from a local sra2 checkout (SRA2_DIR, default ../sra2x); paste into scripts/lib/sra2.js.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.env.SRA2_DIR ?? '../sra2x', 'src/packs/anarchy-items-en')
const load = prefix => readdirSync(dir).filter(f => f.startsWith(prefix)).map(f => JSON.parse(readFileSync(join(dir, f), 'utf8')))
const q = s => JSON.stringify(s).replace(/"/g, "'")

const specs = load('specialization_')
  .map(i => ({ slug: i.system.slug, name: i.name.replace(/^Spec: /, ''), skill: i.system.linkedSkill, attr: i.system.linkedAttribute }))
  .sort((a, b) => a.slug.localeCompare(b.slug))
console.log('// skills:')
for (const i of load('skill_').sort((a, b) => a.system.slug.localeCompare(b.system.slug)))
  console.log(`//   ${i.system.slug}: { slug: ${q(i.system.slug)}, name: ${q(i.name)}, attr: ${q(i.system.linkedAttribute)} }`)
console.log('export const SPECS = [')
for (const s of specs) console.log(`  { slug: ${q(s.slug)}, name: ${q(s.name)}, skill: ${q(s.skill)}, attr: ${q(s.attr)} },`)
console.log(']')
