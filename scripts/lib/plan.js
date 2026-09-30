// Pure import decisions: what to do with a runner already in the world, and what Replace may overwrite.

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
 * A world copy named like a new version ("Mara (2 Oct 2026)") keeps its dated name.
 */
export function replaceUpdate(translated, existingName = '') {
  const system = structuredClone(translated.system)
  for (const k of START_ONLY) delete system[k]
  const u = { name: DATED.test(existingName) ? existingName : translated.name, flags: structuredClone(translated.flags), system }
  if (translated.img) u.img = translated.img
  return u
}

// Replace with a new portrait: the token follows it only while it still shows the actor's image (a GM's own token image stays).
export const tokenUpdate = (existing, img) =>
  img && existing?.prototypeToken?.texture?.src === existing?.img ? { 'prototypeToken.texture.src': img } : {}

// Re-import by id: incoming entries already in the pack are replaced (deleted, then created with the same id), the
// rest are created. Pack entries not in the file are never touched.
export function planPack(existingIds, incoming) {
  const replace = [], create = []
  for (const { _id } of incoming) (existingIds.has(_id) ? replace : create).push(_id)
  return { replace, create }
}
