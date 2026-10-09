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

// A new token image (the file's token, else its portrait or icon): set only while the token shows replaceable art
// (empty, a stock default, the module's or an uploaded portrait/token). A token image the GM chose stays.
export const tokenUpdate = (existing, img) => img && replaceable(existing?.prototypeToken?.texture?.src)
  ? { 'prototypeToken.texture.src': img } : {}

const flagId = d => d?.flags?.[MODULE_ID]?.id
// Recreated flagged items take the old item's image (matched by flag id) when the user chose it (not replaceable).
export function keepItemArt(oldItems, newItems) {
  const chosen = new Map([...oldItems ?? []].filter(i => flagId(i) != null && !replaceable(i.img)).map(i => [flagId(i), i.img]))
  return newItems.map(i => chosen.has(flagId(i)) ? { ...i, img: chosen.get(flagId(i)) } : i)
}

// A replaced pack entry keeps the image (and token image) the user chose, and a replaced actor's recreated items keep theirs.
export function keepArt(old, doc) {
  const d = replaceable(old?.img) ? { ...doc } : { ...doc, img: old.img }
  const tok = old?.prototypeToken?.texture?.src
  if (tok && !replaceable(tok)) d.prototypeToken = { ...doc.prototypeToken, texture: { ...doc.prototypeToken?.texture, src: tok } }
  if (Array.isArray(doc.items)) d.items = keepItemArt(old?.items, doc.items)
  return d
}

/** An Active Effect this module made (flags.<module>.chummer); everything else on our documents is the user's. */
export const isOurEffect = e => e?.flags?.[MODULE_ID]?.chummer === true
/** A re-import's effects for a document: our new ones, then the old ones a user added (kept with their _id). */
export const keepUserEffects = (oldEffects, newEffects) => [...newEffects ?? [], ...(oldEffects ?? []).filter(e => !isOurEffect(e))]

/**
 * A pack actor's items on re-import: each of our items (flags.<module>.id) matched to the old one with the same id keeps
 * that item's _id, its other modules' flags and the effects a user added to it; the items the GM added (no module flags)
 * are kept after ours. An old item of ours the file no longer has is dropped (Chummer is its source).
 */
export function mergeActorItems(existingItems, incomingItems) {
  const old = new Map((existingItems ?? []).filter(i => i.flags?.[MODULE_ID]?.id != null).map(i => [i.flags[MODULE_ID].id, i])), used = new Set()
  const ours = (incomingItems ?? []).map(i => {
    const o = old.get(i.flags?.[MODULE_ID]?.id)
    if (!o || used.has(o._id)) return i
    used.add(o._id)
    return { ...i, _id: o._id, flags: { ...o.flags, ...i.flags }, effects: keepUserEffects(o.effects, i.effects) }
  })
  return [...ours, ...(existingItems ?? []).filter(i => !i.flags?.[MODULE_ID])]
}

/**
 * Replace on a world actor: its items of ours matched by flags.<module>.id (the item's uid in Chummer). A match is
 * updated in place (same _id; Chummer's fields refreshed, the item's other flags kept) and only its effects of ours are
 * swapped, so effects a user added stay; a new one is created; an old one of ours the file no longer has is deleted;
 * the user's own items are never touched. existing: the actor's items ({ id|_id, type, flags, effects }).
 * Returns { update: [{ old, item }], create: [item], remove: [id] }.
 */
export function planItems(existing, incoming) {
  const id = i => i.id ?? i._id
  const old = new Map((existing ?? []).filter(i => i.flags?.[MODULE_ID]?.id != null).map(i => [i.flags[MODULE_ID].id, i])), used = new Set()
  const update = [], create = []
  for (const it of incoming ?? []) {
    const o = old.get(it.flags?.[MODULE_ID]?.id)
    if (o && o.type === it.type && !used.has(id(o))) { used.add(id(o)); update.push({ old: o, item: it }) } else create.push(it)
  }
  const remove = [...old.values()].filter(o => !used.has(id(o))).map(id)
  return { update, create, remove }
}
