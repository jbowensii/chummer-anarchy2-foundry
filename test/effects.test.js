// Chummer's's effect fields (export-format.md: effects' line, applied, switch, when, affects, unpriced; an amp's
// switch; sra2's counts; items' and metatypes' effects; a runner's pool notes, effects block and switched totals).
// Made-up data only.
import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, test } from 'vitest'
import { translateBook } from '../scripts/lib/books.js'
import { bracket, effectFacts, effectHow, effectText, translateRunner } from '../scripts/lib/translate.js'

const file = JSON.parse(readFileSync('samples/test-export.json', 'utf8'))
const opts = { exportedAt: file.exportedAt, appVersion: '0.12.0' }
const [mara] = file.runners
const bonuses = { light: 0, serious: 0, physicalThreshold: 0, mentalThreshold: 0, matrixThreshold: 0, armor: 0, anarchy: 0, initiative: 0 }
const fx = (id, more = {}) => ({ id, name: `Made-up ${id}`, category: 'narrative', applied: true, ...more })

describe('effect text', () => {
  test('the sheet line with how it is turned on', () => {
    expect(effectText(fx('advantage', { line: 'Advantage on Made-up Tests', switch: 'sustained', affects: 'target' }))).toBe('Advantage on Made-up Tests (sustained, affects target(s))')
    expect(effectText(fx('rr-spec', { line: 'Luck', unpriced: true }))).toBe('Luck (unpriced by the rating)')
    expect(effectText(fx('armor-plus', { applied: false, confidence: 'low' }))).toBe('Made-up armor-plus (not applied)')
    expect(effectText({ id: 'narrative', name: 'Narrative', param: 'Made-up knack' })).toBe('Narrative (Made-up knack)') // an older file
    expect(effectHow({ switch: 'conditional', when: 'while gliding' })).toBe('while gliding')
    expect(bracket(1, 2)).toBe('1 (2)')
    expect(bracket(1, 1)).toBe('1')
  })
})

describe('a runner', () => {
  const amp = { uid: 'a-dose', type: 'equipment', typeName: 'Gear', name: 'Made-up dose', canon: false, rating: 3, essence: 0, switch: 'activated',
    effects: [fx('rr-attr', { param: 'agi', switch: 'activated' }), fx('ignore-wounds', { line: 'Ignores wound modifiers', switch: 'activated' }),
      fx('sustain-spell', { switch: 'activated' })],
    rr: [{ on: 'attribute', id: 'agi', name: 'Agility', value: 1 }], bonuses: { ...bonuses, sustainedSpells: 1, summonedSpirits: 1, riggerConsoles: 2, vehicleControlRig: 1 } }
  const spell = { uid: 'i-glow', kind: 'spell', name: 'Made-up glow', canon: false, price: 5000,
    effects: [fx('advantage', { line: 'Advantage on Influence Tests', switch: 'sustained', affects: 'target' })] }
  const runner = { ...mara, amps: [amp], items: [spell],
    pools: [{ skill: 'athletics', label: 'Athletics', attr: 'agi', dp: 6, rr: 0, notes: [{ ref: 'advantage', text: 'Advantage on Athletics Tests', from: 'Made-up shoes' }] }],
    effects: { sustain: { free: 1, max: 2, formsFree: 1, formsMax: 2 }, extraSpirits: 0, socialArmor: 1, matrixArmor: 0, forcedRisk: false, rcc: 0, vcr: false,
      list: [{ ref: 'no-disadvantage', text: 'No Disadvantage: Dusk sight', from: 'Gnome (Dusk sight)', how: '', applied: true, rule: true, type: 'metatype' }] },
    thresholds: { ...mara.thresholds, social: [4, 7, 10] },
    switched: { monitor: mara.monitor, thresholds: mara.thresholds, armor: mara.armor, initiative: null, pools: [{ rr: 1 }], weapons: [],
      effects: { sustain: { free: 2, max: 4, formsFree: 1, formsMax: 2 }, extraSpirits: 0, socialArmor: 1, matrixArmor: 0, ignoreWounds: 'all', forcedRisk: false, rcc: 0, vcr: false, list: [] } } }
  const t = translateRunner(runner, opts)
  test('a switchable amp is imported switched off, with sra2’s counts', () => {
    const feat = t.items.find(i => i.name === 'Made-up dose').system
    expect(feat).toMatchObject({ active: false, sustainedSpellCount: 1, summonedSpiritCount: 1, riggerConsoleCount: 2, hasVehicleControlWiring: true })
    expect(feat.rrList).toEqual([{ rrType: 'attribute', rrValue: 1, rrTarget: 'agility' }])
    expect(feat.narrativeEffects.map(n => n.text)).toEqual(['Ignores wound modifiers (activated)', 'Made-up sustain-spell (activated)'])
  })
  test('an item’s effects are its narrative effects; a target’s say so', () => {
    expect(t.items.find(i => i.name === 'Made-up glow').system.narrativeEffects)
      .toEqual([{ text: 'Advantage on Influence Tests (sustained, affects target(s))', isNegative: false, value: 0 }])
  })
  test('the notes: pool notes, the bracketed totals, social armor, the racial quality', () => {
    const lines = effectFacts(runner)
    expect(lines).toEqual(expect.arrayContaining(['Athletics (AGI): RR 0 (1)', 'Athletics: Advantage on Athletics Tests (Made-up shoes)',
      'Social armor 1: social thresholds 4/7/10', 'Sustained spells: 1 (2) without a Disadvantage, 2 (4) at most',
      'Ignores all wound modifiers (switched on)', 'No Disadvantage: Dusk sight (Gnome (Dusk sight))']))
    expect(t.actor.system.bio.notes).toContain('Athletics (AGI): RR 0 (1)')
  })
  test('a file without the effect fields still translates (older exports)', () => {
    expect(effectFacts(mara)).toEqual([])
  })
})

describe('a book', () => {
  test('a metatype’s racial quality effects in its description; an item’s effects', () => {
    const book = { source: { id: 'MADE', name: 'Made-up book', publisher: 'Nobody', canon: false }, amps: [], vehicles: [], skills: [], specs: [], rules: [],
      items: [{ id: 'made.lamp', source: 'MADE', page: 2, canon: false, kind: 'gear', name: 'Made-up lamp', specialist: false,
        effects: [fx('no-disadvantage', { line: 'No Disadvantage: darkness' })] }],
      metatypes: [{ id: 'gnome', source: 'MADE', page: 1, canon: false, name: 'Gnome', edge: 3, ranges: {}, racialQuality: 'Dusk sight',
        effects: [fx('no-disadvantage', { line: 'No Disadvantage: Dusk sight' })] }] }
    const out = translateBook(book, opts)
    expect(out.packs.metatypes[0].system.description).toContain('No Disadvantage: Dusk sight')
    expect(out.packs.gear[0].system.narrativeEffects[0].text).toBe('No Disadvantage: darkness')
  })
  test('the schema takes the new fields', () => {
    const check = new Ajv2020({ strict: false, validateFormats: false }).compile(JSON.parse(readFileSync('schema/export.schema.json', 'utf8')))
    const e = { id: 'advantage', name: 'Advantage on a Test', category: 'narrative', line: 'Advantage on all Tests', applied: true, switch: 'sustained', affects: 'target', unpriced: true }
    const ok = check({ ...file, runners: [{ ...mara, amps: [{ ...mara.amps[0], switch: 'activated', effects: [e] }] }] })
    expect(check.errors ?? []).toEqual([])
    expect(ok).toBe(true)
  })
})
