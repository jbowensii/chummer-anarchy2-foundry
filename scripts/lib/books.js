// One Chummer book (docs/export-format.md "Book") -> compendium document data per pack. Pure: no Foundry calls.
import { MODULE_ID } from './constants.js'
import { docId } from './ids.js'
import { ATTR, metatypeAnarchy, skillFor, specFor } from './sra2.js'
import { skillIconKey, withIcon } from './icons.js'
import { ampFeat, escapeText, itemFeat, metatypeMax, rrResolver, translateRunner, vehicleActor } from './translate.js'

// pack key -> [label, document type], in the order they are written
export const PACKS = { amps: ['Amps', 'Item'], weapons: ['Weapons', 'Item'], armor: ['Armor', 'Item'], gear: ['Gear', 'Item'],
  spells: ['Spells', 'Item'], vehicles: ['Vehicles', 'Actor'], characters: ['Characters', 'Actor'], npcs: ['NPCs & Critters', 'Actor'], metatypes: ['Metatypes', 'Item'],
  skills: ['Skills & specializations', 'Item'], rules: ['Rules', 'JournalEntry'] }
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

const PACK_OF = { weapon: 'weapons', armor: 'armor', gear: 'gear', spell: 'spells', 'complex-form': 'spells' }
const SRA2_ATTRS = Object.values(ATTR)
const SORT = 100000  // Foundry's CONST.SORT_INTEGER_DENSITY
const NO_TEXT = '<p>(No text in this file.)</p>'
const titleCase = s => s.split(/[-_\s]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ')

// A book item's flat fields ({ dv, ranges, armor: n }) in the runner shape itemFeat reads.
const asItem = (it, name = it.name) => ({ ...it, name, weapon: { dv: it.dv, dvText: it.dv, ranges: it.ranges }, armor: { value: it.armor ?? 0 } })

/** sanitize: plain text -> safe HTML, as for translateRunner. Book text is left out unless descriptions is true. */
export function translateBook(book, { exportedAt, appVersion, descriptions = false, sanitize = escapeText, icons }) {
  const src = book.source, textOnly = [], packs = {}, portraits = {}, iconSet = icons ? new Set(icons) : null
  const icon = (d, key) => withIcon(d, key, src.id, iconSet)
  const add = (pack, doc) => (packs[pack] ??= []).push(doc)
  const ref = page => `${src.id}${page ? ` p.${page}` : ''}`
  const comp = src.compendium === true ? { compendium: true } : {}  // a GM's compendium (Chummer 0.8.0), not a book
  const flags = (id, page, canon = src.canon) => ({ [MODULE_ID]: { id, exportedAt, appVersion, source: src.id, page, canon, ...comp } })
  const text = descriptions ? sanitize : () => ''
  const skills = [...book.skills ?? [], ...(book.specs ?? []).map(sp => ({ id: sp.skill, specs: [sp] }))]
  const ctx = { book: true, flag: x => flags(x.id, x.page, x.canon), icon, sanitize, text, rrTarget: rrResolver(skills), say: l => textOnly.push(l) }
  const doc = (x, d) => ({ _id: docId(x.id), ...d, system: { ...d.system, reference: ref(x.page) } })
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
    add('amps', doc(amp, feat))
  }
  for (const it of book.items ?? []) add(PACK_OF[it.kind] ?? 'gear', doc(it, itemFeat(asItem(it), ctx)))
  for (const v of book.vehicles ?? [])
    add('vehicles', doc(v, vehicleActor({ ...v, chassisId: v.id, flying: v.flyingSpeed > 0 }, ctx, { name: v.name })))

  // the book's pregens (pack characters) and NPCs/critters/spirits (pack npcs): an actor each (translateRunner, embedded
  // items), its vehicles as separate actors, not linked; a portrait is uploaded by importBook (portraits: actor _id -> data URL).
  // A pregen's token is linked; an NPC's token is as translateRunner sets it (hostile, linked only for a prime NPC).
  const people = (pack, kind, vehicleKind, list) => { for (const r of list ?? []) {
    try {
      const c = translateRunner(r, { exportedAt: r.exportedAt ?? exportedAt, appVersion, sanitize, icons: iconSet }), fl = { source: src.id, canon: src.canon, ...comp }
      const _id = docId(`${src.id}:${kind}:${r.id}`)
      add(pack, { _id, ...c.actor, flags: { [MODULE_ID]: { ...c.actor.flags[MODULE_ID], ...fl } }, items: c.items,
        prototypeToken: { actorLink: true, ...c.actor.prototypeToken } })
      if (PORTRAIT.test(r.portrait ?? '')) portraits[_id] = r.portrait
      ;(r.vehicles ?? []).forEach((v, i) => {
        const { actor, items } = c.vehicles[i]
        add(pack, { _id: docId(`${src.id}:${vehicleKind}:${r.id}:${v.uid}`), ...actor, name: `${r.streetName} — ${actor.name}`,
          flags: { [MODULE_ID]: { ...actor.flags[MODULE_ID], ...fl } }, items })
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
      ...metatypeMax(m.ranges), anarchyBonus: anarchy ?? 0, description: sanitize(`Edge: ${m.edge}`) + (m.racialQuality ? sanitize(`Racial quality: ${m.racialQuality}`) : '') } }, 'metatype')))
  }

  // every skill and spec, those sra2 already has too (same slug, so interchangeable with sra2's own)
  const spec = (skillSlug, skillAttr, sp, page) => {
    const p = specFor(skillSlug, sp)
    add('skills', doc({ ...sp, page }, icon({ name: `Spec: ${p.name}`, type: 'specialization', flags: flags(sp.id, page),
      system: { linkedSkill: skillSlug, linkedAttribute: attrOk(p.attr, skillAttr, `Spec: ${p.name}`), slug: p.slug } }, skillIconKey(skillSlug))))
  }
  for (const sk of book.skills ?? []) {
    const s = skillFor({ id: sk.id, attr: sk.attr })
    const attr = s.known ? s.attr : attrOk(s.attr, 'strength', sk.name)
    if (sk.alt) textOnly.push(`${sk.name}: alternative attribute ${sk.alt} → notes (sra2 links one attribute: ${attr})`)
    add('skills', doc(sk, icon({ name: s.known ? s.name : sk.name, type: 'skill', flags: flags(sk.id, sk.page), system: { rating: 0, linkedAttribute: attr, slug: s.slug } }, skillIconKey(s.slug))))
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
    const page = (_id, pname, level, content, fl) => ({ _id, name: pname, type: 'text', title: { show: true, level }, flags: fl, text: { content, format: 1 } })
    const pages = [...sections].flatMap(([section, rules]) => {
      const id = `${src.id}:section:${sheet}:${section}`
      return [page(docId(id), section || name, 1, `<p>${rules.length} rule${rules.length === 1 ? '' : 's'}</p>`, flags(id)),
        ...[...rules].sort((a, b) => (a.page ?? 0) - (b.page ?? 0) || String(a.title).localeCompare(String(b.title)))
          .map(r => page(docId(r.id), r.title || r.id, 2, (descriptions && r.text ? sanitize(r.text) : '') || sanitize(`See ${ref(r.page)}`), flags(r.id, r.page)))]
    }).map((p, i) => ({ ...p, sort: (i + 1) * SORT }))
    const id = `${src.id}:rules-sheet:${sheet}`
    add('rules', { _id: docId(id), name, flags: flags(id), pages })
  }
  return { source: src, packs, portraits, textOnly }
}

// The GM's own table rules. Their text follows the file's descriptions choice: Chummer blanks it when descriptions
// are off, and an empty page says so. A repeated name gets an index-based page id.
export function translateTableRules(tableRules, { exportedAt, appVersion, sanitize = escapeText }) {
  const seen = new Set()
  const pageId = (name, i) => { const id = docId(`table-rules:${name}`); return seen.has(id) ? docId(`table-rules:${name}:${i}`) : (seen.add(id), id) }
  return { _id: docId('table-rules'), name: 'Table rules', flags: { [MODULE_ID]: { id: 'table-rules', exportedAt, appVersion } },
    pages: (tableRules ?? []).map((r, i) => ({ _id: pageId(r.name, i), name: r.name, type: 'text', sort: (i + 1) * SORT,
      flags: { [MODULE_ID]: { id: `table-rules:${r.name}`, exportedAt, appVersion } },
      text: { content: r.text ? sanitize(r.text) : NO_TEXT, format: 1 } })) }
}
