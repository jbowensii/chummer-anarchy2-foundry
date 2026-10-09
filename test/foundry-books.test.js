// importTypes (scripts/foundry/books.js) against a tiny fake of the Foundry globals it uses: one pack per type with every
// book merged in, folders by category made once per pack, Foundry picks the ids, a re-import finds each entry by
// chummerID and updates it in place, nothing is deleted, the 0.8.x per-book packs are never touched, writes go in
// chunks. The real thing runs in Foundry's Quench batches (scripts/foundry/quench.js).
import { readFileSync } from 'node:fs'
import { beforeEach, expect, test, vi } from 'vitest'
import { MODULE_ID } from '../scripts/lib/constants.js'
import { translateBook, translateTableRules } from '../scripts/lib/books.js'
import { importTypes } from '../scripts/foundry/books.js'

const file = JSON.parse(readFileSync('samples/test-books.json', 'utf8'))
const house = JSON.parse(readFileSync('samples/test-compendium.json', 'utf8')).books[0]
const [muc, mux] = file.books
const tr = book => translateBook(book, { exportedAt: file.exportedAt, appVersion: '0.9.0', descriptions: true })
const M = MODULE_ID
let packs, folders, n, failCreate, log

class FakePack {
  constructor(name, label, type) {
    Object.assign(this, { collection: `world.${name}`, title: label, documentName: type, locked: false, folder: null, docs: new Map(), dirs: new Map() })
    packs.set(this.collection, this)
  }
  get index() { return this.docs }
  get folders() { const all = [...this.dirs.values()]; return { filter: f => all.filter(f), get: id => this.dirs.get(id) } }
  async getIndex() { return this.docs }
  getUuid(id) { return `Compendium.${this.collection}.${this.documentName}.${id}` }
  get documentClass() { return Doc }
  async configure({ locked }) { log.push(['lock', this.collection, locked]); this.locked = locked }
  async setFolder(f) { this.folder = f }
  async deleteCompendium() { log.push(['dropPack', this.collection]); packs.delete(this.collection) }
  async getDocuments(q = {}) {
    log.push(['get', this.collection, q._id__in?.length])
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
    log.push(['create', p.collection, docs.length, op.keepId ?? false, docs.some(d => '_id' in d)])
    // the server's id, as Foundry picks one (no keepId)
    const made = docs.map(d => ({ ...structuredClone(d), _id: `id${++n}` }))
    for (const d of made) p.docs.set(d._id, d)
    return made.map(d => ({ id: d._id }))
  },
  async deleteDocuments(ids, op) { const p = packOf(op); log.push(['delete', p.collection, ids.length]); for (const id of ids) p.docs.delete(id) },
  // recursive: false, as writePack asks: each key given replaces the old value
  async updateDocuments(ups, op) { const p = packOf(op); log.push(['update', p.collection, ups.length, op.recursive, op.diff]); for (const u of ups) Object.assign(p.docs.get(u._id), structuredClone(u)) },
}

beforeEach(() => {
  packs = new Map(), folders = [], n = 0, failCreate = null, log = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const all = () => [...packs.values()]
  globalThis.game = {
    packs: { get: id => packs.get(id), filter: f => all().filter(f), some: f => all().some(f) },
    actors: [], items: [], folders, i18n: { format: (k, d) => `${k} ${JSON.stringify(d)}`, localize: k => k }, release: { generation: 14 },
  }
  globalThis.Folder = {
    // Compendium (pack) folders in the sidebar
    create: async d => {
      const f = { id: `f${++n}`, name: d.name, type: d.type, folder: folders.find(x => x.id === d.folder) ?? null,
        getSubfolders: () => folders.filter(x => x.folder === f), delete: async () => folders.splice(folders.indexOf(f), 1) }
      folders.push(f)
      return f
    },
    // folders inside a pack
    createDocuments: async (data, op) => {
      const p = packOf(op)
      log.push(['folders', p.collection, data.map(d => d.name)])
      return data.map(d => { const f = { ...d, id: `d${++n}`, folder: null }; p.dirs.set(f.id, f); return f })
    },
    deleteDocuments: async (ids, op) => { const p = packOf(op); for (const id of ids) p.dirs.delete(id) },
  }
  globalThis.foundry = { documents: { collections: { CompendiumCollection: { createCompendium: async ({ name, label, type }) => new FakePack(name, label, type) } } } }
  globalThis.Item = Doc; globalThis.Actor = Doc; globalThis.JournalEntry = Doc
})

const dirName = (pack, d) => pack.dirs.get(d.folder)?.name
const byKey = (pack, key) => [...pack.docs.values()].find(d => d.flags?.[M]?.chummerID === key)

