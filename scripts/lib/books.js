// One Chummer book (docs/export-format.md "Book") -> compendium document data per pack. Pure: no Foundry calls.
import { MODULE_ID } from './constants.js'
import { chummerFlags } from './chummer-id.js'
import { ATTR, metatypeAnarchy, skillFor, specFor } from './sra2.js'
import { skillIconKey, withIcon } from './icons.js'
import { ampFeat, escapeText, itemFeat, metatypeMax, PACK_OF, rrResolver, translateRunner, vehicleActor } from './translate.js'

// pack key -> [label, document type], in the order they are written
export const PACKS = { amps: ['Amps', 'Item'], weapons: ['Weapons', 'Item'], armor: ['Armor', 'Item'], gear: ['Gear', 'Item'],
  spells: ['Spells', 'Item'], vehicles: ['Vehicles', 'Actor'], characters: ['Characters', 'Actor'], npcs: ['NPCs & Critters', 'Actor'], metatypes: ['Metatypes', 'Item'],
  skills: ['Skills & specializations', 'Item'], rules: ['Rules', 'JournalEntry'], reference: ['Reference', 'JournalEntry'] }
// the reference kinds (Chummer's `reference`: what sra2 has no document for) -> their journal's title
export const REFERENCE = { levels: 'Levels', packages: 'Packages', lifestyles: 'Lifestyles', ampTypes: 'Amp types', ampEffects: 'Amp effects',
  attributes: 'Attributes' }
export const PORTRAIT = /^data:image\/(png|jpe?g);base64,/i
// World pack names may only hold [A-Za-z0-9-_] (BasePackage.validateId).
export const packName = s => s.toLowerCase().replace(/[^a-z0-9_-]/g, '-')

/**
 * The packs importBook writes for a translated book: one per known pack key with at least one entry, in PACKS order.
 * Never an empty compendium: a book with nothing to write plans nothing, and importBook then makes no folder either.
 * A GM's compendium (source.compendium) gets the same packs, labelled "(House)".
 */
export const planBookPacks = (t, prefix = '') => Object.keys(PACKS).filter(k => t.packs[k]?.length)
  .map(k => ({ key: k, docs: t.packs[k], type: PACKS[k][1], name: packName(`${prefix}ca2-${t.source.id}-${k}`),
    label: `${PACKS[k][0]} — ${t.source.id}${t.source.compendium ? ' (House)' : ''}` }))

