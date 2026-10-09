// One Chummer book (docs/export-format.md "Book") -> compendium document data per kind, and the by-type packs every
// imported book is merged into. Pure: no Foundry calls.
import { MODULE_ID } from './constants.js'
import { chummerFlags, keysOf, planUpsert } from './chummer-id.js'
import { ATTR, featType, metatypeAnarchy, skillFor, specFor, vehicleType } from './sra2.js'
import { negative, skillIconKey, withIcon } from './icons.js'
import { ampFeat, escapeText, itemFeat, metatypeMax, PACK_OF, rrResolver, translateRunner, vehicleActor } from './translate.js'

/**
 * The by-type compendiums (0.9.0): one pack per type with every book merged into it, folders inside by category
 * (flags.<module>.category). key -> [label, document type], in the order they are written. sra2's types (feat by its
 * featType, skill, specialization, metatype; character and vehicle actors), split where Chummer has a clear subtype.
 */
export const TYPES = { qualities: ['Qualities', 'Item'], augmentations: ['Cyberware & Bioware', 'Item'], magic: ['Magic & Resonance', 'Item'],
  cyberdecks: ['Cyberdecks', 'Item'], contacts: ['Contacts', 'Item'], 'amped-gear': ['Equipment & vehicle amps', 'Item'],
  weapons: ['Weapons', 'Item'], armor: ['Armor', 'Item'], gear: ['Gear', 'Item'], spells: ['Spells', 'Item'], 'complex-forms': ['Complex forms', 'Item'],
  vehicles: ['Vehicles & Drones', 'Actor'], characters: ['Sample characters', 'Actor'], npcs: ['NPCs', 'Actor'], critters: ['Critters & Spirits', 'Actor'],
  metatypes: ['Metatypes', 'Item'], skills: ['Skills', 'Item'], specializations: ['Specializations', 'Item'],
  rules: ['Rules', 'JournalEntry'], reference: ['Reference', 'JournalEntry'] }
// an amp's pack by its sra2 feat type (an equipment amp, also one that is a weapon or armor, and a vehicle amp: amped-gear)
const AMP_PACK = { trait: 'qualities', cyberware: 'augmentations', 'adept-power': 'magic', awakened: 'magic', emerged: 'magic',
  cyberdeck: 'cyberdecks', contact: 'contacts' }
/** A translated document's type pack. kind: the translateBook list it is in, or a runner item's flags kind. */
export function typeKey(kind, doc) {
  if (kind === 'amps') return AMP_PACK[doc?.system?.featType] ?? 'amped-gear'
  if (kind === 'spells') return doc?.system?.featType === 'complex-form' ? 'complex-forms' : 'spells'
  if (kind === 'skills' || kind === 'specs') return doc?.type === 'specialization' ? 'specializations' : 'skills'
  return Object.hasOwn(TYPES, kind) ? kind : null
}
// the reference kinds (Chummer's `reference`: what sra2 has no document for) -> their journal's title
export const REFERENCE = { levels: 'Levels', packages: 'Packages', lifestyles: 'Lifestyles', ampTypes: 'Amp types', ampEffects: 'Amp effects',
  attributes: 'Attributes' }
export const PORTRAIT = /^data:image\/(png|jpe?g);base64,/i
// World pack names may only hold [A-Za-z0-9-_] (BasePackage.validateId).
export const packName = s => s.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
// Pack names: ca2t-<type> for the books, ca2h-<compendium id>-<type> for a GM's compendium. Never ca2-…: those are the
// per-book packs of 0.8.x and earlier, which this module no longer reads or writes.
export const typePackName = (key, prefix = '', house = null) => packName(`${prefix}${house ? `ca2h-${house.id}-` : 'ca2t-'}${key}`)
/** A by-type pack's type key from its name (no "world."), or null: an old per-book pack, or not ours. */
export function packTypeKey(name, prefix = '') {
  const p = packName(prefix), n = String(name)
  if (n.startsWith(`${p}ca2t-`)) { const k = n.slice(p.length + 5); return Object.hasOwn(TYPES, k) ? k : null }
  if (!n.startsWith(`${p}ca2h-`)) return null
  return Object.keys(TYPES).filter(k => n.endsWith(`-${k}`)).sort((a, b) => b.length - a.length)[0] ?? null
}

