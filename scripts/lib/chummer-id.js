// Our identity for what we import: chummerID, Chummer's own key `<source>:<kind>:<id>` (a catalog entry's id is
// already scoped by its book), and chummerAliases, the keys the entry had in earlier imports (a renamed or re-filed
// entry). Both live in this module's flags, never in Eden's system data, and are indexed in every compendium
// (indexFields) so a pack finds them without loading its documents. Foundry picks every document's _id: we never
// compute or keep one. Pure: no Foundry calls.
import { MODULE_ID } from './constants.js'
import { docId } from './ids.js'

const F = `flags.${MODULE_ID}`
/** The fields every pack indexes for us (main.js adds them to CONFIG.<Document>.compendiumIndexFields). */
export const INDEX_FIELDS = [`${F}.chummerID`, `${F}.chummerAliases`, `${F}.kind`, `${F}.source`, `${F}.page`]

/** Chummer's key for an entry: `<source>:<kind>:<id>`, or null when one part is missing (a custom line). */
export const chummerKey = (source, kind, id) => (source && kind && id ? `${source}:${kind}:${id}` : null)
/** The flags naming an entry: its key and its earlier keys (aliases from the export: [{ id, kind? }], kind when it was
 *  filed as another kind). */
export function chummerFlags(source, kind, id, aliases = []) {
  const chummerID = chummerKey(source, kind, id)
  const chummerAliases = (aliases ?? []).map(a => chummerKey(source, a?.kind ?? kind, a?.id)).filter(k => k && k !== chummerID)
  return { chummerID, chummerAliases }
}

// Migration only: the _id 0.7.x and earlier gave a document (lib/ids.js docId of a seed). A book's catalog entries
// (amps, items, vehicles, metatypes, skills, specs, rule pages) were seeded by their catalog id alone (flags.id); the
// rest (pregens, NPCs, their vehicles, rules sections and sheets, table rules) by exactly the string that is now their
// chummerID. A world that imported a book then still has those documents; a re-import finds them by it and writes
// chummerID onto them. Never used for a new document.
const CATALOG = new Set(['amps', 'weapons', 'armor', 'gear', 'spells', 'vehicles', 'metatypes', 'skills', 'specs', 'rules'])
export const legacyId = chummerID => (chummerID ? docId(chummerID) : null)
export function legacyOf(doc) {
  const k = keysOf(doc).chummerID
  if (!k) return null
  if (k.startsWith('table-rules')) return docId(k)
  const kind = k.split(':')[1]
  return CATALOG.has(kind) && flagsOf(doc).id ? docId(flagsOf(doc).id) : docId(k)
}

const flagsOf = d => d?.flags?.[MODULE_ID] ?? {}
/** An index entry or document, as the planners read it. */
export const keysOf = d => ({ chummerID: flagsOf(d).chummerID ?? null, aliases: flagsOf(d).chummerAliases ?? [] })

/**
 * A pack re-import: each incoming document (no _id) is matched to an existing entry by, in order, its chummerID, one of
 * its aliases, an entry that lists its chummerID as an alias, and (migration) the id 0.7.x computed for
 * it (legacyOf). A match is an update in place, keeping the entry's _id; anything else is created and gets Foundry's id. Each
 * existing entry is matched at most once. Nothing is ever deleted. A key the file has twice keeps its last document;
 * the dropped ones are listed in `duplicates`.
 * existing: the pack's index entries ({ _id, flags }). Returns { updates: [{ _id, doc, how }], creates: [doc], duplicates }.
 */
export function planUpsert(existing, incoming, legacy = legacyOf) {
  const byKey = new Map(), byAlias = new Map(), byId = new Map(), claimed = new Set()
  for (const e of existing) {
    const k = keysOf(e)
    if (k.chummerID && !byKey.has(k.chummerID)) byKey.set(k.chummerID, e)
    for (const a of k.aliases) if (!byAlias.has(a)) byAlias.set(a, e)
    byId.set(e._id, e)
  }
  const last = new Map(), duplicates = [], loose = []
  for (const d of incoming) {
    const k = keysOf(d).chummerID
    if (!k) { loose.push(d); continue }
    if (last.has(k)) duplicates.push(last.get(k))
    last.set(k, d)
  }
  const updates = [], creates = []
  const free = e => (e && !claimed.has(e._id) ? e : null)
  for (const d of [...last.values(), ...loose]) {
    const { chummerID: k, aliases } = keysOf(d)
    const tries = [['chummerID', () => byKey.get(k)], ...aliases.map(a => ['alias', () => byKey.get(a)]), ['alias', () => byAlias.get(k)],
      ['legacy', () => byId.get(legacy(d))]]
    let hit = null, how = null
    for (const [h, f] of tries) { if (k && (hit = free(f()))) { how = h; break } }
    if (hit) { claimed.add(hit._id); updates.push({ _id: hit._id, doc: d, how }) } else creates.push(d)
  }
  return { updates, creates, duplicates }
}

/**
 * An embedded list (a journal's pages) on re-import: an incoming entry takes the _id of the existing one with its
 * chummerID (so links to the page hold); existing entries the file no longer has, and the GM's own, are kept after the
 * imported ones (nothing is deleted). Returns the full list for a replacing update.
 */
export function mergeByKey(existing = [], incoming = []) {
  const old = new Map((existing ?? []).filter(e => keysOf(e).chummerID).map(e => [keysOf(e).chummerID, e])), used = new Set()
  const out = incoming.map(d => {
    const e = old.get(keysOf(d).chummerID)
    if (!e || used.has(e._id)) return d
    used.add(e._id)
    return { ...d, _id: e._id }
  })
  return [...out, ...(existing ?? []).filter(e => !used.has(e._id))]
}

const norm = s => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim()
/**
 * Which compendium entry a runner's item came from. entries: the index entries of that one book's compendiums
 * ({ uuid, type, name, chummerID, aliases, kind, page }). In order: the item's chummerID; its aliases (or an entry
 * listing the item's key as an alias); then the same Foundry type and name (case and punctuation aside), ties broken by
 * the same kind, then the same page. Returns { uuid, how }, { candidates } when still tied, or null.
 */
export function resolveEntry(item, entries) {
  const f = flagsOf(item), k = f.chummerID, aliases = f.chummerAliases ?? []
  const one = (list, how) => (list.length === 1 ? { uuid: list[0].uuid, how } : list.length > 1 ? { candidates: list } : null)
  if (k) {
    const r = one(entries.filter(e => e.chummerID === k), 'chummerID')
      ?? one(entries.filter(e => aliases.includes(e.chummerID) || (e.aliases ?? []).includes(k)), 'alias')
    if (r) return r
  }
  let list = entries.filter(e => e.type === item.type && norm(e.name) === norm(item.name))
  if (list.length > 1 && f.kind) { const same = list.filter(e => e.kind === f.kind); if (same.length) list = same }
  if (list.length > 1 && f.page != null) { const same = list.filter(e => e.page === f.page); if (same.length) list = same }
  return one(list, 'name')
}
/** The report line for an item left unlinked because several entries tie. */
export const tieLine = (item, candidates) => `${item.name}: ${candidates.length} compendium entries match (${
  candidates.map(c => `${c.name}${c.kind ? ` [${c.kind}]` : ''}${c.page != null ? ` p.${c.page}` : ''}`).join(', ')}) → not linked`
