// importBook's re-import (scripts/foundry/books.js) against a tiny fake of the Foundry globals it uses: Foundry picks
// the ids, an entry is found by chummerID (or, migrating from 0.7.x, its computed id) and updated in place, nothing is
// deleted. The real thing runs in Foundry's Quench batches (scripts/foundry/quench.js).
import { readFileSync } from 'node:fs'
import { beforeEach, expect, test, vi } from 'vitest'
import { MODULE_ID } from '../scripts/lib/constants.js'
import { translateBook, translateTableRules } from '../scripts/lib/books.js'
import { docId } from '../scripts/lib/ids.js'
import { importBook, importTableRules } from '../scripts/foundry/books.js'

const file = JSON.parse(readFileSync('samples/test-books.json', 'utf8'))
const [muc] = file.books
const tr = book => translateBook(book, { exportedAt: file.exportedAt, appVersion: '0.9.0', descriptions: true })
const M = MODULE_ID
let packs, folders, n, failCreate, log

class FakePack {
  constructor(name, label, type) {
    Object.assign(this, { collection: `world.${name}`, title: label, documentName: type, locked: false, folder: null, docs: new Map() })
    packs.set(this.collection, this)
  }
  get index() { return this.docs }
  async getIndex() { return this.docs }
  get documentClass() { return Doc }
  async configure({ locked }) { log.push(['lock', this.collection, locked]); this.locked = locked }
  async setFolder(f) { this.folder = f }
  async deleteCompendium() { log.push(['dropPack', this.collection]); packs.delete(this.collection) }
  async getDocuments(q = {}) {
    return [...this.docs.values()].filter(d => !q._id__in || q._id__in.includes(d._id)).map(d => ({ ...d, toObject: () => structuredClone(d) }))
  }
}
const packOf = op => {
  const p = packs.get(op.pack)
  if (p.locked) throw new Error('locked')
  return p
}
const Doc = {
  async createDocuments(docs, op) {
    const p = packOf(op)
    if (failCreate === p.collection) throw new Error('write failed')
    log.push(['create', p.collection, op.keepId ?? false, docs.some(d => '_id' in d)])
    // the server's id, as Foundry picks one (no keepId)
    const made = docs.map(d => ({ ...structuredClone(d), _id: `id${++n}` }))
    for (const d of made) p.docs.set(d._id, d)
    return made.map(d => ({ id: d._id }))
  },
  async deleteDocuments(ids, op) { const p = packOf(op); for (const id of ids) p.docs.delete(id) },
  // recursive: false, as writePack asks: each key given replaces the old value
  async updateDocuments(ups, op) { const p = packOf(op); log.push(['update', p.collection, op.recursive, op.diff]); for (const u of ups) Object.assign(p.docs.get(u._id), structuredClone(u)) },
}

beforeEach(() => {
  packs = new Map(), folders = [], n = 0, failCreate = null, log = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const all = () => [...packs.values()]
  globalThis.game = {
    packs: { get: id => packs.get(id), filter: f => all().filter(f), some: f => all().some(f) },
    folders, i18n: { format: (k, d) => `${k} ${JSON.stringify(d)}`, localize: k => k }, release: { generation: 14 },
  }
  globalThis.Folder = { create: async d => {
    const f = { id: `f${++n}`, name: d.name, type: d.type, folder: folders.find(x => x.id === d.folder) ?? null,
      getSubfolders: () => folders.filter(x => x.folder === f), delete: async () => folders.splice(folders.indexOf(f), 1) }
    folders.push(f)
    return f
  } }
  globalThis.foundry = { documents: { collections: { CompendiumCollection: { createCompendium: async ({ name, label, type }) => new FakePack(name, label, type) } } } }
  globalThis.Item = Doc; globalThis.Actor = Doc; globalThis.JournalEntry = Doc
})