/**
 * The packs an import writes: every translated book's documents merged by type (typeKey), the table rules journal
 * in Rules. A GM's compendium (source.compendium) keeps packs of its own, one per type, labelled "(House)" (`house`).
 * Only types with entries, books first, in TYPES order: never an empty compendium.
 * Returns [{ key, type, name, label, house: source | null, docs }].
 */
export function planTypePacks(ts, { prefix = '', tableRules = null } = {}) {
  const groups = new Map([['', { house: null, packs: {} }]])
  const push = (house, key, doc) => {
    if (!key) return
    const id = house?.id ?? ''
    if (!groups.has(id)) groups.set(id, { house, packs: {} })
    ;(groups.get(id).packs[key] ??= []).push(doc)
  }
  for (const t of ts) {
    const house = t.source?.compendium === true ? t.source : null
    for (const [kind, docs] of Object.entries(t.packs ?? {})) for (const d of docs ?? []) push(house, typeKey(kind, d), d)
  }
  if (tableRules?.pages?.length) push(null, 'rules', tableRules)
  return [...groups.values()].flatMap(({ house, packs }) => Object.keys(TYPES).filter(k => packs[k]?.length).map(k => ({
    key: k, type: TYPES[k][1], name: typePackName(k, prefix, house), house, docs: packs[k],
    label: house ? `${TYPES[k][0]} — ${house.id} (House)` : TYPES[k][0] })))
}

/** A pack write's counts per book (flags source; the table rules journal has none): { [source]: { created, replaced } }. */
export function countByBook(updates, creates) {
  const out = {}, at = d => (out[d?.flags?.[MODULE_ID]?.source ?? 'table rules'] ??= { created: 0, replaced: 0 })
  for (const u of updates) at(u.doc).replaced++
  for (const d of creates) at(d).created++
  return out
}
/**
 * Entries that changed type (owner decision, 0.9.0: move them). After the writes, an entry of ours (it has a chummerID)
 * in another type pack of the same group and document type, found by the chummerID or an alias of an entry this import
 * wrote (lib/chummer-id.js planUpsert), is that entry's old copy; one this import wrote into its own pack is not.
 * existing: { [type key]: index entries ({ _id, name, flags }) } read after the writes; planned: { [type key]: docs }
 * this import wrote. Returns [{ from, to, oldId, newId, name }]: newId the entry's _id in its new pack.
 */
export function planMoves(existing, planned) {
  const moves = []
  for (const [to, docs] of Object.entries(planned)) {
    const newId = new Map((existing[to] ?? []).map(e => [keysOf(e).chummerID, e._id]))
    for (const [from, entries] of Object.entries(existing)) {
      if (from === to || TYPES[from]?.[1] !== TYPES[to]?.[1]) continue
      const own = new Set((planned[from] ?? []).map(d => keysOf(d).chummerID))
      const ours = entries.filter(e => keysOf(e).chummerID && !own.has(keysOf(e).chummerID))
      for (const u of planUpsert(ours, docs, () => null).updates) {
        const id = newId.get(keysOf(u.doc).chummerID)
        if (id) moves.push({ from, to, oldId: u._id, newId: id, name: u.doc.name })
      }
    }
  }
  return moves
}
/** list in slices of n (the import writes ~100 documents per call). */
export const chunk = (list, n) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, (i + 1) * n))

// Folders by category: Chummer's category (its table or section title), never "Other" or "General". Where the export
// has none (or only such a word), a folder from the entry's own data.
const VAGUE = /^(others?|general|misc\.?|miscellaneous|none|unknown|n\/a|[-–—]?)$/i
export const category = s => { const c = String(s ?? '').trim(); return VAGUE.test(c) ? null : c[0].toUpperCase() + c.slice(1) }
// an uncategorised entry by its name's first letter
export const alphaFolder = name => {
  const c = (String(name ?? '').normalize('NFKD').match(/[a-z]/i)?.[0] ?? 'a').toLowerCase()
  return c <= 'f' ? 'A–F' : c <= 'l' ? 'G–L' : c <= 'r' ? 'M–R' : 'S–Z'
}
const meleeOnly = r => !!r?.melee && r.melee !== 'none' && [r.short, r.medium, r.long].every(x => !x || x === 'none')
const VEHICLE_GROUP = { microdrone: 'Drones', minidrone: 'Drones', 'small-drone': 'Drones', 'medium-drone': 'Drones', 'large-drone': 'Drones',
  'racing-motorcycle': 'Bikes', 'offroad-motorcycle': 'Bikes', chopper: 'Bikes', 'sports-car': 'Cars', sedan: 'Cars', 'suv-pickup': 'Cars',
  van: 'Trucks & vans', 'bus-truck': 'Trucks & vans', 'rigid-inflatable-boat': 'Boats', 'jet-ski': 'Boats',
  'civil-helicopter': 'Aircraft', vtol: 'Aircraft', 't-bird': 'Aircraft', 'glider-wing': 'Aircraft' }
