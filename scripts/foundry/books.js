// Write translated books (lib/books.js translateBook) into the by-type world compendiums (lib/books.js planTypePacks).
// Foundry globals only inside functions (node --check clean). Never throws: a failing pack is reported in `failed` and
// the other packs carry on. The per-book packs of 0.8.x (ca2-…) are never read or written.
import { MODULE_ID } from '../lib/constants.js'
import { chunk, countByBook, planTypePacks } from '../lib/books.js'
import { INDEX_FIELDS, keysOf, mergeByKey, planUpsert } from '../lib/chummer-id.js'
import { keepArt, keepUserEffects, mergeActorItems } from '../lib/plan.js'
import { replaceable } from '../lib/icons.js'
import { COMPENDIUM_FOLDER, ensureFolder, FOLDER, uploadPortrait } from './apply.js'

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
async function writeNew(name, label, type, folder, docs, after, onChunk) {
  const { pack, made } = await getPack(name, label, type, folder)
  try { return await writePack(pack, docs, after, onChunk) } catch (e) {
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

// Book pregens' and NPCs' portraits (img) and tokens (token image; without one the token shows the portrait), uploaded
// only once their pack is written: Foundry has no call to delete an uploaded file, so a failed write must never have
// uploaded one. A failed upload keeps the default artwork. The file name is fixed per pregen and export, so a re-import
// overwrites it rather than adding another. An image or token image the user chose (kept by writePack) is never replaced.
export const portraitsAfter = (portraits = {}, tokens = {}, say) => async (docs, op) => {
  for (const d of docs) {
    const key = keysOf(d).chummerID, url = portraits[key], tok = tokens[key], f = d.flags[MODULE_ID]
    if (!url && !tok) continue
    try {
      const up = { _id: d._id }, id = `${f.source}-${f.id}`
      if (url && replaceable(d.img)) up.img = await uploadPortrait(url, id, f.exportedAt)
      if (replaceable(d.prototypeToken?.texture?.src)) {
        const src = tok ? await uploadPortrait(tok, id, f.exportedAt, 'tokens') : up.img
        if (src) up['prototypeToken.texture.src'] = src
      }
      if (Object.keys(up).length > 1) await Actor.updateDocuments([up], op)
    } catch (e) {
      console.error(`${MODULE_ID} | ${d.name}: portrait`, e)
      say(`${d.name}: portrait or token not uploaded (${e?.message ?? e}) → default artwork`)
    }
  }
}

// A re-import updates in place, never deletes (lib/chummer-id.js planUpsert): an incoming entry found in the pack by its
// chummerID, an alias, or (migration from 0.7.x) the id 0.7.x computed for it, is updated in place, keeping its _id, its
// folder, sort and ownership, other modules' flags, the image the user chose (lib/plan.js keepArt), a journal's pages
// by chummerID (and the GM's own) and an actor's GM items; it gets our chummerID flag. Every other entry is created and
// Foundry picks its id. Entries not in the file are never touched.
// Each entry goes in its category's folder inside the pack (flags.<module>.category), made once per pack; an updated
// entry keeps the folder it is in (the GM may have moved it) and only gets one when it has none.
// Updates go first, then creates, CHUNK documents per call, onChunk(done, of) after each; if a create fails, what this
// run created (entries and folders) is deleted again (the updated entries keep their new data). after(docs, op): run
// once everything is written, while the pack is still unlocked, with the written documents' data (their _id included).
const OURS = ['name', 'type', 'img', 'system', 'effects', 'prototypeToken', 'items', 'pages']
function updateData(old, doc) {
  const k = keepArt(old, doc), u = { _id: old._id, flags: { ...old.flags, [MODULE_ID]: doc.flags?.[MODULE_ID] } }
  for (const f of OURS) if (f in k) u[f] = k[f]
  if (Array.isArray(doc.pages)) u.pages = mergeByKey(old.pages, k.pages)
  if (Array.isArray(doc.items)) u.items = mergeActorItems(old.items, k.items)
  // our effects are swapped, a user's kept (lib/plan.js keepUserEffects)
  u.effects = keepUserEffects(old.effects, k.effects ?? [])
  return u
}
const categoryOf = d => d?.flags?.[MODULE_ID]?.category ?? null
// The pack's top-level folders by name; the missing ones among `names` are created in one call. { ids, made }.
async function packFolders(pack, names) {
  const ids = new Map(pack.folders.filter(f => !f.folder).map(f => [f.name, f.id]))
  const missing = [...new Set(names)].filter(n => n && !ids.has(n))
  const made = missing.length ? await Folder.createDocuments(missing.map(name => ({ name, type: pack.documentName, sorting: 'a' })), { pack: pack.collection }) : []
  for (const f of made) ids.set(f.name, f.id)
  return { ids, made: made.map(f => f.id) }
}
async function writePack(pack, incoming, after, onChunk) {
  const Doc = pack.documentClass, op = { pack: pack.collection }
  const index = await pack.getIndex({ fields: INDEX_FIELDS })
  const { updates, creates, duplicates } = planUpsert([...index.values()], incoming)
  // V14 refuses writes to a locked pack (common/abstract/backend.mjs #assertCompendiumUnlocked, ~l.229), even a
  // world pack the GM locked: unlock for this write and lock it again after.
  const locked = pack.locked
  if (locked) await pack.configure({ locked: false })
  try {
    const old = []
    for (const ids of chunk(updates.map(u => u._id), CHUNK)) old.push(...(await pack.getDocuments({ _id__in: ids })).map(d => d.toObject()))
    const was = new Map(old.map(d => [d._id, d]))
    const homeless = u => { const f = was.get(u._id)?.folder; return !f || !pack.folders.get(f) }
    const folders = await packFolders(pack, [...creates, ...updates.filter(homeless).map(u => u.doc)].map(categoryOf))
    const folderOf = d => folders.ids.get(categoryOf(d)) ?? null
    const ups = updates.map(u => { const d = updateData(was.get(u._id), u.doc); if (homeless(u) && folderOf(u.doc)) d.folder = folderOf(u.doc); return d })
    const news = creates.map(d => ({ ...d, folder: folderOf(d) }))
    const made = []
    const steps = [...chunk(ups, CHUNK).map(c => () => Doc.updateDocuments(c, { ...op, recursive: false, diff: false })),
      ...chunk(news, CHUNK).map(c => async () => made.push(...await Doc.createDocuments(c, op)))]
    let done = 0
    try {
      for (const step of steps) { await step(); onChunk?.(++done, steps.length) }
    } catch (e) {
      try { if (made.length) await Doc.deleteDocuments(made.map(d => d.id), op) } catch {}
      try { if (folders.made.length) await Folder.deleteDocuments(folders.made, op) } catch {}
      throw e
    }
    const written = [...ups.map(u => ({ ...u, img: u.img ?? was.get(u._id)?.img, prototypeToken: u.prototypeToken ?? was.get(u._id)?.prototypeToken })),
      ...made.map((d, i) => ({ ...news[i], _id: d.id }))]
    await after?.(written, op)
    return { label: pack.title, created: creates.length, replaced: updates.length, byBook: countByBook(updates, creates),
      migrated: updates.filter(u => u.how === 'legacy').length, duplicates: duplicates.map(d => d.name ?? keysOf(d).chummerID) }
  } finally {
    if (locked) await pack.configure({ locked: true })
  }
}

const fail = (pack, name, error) => { console.error(`${MODULE_ID} | ${name}`, error); return { pack, name, error } }

const PEOPLE = new Set(['characters', 'npcs', 'critters'])

/**
 * ts: translateBook outputs (the ticked books); tableRules: translateTableRules output or null. Every book's entries go
 * into one pack per type (lib/books.js planTypePacks) in the Compendium folder topFolder (by default FOLDER); a GM's
 * compendium gets its own packs in "<name> (<id>)" inside houseFolder (by default COMPENDIUM_FOLDER). Pack names get
 * `prefix` (Quench). onProgress({ key, label, n, total, done?, of? }): before each pack, and after each chunk written.
 * Returns { counts: { [pack name]: { label, created, replaced, migrated, byBook: { [source]: { created, replaced } },
 * duplicates: [entry name] } }, failed: [{ pack, name, error }], notes: [portrait lines] }.
 */
export async function importTypes(ts, { tableRules = null, onProgress, prefix = '', topFolder = FOLDER, houseFolder = COMPENDIUM_FOLDER } = {}) {
  const counts = {}, failed = [], made = [], notes = []
  const packs = planTypePacks(ts, { prefix, tableRules })
  const portraits = Object.assign({}, ...ts.map(t => t.portraits)), tokens = Object.assign({}, ...ts.map(t => t.tokens))
  // folders only when a pack goes in them (0.2.x made a book folder for a book with nothing)
  const top = lazyFolder(topFolder, null, made), houseTop = lazyFolder(houseFolder, null, made), houses = new Map()
  const folderOf = h => {
    if (!h) return top
    if (!houses.has(h.id)) houses.set(h.id, lazyFolder(`${h.name} (${h.id})`, houseTop, made))
    return houses.get(h.id)
  }
  for (const [i, p] of packs.entries()) {
    const at = { key: p.key, label: p.label, n: i + 1, total: packs.length }
    onProgress?.(at)
    try {
      const after = PEOPLE.has(p.key) ? portraitsAfter(portraits, tokens, l => notes.push(l)) : undefined
      counts[p.name] = await writeNew(p.name, p.label, p.type, await folderOf(p.house)(), p.docs, after,
        (done, of) => onProgress?.({ ...at, done, of }))
    } catch (error) { failed.push(fail(p.name, p.label, error)) }
  }
  await dropEmptyFolders(made)
  return { counts, failed, notes }
}