test('Foundry picks every id: no _id and no keepId in any create', async () => {
  const res = await importBook(tr(muc))
  expect(res.failed).toEqual([])
  const creates = log.filter(l => l[0] === 'create')
  expect(creates.length).toBeGreaterThan(5)
  for (const [, pack, keepId, hadId] of creates) expect([pack, keepId, hadId]).toEqual([pack, false, false])
})

test('re-import: every entry found by chummerID and updated in place (same _id), the GM’s own kept, nothing new, nothing deleted', async () => {
  await importBook(tr(muc))
  const amps = packs.get('world.ca2-muc-amps'), rules = packs.get('world.ca2-muc-rules')
  const before = new Map([...amps.docs.values()].map(d => [d.flags[M].chummerID, d._id]))
  amps.docs.set('gm', { _id: 'gm', name: 'GM amp', flags: {} })
  const [core] = rules.docs.values()
  const pageIds = core.pages.map(p => p._id)
  core.pages.push({ _id: 'gmpage', name: 'GM page', flags: {} })
  const changed = structuredClone(muc)
  changed.amps[0].name = 'Renamed Amp'
  const res = await importBook(tr(changed))
  expect(res.counts['ca2-muc-amps']).toMatchObject({ created: 0, replaced: before.size, migrated: 0 })
  expect(amps.docs.size).toBe(before.size + 1)
  for (const [key, id] of before) expect(amps.docs.get(id).flags[M].chummerID).toBe(key)
  expect([...amps.docs.values()].map(d => d.name)).toContain('Renamed Amp')
  const pages = [...rules.docs.values()].find(j => j._id === core._id).pages
  expect(pages.map(p => p._id)).toEqual([...pageIds, 'gmpage'])  // imported pages keep their ids; the GM's stays
})

test('migration: entries 0.7.x wrote under computed ids (no chummerID) are updated in place and get chummerID', async () => {
  const weapons = new FakePack('ca2-muc-weapons', 'Weapons — MUC', 'Item'), chars = new FakePack('ca2-muc-characters', 'Characters — MUC', 'Actor')
  const blade = muc.items.find(i => i.kind === 'weapon'), max = muc.characters[0]
  weapons.docs.set(docId(blade.id), { _id: docId(blade.id), name: 'old', folder: 'f-old', flags: { [M]: { id: blade.id } } })
  chars.docs.set(docId(`MUC:character:${max.id}`), { _id: docId(`MUC:character:${max.id}`), name: 'old max', items: [], flags: { [M]: { id: max.id } } })
  const res = await importBook(tr(muc))
  expect(res.counts['ca2-muc-weapons']).toMatchObject({ created: 0, replaced: 1, migrated: 1 })
  expect(weapons.docs.get(docId(blade.id))).toMatchObject({ name: blade.name, folder: 'f-old', flags: { [M]: { chummerID: `MUC:weapons:${blade.id}` } } })
  expect(chars.docs.get(docId(`MUC:character:${max.id}`)).flags[M].chummerID).toBe(`MUC:character:${max.id}`)
  expect(weapons.docs.size).toBe(1)
  const again = await importBook(tr(muc))
  expect(again.counts['ca2-muc-weapons']).toMatchObject({ replaced: 1, migrated: 0, created: 0 })
})

test('table rules: re-imported in place by chummerID; a 0.7.x journal found by its computed id', async () => {
  const pack = new FakePack('ca2-table-rules', 'Table rules — Chummer', 'JournalEntry')
  pack.docs.set(docId('table-rules'), { _id: docId('table-rules'), name: 'Table rules', pages: [], flags: { [M]: { id: 'table-rules' } } })
  const res = await importTableRules(translateTableRules(file.tableRules, { exportedAt: 'x', appVersion: 'y' }))
  expect(res.counts['ca2-table-rules']).toMatchObject({ replaced: 1, migrated: 1, created: 0 })
  expect(pack.docs.get(docId('table-rules')).flags[M].chummerID).toBe('table-rules')
})
