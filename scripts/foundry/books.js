// Write a translated book (lib/books.js translateBook) into world compendiums. Foundry globals only inside functions
// (node --check clean). Never throws: a failing pack is reported in `failed` and the other packs carry on.
import { MODULE_ID } from '../lib/constants.js'
import { packName, PACKS, planBookPacks } from '../lib/books.js'
import { mergeActorItems, mergeJournalPages, planPack } from '../lib/plan.js'
import { ensureFolder, FOLDER, uploadPortrait } from './apply.js'

export { PACKS }
const CHUNK = 100

// The world pack `name`, created in `folder` when missing (the server fills path, system and package: 'world').
// { pack, made }: made when this call created it.
async function getPack(name, label, type, folder) {
  const found = game.packs.get(`world.${name}`)
  if (found?.documentName === type) return { pack: found, made: false }
  if (found) {
    const kind = game.i18n.localize(CONFIG[found.documentName]?.documentClass?.metadata?.labelPlural ?? found.documentName)
    throw new Error(game.i18n.format('CA2I.PackTypeClash', { id: found.collection, type: kind }))
  }
  const pack = await foundry.documents.collections.CompendiumCollection.createCompendium({ name, label, type })
  if (!pack?.collection) throw new Error(`Could not create the compendium ${label}`)
  try { await pack.setFolder(folder) } catch (e) { await dropPack(pack); throw e }
  return { pack, made: true }
}
const dropPack = async pack => { try { await pack.deleteCompendium() } catch (e) { console.error(`${MODULE_ID} | ${pack.title}: deleting the empty compendium failed`, e) } }

// Write docs into the pack, creating it only now that there is something to write. A pack this call created is
// deleted again when the write fails, so a failure never leaves an empty compendium behind (0.2.x did).
async function writeNew(name, label, type, folder, docs, after) {
  const { pack, made } = await getPack(name, label, type, folder)
  try { return await writePack(pack, docs, after) } catch (e) {
    if (made) await dropPack(pack)
    throw e
  }
}

// A folder made only when needed (ensureFolder), remembering whether this run made it so an unused one can go again.
const lazyFolder = (name, parent, made) => {
  let f
  return async () => {
    if (f) return f
    const p = parent && await parent()
    const had = game.folders.find(x => x.type === 'Compendium' && x.name === name && (x.folder?.id ?? null) === (p?.id ?? null))
    f = had ?? await ensureFolder(name, p, 'Compendium')
    if (!had) made.push(f)
    return f
  }
}
// Folders this run made that hold nothing (no pack was written into them) are deleted, innermost first.
async function dropEmptyFolders(made) {
  for (const f of made.reverse()) {
    try { if (!f.getSubfolders().length && !game.packs.some(p => p.folder?.id === f.id)) await f.delete() } catch {}
  }
}

// Book pregens' portraits (img and token), uploaded only once their pack is written: Foundry has no call to delete
// an uploaded file, so a failed write must never have uploaded one. A failed upload keeps the default artwork.
// The file name is fixed per pregen and export, so a re-import overwrites it rather than adding another.
const portraitsAfter = (portraits = {}, say) => async (docs, op) => {
  for (const d of docs) {
    const url = portraits[d._id], f = d.flags[MODULE_ID]
    if (!url) continue
    try {
      const img = await uploadPortrait(url, `${f.source}-${f.id}`, f.exportedAt)
      await Actor.updateDocuments([{ _id: d._id, img, 'prototypeToken.texture.src': img }], op)
    } catch (e) {
      console.error(`${MODULE_ID} | ${d.name}: portrait`, e)
      say(`${d.name}: portrait not uploaded (${e?.message ?? e}) → default artwork`)
    }
  }
}

