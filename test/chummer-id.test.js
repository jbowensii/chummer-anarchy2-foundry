// Our identity (scripts/lib/chummer-id.js): chummerID and aliases, the re-import upsert with the 0.2.x migration, merging
// a journal's pages, and resolving a runner's item to its compendium entry with the tie-breaks. Invented keys only.
import { describe, expect, test } from 'vitest'
import { MODULE_ID } from '../scripts/lib/constants.js'
import { docId } from '../scripts/lib/ids.js'
import { chummerFlags, chummerKey, INDEX_FIELDS, legacyId, legacyOf, mergeByKey, planUpsert, resolveEntry, tieLine } from '../scripts/lib/chummer-id.js'

const doc = (key, aliases = [], extra = {}) => ({ name: key, flags: { [MODULE_ID]: { chummerID: key, chummerAliases: aliases } }, ...extra })
const entry = (_id, key, aliases = []) => ({ _id, flags: { [MODULE_ID]: { chummerID: key, chummerAliases: aliases } } })

describe('keys', () => {
  test('chummerKey and chummerFlags; aliases keep their own kind, never repeat the key', () => {
    expect(chummerKey('MUC', 'weapons', 'mus.zapper')).toBe('MUC:weapons:mus.zapper')
    expect(chummerKey(null, 'gear', 'x')).toBe(null)
    expect(chummerFlags('MUC', 'gear', 'mus.rope', [{ id: 'mus.line' }, { id: 'mus.old', kind: 'weapons' }, { id: 'mus.rope' }]))
      .toEqual({ chummerID: 'MUC:gear:mus.rope', chummerAliases: ['MUC:gear:mus.line', 'MUC:weapons:mus.old'] })
    expect(chummerFlags(undefined, 'gear', undefined)).toEqual({ chummerID: null, chummerAliases: [] })
  })
  test('the indexed fields are this module’s flags only', () => {
    expect(INDEX_FIELDS).toEqual(['flags.chummer-anarchy2-importer.chummerID', 'flags.chummer-anarchy2-importer.chummerAliases',
      'flags.chummer-anarchy2-importer.kind', 'flags.chummer-anarchy2-importer.source', 'flags.chummer-anarchy2-importer.page'])
  })
  test('legacyOf: the id 0.7.x computed: a catalog entry’s from its catalog id, the rest from the key itself', () => {
    const d = (key, id) => ({ flags: { [MODULE_ID]: { chummerID: key, id } } })
    expect(legacyOf(d('MUC:weapons:muc.blade', 'muc.blade'))).toBe(docId('muc.blade'))
    expect(legacyOf(d('MUC:specs:close-combat.style', 'close-combat.style'))).toBe(docId('close-combat.style'))
    expect(legacyOf(d('MUC:rules:muc.rule-one', 'muc.rule-one'))).toBe(docId('muc.rule-one'))
    expect(legacyOf(d('MUC:character:max', 'max'))).toBe(docId('MUC:character:max'))
    expect(legacyOf(d('MUC:vehicle:max:v1', 'v1'))).toBe(docId('MUC:vehicle:max:v1'))
    expect(legacyOf(d('MUC:section:core:Basics', 'x'))).toBe(docId('MUC:section:core:Basics'))
    expect(legacyOf(d('table-rules:A', 'table-rules:A'))).toBe(docId('table-rules:A'))
    expect(legacyOf({ flags: {} })).toBe(null)
    expect(legacyId('k')).toBe(docId('k'))
  })
})