test('one pack per type, every book merged, in the Compendium folder Chummer Anarchy; Foundry picks every id', async () => {
  const res = await importTypes([tr(muc), tr(mux)])
  expect(res.failed).toEqual([])
  expect([...packs.keys()].every(k => /^world\.ca2t-[a-z-]+$/.test(k))).toBe(true)
  expect([...packs.values()].every(p => p.folder?.name === 'Chummer Anarchy')).toBe(true)
  expect(folders.map(f => f.name)).toEqual(['Chummer Anarchy'])
  const q = packs.get('world.ca2t-qualities')
  expect(q.title).toBe('Qualities')
  expect([...q.docs.values()].map(d => d.flags[M].source)).toEqual(['MUC', 'MUX'])
  expect(res.counts['ca2t-qualities']).toMatchObject({ label: 'Qualities', created: 2, replaced: 0, byBook: { MUC: { created: 1, replaced: 0 }, MUX: { created: 1, replaced: 0 } } })
  for (const [, , , keepId, hadId] of log.filter(l => l[0] === 'create')) expect([keepId, hadId]).toEqual([false, false])
})

test('folders by category inside each pack, made once per pack; every entry in one', async () => {
  await importTypes([tr(muc), tr(mux)])
  const made = log.filter(l => l[0] === 'folders')
  expect(new Set(made.map(l => l[1])).size).toBe(made.length)  // one call per pack
  for (const p of packs.values()) for (const d of p.docs.values()) expect(dirName(p, d), d.name).toBe(d.flags[M].category)
  expect([...packs.get('world.ca2t-qualities').dirs.values()].map(f => f.name)).toEqual(['Positive qualities'])
  expect(dirName(packs.get('world.ca2t-weapons'), byKey(packs.get('world.ca2t-weapons'), 'MUC:weapons:muc.made-up-blade'))).toBe('Melee weapons')
  expect([...packs.get('world.ca2t-rules').dirs.values()].map(f => f.name)).toEqual(['Core', 'Optional rules'])
})

test('re-import of one book: its entries updated in place (same _id, moved back into their category folder), the other book’s and the GM’s own left alone', async () => {
  await importTypes([tr(muc), tr(mux)])
  const q = packs.get('world.ca2t-qualities'), rules = packs.get('world.ca2t-rules')
  const knack = byKey(q, 'MUC:amps:muc.made-up-knack'), extra = [...q.docs.values()].find(d => d.flags[M].source === 'MUX')
  const muxBefore = structuredClone(extra)
  q.docs.set('gm', { _id: 'gm', name: 'GM amp', flags: {} })
  // the GM moved the knack into a folder of their own: the re-import puts it back
  q.dirs.set('mine', { id: 'mine', name: 'Mine', folder: null })
  knack.folder = 'mine'
  const core = byKey(rules, 'MUC:rules-sheet:core'), pageIds = core.pages.map(p => p._id)
  core.pages.push({ _id: 'gmpage', name: 'GM page', flags: {} })
  const changed = structuredClone(muc)
  changed.amps[0].name = 'Renamed Knack'
  log = []
  const res = await importTypes([tr(changed)])
  expect(res.counts['ca2t-qualities']).toMatchObject({ created: 0, replaced: 1, byBook: { MUC: { created: 0, replaced: 1 } } })
  expect(q.docs.get(knack._id).name).toBe('Renamed Knack')
  expect(dirName(q, q.docs.get(knack._id))).toBe('Positive qualities')  // owner decision: always its category's folder
  expect(q.docs.get(extra._id)).toEqual(muxBefore)  // the book not in the file: untouched
  expect(q.docs.get('gm')).toBeTruthy()
  expect(q.docs.size).toBe(3)
  expect(log.some(l => l[0] === 'delete')).toBe(false)
  expect(log.filter(l => l[0] === 'folders')).toEqual([])  // every folder it needs is there already
  expect(byKey(rules, 'MUC:rules-sheet:core').pages.map(p => p._id)).toEqual([...pageIds, 'gmpage'])
})

test('an entry with no folder (or a deleted one) gets its category folder on re-import', async () => {
  await importTypes([tr(muc)])
  const w = packs.get('world.ca2t-weapons'), blade = byKey(w, 'MUC:weapons:muc.made-up-blade')
  w.dirs.clear()
  await importTypes([tr(muc)])
  expect(dirName(w, w.docs.get(blade._id))).toBe('Melee weapons')
})

test('the 0.8.x per-book packs are never read or written, even holding the same chummerIDs', async () => {
  const old = new FakePack('ca2-muc-amps', 'Amps — MUC', 'Item'), tableOld = new FakePack('ca2-table-rules', 'Table rules — Chummer', 'JournalEntry')
  old.docs.set('o1', { _id: 'o1', name: 'old knack', flags: { [M]: { chummerID: 'MUC:amps:muc.made-up-knack' } } })
  const res = await importTypes([tr(muc)], { tableRules: translateTableRules(file.tableRules, { exportedAt: 'x', appVersion: 'y' }) })
  expect(res.failed).toEqual([])
  expect(log.filter(l => l[1] === old.collection || l[1] === tableOld.collection)).toEqual([])
  expect(old.docs.get('o1').name).toBe('old knack')
  expect(byKey(packs.get('world.ca2t-qualities'), 'MUC:amps:muc.made-up-knack')).toBeTruthy()
  // the table rules journal is in Rules, folder Table rules
  const rules = packs.get('world.ca2t-rules'), tr2 = byKey(rules, 'table-rules')
  expect(dirName(rules, tr2)).toBe('Table rules')
  expect(res.counts['ca2t-rules'].byBook).toMatchObject({ MUC: { created: 2 }, 'table rules': { created: 1 } })
})

