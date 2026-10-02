// Pure import decisions: what to do with a runner already in the world, and what Replace may overwrite.
import { MODULE_ID } from './constants.js'
import { replaceable } from './icons.js'

const time = x => Date.parse(x?.exportedAt ?? '') || 0

// none in the world -> create; the world copy came from a newer file -> skip; otherwise replace.
export const defaultChoice = (existing, incoming) =>
  !existing ? 'create' : time(incoming) < time(existing) ? 'skip' : 'replace'

// Fixed month names: ICU's en-GB 'short' month is "Sept" on newer runtimes. Local date: what the GM's calendar says.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function newVersionName(streetName, exportedAt) {
  const d = new Date(exportedAt)
  return `${streetName} (${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()})`
}
const DATED = new RegExp(` \\(\\d{1,2} (${MONTHS.join('|')}) \\d{4}\\)$`)

// Translated fields that are a starting choice, not Chummer data: set on create, never reset by Replace.
const START_ONLY = ['controlMode']

/**
 * The Replace update for a translated actor (runner or vehicle): its name, image, flags and the system fields the
 * translation produces, less START_ONLY. Play state (damage, anarchy, ownership, token settings and a custom token image) is never in it.
 * A world copy named like a new version ("Mara (2 Oct 2026)") keeps its dated name. The image changes only while the
 * world copy's is replaceable (lib/icons.js): art the user chose is never overwritten.
 */
export function replaceUpdate(translated, existingName = '', existingImg = '') {
  const system = structuredClone(translated.system)
  for (const k of START_ONLY) delete system[k]
  const u = { name: DATED.test(existingName) ? existingName : translated.name, flags: structuredClone(translated.flags), system }
  if (translated.img && replaceable(existingImg)) u.img = translated.img
  return u
}

// A new image (portrait or icon): the token follows it only while the actor's image may change (replaceable) and the
// token still shows it (a GM's own token image stays).
export const tokenUpdate = (existing, img) => img && replaceable(existing?.img)
  && existing?.prototypeToken?.texture?.src === existing?.img ? { 'prototypeToken.texture.src': img } : {}

const flagId = d => d?.flags?.[MODULE_ID]?.id
// Recreated flagged items take the old item's image (matched by flag id) when the user chose it (not replaceable).
export function keepItemArt(oldItems, newItems) {
  const chosen = new Map([...oldItems ?? []].filter(i => flagId(i) != null && !replaceable(i.img)).map(i => [flagId(i), i.img]))
  return newItems.map(i => chosen.has(flagId(i)) ? { ...i, img: chosen.get(flagId(i)) } : i)
}

// A replaced pack entry keeps the image the user chose, and a replaced actor's recreated items keep theirs.
export function keepArt(old, doc) {
  const d = replaceable(old?.img) ? { ...doc } : { ...doc, img: old.img }
  if (Array.isArray(doc.items)) d.items = keepItemArt(old?.items, doc.items)
  return d
}

// Re-import by id: incoming entries already in the pack are replaced (deleted, then created with the same id), the
// rest are created. Pack entries not in the file are never touched. An id the file has twice keeps its last entry
// (`docs` is what to write); the dropped earlier ones are listed in `duplicates` for the report.
export function planPack(existingIds, incoming) {
  const byId = new Map(), duplicates = []
  for (const d of incoming) {
    if (byId.has(d._id)) duplicates.push(byId.get(d._id))
    byId.set(d._id, d)
  }
  const docs = [...byId.values()], replace = [], create = []
  for (const { _id } of docs) (existingIds.has(_id) ? replace : create).push(_id)
  return { replace, create, docs, duplicates }
}

// Replacing a journal: its pages are rebuilt from the file; only the old pages without this module's flag (the GM's
// own) are kept, after the imported ones. A stale or renamed imported page does not linger.
export const mergeJournalPages = (existingPages, incomingPages) =>
  [...incomingPages, ...(existingPages ?? []).filter(p => !p.flags?.[MODULE_ID])]

// Replacing a pack actor (a book pregen): its Chummer items are rebuilt from the file; the items the GM added
// (no module flags) are kept, after the imported ones.
export const mergeActorItems = (existingItems, incomingItems) =>
  [...incomingItems, ...(existingItems ?? []).filter(i => !i.flags?.[MODULE_ID])]
