// Pure import decisions: what to do with a runner already in the world, and what Replace may overwrite.

const time = x => Date.parse(x?.exportedAt ?? '') || 0

// none in the world -> create; the world copy came from a newer file -> skip; otherwise replace.
export const defaultChoice = (existing, incoming) =>
  !existing ? 'create' : time(incoming) < time(existing) ? 'skip' : 'replace'

// Fixed month names: ICU's en-GB 'short' month is "Sept" on newer runtimes.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function newVersionName(streetName, exportedAt) {
  const d = new Date(exportedAt)
  return `${streetName} (${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()})`
}

/**
 * The Replace update for a translated actor (runner or vehicle): its name, image, flags and exactly the system fields the
 * translation produces. Play state (damage, anarchy, ownership, other token settings) is never in it, so the update keeps it.
 */
export function replaceUpdate(translated) {
  const u = { name: translated.name, flags: structuredClone(translated.flags), system: structuredClone(translated.system) }
  if (translated.img) Object.assign(u, { img: translated.img, prototypeToken: { texture: { src: translated.img } } })
  return u
}