const SRA2_ATTRS = Object.values(ATTR)
const SORT = 100000  // Foundry's CONST.SORT_INTEGER_DENSITY
const NO_TEXT = '<p>(No text in this file.)</p>'
const titleCase = s => s.split(/[-_\s]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ')

// A book item's flat fields ({ dv, ranges, armor: n }) in the runner shape itemFeat reads.
const asItem = (it, name = it.name) => ({ ...it, name, weapon: { dv: it.dv, dvText: it.dv, ranges: it.ranges }, armor: { value: it.armor ?? 0 } })

/** sanitize: plain text -> safe HTML, as for translateRunner. Book text is left out unless descriptions is true. */
export function translateBook(book, { exportedAt, appVersion, descriptions = false, sanitize = escapeText, icons }) {
  const src = book.source, textOnly = [], packs = {}, portraits = {}, tokens = {}, iconSet = icons ? new Set(icons) : null
  const icon = (d, key) => withIcon(d, key, src.id, iconSet)
  const add = (pack, doc) => (packs[pack] ??= []).push(doc)
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
    add('amps', doc(amp, feat, 'amps'))
  }
  for (const it of book.items ?? []) { const pack = PACK_OF[it.kind] ?? 'gear'; add(pack, doc(it, itemFeat(asItem(it), ctx), pack)) }
  for (const v of book.vehicles ?? [])
    add('vehicles', doc(v, vehicleActor({ ...v, chassisId: v.id, flying: v.flyingSpeed > 0 }, ctx, { name: v.name }), 'vehicles'))

  // the book's pregens (pack characters) and NPCs/critters/spirits (pack npcs): an actor each (translateRunner, embedded
  // items), its vehicles as separate actors, not linked; a portrait and a token image are uploaded by importBook
  // (portraits, tokens: chummerID -> data URL).
  // A pregen's token is linked; an NPC's token is as translateRunner sets it (hostile, linked only for a prime NPC).
  const people = (pack, kind, vehicleKind, list) => { for (const r of list ?? []) {
    try {
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
  people('characters', 'character', 'vehicle', book.characters)
  people('npcs', 'npc', 'npc-vehicle', book.npcs)

  for (const m of book.metatypes ?? []) {
    const anarchy = metatypeAnarchy(m.name)
    if (anarchy == null) textOnly.push(`Metatype ${m.name}: not an sra2 metatype → Anarchy bonus 0`)
    add('metatypes', doc(m, icon({ name: m.name, type: 'metatype', flags: flags(m.id, m.page, m.canon), system: {
      ...metatypeMax(m.ranges), anarchyBonus: anarchy ?? 0, description: sanitize(`Edge: ${m.edge}`) + (m.racialQuality ? sanitize(`Racial quality: ${m.racialQuality}`) : '') } }, 'metatype'), 'metatypes'))
  }

  // every skill and spec, those sra2 already has too (same slug, so interchangeable with sra2's own)
  const spec = (skillSlug, skillAttr, sp, page) => {
    const p = specFor(skillSlug, sp)
    add('skills', doc({ ...sp, page }, icon({ name: `Spec: ${p.name}`, type: 'specialization', flags: flags(sp.id, page),
      system: { linkedSkill: skillSlug, linkedAttribute: attrOk(p.attr, skillAttr, `Spec: ${p.name}`), slug: p.slug } }, skillIconKey(skillSlug)), 'specs'))
  }
  for (const sk of book.skills ?? []) {
    const s = skillFor({ id: sk.id, attr: sk.attr })
    const attr = s.known ? s.attr : attrOk(s.attr, 'strength', sk.name)
    if (sk.alt) textOnly.push(`${sk.name}: alternative attribute ${sk.alt} → notes (sra2 links one attribute: ${attr})`)
    add('skills', doc(sk, icon({ name: s.known ? s.name : sk.name, type: 'skill', flags: flags(sk.id, sk.page), system: { rating: 0, linkedAttribute: attr, slug: s.slug } }, skillIconKey(s.slug)), 'skills'))
    for (const sp of sk.specs ?? []) spec(s.slug, attr, sp, sk.page)
  }
  for (const sp of book.specs ?? []) { const s = skillFor({ id: sp.skill }); spec(s.slug, s.attr, sp, sp.page) }

  // one journal per rules sheet (Foundry refuses a journal without a name: sheetName, else the title-cased sheet,
  // else "Rules"); inside, a level-1 page per section (in order of first appearance) then its rules as level-2 pages
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
    add('rules', { name, flags: flags(id, undefined, src.canon, id), pages })
  }
  // the kinds sra2 has no document for: a Reference journal each, a page per entry (its printed stats, text, source,
  // page and chummerID)
  const byKind = new Map()
  for (const r of book.reference ?? []) byKind.set(r.kind, [...byKind.get(r.kind) ?? [], r])
  for (const [kind, list] of byKind) {
    const title = REFERENCE[kind] ?? titleCase(kind)
    if (!REFERENCE[kind]) textOnly.push(`${list.length} ${kind}: a kind this module doesn't know → Reference journal "${title}"`)
    add('reference', { name: title, flags: flags(kind, list[0].page, src.canon, `${src.id}:reference:${kind}`),
      pages: list.map((r, i) => ({ name: r.name || r.id, type: 'text', title: { show: true, level: 1 }, sort: (i + 1) * SORT,
        flags: flags(r.id, r.page, src.canon, `${src.id}:${kind}:${r.id}`),
        text: { content: sanitize(Object.entries(r.stats ?? {}).map(([k, v]) => `${k}: ${v}`).join('\n\n'))
          + (descriptions && r.description ? sanitize(r.description) : '') + sanitize(`See ${ref(r.page)}`), format: 1 } })) })
  }
  return { source: src, packs, portraits, tokens, textOnly }
}

// The GM's own table rules. Their text follows the file's descriptions choice: Chummer blanks it when descriptions
// are off, and an empty page says so. A repeated name gets an index-based chummerID.
export function translateTableRules(tableRules, { exportedAt, appVersion, sanitize = escapeText }) {
  const seen = new Set()
  const pageKey = (name, i) => { const k = `table-rules:${name}`; return seen.has(k) ? `${k}:${i}` : (seen.add(k), k) }
  return { name: 'Table rules', flags: { [MODULE_ID]: { id: 'table-rules', chummerID: 'table-rules', chummerAliases: [], exportedAt, appVersion } },
    pages: (tableRules ?? []).map((r, i) => ({ name: r.name, type: 'text', sort: (i + 1) * SORT,
      flags: { [MODULE_ID]: { id: `table-rules:${r.name}`, chummerID: pageKey(r.name, i), chummerAliases: [], exportedAt, appVersion } },
      text: { content: r.text ? sanitize(r.text) : NO_TEXT, format: 1 } })) }
}
