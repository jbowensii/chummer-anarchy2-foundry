import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { MODULE_ID } from '../scripts/lib/constants.js'
import { ampIconKey, iconFor, itemIconKey, MODULE_ICON_ROOT, replaceable, skillIconKey, slugName } from '../scripts/lib/icons.js'
import { translateBook } from '../scripts/lib/books.js'
import { translateRunner } from '../scripts/lib/translate.js'

const M = MODULE_ICON_ROOT
describe('iconFor lookup order', () => {
  const all = ['icons/items/crb.ares-predator-vi.webp', 'icons/items/ares-predator-vi.webp',
    'icons/defaults/weapon/heavy-pistols.webp', 'icons/defaults/weapon.webp']
  const args = ['weapon/heavy-pistols', 'Ares Predator VI', 'CRB']
  test('book file, then name file, then full key, then category, then null', () => {
    expect(iconFor(...args, all)).toBe(M + all[0])
    expect(iconFor(...args, all.slice(1))).toBe(M + all[1])
    expect(iconFor(...args, all.slice(2))).toBe(M + all[2])
    expect(iconFor(...args, new Set(all.slice(3)))).toBe(M + all[3])
    expect(iconFor(...args, [])).toBeNull()
  })
  test('no book skips the book file', () => expect(iconFor('weapon/heavy-pistols', 'Ares Predator VI', null, all)).toBe(M + all[1]))
  test('slugName', () => expect(slugName('  Ares Predator VI (Custom)! ')).toBe('ares-predator-vi-custom'))
})

describe('icon keys', () => {
  test('items', () => {
    expect(itemIconKey({ kind: 'weapon', name: 'Made-Up Heavy Pistol' })).toBe('weapon/heavy-pistols')
    expect(itemIconKey({ kind: 'weapon', name: 'Made-Up Zapper Thing' })).toBe('weapon/custom-weapon')
    expect(itemIconKey({ kind: 'armor', name: 'Vest' })).toBe('armor')
    expect(itemIconKey({ kind: 'gear', name: 'Made-Up Phone', starting: 'commlink' })).toBe('equipment/commlink')
    expect(itemIconKey({ kind: 'gear', name: 'Papers', starting: 'fake-sin' })).toBe('equipment/sin')
    expect(itemIconKey({ kind: 'gear', name: 'Papers', starting: 'real-sin' })).toBe('equipment/sin')
    expect(itemIconKey({ kind: 'gear', name: 'Rope' })).toBe('equipment')
    expect(itemIconKey({ kind: 'gear', name: 'Fake SIN' })).toBe('equipment')  // starting kind only
    expect(itemIconKey({ kind: 'gear', name: 'Commlink' })).toBe('equipment')
    expect(itemIconKey({ kind: 'spell', name: 'Bolt', category: 'Combat' })).toBe('spell/combat')
    expect(itemIconKey({ kind: 'spell', name: 'Charm' })).toBe('spell')
    expect(itemIconKey({ kind: 'complex-form', name: 'Puppeteer' })).toBe('complex-form')
  })
  test('amps', () => {
    expect(ampIconKey({ type: 'quality', rating: 1 })).toBe('trait/positive')
    expect(ampIconKey({ type: 'quality', rating: 1, effects: [{ id: 'x', category: 'negative' }] })).toBe('trait/negative')
    expect(ampIconKey({ type: 'quality', rating: -1 })).toBe('trait/negative')
    expect(ampIconKey({ type: 'bioware' })).toBe('cyberware/bioware')
    expect(ampIconKey({ type: 'cyberware' })).toBe('cyberware')
    expect(ampIconKey({ type: 'adept' })).toBe('adept-power')
    expect(ampIconKey({ type: 'equipment', name: 'Made-up Blade', item: { kind: 'weapon' } })).toBe('weapon/short-weapons')
  })
  test('skills by group', () => {
    expect(['athletics', 'influence', 'cracking', 'conjuration', 'technomancer', 'perception', 'chummer-x'].map(skillIconKey))
      .toEqual(['skill/physical', 'skill/social', 'skill/technical', 'skill/magic', 'skill/resonance', 'skill/perception', 'skill'])
  })
})

