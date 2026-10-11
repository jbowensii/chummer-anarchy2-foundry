// Chummer Anarchy 0.12.x+ (owner, 2026-10-11): an entry the book prints with several levels is one entry per level, each
// with `family` (the id the entry had before it was split) and `level`; the lowest level keeps that id. Made-up data only.
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import Ajv2020 from 'ajv/dist/2020.js'
import { MODULE_ID } from '../scripts/lib/constants.js'
import { translateBook } from '../scripts/lib/books.js'
import { planUpsert } from '../scripts/lib/chummer-id.js'

const bonuses = { light: 0, serious: 0, physicalThreshold: 0, mentalThreshold: 0, matrixThreshold: 0, armor: 0, anarchy: 0, initiative: 0 }
const amp = (n, extra = {}) => ({ id: n === 1 ? 'mux.hop' : `mux.hop-level-${n}`, source: 'MUX', page: 5, canon: false, mod: false, type: 'adept', typeName: 'Adept power',
  name: `Hop ${n}`, rating: n, essence: 0, effects: [], rr: [], bonuses, family: 'mux.hop', level: n, ...extra })
const book = { source: { id: 'MUX', name: 'Made-Up Extras', publisher: 'Made-Up Press', canon: false },
  amps: [amp(1), amp(2), amp(3)], items: [], vehicles: [], skills: [], specs: [], rules: [] }
const file = { format: 'chummer-anarchy2-export', version: 1, kind: 'books', exportedAt: '2026-10-11T00:00:00.000Z',
  app: { name: 'Chummer Anarchy 2.0', version: 'test' }, descriptions: false, books: [book] }
const flags = d => d.flags[MODULE_ID]

describe('levels', () => {
  test('the export schema takes family and level', () => {
    const check = new Ajv2020({ strict: false, validateFormats: false }).compile(JSON.parse(readFileSync('schema/export.schema.json', 'utf8')))
    expect(check(file), JSON.stringify(check.errors)).toBe(true)
  })

  test('each level is its own feat with its rating; the lowest keeps the old id', () => {
    const feats = translateBook(book, { exportedAt: file.exportedAt, appVersion: 'test' }).packs.amps
    expect(feats.map(f => [f.name, f.system.rating, flags(f).chummerID])).toEqual([
      ['Hop 1', 1, 'MUX:amps:mux.hop'], ['Hop 2', 2, 'MUX:amps:mux.hop-level-2'], ['Hop 3', 3, 'MUX:amps:mux.hop-level-3']])
    expect(new Set(feats.map(f => flags(f).category))).toEqual(new Set([flags(feats[0]).category])) // one folder
  })

  test('re-importing over the world’s old single entry updates it as level 1 and adds the others', () => {
    const feats = translateBook(book, { exportedAt: file.exportedAt, appVersion: 'test' }).packs.amps
    const old = { _id: 'F1', flags: { [MODULE_ID]: { chummerID: 'MUX:amps:mux.hop', chummerAliases: [] } } }
    const r = planUpsert([old], feats)
    expect(r.updates.map(u => [u._id, u.doc.name, u.how])).toEqual([['F1', 'Hop 1', 'chummerID']])
    expect(r.creates.map(d => d.name)).toEqual(['Hop 2', 'Hop 3'])
  })
})