test('writes go in chunks of 100 with progress per chunk; a locked pack is unlocked and locked again', async () => {
  const big = structuredClone(muc)
  big.items = Array.from({ length: 250 }, (_, i) => ({ id: `muc.g${i}`, source: 'MUC', page: 1, canon: true, kind: 'gear', name: `Gadget ${i}`, specialist: false, category: 'Tools' }))
  const seen = []
  await importTypes([tr(big)], { onProgress: p => seen.push(p) })
  expect(log.filter(l => l[0] === 'create' && l[1] === 'world.ca2t-gear').map(l => l[2])).toEqual([100, 100, 50])
  expect(seen.filter(p => p.key === 'gear').map(p => [p.done, p.of])).toEqual([[undefined, undefined], [1, 3], [2, 3], [3, 3]])
  const g = packs.get('world.ca2t-gear')
  g.locked = true
  log = []
  await importTypes([tr(big)])
  expect(log.filter(l => l[1] === g.collection).map(l => l[0] === 'update' ? [l[0], l[2]] : l[0] === 'lock' ? [l[0], l[2]] : [l[0]]))
    .toEqual([['lock', false], ['get'], ['get'], ['get'], ['update', 100], ['update', 100], ['update', 50], ['lock', true]])
})

test('a failing create deletes what it made (entries, folders, a new pack); the other packs carry on', async () => {
  failCreate = 'world.ca2t-weapons'
  const res = await importTypes([tr(muc)])
  expect(res.failed.map(f => f.pack)).toEqual(['ca2t-weapons'])
  expect(packs.has('world.ca2t-weapons')).toBe(false)
  expect(res.counts['ca2t-armor'].created).toBe(1)
})

test('re-import keeps a user’s effect on an entry (this module makes none: sra2’s own fields carry ours)', async () => {
  await importTypes([tr(muc)])
  const q = packs.get('world.ca2t-qualities'), [entry] = q.docs.values()
  entry.effects = [{ _id: 'userfx', name: 'GM house rule', flags: {} }]
  await importTypes([tr(muc)])
  expect(q.docs.get(entry._id).effects).toEqual([{ _id: 'userfx', name: 'GM house rule', flags: {} }])
})

test('a GM’s compendium: its own packs by type in "Chummer compendiums/<name> (<id>)", never merged with the books', async () => {
  const res = await importTypes([tr(muc), tr(house)])
  expect(res.failed).toEqual([])
  const w = packs.get('world.ca2h-myh-weapons')
  expect(w.title).toBe('Weapons — MYH (House)')
  expect(w.folder.name).toBe('Made-Up House Stuff (MYH)')
  expect(w.folder.folder.name).toBe('Chummer compendiums')
  expect([...packs.get('world.ca2t-weapons').docs.values()].map(d => d.flags[M].source)).toEqual(['MUC'])
})

test('an entry that changed type moves: created in its new pack with the old one’s user effects and art, links re-pointed, the old copy deleted', async () => {
  await importTypes([tr(muc)])
  const q = packs.get('world.ca2t-qualities'), knack = byKey(q, 'MUC:amps:muc.made-up-knack')
  knack.effects = [{ _id: 'userfx', name: 'GM house rule', flags: {} }]
  knack.img = 'worlds/w/my-knack.webp'
  q.docs.set('gm', { _id: 'gm', name: 'Made-up Knack', flags: {} })  // the GM's own, same name: never ours to delete
  const oldUuid = q.getUuid(knack._id), ups = []
  const linked = { items: [{ id: 'i1', _stats: { compendiumSource: oldUuid } }, { id: 'i2', _stats: { compendiumSource: 'elsewhere' } }],
    updateEmbeddedDocuments: async (_, u) => { ups.push(...u) } }
  game.actors.push(linked)
  q.locked = true
  const changed = structuredClone(muc)
  Object.assign(changed.amps[0], { type: 'cyberware', typeName: 'Cyberware' })
  const res = await importTypes([tr(changed)])
  expect(res.failed).toEqual([])
  const aug = packs.get('world.ca2t-augmentations'), moved = byKey(aug, 'MUC:amps:muc.made-up-knack')
  expect(moved).toMatchObject({ img: 'worlds/w/my-knack.webp', system: { featType: 'cyberware' } })
  expect(moved.effects).toEqual([{ _id: 'userfx', name: 'GM house rule', flags: {} }])
  expect(dirName(aug, moved)).toBe('Cyberware')
  expect(q.docs.has(knack._id)).toBe(false)
  expect(q.docs.has('gm')).toBe(true)
  expect(q.locked).toBe(true)
  expect(ups).toEqual([{ _id: 'i1', '_stats.compendiumSource': aug.getUuid(moved._id) }])
  expect(res.moved).toEqual([{ name: 'Made-up Knack', from: 'Qualities', to: 'Cyberware & Bioware', links: 1 }])
  // nothing more to move on the next import
  expect((await importTypes([tr(changed)])).moved).toEqual([])
})