describe('re-import upsert', () => {
  test('found by chummerID: an update in place with the entry’s own _id; not found: created (Foundry picks the id)', () => {
    const r = planUpsert([entry('F1', 'MUC:gear:mus.a'), entry('F9', 'MUC:gear:mus.gm-own')], [doc('MUC:gear:mus.a'), doc('MUC:gear:mus.b')])
    expect(r.updates).toEqual([{ _id: 'F1', doc: doc('MUC:gear:mus.a'), how: 'chummerID' }])
    expect(r.creates).toEqual([doc('MUC:gear:mus.b')])
    expect(r.creates[0]).not.toHaveProperty('_id')
  })
  test('nothing is deleted: entries the file no longer has are not in the plan at all', () => {
    const r = planUpsert([entry('F1', 'MUC:gear:mus.gone')], [doc('MUC:gear:mus.new')])
    expect(Object.keys(r)).toEqual(['updates', 'creates', 'duplicates'])
    expect(r.updates).toEqual([])
  })
  test('a renamed entry is found by its alias, in either direction', () => {
    expect(planUpsert([entry('F1', 'MUC:gear:mus.old')], [doc('MUC:gear:mus.new', ['MUC:gear:mus.old'])]).updates[0])
      .toMatchObject({ _id: 'F1', how: 'alias' })
    // the pack's entry already lists the incoming key as one of its earlier ones
    expect(planUpsert([entry('F2', 'MUC:gear:mus.new', ['MUC:gear:mus.old'])], [doc('MUC:gear:mus.old')]).updates[0])
      .toMatchObject({ _id: 'F2', how: 'alias' })
  })
  test('migration: an entry 0.2.x wrote under its computed id (no chummerID) is updated in place, by its key or an alias', () => {
    const old = [{ _id: docId('mus.a'), flags: { [MODULE_ID]: { id: 'mus.a' } } }, { _id: docId('MUC:character:max'), flags: {} }]
    const a = doc('MUC:gear:mus.a'), max = doc('MUC:character:max')
    a.flags[MODULE_ID].id = 'mus.a'; max.flags[MODULE_ID].id = 'max'
    const r = planUpsert(old, [a, max])
    expect(r.updates.map(u => [u._id, u.how])).toEqual([[docId('mus.a'), 'legacy'], [docId('MUC:character:max'), 'legacy']])
    expect(r.updates[0].doc.flags[MODULE_ID].chummerID).toBe('MUC:gear:mus.a')  // the update writes chummerID onto it
    expect(r.creates).toEqual([])
  })
  test('chummerID wins over the legacy id; each existing entry is matched once', () => {
    const r = planUpsert([entry('F1', 'MUC:gear:mus.a'), entry(docId('MUC:gear:mus.a'), null)], [doc('MUC:gear:mus.a')], d => docId(d.flags[MODULE_ID].chummerID))
    expect(r.updates).toEqual([{ _id: 'F1', doc: doc('MUC:gear:mus.a'), how: 'chummerID' }])
    const twice = planUpsert([entry('F1', 'MUC:gear:mus.old')], [doc('MUC:gear:mus.x', ['MUC:gear:mus.old']), doc('MUC:gear:mus.y', ['MUC:gear:mus.old'])])
    expect(twice.updates.map(u => u._id)).toEqual(['F1'])
    expect(twice.creates.map(d => d.name)).toEqual(['MUC:gear:mus.y'])
  })
  test('a key the file has twice: the last one is written, the earlier reported; a document without a key is created', () => {
    const a1 = doc('MUC:gear:mus.a', [], { v: 1 }), a2 = doc('MUC:gear:mus.a', [], { v: 2 }), loose = { name: 'loose', flags: {} }
    const r = planUpsert([], [a1, loose, a2])
    expect(r.creates).toEqual([a2, loose])
    expect(r.duplicates).toEqual([a1])
  })
})

describe('a journal’s pages on re-import', () => {
  test('an imported page keeps its _id by chummerID; the GM’s pages and pages the file dropped are kept after', () => {
    const existing = [{ _id: 'P1', ...doc('MUC:rules:mus.r1') }, { _id: 'P2', ...doc('MUC:rules:mus.r-gone') }, { _id: 'G1', name: 'GM page', flags: {} }]
    const out = mergeByKey(existing, [doc('MUC:rules:mus.r1', [], { text: 'new' }), doc('MUC:rules:mus.r2')])
    expect(out.map(p => [p._id, p.name])).toEqual([['P1', 'MUC:rules:mus.r1'], [undefined, 'MUC:rules:mus.r2'], ['P2', 'MUC:rules:mus.r-gone'], ['G1', 'GM page']])
    expect(out[0].text).toBe('new')
  })
})