test('replaceable', () => {
  for (const img of [null, '', 'icons/svg/item-bag.svg', 'icons/svg/mystery-man.svg', '/icons/svg/sword.svg',
    'systems/sra2/icons/feat.svg', `${M}icons/defaults/armor.webp`, 'worlds/w/chummer/portraits/r-1.png']) expect(replaceable(img), img).toBe(true)
  for (const img of ['worlds/w/mara.png', 'icons/weapons/guns/pistol.webp', 'uploads/x.webp', 'modules/other/x.webp', 'worlds/w/chummer/x.webp'])
    expect(replaceable(img), img).toBe(false)
})

describe('translators with icons', () => {
  const file = JSON.parse(readFileSync('samples/test-export.json', 'utf8'))
  const index = JSON.parse(readFileSync('icons/index.json', 'utf8'))
  const opts = { exportedAt: file.exportedAt, appVersion: file.app.version, icons: index }
  test('runner items, metatype, skills and vehicles get img; the character does not', () => {
    const t = translateRunner(file.runners[0], opts)
    const img = n => t.items.find(i => i.name === n).img
    expect(img('Made-Up Heavy Pistol')).toBe(`${M}icons/defaults/weapon/heavy-pistols.webp`)
    expect(img('Human')).toBe(`${M}icons/defaults/metatype.webp`)
    expect(img('Spec: Pistols')).toBe(`${M}icons/defaults/skill/physical.webp`)
    expect(t.vehicles[0].actor.img).toBe(`${M}icons/defaults/vehicle/medium-drone.webp`)
    expect(t.actor.img).toBeUndefined()
    expect(t.actor.flags[MODULE_ID].icon).toBeUndefined()
  })
  test('without the icons option no document gets an img', () => {
    const t = translateRunner(file.runners[0], { ...opts, icons: undefined })
    expect(t.items.length).toBeGreaterThan(0)
    for (const i of t.items) { expect(i.img, i.name).toBeUndefined(); expect(i.flags[MODULE_ID].icon, i.name).toBeTruthy() }
    expect(t.vehicles[0].actor.img).toBeUndefined()
  })
  test('runner amps: negative quality, adept power; vehicle book from its amp', () => {
    const r = structuredClone(file.runners[0])
    r.amps.push({ uid: 'a-neg', type: 'quality', name: 'Made-Up Bad Luck', rating: 1, effects: [{ id: 'negative', name: 'Negative', category: 'negative' }] })
    r.amps.find(a => a.uid === 'v-drone').source = 'CRB'
    const t = translateRunner(r, opts), key = n => t.items.find(i => i.name === n).flags[MODULE_ID].icon.key
    expect(key('Made-Up Bad Luck')).toBe('trait/negative')
    expect(key('Made-Up Steady Hands')).toBe('trait/positive')
    expect(key('Made-Up Quick Flow')).toBe('adept-power')
    expect(t.vehicles[0].actor.flags[MODULE_ID].icon.book).toBe('CRB')
  })
  test('book entries carry the book id', () => {
    const books = JSON.parse(readFileSync('samples/test-books.json', 'utf8'))
    const t = translateBook(books.books?.[0] ?? books, opts)
    const all = Object.entries(t.packs).filter(([k]) => k !== 'rules' && k !== 'characters' && k !== 'npcs').flatMap(([, d]) => d)
    expect(all.length).toBeGreaterThan(0)
    for (const d of all) {
      expect(d.flags[MODULE_ID].icon.book, d.name).toBe(t.source.id)
      expect(d.img, d.name).toMatch(/^modules\/chummer-anarchy2-importer\/icons\/defaults\//)
    }
    const charm = all.find(d => d.name === 'Made-up Charm')
    expect(charm.flags[MODULE_ID].icon.key).toBe('spell/combat')
    expect(charm.img).toBe(`${M}icons/defaults/spell/combat.webp`)
  })
  test('a book quality printed with a negative rating is trait/negative', () => {
    const b = structuredClone(JSON.parse(readFileSync('samples/test-books.json', 'utf8')).books[0])
    const q = b.amps.find(a => a.type === 'quality')
    Object.assign(q, { rating: 0, printedRating: -2, effects: [] })
    const t = translateBook(b, opts)
    expect(t.packs.amps.find(d => d.name === q.name).flags[MODULE_ID].icon.key).toBe('trait/negative')
  })
})
