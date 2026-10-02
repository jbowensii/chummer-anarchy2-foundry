import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { MODULE_ID } from '../scripts/lib/constants.js'
import { planBookPacks, translateBook, translateTableRules } from '../scripts/lib/books.js'
import { docId } from '../scripts/lib/ids.js'

const file = JSON.parse(readFileSync('samples/test-books.json', 'utf8'))
const opts = { exportedAt: file.exportedAt, appVersion: file.app.version, descriptions: file.descriptions }
const [muc, mux] = file.books
const t = translateBook(muc, opts)
const find = (pack, name) => t.packs[pack].find(d => d.name === name)

describe('translating a book', () => {
  test('packs only for the content a book has', () => {
    expect(Object.keys(t.packs).sort()).toEqual(['amps', 'armor', 'characters', 'gear', 'metatypes', 'rules', 'skills', 'spells', 'vehicles', 'weapons'])
    expect(Object.keys(translateBook(mux, opts).packs)).toEqual(['amps'])
    expect(t.source).toEqual(muc.source)
  })

  test('deterministic ids, flags with source/page/canon, reference', () => {
    const blade = find('weapons', 'Made-up Short Blade')
    expect(blade._id).toBe(docId('muc.made-up-blade'))
    expect(translateBook(muc, opts).packs.weapons[0]._id).toBe(blade._id)
    expect(blade.flags[MODULE_ID]).toEqual({ id: 'muc.made-up-blade', exportedAt: opts.exportedAt, appVersion: '0.6.0', source: 'MUC', page: 20, canon: true,
      icon: { key: 'weapon/short-weapons', name: blade.name, book: 'MUC' } })
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

  test('a book skill or spec sra2 already has is included, with the sra2 name and slug', () => {
    const b = structuredClone(muc)
    b.skills = [{ id: 'athletics', source: 'MUC', page: 1, name: 'Athletics', attr: 'str', specs: [{ id: 'athletics.climbing', name: 'Climbing', attr: 'str' }] }]
    b.specs = [{ skill: 'close-combat', id: 'close-combat.blades', name: 'Blades', attr: 'agi' }]
    const s = translateBook(b, opts).packs.skills
    expect(s.map(d => [d._id, d.name, d.type, d.system.slug])).toEqual([
      [docId('athletics'), 'Athletics', 'skill', 'athletics'],
      [docId('athletics.climbing'), 'Spec: Climbing', 'specialization', 'spec_climbing'],
      [docId('close-combat.blades'), 'Spec: Blades', 'specialization', 'spec_blades']])
    expect(s[0].system).toMatchObject({ linkedAttribute: 'strength', rating: 0, reference: 'MUC p.1' })
    expect(s[1].system).toMatchObject({ linkedSkill: 'athletics', linkedAttribute: 'strength' })
  })

  test('characters: an actor per pregen with its items; its vehicles as separate, unlinked actors', () => {
    const [max] = muc.characters, c = t.packs.characters
    expect(c.map(d => [d._id, d.name, d.type])).toEqual([
      [docId('MUC:character:muc-sample-max'), 'Made-Up Max', 'character'],
      [docId('MUC:vehicle:muc-sample-max:v-drone'), 'Made-Up Max — Made-Up Scout Drone', 'vehicle']])
    expect(c.every(d => /^[A-Za-z0-9]{16}$/.test(d._id))).toBe(true)
    expect(translateBook(muc, opts).packs.characters.map(d => d._id)).toEqual(c.map(d => d._id))
    const [actor, drone] = c
    expect(actor.items.map(i => i.type)).toEqual(['metatype', 'skill'])
    expect(actor.items.every(i => i._id === undefined)).toBe(true)
    expect(actor.system.attributes).toMatchObject({ logic: 4, willpower: 3 })
    expect(actor.system.linkedVehicles ?? []).toEqual([])
    expect(actor.flags[MODULE_ID]).toMatchObject({ id: 'muc-sample-max', source: 'MUC', canon: true })
    expect(actor).not.toHaveProperty('img')  // the portrait is uploaded by importBook
    expect(actor.prototypeToken).toEqual({ actorLink: true })  // a pregen's token is its actor, as for runners
    expect(drone).toMatchObject({ items: [], system: { vehicleType: 'custom-vehicle', isFlying: true } })
    expect(drone.flags[MODULE_ID]).toMatchObject({ runner: 'muc-sample-max', source: 'MUC' })
    expect(t.portraits).toEqual({ [actor._id]: max.portrait })
    // no portrait, or not an image data URL: default artwork
    const b = structuredClone(muc)
    b.characters[0].portrait = null
    expect(translateBook(b, opts).portraits).toEqual({})
    b.characters[0].portrait = 'https://example.com/x.png'
    expect(translateBook(b, opts).portraits).toEqual({})
  })

  test('a character that cannot be translated is noted, the others carry on', () => {
    const b = structuredClone(muc)
    b.characters.unshift({ id: 'broken', streetName: 'Broken', get attributes() { throw new Error('bad') } })
    const r = translateBook(b, opts)
    expect(r.packs.characters.map(d => d.name)).toEqual(['Made-Up Max', 'Made-Up Max — Made-Up Scout Drone'])
    expect(r.textOnly).toContain('Broken: not imported (bad)')
  })

  test('metatypes: sra2 metatype items with the maximums, Anarchy bonus, Edge and racial quality', () => {
    const [m] = t.packs.metatypes
    expect(m).toMatchObject({ _id: docId('muc.made-up-gnome'), name: 'Made-Up Gnome', type: 'metatype',
      system: { maxStrength: 4, maxAgility: 6, maxWillpower: 7, maxLogic: 7, maxCharisma: 6, anarchyBonus: 0, reference: 'MUC p.12' },
      flags: { [MODULE_ID]: { id: 'muc.made-up-gnome', source: 'MUC', page: 12, canon: true } } })
    expect(m.system.description).toContain('Edge: 3')
    expect(m.system.description).toContain('Racial quality: Made-up Keen Eyes')
    expect(t.textOnly).toContain('Metatype Made-Up Gnome: not an sra2 metatype → Anarchy bonus 0')
    const b = structuredClone(muc)
    Object.assign(b.metatypes[0], { name: 'Human', racialQuality: '' })
    const h = translateBook(b, opts).packs.metatypes[0].system
    expect(h.anarchyBonus).toBe(1)
    expect(h.description).not.toContain('Racial quality')
  })

  test('rules: one journal per sheet, a level-1 page per section then its rules as level-2 pages', () => {
    const r = t.packs.rules
    // named from sheetName, else the title-cased sheet
    expect(r.map(j => j.name)).toEqual(['Core', 'Optional rules'])
    expect(r[0]._id).toBe(docId('MUC:rules-sheet:core'))
    expect(r[1]._id).toBe(docId('MUC:rules-sheet:optional'))
    expect(r[0].pages.map(p => [p.name, p.title.level])).toEqual([
      ['Made-Up Basics', 1], ['Rule One', 2], ['Rule Two', 2], ['Made-Up Extras', 1], ['Rule Three', 2]])
    expect(r[0].pages.every(p => p.title.show === true && p.type === 'text')).toBe(true)
    expect(r[0].pages[0]).toMatchObject({ _id: docId('MUC:section:core:Made-Up Basics'), text: { content: '<p>2 rules</p>', format: 1 } })
    expect(r[0].pages[3]).toMatchObject({ _id: docId('MUC:section:core:Made-Up Extras'), text: { content: '<p>1 rule</p>', format: 1 } })
    expect(r[0].pages.map(p => p.sort)).toEqual(r[0].pages.map((_, i) => (i + 1) * 100000))
    // an empty section falls back to the journal's name
    expect(r[1].pages.map(p => [p.name, p.title.level])).toEqual([['Optional rules', 1], ['Rule Four', 2]])
    expect(r[1].pages[0]._id).toBe(docId('MUC:section:optional:'))
    // rule pages keep their id, flags and reference
    expect(r[0].pages[1]).toMatchObject({ _id: docId('muc.rule-one'), flags: { [MODULE_ID]: { id: 'muc.rule-one', page: 50, source: 'MUC' } } })
    expect(r[0].pages[1].text.content).toBe('<p>Made-up rule text with &lt;i&gt;markup&lt;/i&gt;.</p>')
    // sorted by page then title within a section
    const b = structuredClone(muc)
    b.rules[0].page = 60
    b.rules.push({ id: 'muc.rule-a', source: 'MUC', page: 51, sheet: 'core', section: 'Made-Up Basics', title: 'A Rule' })
    const pages = translateBook(b, opts).packs.rules[0].pages
    expect(pages.map(p => p.name)).toEqual(['Made-Up Basics', 'A Rule', 'Rule Two', 'Rule One', 'Made-Up Extras', 'Rule Three'])
    expect(pages[1]).toMatchObject({ _id: docId('muc.rule-a'), type: 'text', text: { content: '<p>See MUC p.51</p>', format: 1 } })
  })

  test('descriptions escaped, and absent when descriptions are off', () => {
    expect(find('amps', 'Made-up Knack').system.description).toContain('A &lt;b&gt;bold&lt;/b&gt; made-up text')
    const off = translateBook(muc, { ...opts, descriptions: false })
    expect(off.packs.amps[0].system.description).not.toContain('bold')
    expect(off.packs.weapons[0].system.description).not.toContain('blade')
    expect(off.packs.rules[0].pages[1].text.content).toBe('<p>See MUC p.50</p>')
  })

  const melee = { melee: 'ok', short: 'none', medium: 'none', long: 'none' }
  test('add-ons and printed ratings are noted', () => {
    const b = structuredClone(muc)
    Object.assign(b.amps[1], { mod: true, printedRating: 2 })
    const d = translateBook(b, opts).packs.amps[1].system
    expect(d.description).toContain('Add-on')
    expect(d.description).toContain('Printed rating: 2')
    expect(find('amps', 'Made-up Implant').system.description).not.toContain('Add-on')
  })

  test('an equipment amp whose base item is a weapon or armor becomes that feat type, keeping its rr', () => {
    const b = structuredClone(muc)
    Object.assign(b.amps[0], { type: 'equipment', typeName: 'Equipment', item: { kind: 'weapon', specialist: false, dv: '5P', ranges: melee } })
    Object.assign(b.amps[1], { type: 'equipment', typeName: 'Equipment', item: { kind: 'armor', specialist: false, armor: 3 } })
    const [w, a] = translateBook(b, opts).packs.amps
    expect(w.system).toMatchObject({ featType: 'weapon', damageValue: '5', vdCustomValue: 5, meleeRange: 'ok', rrList: [{ rrTarget: 'spec_pistols' }] })
    expect(a.system).toMatchObject({ featType: 'armor', armorValue: 3 })
  })

  test('an unparsed DV is kept in the description (items and equipment amps)', () => {
    const b = structuredClone(muc)
    b.items[0].dv = 'Special'
    Object.assign(b.amps[0], { type: 'equipment', item: { kind: 'weapon', specialist: false, dv: 'Odd', ranges: melee } })
    const r = translateBook(b, opts)
    expect(r.packs.weapons[0].system.description).toContain('Chummer DV: Special')
    expect(r.packs.amps[0].system.description).toContain('Chummer DV: Odd')
    expect(r.textOnly).toEqual(expect.arrayContaining(['Made-up Short Blade: DV Special → description (not understood)', 'Made-up Knack: DV Odd → description (not understood)']))
  })

  test('other amp types keep their feat type; the base item goes to textOnly', () => {
    const b = structuredClone(muc)
    b.amps[1].item = { kind: 'weapon', specialist: false, dv: '5P', ranges: melee }
    const r = translateBook(b, opts), d = r.packs.amps[1].system
    expect(d.featType).toBe('cyberware')
    expect(d).not.toHaveProperty('damageValue')
    expect(r.textOnly).toContain('Made-up Implant: base weapon (DV 5P, ranges ok/none/none/none) → notes (sra2 cyberware feat)')
  })

  test('vehicle amps stay equipment feats with a note; a skill\'s alt attribute is noted', () => {
    const b = structuredClone(muc)
    Object.assign(b.amps[1], { type: 'vehicle', typeName: 'Vehicle' })
    b.skills[0].alt = 'cha'
    const r = translateBook(b, opts)
    expect(r.packs.amps[1].system.featType).toBe('equipment')
    expect(r.textOnly).toContain('Made-up Implant: vehicle template, import as a vehicle later')
    expect(r.textOnly.some(l => l.startsWith('Made-Up Lore: alternative attribute cha'))).toBe(true)
  })
})

test('table rules: one journal, a page per rule', () => {
  const j = translateTableRules(file.tableRules, opts)
  expect(j).toMatchObject({ _id: docId('table-rules'), name: 'Table rules' })
  expect(j.pages).toEqual([expect.objectContaining({ name: 'Made-Up Table Rule', type: 'text', text: { content: '<p>A made-up table rule.</p>', format: 1 } })])
  // repeated names get distinct page ids; a rule Chummer blanked (descriptions off) says the file has no text
  const two = translateTableRules([...file.tableRules, { ...file.tableRules[0], text: '' }], opts)
  expect(two.pages.map(p => p.text.content)).toEqual(['<p>A made-up table rule.</p>', '<p>(No text in this file.)</p>'])
  expect(new Set(two.pages.map(p => p._id)).size).toBe(2)
})

test('older files: no sheetName -> title-cased sheet, then "Rules"; a page without a title uses its id', () => {
  const book = { source: { id: 'NOS', name: 'No Sections', publisher: 'x', canon: true }, amps: [], items: [], vehicles: [], skills: [], specs: [],
    rules: [{ id: 'nos.a', source: 'NOS', page: 1, sheet: 'quick-start', section: '', title: 'A' }, { id: 'nos.b', source: 'NOS', page: 2, sheet: '', section: '', title: '' }] }
  const t = translateBook(book, { exportedAt: '2026-10-01T00:00:00Z', appVersion: '0.6.1', descriptions: false })
  const names = t.packs.rules.map(j => j.name).sort()
  expect(names).toEqual(['Quick Start', 'Rules'])
  expect(t.packs.rules.every(j => typeof j.name === 'string' && j.name.length > 0)).toBe(true)
  expect(t.packs.rules.flatMap(j => j.pages).map(p => p.name).sort()).toEqual(['A', 'Quick Start', 'Rules', 'nos.b'])
})

describe('planning the packs of a book (never an empty compendium)', () => {
  test('one pack per non-empty list, in PACKS order, with world-safe names', () => {
    const p = planBookPacks(t, 'q-')
    expect(p.map(x => x.key)).toEqual(['amps', 'weapons', 'armor', 'gear', 'spells', 'vehicles', 'characters', 'metatypes', 'skills', 'rules'])
    expect(p.find(x => x.key === 'characters')).toMatchObject({ name: 'q-ca2-muc-characters', label: 'Characters — MUC', type: 'Actor' })
    expect(p.find(x => x.key === 'metatypes')).toMatchObject({ name: 'q-ca2-muc-metatypes', label: 'Metatypes — MUC', type: 'Item' })
    expect(p.every(x => x.docs.length > 0)).toBe(true)
  })
  test('a book with nothing to write plans no pack (so importBook makes no folder either)', () => {
    // 0.2.x: a pregens-only book had no pack the module knew, yet its book folder was still created
    const pregensOnly = { source: { id: 'PRE', name: 'Pregens', publisher: 'x', canon: true }, packs: { characters: [] , rules: [], other: [{ _id: 'x' }] }, textOnly: [] }
    expect(planBookPacks(pregensOnly)).toEqual([])
    const empty = { source: { id: 'E', name: 'Empty', publisher: 'x', canon: true }, amps: [], items: [], vehicles: [], skills: [], specs: [], rules: [], metatypes: [], characters: [] }
    expect(planBookPacks(translateBook(empty, opts))).toEqual([])
  })
})
