// Icon choice for imported documents. Pure: no Foundry calls. Paths in the index are relative to the module root.
import { MODULE_ID } from './constants.js'
import { featType, vehicleType, weaponType } from './sra2.js'

export const MODULE_ICON_ROOT = `modules/${MODULE_ID}/`

// lowercase, non-alphanumerics -> '-', trimmed (Chummer's id rule)
export const slugName = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

/**
 * The module path of the best icon, or null. index: icons/index.json (array or Set). Order: book-specific item file,
 * item file by name, the full-key default, the category default.
 */
export function iconFor(key, name, book, index) {
  const has = index instanceof Set ? index : new Set(index ?? [])
  const slug = slugName(name), b = slugName(book), cat = String(key ?? '').split('/')[0]
  const hit = [b && slug && `icons/items/${b}.${slug}.webp`, slug && `icons/items/${slug}.webp`,
    key && `icons/defaults/${key}.webp`, cat && `icons/defaults/${cat}.webp`].find(p => p && has.has(p))
  return hit ? MODULE_ICON_ROOT + hit : null
}

// Replace only empty images, Foundry's stock svg defaults, sra2's defaults, the module's own art and the portraits the
// importer uploads (worlds/<world>/chummer/portraits, foundry/apply.js uploadPortrait). Anything else the user chose.
export function replaceable(img) {
  const p = String(img ?? '').trim().replace(/^\/+/, '')
  return !p || p.startsWith('icons/svg/') || p.startsWith('systems/sra2/') || p.startsWith(MODULE_ICON_ROOT)
    || /^worlds\/[^/]+\/chummer\/portraits\//.test(p)
}

// Stores flags.icon (always) and sets img when an icon resolves (icons: the index as a Set, or null for none).
export function withIcon(doc, key, book, icons) {
  doc.flags[MODULE_ID].icon = { key, name: doc.name, book: book ?? null }
  const img = icons && iconFor(key, doc.name, book, icons)
  if (img) doc.img = img
  return doc
}

const SKILL_GROUP = { athletics: 'physical', 'close-combat': 'physical', 'ranged-weapons': 'physical', stealth: 'physical',
  piloting: 'physical', survival: 'physical', influence: 'social', networking: 'social', cracking: 'technical',
  electronics: 'technical', engineering: 'technical', sorcery: 'magic', conjuration: 'magic', 'astral-combat': 'magic',
  technomancer: 'resonance', perception: 'perception' }
// a skill or spec by its sra2 skill slug
export const skillIconKey = slug => (Object.hasOwn(SKILL_GROUP, slug) ? `skill/${SKILL_GROUP[slug]}` : 'skill')

const SPELL = /\b(combat|detection|health|illusion|manipulation)\b/
// a runner-shaped item ({ kind, name, starting?, category? })
export function itemIconKey(it) {
  if (it.kind === 'weapon') return `weapon/${weaponType(it.name)}`
  if (it.kind === 'armor') return 'armor'
  if (it.kind === 'complex-form') return 'complex-form'
  if (it.kind === 'spell') { const m = SPELL.exec(String(it.category ?? '').toLowerCase()); return m ? `spell/${m[1]}` : 'spell' }
  if (it.starting === 'fake-sin' || it.starting === 'real-sin') return 'equipment/sin'
  if (it.starting === 'commlink') return 'equipment/commlink'
  return 'equipment'
}

const negative = amp => (amp.rating ?? 0) < 0 || (amp.printedRating ?? 0) < 0
  || (amp.effects ?? []).some(e => e.category === 'negative' || e.id === 'negative')
// an amp, as the feat ampFeat makes (a book equipment amp over a weapon/armor is that item)
export function ampIconKey(amp) {
  if (amp.type === 'vehicle') return `vehicle/${vehicleType(amp.vehicle, amp.name)}`
  if (amp.type === 'equipment' && amp.item?.kind === 'weapon') return `weapon/${weaponType(amp.name)}`
  if (amp.type === 'equipment' && amp.item?.kind === 'armor') return 'armor'
  if (amp.type === 'bioware') return 'cyberware/bioware'
  const t = featType(amp.type)
  return t === 'trait' ? `trait/${negative(amp) ? 'negative' : 'positive'}` : t
}
