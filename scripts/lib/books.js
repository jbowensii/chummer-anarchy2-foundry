// One Chummer book (docs/export-format.md "Book") -> compendium document data per pack. Pure: no Foundry calls.
import { MODULE_ID } from './constants.js'
import { docId } from './ids.js'
import { ATTR, skillFor, specFor } from './sra2.js'
import { ampFeat, escapeText, itemFeat, rrResolver, vehicleActor } from './translate.js'

const PACK_OF = { weapon: 'weapons', armor: 'armor', gear: 'gear', spell: 'spells', 'complex-form': 'spells' }
const SRA2_ATTRS = Object.values(ATTR)
const SORT = 100000  // Foundry's CONST.SORT_INTEGER_DENSITY
const NO_TEXT = '<p>(No text in this file.)</p>'

// A book item's flat fields ({ dv, ranges, armor: n }) in the runner shape itemFeat reads.
const asItem = (it, name = it.name) => ({ ...it, name, weapon: { dv: it.dv, dvText: it.dv, ranges: it.ranges }, armor: { value: it.armor ?? 0 } })

/** sanitize: plain text -> safe HTML, as for translateRunner. Book text is left out unless descriptions is true. */
export function translateBook(book, { exportedAt, appVersion, descriptions = false, sanitize = escapeText }) {
  const src = book.source, textOnly = [], packs = {}
  const add = (pack, doc) => (packs[pack] ??= []).push(doc)
  const ref = page => `${src.id}${page ? ` p.${page}` : ''}`
  const flags = (id, page, canon = src.canon) => ({ [MODULE_ID]: { id, exportedAt, appVersion, source: src.id, page, canon } })
  const text = descriptions ? sanitize : () => ''
  const skills = [...book.skills ?? [], ...(book.specs ?? []).map(sp => ({ id: sp.skill, specs: [sp] }))]
  const ctx = { book: true, flag: x => flags(x.id, x.page, x.canon), sanitize, text, rrTarget: rrResolver(skills), say: l => textOnly.push(l) }
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

  // only what sra2 doesn't already have
  const spec = (skillSlug, skillAttr, sp, page) => {
    const p = specFor(skillSlug, sp)
    if (p.known) return
    add('skills', doc({ ...sp, page }, { name: `Spec: ${p.name}`, type: 'specialization', flags: flags(sp.id, page),
      system: { linkedSkill: skillSlug, linkedAttribute: attrOk(p.attr, skillAttr, `Spec: ${p.name}`), slug: p.slug } }))
  }
  for (const sk of book.skills ?? []) {
    const s = skillFor({ id: sk.id, attr: sk.attr })
    const attr = s.known ? s.attr : attrOk(s.attr, 'strength', sk.name)
    if (sk.alt) textOnly.push(`${sk.name}: alternative attribute ${sk.alt} → notes (sra2 links one attribute: ${attr})`)
    if (!s.known) add('skills', doc(sk, { name: sk.name, type: 'skill', flags: flags(sk.id, sk.page), system: { rating: 0, linkedAttribute: attr, slug: s.slug } }))
    for (const sp of sk.specs ?? []) spec(s.slug, attr, sp, sk.page)
  }
  for (const sp of book.specs ?? []) { const s = skillFor({ id: sp.skill }); spec(s.slug, s.attr, sp, sp.page) }

  // one journal per section, one text page per rule
  const sections = new Map()
  for (const r of book.rules ?? []) sections.set(r.section, [...sections.get(r.section) ?? [], r])
  for (const [section, rules] of sections) {
    const pages = [...rules].sort((a, b) => (a.page ?? 0) - (b.page ?? 0) || String(a.title).localeCompare(String(b.title)))
      .map((r, i) => ({ _id: docId(r.id), name: r.title, type: 'text', sort: (i + 1) * SORT, flags: flags(r.id, r.page),
        text: { content: (descriptions && r.text ? sanitize(r.text) : '') || sanitize(`See ${ref(r.page)}`), format: 1 } }))
    add('rules', { _id: docId(`${src.id}:rules:${section}`), name: section, flags: flags(`${src.id}:rules:${section}`), pages })
  }
  return { source: src, packs, textOnly }
}

// The GM's own table rules. Their text follows the file's descriptions choice: Chummer blanks it when descriptions
// are off, and an empty page says so. A repeated name gets an index-based page id.
export function translateTableRules(tableRules, { exportedAt, appVersion, sanitize = escapeText }) {
  const seen = new Set()
  const pageId = (name, i) => { const id = docId(`table-rules:${name}`); return seen.has(id) ? docId(`table-rules:${name}:${i}`) : (seen.add(id), id) }
  return { _id: docId('table-rules'), name: 'Table rules', flags: { [MODULE_ID]: { id: 'table-rules', exportedAt, appVersion } },
    pages: (tableRules ?? []).map((r, i) => ({ _id: pageId(r.name, i), name: r.name, type: 'text', sort: (i + 1) * SORT,
      text: { content: r.text ? sanitize(r.text) : NO_TEXT, format: 1 } })) }
}
