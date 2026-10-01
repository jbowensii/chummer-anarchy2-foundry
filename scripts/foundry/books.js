// Write a translated book (lib/books.js translateBook) into world compendiums. Foundry globals only inside functions
// (node --check clean). Never throws: a failing pack is reported in `failed` and the other packs carry on.
import { MODULE_ID } from '../lib/constants.js'
import { mergeJournalPages, planPack } from '../lib/plan.js'
import { ensureFolder, FOLDER } from './apply.js'

const CHUNK = 100
export const PACKS = { amps: ['Amps', 'Item'], weapons: ['Weapons', 'Item'], armor: ['Armor', 'Item'], gear: ['Gear', 'Item'],
  spells: ['Spells', 'Item'], vehicles: ['Vehicles', 'Actor'], skills: ['Skills & specializations', 'Item'], rules: ['Rules', 'JournalEntry'] }

// World pack names may only hold [A-Za-z0-9-_] (BasePackage.validateId).
const packName = s => s.toLowerCase().replace(/[^a-z0-9_-]/g, '-')

// The world pack `name`, created in `folder` when missing (the server fills path, system and package: 'world').
async function getPack(name, label, type, folder) {
  const found = game.packs.get(`world.${name}`)
  if (found?.documentName === type) return found
  if (found) {
    const kind = game.i18n.localize(CONFIG[found.documentName]?.documentClass?.metadata?.labelPlural ?? found.documentName)
    throw new Error(game.i18n.format('CA2I.PackTypeClash', { id: found.collection, type: kind }))
  }
  const pack = await foundry.documents.collections.CompendiumCollection.createCompendium({ name, label, type })
  if (!pack?.collection) throw new Error(`Could not create the compendium ${label}`)
  await pack.setFolder(folder)
  return pack
}

// Replace by id: delete the entries the file has, then create all of them with their ids, in chunks. If a create
// fails, what this run made is deleted and the replaced entries are put back, so a failure never loses them.
// A replaced journal keeps the pages the GM added to it (lib/plan.js mergeJournalPages).
async function writePack(pack, incoming) {
  const Doc = pack.documentClass, op = { pack: pack.collection }
  const { replace, create, duplicates, ...plan } = planPack(new Set(pack.index.keys()), incoming)
  let docs = plan.docs
  // V14 refuses writes to a locked pack (common/abstract/backend.mjs #assertCompendiumUnlocked, ~l.229), even a
  // world pack the GM locked: unlock for this write and lock it again after.
  const locked = pack.locked
  if (locked) await pack.configure({ locked: false })
  try {
    const old = replace.length ? (await pack.getDocuments({ _id__in: replace })).map(d => d.toObject()) : []
    if (pack.documentName === 'JournalEntry' && old.length) {
      const was = new Map(old.map(j => [j._id, j]))
      docs = docs.map(j => was.has(j._id) ? { ...j, pages: mergeJournalPages(was.get(j._id).pages, j.pages ?? []) } : j)
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
  const src = t.source, counts = {}, failed = []
  const packs = Object.entries(t.packs).filter(([k, docs]) => PACKS[k] && docs?.length)
    .map(([k, docs]) => ({ key: k, docs, type: PACKS[k][1], name: packName(`${prefix}ca2-${src.id}-${k}`), label: `${PACKS[k][0]} — ${src.id}` }))
  let folder
  try {
    folder = await ensureFolder(`${src.name} (${src.id})`, await ensureFolder(topFolder, null, 'Compendium'), 'Compendium')
  } catch (error) {
    return { source: src, counts, failed: packs.map(p => fail(p.name, p.label, error)) }
  }
  for (const [i, p] of packs.entries()) {
    onProgress?.({ pack: PACKS[p.key][0], n: i + 1, total: packs.length })
    try { counts[p.name] = await writePack(await getPack(p.name, p.label, p.type, folder), p.docs) }
    catch (error) { failed.push(fail(p.name, p.label, error)) }
  }
  return { source: src, counts, failed }
}

/** journal: translateTableRules output, written by id into the table rules pack in topFolder. Same result shape. */
export async function importTableRules(journal, { prefix = '', topFolder = FOLDER } = {}) {
  const name = packName(`${prefix}ca2-table-rules`), label = 'Table rules — Chummer'
  try {
    const pack = await getPack(name, label, 'JournalEntry', await ensureFolder(topFolder, null, 'Compendium'))
    return { counts: { [name]: await writePack(pack, [journal]) }, failed: [] }
  } catch (error) {
    return { counts: {}, failed: [fail(name, label, error)] }
  }
}