/** The folder of a book vehicle: its sra2 vehicle type's group, else drone by name, aircraft when it flies, else ground. */
export const vehicleFolder = v => VEHICLE_GROUP[vehicleType(v.id, v.name)]
  ?? (/\bdrones?\b/i.test(v.name ?? '') ? 'Drones' : v.flyingSpeed > 0 ? 'Aircraft' : 'Ground vehicles')
/** The folder of a book item (weapon, armor, gear, spell, complex form) in its type pack. */
export const itemFolder = it => category(it.category) ?? (it.kind === 'weapon' ? (meleeOnly(it.ranges) ? 'Melee weapons' : 'Ranged weapons')
  : it.kind === 'armor' ? `Armor ${it.armor ?? 0}` : alphaFolder(it.name))
// A spirit's type from its name or metatype (the export has no field for it), as "<type> spirits".
const SPIRIT = /\b(air|earth|fire|water|man|beasts?|guardian|guidance|plant|task|ally|shadow|insect|toxic|blood)\b/i
const MAGIC_SKILLS = new Set(['sorcery', 'conjuration', 'astral-combat'])
// a critter with magic: a magic skill, an awakened or adept amp, or a spell
const awakened = r => (r.skills ?? []).some(s => MAGIC_SKILLS.has(s.id)) || (r.amps ?? []).some(a => a.type === 'awakened' || a.type === 'adept')
  || (r.items ?? []).some(i => i.kind === 'spell')
/**
 * The folder of a book NPC (pack npcs: its tier), critter or spirit (pack critters). A category in its npc block wins
 * (the export has none yet); else a spirit by its type ("Fire spirits", else "Spirits") and a critter Awakened or Mundane.
 */
export function npcFolder(r) {
  const n = r.npc ?? { kind: 'npc' }
  if (n.kind === 'npc') return `${titleCase(n.tier || 'regular')} NPCs`
  const given = category(n.category)
  if (given) return given
  if (n.kind === 'spirit') {
    const t = SPIRIT.exec(`${r.streetName ?? ''} ${r.metatype?.name ?? ''}`)?.[1].toLowerCase().replace(/s$/, '')
    return !t ? 'Spirits' : t === 'man' ? 'Spirits of man' : `${titleCase(t)} spirits`
  }
  if (n.kind === 'critter') return awakened(r) ? 'Awakened critters' : 'Mundane critters'
  return `${titleCase(n.kind)}s`
}
/** The folder of a book amp: qualities positive or negative, the others by Chummer's amp type name ("… add-ons" for an add-on). */
export const ampFolder = amp => featType(amp.type) === 'trait' ? (negative(amp) ? 'Negative qualities' : 'Positive qualities')
  : `${category(amp.typeName) ?? titleCase(amp.type ?? '')}${amp.mod ? ' add-ons' : ''}`
const inFolder = (d, name) => { d.flags[MODULE_ID].category = name; return d }