describe('a runner’s item -> its compendium entry', () => {
  const e = (name, extra = {}) => ({ uuid: `Compendium.world.ca2-muc-gear.Item.${name}`, type: 'gear', name, chummerID: null, aliases: [], kind: 'gear', page: 10, ...extra })
  const item = (name, f = {}) => ({ name, type: 'gear', flags: { [MODULE_ID]: { chummerID: 'MUC:gear:mus.rope', chummerAliases: [], kind: 'gear', page: 10, ...f } } })
  test('by chummerID first, whatever the name', () => {
    expect(resolveEntry(item('Renamed Rope'), [e('Rope', { chummerID: 'MUC:gear:mus.rope', uuid: 'U1' }), e('Renamed Rope')]))
      .toEqual({ uuid: 'U1', how: 'chummerID' })
  })
  test('then by alias: the item’s earlier key, or an entry listing the item’s key', () => {
    expect(resolveEntry(item('Rope', { chummerID: 'MUC:gear:mus.new', chummerAliases: ['MUC:gear:mus.rope'] }), [e('X', { chummerID: 'MUC:gear:mus.rope', uuid: 'U2' })]))
      .toEqual({ uuid: 'U2', how: 'alias' })
    expect(resolveEntry(item('Rope'), [e('X', { chummerID: 'MUC:gear:mus.newer', aliases: ['MUC:gear:mus.rope'], uuid: 'U3' })]))
      .toEqual({ uuid: 'U3', how: 'alias' })
  })
  test('then the same type and name (case and punctuation aside); another type never matches', () => {
    expect(resolveEntry(item('glitter rope!'), [e('Glitter Rope', { uuid: 'U4' }), e('Glitter Rope', { type: 'mod', uuid: 'U5' })]))
      .toEqual({ uuid: 'U4', how: 'name' })
  })
  test('ties: the same kind wins, then the same page', () => {
    expect(resolveEntry(item('Rope'), [e('Rope', { kind: 'weapons', uuid: 'W' }), e('Rope', { uuid: 'G' })])).toEqual({ uuid: 'G', how: 'name' })
    expect(resolveEntry(item('Rope'), [e('Rope', { page: 12, uuid: 'P12' }), e('Rope', { uuid: 'P10' })])).toEqual({ uuid: 'P10', how: 'name' })
  })
  test('still tied: no link, the candidates for the report', () => {
    const r = resolveEntry(item('Rope'), [e('Rope', { uuid: 'A' }), e('Rope', { uuid: 'B' })])
    expect(r.candidates.map(c => c.uuid)).toEqual(['A', 'B'])
    expect(tieLine(item('Rope'), r.candidates)).toBe('Rope: 2 compendium entries match (Rope [gear] p.10, Rope [gear] p.10) → not linked')
  })
  test('nothing in the book: null', () => expect(resolveEntry(item('Rope'), [e('Other')])).toBe(null))
  test('by type pack: only its own pack by name; the same book preferred; still tied across books: the report names each book', () => {
    const own = item('Rope', { source: 'MUC' })
    expect(resolveEntry(own, [e('Rope', { pack: 'weapons', uuid: 'W' }), e('Rope', { pack: 'gear', source: 'OTH', uuid: 'O' })], 'gear')).toEqual({ uuid: 'O', how: 'name' })
    expect(resolveEntry(own, [e('Rope', { pack: 'gear', source: 'OTH', uuid: 'O' }), e('Rope', { pack: 'gear', source: 'MUC', uuid: 'M' })], 'gear')).toEqual({ uuid: 'M', how: 'name' })
    const r = resolveEntry(own, [e('Rope', { pack: 'gear', source: 'OTH' }), e('Rope', { pack: 'gear', source: 'OTX' })], 'gear')
    expect(tieLine(own, r.candidates)).toBe('Rope: 2 compendium entries match (Rope [gear] OTH p.10, Rope [gear] OTX p.10) → not linked')
  })
})