// Replace by id: delete the entries the file has, then create all of them with their ids, in chunks. If a create
// fails, what this run made is deleted and the replaced entries are put back, so a failure never loses them.
// A replaced journal keeps the pages the GM added to it, a replaced actor the GM's own items (lib/plan.js).
// after(docs, op): run once everything is written, while the pack is still unlocked.
async function writePack(pack, incoming, after) {
  const Doc = pack.documentClass, op = { pack: pack.collection }
  const { replace, create, duplicates, ...plan } = planPack(new Set(pack.index.keys()), incoming)
  let docs = plan.docs
  // V14 refuses writes to a locked pack (common/abstract/backend.mjs #assertCompendiumUnlocked, ~l.229), even a
  // world pack the GM locked: unlock for this write and lock it again after.
  const locked = pack.locked
  if (locked) await pack.configure({ locked: false })
  try {
    const old = replace.length ? (await pack.getDocuments({ _id__in: replace })).map(d => d.toObject()) : []
    const [kept, merge] = { JournalEntry: ['pages', mergeJournalPages], Actor: ['items', mergeActorItems] }[pack.documentName] ?? []
    if (merge && old.length) {
      const was = new Map(old.map(d => [d._id, d]))
      docs = docs.map(d => was.has(d._id) ? { ...d, [kept]: merge(was.get(d._id)[kept], d[kept] ?? []) } : d)
    }
    if (replace.length) await Doc.deleteDocuments(replace, op)
    const made = []
    try {
      for (let i = 0; i < docs.length; i += CHUNK) {
        made.push(...await Doc.createDocuments(docs.slice(i, i + CHUNK), { ...op, keepId: true }))
      }
    } catch (e) {
      try { if (made.length) await Doc.deleteDocuments(made.map(d => d.id), op) } catch {}
      try { if (old.length) await Doc.createDocuments(old, { ...op, keepId: true }) } catch (restore) {
        console.error(`${MODULE_ID} | ${pack.title}: restoring the replaced entries failed`, restore)
        throw new Error(`${e?.message ?? e} (restoring the replaced entries failed)`, { cause: e })
      }
      throw e
    }
    await after?.(docs, op)
    return { label: pack.title, created: create.length, replaced: replace.length, duplicates: duplicates.map(d => d.name ?? d._id) }
  } finally {
    if (locked) await pack.configure({ locked: true })
  }
}

const fail = (pack, name, error) => { console.error(`${MODULE_ID} | ${name}`, error); return { pack, name, error } }

/**
 * t: translateBook output. onProgress({ pack, n, total }) before each pack is written. Packs go in `<book name> (<source id>)` inside topFolder; pack names get `prefix` (Quench).
 * Returns { source, counts: { [pack name]: { label, created, replaced, duplicates: [entry name] } }, failed: [{ pack, name, error }] }.
 */
export async function importBook(t, { onProgress, prefix = '', topFolder = FOLDER } = {}) {
  const src = t.source, counts = {}, failed = [], made = []
  // nothing to write: no pack and no folder (0.2.x made the book folder anyway, e.g. for a pregens-only book)
  const packs = planBookPacks(t, prefix)
  const folder = lazyFolder(`${src.name} (${src.id})`, lazyFolder(topFolder, null, made), made)
  for (const [i, p] of packs.entries()) {
    onProgress?.({ pack: PACKS[p.key][0], n: i + 1, total: packs.length })
    try {
      const after = p.key === 'characters' ? portraitsAfter(t.portraits, l => t.textOnly?.push(l)) : undefined
      counts[p.name] = await writeNew(p.name, p.label, p.type, await folder(), p.docs, after)
    } catch (error) { failed.push(fail(p.name, p.label, error)) }
  }
  await dropEmptyFolders(made)
  return { source: src, counts, failed }
}

/** journal: translateTableRules output, written by id into the table rules pack in topFolder. Same result shape. */
export async function importTableRules(journal, { prefix = '', topFolder = FOLDER } = {}) {
  const name = packName(`${prefix}ca2-table-rules`), label = 'Table rules — Chummer', made = []
  if (!journal?.pages?.length) return { counts: {}, failed: [] }  // never an empty journal or compendium
  try {
    return { counts: { [name]: await writeNew(name, label, 'JournalEntry', await lazyFolder(topFolder, null, made)(), [journal]) }, failed: [] }
  } catch (error) {
    await dropEmptyFolders(made)
    return { counts: {}, failed: [fail(name, label, error)] }
  }
}