const SRA2_ATTRS = Object.values(ATTR)
const SORT = 100000  // Foundry's CONST.SORT_INTEGER_DENSITY
const NO_TEXT = '<p>(No text in this file.)</p>'
function titleCase(s) { return String(s).split(/[-_\s]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ') }

// A book item's flat fields ({ dv, ranges, armor: n }) in the runner shape itemFeat reads.
const asItem = (it, name = it.name) => ({ ...it, name, weapon: { dv: it.dv, dvText: it.dv, ranges: it.ranges }, armor: { value: it.armor ?? 0 } })

/** sanitize: plain text -> safe HTML, as for translateRunner. Book text is left out unless descriptions is true. */
export function translateBook(book, { exportedAt, appVersion, descriptions = false, sanitize = escapeText, icons }) {
  const src = book.source, textOnly = [], packs = {}, portraits = {}, tokens = {}, iconSet = icons ? new Set(icons) : null
  const icon = (d, key) => withIcon(d, key, src.id, iconSet)
  const add = (pack, doc) => (packs[pack] ??= []).push(doc), addTo = add
  const ref = page => `${src.id}${page ? ` p.${page}` : ''}`
  const comp = src.compendium === true ? { compendium: true } : {}  // a GM's compendium (Chummer 0.8.0), not a book
  // our identity (lib/chummer-id.js): chummerID, <source>:<kind>:<id> for a catalog entry, else the document's own key
  // (key); no _id anywhere: Foundry picks it, and a re-import finds the entry by chummerID (foundry/books.js)
  const flags = (id, page, canon = src.canon, key = null) => ({ [MODULE_ID]: { id, exportedAt, appVersion,
    ...key ? { chummerID: key, chummerAliases: [] } : {}, source: src.id, page, canon, ...comp } })
  const keyed = (d, key, aliases = []) => ({ ...d, flags: { ...d.flags, [MODULE_ID]: { ...d.flags[MODULE_ID], chummerID: key, chummerAliases: aliases } } })
  const text = descriptions ? sanitize : () => ''
  const skills = [...book.skills ?? [], ...(book.specs ?? []).map(sp => ({ id: sp.skill, specs: [sp] }))]
  const ctx = { book: true, flag: x => flags(x.id, x.page, x.canon), icon, sanitize, text, rrTarget: rrResolver(skills), say: l => textOnly.push(l) }
  // a catalog entry: chummerID <source>:<kind>:<id> (kind: its pack's key), its earlier keys when the file has them
  const doc = (x, d, kind) => { const k = chummerFlags(src.id, kind, x.id, x.aliases)
    return keyed({ ...d, system: { ...d.system, reference: ref(x.page) } }, k.chummerID, k.chummerAliases) }
  const attrOk = (attr, fallback, what) => {
    if (SRA2_ATTRS.includes(attr)) return attr
    const a = SRA2_ATTRS.includes(fallback) ? fallback : 'strength'
    textOnly.push(`${what}: attribute ${attr} → ${a}`)
    return a
  }

  for (const amp of book.amps ?? []) {
    const feat = ampFeat(amp, ctx), base = amp.item, kind = base?.kind
    if (amp.type === 'vehicle') textOnly.push(`${amp.name}: vehicle template, import as a vehicle later`)
    if (kind === 'weapon' || kind === 'armor') {
      if (amp.type === 'equipment') {
        // the amp IS that item in sra2: a weapon/armor feat with the amp's rr/effects and the item's fields
        const { featType, cost, reference, description, ...fields } = itemFeat(asItem(base, amp.name), ctx).system
        Object.assign(feat.system, fields, { featType: kind })
        feat.system.description += description  // an unparsed DV's "Chummer DV" line
      } else {
        const r = base.ranges ?? {}
        textOnly.push(`${amp.name}: base ${kind} (${kind === 'armor' ? `Armor ${base.armor ?? 0}`
          : `DV ${base.dv ?? ''}, ranges ${[r.melee, r.short, r.medium, r.long].map(x => x ?? 'none').join('/')}`}) → notes (sra2 ${feat.system.featType} feat)`)
      }
    }
    add('amps', inFolder(doc(amp, feat, 'amps'), ampFolder(amp)))
  }
  for (const it of book.items ?? []) { const pack = PACK_OF[it.kind] ?? 'gear'; add(pack, inFolder(doc(it, itemFeat(asItem(it), ctx), pack), itemFolder(it))) }
  for (const v of book.vehicles ?? [])
    add('vehicles', inFolder(doc(v, vehicleActor({ ...v, chassisId: v.id, flying: v.flyingSpeed > 0 }, ctx, { name: v.name }), 'vehicles'), vehicleFolder(v)))

  // the book's pregens (pack characters, folder: their level, else metatype), NPCs (pack npcs) and critters and spirits
  // (pack critters; folders: npcFolder): an actor each (translateRunner, embedded items), its
  // vehicles as separate actors in its folder, not linked; a portrait and a token image are uploaded by importTypes
  // (portraits, tokens: chummerID -> data URL).
  // A pregen's token is linked; an NPC's token is as translateRunner sets it (hostile, linked only for a prime NPC).
  const people = (kind, vehicleKind, list) => { for (const r of list ?? []) {
    try {
      const n = kind === 'npc' ? r.npc ?? { kind: 'npc' } : null, pack = !n ? 'characters' : n.kind === 'npc' ? 'npcs' : 'critters'
      const folder = !n ? category(r.level?.name) ?? category(r.metatype?.name) ?? 'Runners' : npcFolder(r)
      const add = (p, d) => addTo(p, inFolder(d, folder))
      const c = translateRunner(r, { exportedAt: r.exportedAt ?? exportedAt, appVersion, sanitize, icons: iconSet }), fl = { source: src.id, canon: src.canon, ...comp }
      const key = `${src.id}:${kind}:${r.id}`
      add(pack, { ...c.actor, flags: { [MODULE_ID]: { ...c.actor.flags[MODULE_ID], ...fl, chummerID: key, chummerAliases: [] } }, items: c.items,
        prototypeToken: { actorLink: true, ...c.actor.prototypeToken } })
      if (PORTRAIT.test(r.portrait ?? '')) portraits[key] = r.portrait
      if (PORTRAIT.test(r.token ?? '')) tokens[key] = r.token
      ;(r.vehicles ?? []).forEach((v, i) => {
        const { actor, items } = c.vehicles[i]
        add(pack, { ...actor, name: `${r.streetName} — ${actor.name}`,
          flags: { [MODULE_ID]: { ...actor.flags[MODULE_ID], ...fl, chummerID: `${src.id}:${vehicleKind}:${r.id}:${v.uid}`, chummerAliases: [] } }, items })
      })
      textOnly.push(...c.textOnly.map(l => `${r.streetName}: ${l}`))
    } catch (e) { textOnly.push(`${r?.streetName ?? r?.id}: not imported (${e?.message ?? e})`) }
  } }
  people('character', 'vehicle', book.characters)
  people('npc', 'npc-vehicle', book.npcs)

  for (const m of book.metatypes ?? []) {
    const anarchy = metatypeAnarchy(m.name)
    if (anarchy == null) textOnly.push(`Metatype ${m.name}: not an sra2 metatype → Anarchy bonus 0`)
    add('metatypes', inFolder(doc(m, icon({ name: m.name, type: 'metatype', flags: flags(m.id, m.page, m.canon), system: {
      ...metatypeMax(m.ranges), anarchyBonus: anarchy ?? 0, description: sanitize(`Edge: ${m.edge}`) + (m.racialQuality ? sanitize(`Racial quality: ${m.racialQuality}`) : '') } }, 'metatype'), 'metatypes'),
    anarchy == null ? 'Metavariants' : 'Core metatypes'))
  }

  // every skill and spec, those sra2 already has too (same slug, so interchangeable with sra2's own); a skill's folder is
  // its linked attribute, a spec's the skill it belongs to
  const spec = (skillSlug, skillAttr, sp, page, skillName) => {
    const p = specFor(skillSlug, sp)
    add('skills', inFolder(doc({ ...sp, page }, icon({ name: `Spec: ${p.name}`, type: 'specialization', flags: flags(sp.id, page),
      system: { linkedSkill: skillSlug, linkedAttribute: attrOk(p.attr, skillAttr, `Spec: ${p.name}`), slug: p.slug } }, skillIconKey(skillSlug)), 'specs'), skillName))
  }
  for (const sk of book.skills ?? []) {
    const s = skillFor({ id: sk.id, attr: sk.attr })
    const attr = s.known ? s.attr : attrOk(s.attr, 'strength', sk.name)
    if (sk.alt) textOnly.push(`${sk.name}: alternative attribute ${sk.alt} → notes (sra2 links one attribute: ${attr})`)
    const name = s.known ? s.name : sk.name
    add('skills', inFolder(doc(sk, icon({ name, type: 'skill', flags: flags(sk.id, sk.page), system: { rating: 0, linkedAttribute: attr, slug: s.slug } }, skillIconKey(s.slug)), 'skills'),
      titleCase(attr)))
    for (const sp of sk.specs ?? []) spec(s.slug, attr, sp, sk.page, name)
  }
  // a spec on another book's skill: that skill's sra2 name, else its id's last part ("muc.made-up-lore" -> "Made Up Lore")
  for (const sp of book.specs ?? []) { const s = skillFor({ id: sp.skill }); spec(s.slug, s.attr, sp, sp.page, s.known ? s.name : titleCase(String(sp.skill).split('.').pop())) }

  // one journal per rules sheet, "<sheet> (<book id>)" in the sheet's folder (Foundry refuses a journal without a name:
  // sheetName, else the title-cased sheet, else "Rules"); inside, a level-1 page per section (in order of first appearance) then its rules as level-2 pages
  const sheets = new Map()
  for (const r of book.rules ?? []) {
    const k = r.sheet ?? '', sh = sheets.get(k) ?? { name: r.sheetName || titleCase(k) || 'Rules', sections: new Map() }
    sheets.set(k, sh)
    sh.sections.set(r.section ?? '', [...sh.sections.get(r.section ?? '') ?? [], r])
  }
  for (const [sheet, { name, sections }] of sheets) {
    const page = (pname, level, content, fl) => ({ name: pname, type: 'text', title: { show: true, level }, flags: fl, text: { content, format: 1 } })
    const pages = [...sections].flatMap(([section, rules]) => {
      const id = `${src.id}:section:${sheet}:${section}`
      return [page(section || name, 1, `<p>${rules.length} rule${rules.length === 1 ? '' : 's'}</p>`, flags(id, undefined, src.canon, id)),
        ...[...rules].sort((a, b) => (a.page ?? 0) - (b.page ?? 0) || String(a.title).localeCompare(String(b.title)))
          .map(r => page(r.title || r.id, 2, (descriptions && r.text ? sanitize(r.text) : '') || sanitize(`See ${ref(r.page)}`),
            flags(r.id, r.page, src.canon, `${src.id}:rules:${r.id}`)))]
    }).map((p, i) => ({ ...p, sort: (i + 1) * SORT }))
    const id = `${src.id}:rules-sheet:${sheet}`
    add('rules', inFolder({ name: `${name} (${src.id})`, flags: flags(id, undefined, src.canon, id), pages }, name))
  }
  // the kinds sra2 has no document for: a Reference journal each, "<kind> (<book id>)" in the kind's folder, a page per entry (its printed stats, text, source,
  // page and chummerID)
  const byKind = new Map()
  for (const r of book.reference ?? []) byKind.set(r.kind, [...byKind.get(r.kind) ?? [], r])
  for (const [kind, list] of byKind) {
    const title = REFERENCE[kind] ?? titleCase(kind)
    if (!REFERENCE[kind]) textOnly.push(`${list.length} ${kind}: a kind this module doesn't know → Reference journal "${title}"`)
    add('reference', inFolder({ name: `${title} (${src.id})`, flags: flags(kind, list[0].page, src.canon, `${src.id}:reference:${kind}`),
      pages: list.map((r, i) => ({ name: r.name || r.id, type: 'text', title: { show: true, level: 1 }, sort: (i + 1) * SORT,
        flags: flags(r.id, r.page, src.canon, `${src.id}:${kind}:${r.id}`),
        text: { content: sanitize(Object.entries(r.stats ?? {}).map(([k, v]) => `${k}: ${v}`).join('\n\n'))
          + (descriptions && r.description ? sanitize(r.description) : '') + sanitize(`See ${ref(r.page)}`), format: 1 } })) }, title))
  }
  return { source: src, packs, portraits, tokens, textOnly }
}

// The GM's own table rules: a journal in the Rules compendium, folder "Table rules". Their text follows the file's descriptions choice: Chummer blanks it when descriptions
// are off, and an empty page says so. A repeated name gets an index-based chummerID.
export function translateTableRules(tableRules, { exportedAt, appVersion, sanitize = escapeText }) {
  const seen = new Set()
  const pageKey = (name, i) => { const k = `table-rules:${name}`; return seen.has(k) ? `${k}:${i}` : (seen.add(k), k) }
  return { name: 'Table rules', flags: { [MODULE_ID]: { id: 'table-rules', chummerID: 'table-rules', chummerAliases: [], exportedAt, appVersion, category: 'Table rules' } },
    pages: (tableRules ?? []).map((r, i) => ({ name: r.name, type: 'text', sort: (i + 1) * SORT,
      flags: { [MODULE_ID]: { id: `table-rules:${r.name}`, chummerID: pageKey(r.name, i), chummerAliases: [], exportedAt, appVersion } },
      text: { content: r.text ? sanitize(r.text) : NO_TEXT, format: 1 } })) }
}
