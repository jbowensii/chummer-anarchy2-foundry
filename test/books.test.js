import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { MODULE_ID } from '../scripts/lib/constants.js'
import { translateBook, translateTableRules } from '../scripts/lib/books.js'
import { docId } from '../scripts/lib/ids.js'

const file = JSON.parse(readFileSync('samples/test-books.json', 'utf8'))
const opts = { exportedAt: file.exportedAt, appVersion: file.app.version, descriptions: file.descriptions }
const [muc, mux] = file.books
const t = translateBook(muc, opts)
const find = (pack, name) => t.packs[pack].find(d => d.name === name)

describe('translating a book', () => {
  test('packs only for the content a book has', () => {
    expect(Object.keys(t.packs).sort()).toEqual(['amps', 'armor', 'gear', 'rules', 'skills', 'spells', 'vehicles', 'weapons'])
    expect(Object.keys(translateBook(mux, opts).packs)).toEqual(['amps'])
    expect(t.source).toEqual(muc.source)
  })

  test('deterministic ids, flags with source/page/canon, reference', () => {
    const blade = find('weapons', 'Made-up Short Blade')
    expect(blade._id).toBe(docId('muc.made-up-blade'))
    expect(translateBook(muc, opts).packs.weapons[0]._id).toBe(blade._id)
    expect(blade.flags[MODULE_ID]).toEqual({ id: 'muc.made-up-blade', exportedAt: opts.exportedAt, appVersion: '0.6.0', source: 'MUC', page: 20, canon: true })
    expect(blade.system.reference).toBe('MUC p.20')
    const extra = translateBook(mux, opts).packs.amps[0]
    expect(extra.flags[MODULE_ID]).toMatchObject({ source: 'MUX', page: 5, canon: false })
    // vehicles, skills and rules take canon from the book
    expect(find('vehicles', 'Made-up Cart').flags[MODULE_ID]).toMatchObject({ id: 'muc.made-up-cart', canon: true, page: 30 })
    expect(find('skills', 'Made-Up Lore').flags[MODULE_ID]).toMatchObject({ canon: true, page: 40 })
  })

  test('amps become feats; the known-spec rr resolves to its sra2 slug', () => {
    const knack = find('amps', 'Made-up Knack')
    expect(knack).toMatchObject({ type: 'feat', system: { featType: 'trait', rating: 1 } })
    expect(knack.system.rrList).toEqual([{ rrType: 'specialization', rrValue: 1, rrTarget: 'spec_pistols' }])
    expect(find('amps', 'Made-up Implant').system).toMatchObject({ featType: 'cyberware', essenceCost: 0.5, bonusLightDamage: 1 })
  })

  test('items: the weapon is short-weapons (known type, no custom links), armor and spell', () => {
    const blade = find('weapons', 'Made-up Short Blade').system
    expect(blade).toMatchObject({ featType: 'weapon', weaponType: 'short-weapons', vdMode: 'attribute', vdBonus: 1, meleeRange: 'ok', shortRange: 'none' })
    expect(blade).not.toHaveProperty('linkedAttackSkill')
    expect(find('armor', 'Made-up Vest').system).toMatchObject({ featType: 'armor', armorValue: 2 })
    expect(find('gear', 'Made-up Widget').system.featType).toBe('equipment')
    expect(find('spells', 'Made-up Charm').system.featType).toBe('spell')
    expect(blade.description).not.toContain('price')
  })

  test('the vehicle is a custom vehicle actor', () => {
    expect(find('vehicles', 'Made-up Cart')).toMatchObject({ _id: docId('muc.made-up-cart'), type: 'vehicle',
      system: { vehicleType: 'custom-vehicle', customAutopilot: 1, customStructure: 2, customSpeed: 2, customArmor: 1, isFlying: false, reference: 'MUC p.30' } })
  })

  test('skills: the new skill and both specs; the core-skill spec linked to close-combat', () => {
    const s = t.packs.skills
    expect(s.map(d => [d.name, d.type])).toEqual([['Made-Up Lore', 'skill'], ['Spec: Old Texts', 'specialization'], ['Spec: Made-Up Style', 'specialization']])
    const lore = s[0].system.slug
    expect(s[0].system).toMatchObject({ linkedAttribute: 'logic', rating: 0 })
    expect(s[1].system).toMatchObject({ linkedSkill: lore, linkedAttribute: 'logic' })
    expect(s[2].system).toMatchObject({ linkedSkill: 'close-combat', linkedAttribute: 'agility', reference: 'MUC p.41' })
    expect(s[2]._id).toBe(docId('close-combat.made-up-style'))
  })

  test('a book skill or spec sra2 already has is left out', () => {
    const b = structuredClone(muc)
    b.skills = [{ id: 'athletics', source: 'MUC', page: 1, name: 'Athletics', attr: 'str', specs: [{ id: 'athletics.climbing', name: 'Climbing', attr: 'str' }] }]
    b.specs = [{ skill: 'close-combat', id: 'close-combat.blades', name: 'Blades', attr: 'agi' }]
    expect(translateBook(b, opts).packs.skills).toBeUndefined()
  })

  test('rules: one journal per section, pages sorted by page then title', () => {
    const r = t.packs.rules
    expect(r.map(j => j.name)).toEqual(['Made-Up Basics', 'Made-Up Extras'])
    const b = structuredClone(muc)
    b.rules[0].page = 60
    b.rules.push({ id: 'muc.rule-a', source: 'MUC', page: 51, sheet: 'core', section: 'Made-Up Basics', title: 'A Rule' })
    const pages = translateBook(b, opts).packs.rules[0].pages
    expect(pages.map(p => p.name)).toEqual(['A Rule', 'Rule Two', 'Rule One'])
    expect(pages.map(p => p.sort)).toEqual([...pages.map(p => p.sort)].sort((x, y) => x - y))
    expect(pages[0]).toMatchObject({ _id: docId('muc.rule-a'), type: 'text', text: { content: '<p>See MUC p.51</p>', format: 1 } })
    expect(r[0].pages[0].text.content).toBe('<p>Made-up rule text with &lt;i&gt;markup&lt;/i&gt;.</p>')
    expect(r[0]._id).toMatch(/^[A-Za-z0-9]{16}$/)
    expect(r[0]._id).not.toBe(r[1]._id)
  })

  test('descriptions escaped, and absent when descriptions are off', () => {
    expect(find('amps', 'Made-up Knack').system.description).toContain('A &lt;b&gt;bold&lt;/b&gt; made-up text')
    const off = translateBook(muc, { ...opts, descriptions: false })
    expect(off.packs.amps[0].system.description).not.toContain('bold')
    expect(off.packs.weapons[0].system.description).not.toContain('blade')
    expect(off.packs.rules[0].pages[0].text.content).toBe('<p>See MUC p.50</p>')
  })

  test('add-ons, printed ratings and an amp\'s base item', () => {
    const b = structuredClone(muc)
    Object.assign(b.amps[1], { mod: true, printedRating: 2, item: { kind: 'weapon', specialist: false, dv: '5P', ranges: { melee: 'ok', short: 'none', medium: 'none', long: 'none' } } })
    const d = translateBook(b, opts).packs.amps[1].system
    expect(d.description).toContain('Add-on')
    expect(d.description).toContain('Printed rating: 2')
    expect(d).toMatchObject({ featType: 'cyberware', damageValue: '5', vdCustomValue: 5, meleeRange: 'ok' })
    expect(find('amps', 'Made-up Implant').system.description).not.toContain('Add-on')
  })
})

test('table rules: one journal, a page per rule', () => {
  const j = translateTableRules(file.tableRules, opts)
  expect(j).toMatchObject({ _id: docId('table-rules'), name: 'Table rules' })
  expect(j.pages).toEqual([expect.objectContaining({ name: 'Made-Up Table Rule', type: 'text', text: { content: '<p>A made-up table rule.</p>', format: 1 } })])
})
