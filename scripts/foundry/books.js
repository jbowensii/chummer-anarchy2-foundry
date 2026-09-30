// Write a translated book (lib/books.js translateBook) into world compendiums. Foundry globals only inside functions
// (node --check clean). Never throws: a failing pack is reported in `failed` and the other packs carry on.
import { MODULE_ID } from '../lib/constants.js'
import { planPack } from '../lib/plan.js'
import { ensureFolder, FOLDER } from './apply.js'

const CHUNK = 100
const PACKS = { amps: ['Amps', 'Item'], weapons: ['Weapons', 'Item'], armor: ['Armor', 'Item'], gear: ['Gear', 'Item'],
  spells: ['Spells', 'Item'], vehicles: ['Vehicles', 'Actor'], skills: ['Skills & specializations', 'Item'], rules: ['Rules', 'JournalEntry'] }

// World pack names may only hold [A-Za-z0-9-_] (BasePackage.validateId).
const packName = s => s.toLowerCase().replace(/[^a-z0-9_-]/g, '-')

// The world pack `name`, created in `folder` when missing (the server fills path, system and package: 'world').
async function getPack(name, label, type, folder) {
  const found = game.packs.get(`world.${name}`)
  if (found) return found
  const pack = await foundry.documents.collections.CompendiumCollection.createCompendium({ name, label, type })
  if (!pack?.collection) throw new Error(`Could not create the compendium ${label}`)
  await pack.setFolder(folder)
  return pack
}

// Replace by id: delete the entries the file has, then create all of them with their ids, in chunks. If a create
// fails, what this run made is deleted and the replaced entries are put back, so a failure never loses them.
async function writePack(pack, docs, onProgress) {
  const Doc = pack.documentClass, op = { pack: pack.collection }
  const { replace, create } = planPack(new Set(pack.index.keys()), docs)
  const locked = pack.locked
  if (locked) await pack.configure({ locked: false })
  try {
    const old = replace.length ? (await pack.getDocuments({ _id__in: replace })).map(d => d.toObject()) : []
    if (replace.length) await Doc.deleteDocuments(replace, op)
    const made = []
    try {
      for (let i = 0; i < docs.length; i += CHUNK) {
        made.push(...await Doc.createDocuments(docs.slice(i, i + CHUNK), { ...op, keepId: true }))
        onProgress?.({ pack: pack.title, done: made.length, total: docs.length })
      }
    } catch (e) {
      try { if (made.length) await Doc.deleteDocuments(made.map(d => d.id), op) } catch {}
      try { if (old.length) await Doc.createDocuments(old, { ...op, keepId: true }) } catch {}
      throw e
    }
    return { created: create.length, replaced: replace.length }
  } finally {
    if (locked) await pack.configure({ locked: true })
  }
}

const fail = (pack, name, error) => { console.error(`${MODULE_ID} | ${name}`, error); return { pack, name, error } }

/**
 * t: translateBook output. Packs go in `<book name> (<source id>)` inside topFolder; pack names get `prefix` (Quench).
 * Returns { source, counts: { [pack name]: { created, replaced } }, failed: [{ pack, name, error }] }.
 */
export async function importBook(t, { onProgress, prefix = '', topFolder = FOLDER } = {}) {
  const src = t.source, counts = {}, failed = []
  const packs = Object.entries(t.packs).filter(([k, docs]) => PACKS[k] && docs?.length)
    .map(([k, docs]) => ({ docs, type: PACKS[k][1], name: packName(`${prefix}ca2-${src.id}-${k}`), label: `${PACKS[k][0]} — ${src.id}` }))
  let folder
  try {
    folder = await ensureFolder(`${src.name} (${src.id})`, await ensureFolder(topFolder, null, 'Compendium'), 'Compendium')
  } catch (error) {
    return { source: src, counts, failed: packs.map(p => fail(p.name, p.label, error)) }
  }
  for (const p of packs) {
    try { counts[p.name] = await writePack(await getPack(p.name, p.label, p.type, folder), p.docs, onProgress) }
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
