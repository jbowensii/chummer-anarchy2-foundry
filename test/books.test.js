import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { MODULE_ID } from '../scripts/lib/constants.js'
import { alphaFolder, ampFolder, category, chunk, countByBook, itemFolder, packTypeKey, planTypePacks, translateBook, translateTableRules,
  TYPES, typeKey, typePackName, vehicleFolder } from '../scripts/lib/books.js'
import { docId } from '../scripts/lib/ids.js'
import { legacyOf } from '../scripts/lib/chummer-id.js'
import { portraitsAfter } from '../scripts/foundry/books.js'

const file = JSON.parse(readFileSync('samples/test-books.json', 'utf8'))
const opts = { exportedAt: file.exportedAt, appVersion: file.app.version, descriptions: file.descriptions }
const [muc, mux] = file.books
const t = translateBook(muc, opts)
const find = (pack, name) => t.packs[pack].find(d => d.name === name)
// our identity (lib/chummer-id.js); legacyOf: the id 0.7.x computed for the document, which a re-import still finds
const cid = d => d.flags[MODULE_ID].chummerID
const ids = (d, key, legacy) => { expect(d).not.toHaveProperty('_id'); expect(cid(d)).toBe(key); expect(legacyOf(d)).toBe(docId(legacy)) }

describe('translating a book', () => {
  test('packs only for the content a book has', () => {
    expect(Object.keys(t.packs).sort()).toEqual(['amps', 'armor', 'characters', 'critters', 'gear', 'metatypes', 'rules', 'skills', 'spells', 'vehicles', 'weapons'])
    expect(Object.keys(translateBook(mux, opts).packs)).toEqual(['amps'])
    expect(t.source).toEqual(muc.source)
  })

  test('no _id (Foundry picks it); chummerID <source>:<pack>:<id>, the 0.7.x id still found; flags with source/page/canon, reference', () => {
    const blade = find('weapons', 'Made-up Short Blade')
    ids(blade, 'MUC:weapons:muc.made-up-blade', 'muc.made-up-blade')
    expect(cid(translateBook(muc, opts).packs.weapons[0])).toBe(cid(blade))
    expect(blade.flags[MODULE_ID]).toEqual({ id: 'muc.made-up-blade', chummerID: 'MUC:weapons:muc.made-up-blade', chummerAliases: [],
      exportedAt: opts.exportedAt, appVersion: '0.6.0', source: 'MUC', page: 20, canon: true,
      icon: { key: 'weapon/short-weapons', name: blade.name, book: 'MUC' }, category: 'Melee weapons' })
    const all = Object.values(t.packs).flat()
    expect(new Set(all.map(cid)).size).toBe(all.length)
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
    ids(find('vehicles', 'Made-up Cart'), 'MUC:vehicles:muc.made-up-cart', 'muc.made-up-cart')
    expect(find('vehicles', 'Made-up Cart')).toMatchObject({ type: 'vehicle',
      system: { vehicleType: 'custom-vehicle', customAutopilot: 1, customStructure: 2, customSpeed: 2, customArmor: 1, isFlying: false, reference: 'MUC p.30' } })
  })

  test('skills: the new skill and both specs; the core-skill spec linked to close-combat', () => {
    const s = t.packs.skills
    expect(s.map(d => [d.name, d.type])).toEqual([['Made-Up Lore', 'skill'], ['Spec: Old Texts', 'specialization'], ['Spec: Made-Up Style', 'specialization']])
    const lore = s[0].system.slug
    expect(s[0].system).toMatchObject({ linkedAttribute: 'logic', rating: 0 })
    expect(s[1].system).toMatchObject({ linkedSkill: lore, linkedAttribute: 'logic' })
    expect(s[2].system).toMatchObject({ linkedSkill: 'close-combat', linkedAttribute: 'agility', reference: 'MUC p.41' })
    ids(s[2], 'MUC:specs:close-combat.made-up-style', 'close-combat.made-up-style')
    ids(s[0], `MUC:skills:${muc.skills[0].id}`, muc.skills[0].id)
  })

  test('a book skill or spec sra2 already has is included, with the sra2 name and slug', () => {
    const b = structuredClone(muc)
    b.skills = [{ id: 'athletics', source: 'MUC', page: 1, name: 'Athletics', attr: 'str', specs: [{ id: 'athletics.climbing', name: 'Climbing', attr: 'str' }] }]
    b.specs = [{ skill: 'close-combat', id: 'close-combat.blades', name: 'Blades', attr: 'agi' }]
    const s = translateBook(b, opts).packs.skills
    expect(s.map(d => [cid(d), legacyOf(d), d.name, d.type, d.system.slug])).toEqual([
      ['MUC:skills:athletics', docId('athletics'), 'Athletics', 'skill', 'athletics'],
      ['MUC:specs:athletics.climbing', docId('athletics.climbing'), 'Spec: Climbing', 'specialization', 'spec_climbing'],
      ['MUC:specs:close-combat.blades', docId('close-combat.blades'), 'Spec: Blades', 'specialization', 'spec_blades']])
    expect(s[0].system).toMatchObject({ linkedAttribute: 'strength', rating: 0, reference: 'MUC p.1' })
    expect(s[1].system).toMatchObject({ linkedSkill: 'athletics', linkedAttribute: 'strength' })
  })

  test('characters: an actor per pregen with its items; its vehicles as separate, unlinked actors', () => {
    const [max] = muc.characters, c = t.packs.characters
    expect(c.map(d => [cid(d), d.name, d.type])).toEqual([
      ['MUC:character:muc-sample-max', 'Made-Up Max', 'character'],
      ['MUC:vehicle:muc-sample-max:v-drone', 'Made-Up Max — Made-Up Scout Drone', 'vehicle']])
    ids(c[0], 'MUC:character:muc-sample-max', 'MUC:character:muc-sample-max')
    ids(c[1], 'MUC:vehicle:muc-sample-max:v-drone', 'MUC:vehicle:muc-sample-max:v-drone')
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
    expect(t.portraits).toEqual({ [cid(actor)]: max.portrait })  // by chummerID: the actor has no _id until Foundry gives it one
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
    ids(m, 'MUC:metatypes:muc.made-up-gnome', 'muc.made-up-gnome')
    expect(m).toMatchObject({ name: 'Made-Up Gnome', type: 'metatype',
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
    expect(r.map(j => j.name)).toEqual(['Core (MUC)', 'Optional rules (MUC)'])
    ids(r[0], 'MUC:rules-sheet:core', 'MUC:rules-sheet:core')
    ids(r[1], 'MUC:rules-sheet:optional', 'MUC:rules-sheet:optional')
    expect(r[0].pages.map(p => [p.name, p.title.level])).toEqual([
      ['Made-Up Basics', 1], ['Rule One', 2], ['Rule Two', 2], ['Made-Up Extras', 1], ['Rule Three', 2]])
    expect(r[0].pages.every(p => p.title.show === true && p.type === 'text')).toBe(true)
    expect(r[0].pages[0]).toMatchObject({ text: { content: '<p>2 rules</p>', format: 1 } })
    ids(r[0].pages[0], 'MUC:section:core:Made-Up Basics', 'MUC:section:core:Made-Up Basics')
    ids(r[0].pages[3], 'MUC:section:core:Made-Up Extras', 'MUC:section:core:Made-Up Extras')
    expect(r[0].pages.map(p => p.sort)).toEqual(r[0].pages.map((_, i) => (i + 1) * 100000))
    // an empty section falls back to the journal's name
    expect(r[1].pages.map(p => [p.name, p.title.level])).toEqual([['Optional rules', 1], ['Rule Four', 2]])
    ids(r[1].pages[0], 'MUC:section:optional:', 'MUC:section:optional:')
    // rule pages keep their id, flags and reference
    expect(r[0].pages[1]).toMatchObject({ flags: { [MODULE_ID]: { id: 'muc.rule-one', page: 50, source: 'MUC' } } })
    ids(r[0].pages[1], 'MUC:rules:muc.rule-one', 'muc.rule-one')
    expect(r[0].pages[1].text.content).toBe('<p>Made-up rule text with &lt;i&gt;markup&lt;/i&gt;.</p>')
    // sorted by page then title within a section
    const b = structuredClone(muc)
    b.rules[0].page = 60
    b.rules.push({ id: 'muc.rule-a', source: 'MUC', page: 51, sheet: 'core', section: 'Made-Up Basics', title: 'A Rule' })
    const pages = translateBook(b, opts).packs.rules[0].pages
    expect(pages.map(p => p.name)).toEqual(['Made-Up Basics', 'A Rule', 'Rule Two', 'Rule One', 'Made-Up Extras', 'Rule Three'])
    expect(pages[1]).toMatchObject({ type: 'text', text: { content: '<p>See MUC p.51</p>', format: 1 } })
    ids(pages[1], 'MUC:rules:muc.rule-a', 'muc.rule-a')
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
  expect(j).toMatchObject({ name: 'Table rules' })
  ids(j, 'table-rules', 'table-rules')
  ids(j.pages[0], 'table-rules:Made-Up Table Rule', 'table-rules:Made-Up Table Rule')
  expect(j.pages).toEqual([expect.objectContaining({ name: 'Made-Up Table Rule', type: 'text', text: { content: '<p>A made-up table rule.</p>', format: 1 } })])
  // repeated names get distinct page ids; a rule Chummer blanked (descriptions off) says the file has no text
  const two = translateTableRules([...file.tableRules, { ...file.tableRules[0], text: '' }], opts)
  expect(two.pages.map(p => p.text.content)).toEqual(['<p>A made-up table rule.</p>', '<p>(No text in this file.)</p>'])
  expect(new Set(two.pages.map(cid)).size).toBe(2)
  expect(legacyOf(two.pages[1])).toBe(docId('table-rules:Made-Up Table Rule:1'))  // 0.7.x's index-based id
})

test('older files: no sheetName -> title-cased sheet, then "Rules"; a page without a title uses its id', () => {
  const book = { source: { id: 'NOS', name: 'No Sections', publisher: 'x', canon: true }, amps: [], items: [], vehicles: [], skills: [], specs: [],
    rules: [{ id: 'nos.a', source: 'NOS', page: 1, sheet: 'quick-start', section: '', title: 'A' }, { id: 'nos.b', source: 'NOS', page: 2, sheet: '', section: '', title: '' }] }
  const t = translateBook(book, { exportedAt: '2026-10-01T00:00:00Z', appVersion: '0.6.1', descriptions: false })
  const names = t.packs.rules.map(j => j.name).sort()
  expect(names).toEqual(['Quick Start (NOS)', 'Rules (NOS)'])
  expect(t.packs.rules.every(j => typeof j.name === 'string' && j.name.length > 0)).toBe(true)
  expect(t.packs.rules.flatMap(j => j.pages).map(p => p.name).sort()).toEqual(['A', 'Quick Start', 'Rules', 'nos.b'])
})

describe('a book’s NPCs, critters and spirits', () => {
  test('pack critters (a spirit): an unlinked hostile actor per regular NPC, GM description, no metatype item for a spirit', () => {
    const [wisp] = t.packs.critters
    expect(t.packs.critters).toHaveLength(1)
    expect(t.packs.npcs).toBeUndefined()
    expect(wisp).toMatchObject({ name: 'Made-Up Wisp', type: 'character' })
    ids(wisp, 'MUC:npc:muc-npc-wisp', 'MUC:npc:muc-npc-wisp')
    expect(wisp.flags[MODULE_ID]).toMatchObject({ id: 'muc-npc-wisp', source: 'MUC', npc: { kind: 'spirit', tier: 'regular' } })
    expect(wisp.prototypeToken).toEqual({ actorLink: false, disposition: -1 })
    expect(wisp.items.map(i => i.type)).toEqual(['skill'])
    expect(wisp.system.bio.gmDescription).toContain('<p>Spirit, regular NPC. No Edge.</p>')
    expect(wisp.system.bio.gmDescription).toContain('<p>Astral Combat 4 (4+W, RR 0)</p>')
  })
  test('with icons, the NPC’s image and token are the spirit default', () => {
    const icons = JSON.parse(readFileSync('icons/index.json', 'utf8'))
    const [wisp] = translateBook(muc, { ...opts, icons }).packs.critters
    expect(wisp.img).toBe('modules/chummer-anarchy2-importer/icons/defaults/npc/spirit.webp')
    expect(wisp.prototypeToken).toEqual({ actorLink: false, disposition: -1, texture: { src: wisp.img } })
  })
})

describe('by-type packs: every book merged into one compendium per type', () => {
  const tx = translateBook(mux, opts)
  test('one pack per type with entries, in TYPES order, all books merged, world-safe names distinct from the 0.8.x per-book ca2-…', () => {
    const p = planTypePacks([t, tx], { prefix: 'q-' })
    expect(p.map(x => x.key)).toEqual(['qualities', 'augmentations', 'weapons', 'armor', 'gear', 'spells', 'vehicles', 'characters', 'critters',
      'metatypes', 'skills', 'specializations', 'rules'])
    expect(p.every(x => x.docs.length > 0 && x.house === null && /^q-ca2t-[a-z-]+$/.test(x.name) && x.label === TYPES[x.key][0])).toBe(true)
    expect(p.find(x => x.key === 'critters')).toMatchObject({ name: 'q-ca2t-critters', label: 'Critters & Spirits', type: 'Actor' })
    // MUX's amp is a quality: it sits in the same Qualities pack as MUC's
    expect(p.find(x => x.key === 'qualities').docs.map(d => d.flags[MODULE_ID].source)).toEqual(['MUC', 'MUX'])
    expect(planTypePacks([t]).find(x => x.key === 'weapons').name).toBe('ca2t-weapons')
  })
  test('sra2 types: amps by feat type, spells and complex forms apart, skills and specializations apart', () => {
    const feat = featType => ({ type: 'feat', system: { featType } })
    expect(['trait', 'cyberware', 'adept-power', 'awakened', 'emerged', 'cyberdeck', 'contact', 'equipment', 'weapon', 'armor'].map(f => typeKey('amps', feat(f))))
      .toEqual(['qualities', 'augmentations', 'magic', 'magic', 'magic', 'cyberdecks', 'contacts', 'amped-gear', 'amped-gear', 'amped-gear'])
    expect([typeKey('spells', feat('spell')), typeKey('spells', feat('complex-form')), typeKey('skills', { type: 'skill' }),
      typeKey('skills', { type: 'specialization' }), typeKey('weapons', feat('weapon')), typeKey('nonsense', {})])
      .toEqual(['spells', 'complex-forms', 'skills', 'specializations', 'weapons', null])
  })
  test('pack names and back: ca2t-<type>, a GM compendium ca2h-<id>-<type>; an old ca2-<book>-<kind> pack is not ours', () => {
    expect(typePackName('amped-gear')).toBe('ca2t-amped-gear')
    expect(typePackName('gear', 'q-', { id: 'My.H' })).toBe('q-ca2h-my-h-gear')
    expect(['ca2t-amped-gear', 'ca2t-gear', 'ca2h-my-h-amped-gear', 'ca2h-my-h-gear', 'ca2-muc-gear', 'ca2-type-weapons', 'ca2t-nonsense', 'q-ca2t-gear']
      .map(n => packTypeKey(n))).toEqual(['amped-gear', 'gear', 'amped-gear', 'gear', null, null, null, null])
    expect(packTypeKey('q-ca2t-gear', 'q-')).toBe('gear')
  })
  test('the table rules journal goes into Rules, folder Table rules', () => {
    const j = translateTableRules(file.tableRules, opts)
    const rules = planTypePacks([t], { tableRules: j }).find(p => p.key === 'rules')
    expect(rules.docs.at(-1)).toBe(j)
    expect(j.flags[MODULE_ID].category).toBe('Table rules')
    expect(planTypePacks([], { tableRules: j }).map(p => p.key)).toEqual(['rules'])
  })
  test('nothing to write plans no pack (so no folder either)', () => {
    const pregensOnly = { source: { id: 'PRE', name: 'Pregens', publisher: 'x', canon: true }, packs: { characters: [], npcs: [], rules: [], other: [{ _id: 'x' }] }, textOnly: [] }
    expect(planTypePacks([pregensOnly])).toEqual([])
    const empty = { source: { id: 'E', name: 'Empty', publisher: 'x', canon: true }, amps: [], items: [], vehicles: [], skills: [], specs: [], rules: [], metatypes: [], characters: [], npcs: [] }
    expect(planTypePacks([translateBook(empty, opts)])).toEqual([])
    expect(planTypePacks([], { tableRules: { pages: [] } })).toEqual([])
  })
})

describe('folders by category, never Other or General', () => {
  const folder = d => d.flags[MODULE_ID].category
  const all = [...Object.values(t.packs).flat(), ...Object.values(translateBook(mux, opts).packs).flat()]
  test('every entry has a folder, none vague', () => {
    for (const d of all) expect(folder(d), d.name).toMatch(/\S/)
    expect(all.some(d => /^(other|general)$/i.test(folder(d)))).toBe(false)
  })
  test('the sample book: Chummer’s category where it has one, else from the entry’s data', () => {
    const f = (pack, name) => folder(t.packs[pack].find(d => d.name === name))
    expect([f('amps', 'Made-up Knack'), f('amps', 'Made-up Implant'), f('weapons', 'Made-up Short Blade'), f('armor', 'Made-up Vest'),
      f('gear', 'Made-up Widget'), f('spells', 'Made-up Charm'), f('vehicles', 'Made-up Cart'), f('metatypes', 'Made-Up Gnome'),
      f('skills', 'Made-Up Lore'), f('skills', 'Spec: Old Texts'), f('skills', 'Spec: Made-Up Style'), f('rules', 'Core (MUC)'),
      f('characters', 'Made-Up Max'), f('characters', 'Made-Up Max — Made-Up Scout Drone'), f('critters', 'Made-Up Wisp')])
      .toEqual(['Positive qualities', 'Cyberware', 'Melee weapons', 'Armor 2', 'M–R', 'Combat', 'Ground vehicles', 'Metavariants',
        'Logic', 'Made-Up Lore', 'Close Combat', 'Core', 'Runner', 'Runner', 'Spirits'])
  })
  test('category: Chummer’s, capitalised; Other, General, Misc and blanks are no category', () => {
    expect(['Handguns', 'combat', 'basic bioware', 'Other', 'general', ' misc. ', '', null, 'Miscellaneous', '–'].map(category))
      .toEqual(['Handguns', 'Combat', 'Basic bioware', null, null, null, null, null, null, null])
  })
  test('items: category, else weapons melee or ranged, armor by value, the rest by initial', () => {
    expect(itemFolder({ kind: 'weapon', category: 'Pistols' })).toBe('Pistols')
    expect(itemFolder({ kind: 'weapon', category: 'Other', ranges: { melee: 'ok', short: 'none', medium: 'none', long: 'none' } })).toBe('Melee weapons')
    expect(itemFolder({ kind: 'weapon', ranges: { melee: 'disadvantage', short: 'ok', medium: 'ok', long: 'none' } })).toBe('Ranged weapons')
    expect(itemFolder({ kind: 'armor', armor: 4 })).toBe('Armor 4')
    expect(itemFolder({ kind: 'complex-form', category: 'sustained' })).toBe('Sustained')
    expect(['Ammo', 'grapple', 'Óptica', 'Zoom', '3D printer', ''].map(alphaFolder)).toEqual(['A–F', 'G–L', 'M–R', 'S–Z', 'A–F', 'A–F'])
  })
  test('amps: qualities positive or negative, the others by Chummer’s amp type, add-ons apart', () => {
    expect(ampFolder({ type: 'quality', effects: [{ id: 'negative' }] })).toBe('Negative qualities')
    expect(ampFolder({ type: 'quality', typeName: 'Trait' })).toBe('Positive qualities')
    expect(ampFolder({ type: 'bioware', typeName: 'Bioware' })).toBe('Bioware')
    expect(ampFolder({ type: 'cyberdeck', typeName: 'Cyberdeck', mod: true })).toBe('Cyberdeck add-ons')
    expect(ampFolder({ type: 'adept', typeName: '' })).toBe('Adept')
  })
  test('vehicles: by sra2 vehicle type, else drone by name, aircraft when it flies, else ground', () => {
    expect([vehicleFolder({ id: 'medium-drone', name: 'X' }), vehicleFolder({ id: 'x', name: 'Made-up Sedan' }),
      vehicleFolder({ id: 'x', name: 'Spy Drone' }), vehicleFolder({ id: 'x', name: 'Kite', flyingSpeed: 3 }), vehicleFolder({ id: 'x', name: 'Cart' })])
      .toEqual(['Drones', 'Cars', 'Drones', 'Aircraft', 'Ground vehicles'])
  })
  test('people: NPCs by tier, critters and spirits by kind; a sra2 metatype is core', () => {
    const b = structuredClone(muc)
    b.npcs.push({ ...structuredClone(muc.npcs[0]), id: 'muc-npc-boss', streetName: 'Boss', npc: { kind: 'npc', tier: 'prime' } })
    b.metatypes[0].name = 'Ork'
    const r = translateBook(b, opts)
    expect(r.packs.npcs.map(d => [d.name, folder(d)])).toEqual([['Boss', 'Prime NPCs']])
    expect(folder(r.packs.metatypes[0])).toBe('Core metatypes')
  })
})

describe('import helpers', () => {
  test('counts per book: replaced from updates, created from creates; the table rules count apart', () => {
    const d = source => ({ flags: { [MODULE_ID]: { source } } })
    expect(countByBook([{ doc: d('MUC') }, { doc: d('MUX') }], [d('MUC'), d('MUC'), { flags: {} }]))
      .toEqual({ MUC: { created: 2, replaced: 1 }, MUX: { created: 0, replaced: 1 }, 'table rules': { created: 1, replaced: 0 } })
  })
  test('chunk: slices of n, the last one shorter; nothing for nothing', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk(Array.from({ length: 250 }, (_, i) => i), 100).map(c => c.length)).toEqual([100, 100, 50])
    expect(chunk([], 100)).toEqual([])
  })
})

describe('a compendium book (source.compendium)', () => {
  const cf = JSON.parse(readFileSync('samples/test-compendium.json', 'utf8'))
  const [house] = cf.books
  const ct = translateBook(house, { exportedAt: cf.exportedAt, appVersion: cf.app.version, descriptions: true })
  const plain = structuredClone(house)
  delete plain.source.compendium
  const pt = translateBook(plain, { exportedAt: cf.exportedAt, appVersion: cf.app.version, descriptions: true })

  test('its own packs by type (ca2h-<id>-<type>, labelled (House)), the same types a plain book of the same content gets', () => {
    const p = planTypePacks([ct, t])
    const own = p.filter(x => x.house)
    expect(own.map(x => x.key)).toEqual(['qualities', 'augmentations', 'weapons', 'armor', 'gear', 'spells', 'vehicles', 'critters'])
    expect(own.every(x => x.house.id === 'MYH' && x.name === `ca2h-myh-${x.key}` && x.label === `${TYPES[x.key][0]} — MYH (House)`)).toBe(true)
    expect(own.map(x => [x.key, x.type, x.docs.length])).toEqual(planTypePacks([pt]).map(x => [x.key, x.type, x.docs.length]))
    // never merged with the books
    expect(p.filter(x => !x.house).flatMap(x => x.docs).some(d => d.flags[MODULE_ID].source === 'MYH')).toBe(false)
  })

  test('every entry is flagged compendium; a plain book has no such flag', () => {
    const all = Object.values(ct.packs).flat()
    expect(all.every(d => d.flags[MODULE_ID].compendium === true && d.flags[MODULE_ID].canon === false)).toBe(true)
    expect(Object.values(pt.packs).flat().some(d => 'compendium' in d.flags[MODULE_ID])).toBe(false)
    expect(Object.values(t.packs).flat().some(d => 'compendium' in d.flags[MODULE_ID])).toBe(false)
    expect(ct.packs.weapons[0].system.description).toContain('GM’s own made-up note')
  })
})

describe('book pregen and NPC tokens (0.7.0)', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  test('translateBook lists a character’s token by its chummerID, only an image data URL', () => {
    const b = structuredClone(muc)
    b.characters[0].token = PNG
    b.npcs[0].token = 'https://example.com/x.png'
    const tb = translateBook(b, opts)
    expect(tb.tokens).toEqual({ 'MUC:character:muc-sample-max': PNG })
    expect(t.tokens).toEqual({})
  })
  test('portraitsAfter: token image from the token, else the portrait; chosen art is never replaced', async () => {
    const ups = []
    globalThis.game = { world: { id: 'w' } }
    globalThis.foundry = { applications: { apps: { FilePicker: { implementation: {
      browse: async () => ({}), upload: async (_, dir, file) => ({ path: `${dir}/${file.name}` }) } } } } }
    globalThis.Actor = { updateDocuments: async u => { ups.push(...u) } }
    const fl = k => ({ [MODULE_ID]: { source: 'MUC', id: 'x', chummerID: k, exportedAt: '2026-10-02T09:15:00.000Z' } })
    const docs = [{ _id: 'a', flags: fl('A') }, { _id: 'b', flags: fl('B') }, { _id: 'c', flags: fl('C'), img: 'worlds/w/mine.webp', prototypeToken: { texture: { src: 'worlds/w/mine-token.webp' } } }]
    await portraitsAfter({ A: PNG, B: PNG, C: PNG }, { A: PNG, C: PNG }, () => {})(docs, {})
    expect(ups).toHaveLength(2)
    expect(ups[0].img).toMatch(/^worlds\/w\/chummer\/portraits\/MUC-x-\d+\.png$/)
    expect(ups[0]['prototypeToken.texture.src']).toMatch(/^worlds\/w\/chummer\/tokens\/MUC-x-\d+\.png$/)
    expect(ups[1]['prototypeToken.texture.src']).toBe(ups[1].img)
  })
})

describe('the kinds sra2 has no document for', () => {
  test('a Reference journal per kind, a page per entry with its stats, text, source, page and chummerID', () => {
    const b = { ...structuredClone(muc), reference: [
      { kind: 'levels', id: 'muc.made-up-level', source: 'MUC', page: 7, name: 'Made-up Level', stats: { nuyen: 1000, skillCap: 5 } },
      { kind: 'lifestyles', id: 'muc.made-up-squat', source: 'MUC', page: 8, name: 'Made-up Squat', stats: { perRun: 50 }, description: 'An invented lifestyle.' },
      { kind: 'gizmos', id: 'muc.g', source: 'MUC', page: 9, name: 'G', stats: {} }] }
    const r = translateBook(b, opts)
    expect(planTypePacks([r]).find(p => p.key === 'reference')).toMatchObject({ type: 'JournalEntry', label: 'Reference', name: 'ca2t-reference' })
    expect(r.packs.reference.map(j => [j.name, cid(j), j.flags[MODULE_ID].category])).toEqual([['Levels (MUC)', 'MUC:reference:levels', 'Levels'],
      ['Lifestyles (MUC)', 'MUC:reference:lifestyles', 'Lifestyles'], ['Gizmos (MUC)', 'MUC:reference:gizmos', 'Gizmos']])
    const [lvl] = r.packs.reference[0].pages
    expect(lvl).toMatchObject({ name: 'Made-up Level', type: 'text', flags: { [MODULE_ID]: { id: 'muc.made-up-level', chummerID: 'MUC:levels:muc.made-up-level', source: 'MUC', page: 7 } } })
    expect(lvl.text.content).toBe('<p>nuyen: 1000</p><p>skillCap: 5</p><p>See MUC p.7</p>')
    expect(r.packs.reference[1].pages[0].text.content).toContain('<p>An invented lifestyle.</p>')
    expect(r.textOnly).toContain(`1 gizmos: a kind this module doesn't know → Reference journal "Gizmos"`)
  })
})
