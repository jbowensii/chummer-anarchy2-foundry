// One Chummer runner (docs/export-format.md) -> sra2 v14.3.3 document data. Pure: no Foundry calls.
import { MODULE_ID } from './constants.js'
import { ATTR, featType, metatypeAnarchy, skillFor, specFor, vehicleType, weaponType } from './sra2.js'
import { ampIconKey, itemIconKey, skillIconKey, withIcon } from './icons.js'

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
// Plain text -> HTML: escaped, one <p> per paragraph (blank-line separated).
export const escapeText = s => String(s ?? '').split(/\r?\n\s*\r?\n/).map(p => p.trim()).filter(Boolean)
  .map(p => `<p>${p.replace(/[&<>"']/g, c => ESC[c])}</p>`).join('')

// Effects that become sra2 fields (Risk Reduction, wound boxes, thresholds) or runner totals (armor), not narrative text.
const NOT_TEXT = new Set(['rr-attr', 'rr-skill', 'rr-spec', 'wound-light', 'wound-serious', 'mental-armor', 'firewall-plus', 'armor-plus'])
const RR_TYPE = { attribute: 'attribute', skill: 'skill', spec: 'specialization' }
const ITEM_FEAT = { weapon: 'weapon', armor: 'armor', gear: 'equipment', spell: 'spell', 'complex-form': 'complex-form' }
const SRA2_ATTRS = Object.values(ATTR)

const ref = x => (x.source ? `${x.source}${x.page ? ` p.${x.page}` : ''}` : '')
const slots = (list, key, n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`${key}${i + 1}`, String(list?.[i] ?? '')]))
// sra2 vehicle weapon mounts are 'none' | 'smg' | 'rifle' (config/vehicle-types.json, actor-vehicle.ts prepareDerivedData).
const mountOf = t => (/\b(rifle|heavy)\b/i.test(t ?? '') ? 'rifle' : /\b(smg|light)\b/i.test(t ?? '') ? 'smg' : 'none')
// A Chummer DV -> sra2 vd fields: "4P"/"4" -> custom 4; "STR+1"/"FOR+1S"/"STR" -> strength + bonus; else null.
function parseDv(dv) {
  const s = String(dv ?? '').trim(), n = /^(\d+)/.exec(s), a = /^(STR|FOR)\s*(?:\+\s*(\d+))?\s*[PS]?$/i.exec(s)
  if (n) return { damageValue: n[1], vdMode: 'custom', vdCustomValue: Number(n[1]) }
  if (a) { const b = Number(a[2] ?? 0); return { damageValue: b ? `FOR+${b}` : 'FOR', vdMode: 'attribute', vdAttribute: 'strength', vdBonus: b } }
  return null
}

// A metatype's attribute caps (ranges[*][1], default 6), clamped to sra2's 1-10.
export const metatypeMax = (ranges = {}) => {
  const max = a => Math.min(10, Math.max(1, ranges?.[a]?.[1] ?? 6))
  return { maxStrength: max('str'), maxAgility: max('agi'), maxWillpower: max('wil'), maxLogic: max('log'), maxCharisma: max('cha') }
}

/**
 * sanitize: a function that takes PLAIN TEXT and returns safe HTML. Callers wrap Foundry's cleaner AROUND escapeText
 * (e.g. t => clean(escapeText(t))), never replace escapeText with the cleaner: a cleaner neither escapes text nor makes paragraphs.
 * icons: icons/index.json (array or Set); without it no img is set (flags.icon is stored either way).
 */
export function translateRunner(runner, { exportedAt, appVersion, sanitize = escapeText, icons }) {
  const textOnly = [], items = [], iconSet = icons ? new Set(icons) : null
  const flag = id => ({ [MODULE_ID]: { id, exportedAt, appVersion } })
  const icon = (doc, key, x) => withIcon(doc, key, x?.source ?? null, iconSet)
  const skills = runner.skills ?? []
  const vehicleUids = new Set((runner.vehicles ?? []).map(v => v.uid))
  const ranges = runner.metatype?.ranges ?? {}
  const attrOk = (attr, fallback, what) => {
    if (SRA2_ATTRS.includes(attr)) return attr
    const a = SRA2_ATTRS.includes(fallback) ? fallback : 'strength'
    textOnly.push(`${what}: attribute ${attr} → ${a}`)
    return a
  }

  const metaName = runner.metatype?.name ?? 'Metatype', anarchyBonus = metatypeAnarchy(metaName)
  if (anarchyBonus == null) textOnly.push(`Metatype ${metaName}: not an sra2 metatype → Anarchy bonus 0`)
  items.push(icon({ name: metaName, type: 'metatype', flags: flag(runner.metatype?.id ?? 'metatype'),
    system: { ...metatypeMax(ranges), anarchyBonus: anarchyBonus ?? 0 } }, 'metatype'))

  for (const sk of skills) {
    const s = skillFor(sk), name = s.known ? s.name : sk.name
    const attr = attrOk(s.attr, 'strength', name)
    items.push(icon({ name, type: 'skill', flags: flag(sk.id), system: { rating: sk.rating ?? 0, linkedAttribute: attr, slug: s.slug } }, skillIconKey(s.slug)))
    for (const sp of sk.specs ?? []) {
      const p = specFor(s.slug, sp)
      items.push(icon({ name: `Spec: ${p.name}`, type: 'specialization', flags: flag(sp.id),
        system: { linkedSkill: s.slug, linkedAttribute: attrOk(p.attr, attr, `Spec: ${p.name}`), slug: p.slug } }, skillIconKey(s.slug)))
    }
  }

  const rrTarget = rrResolver(skills)
  // the shared mapping (ampFeat/itemFeat/vehicleActor) with the runner's rr resolution and flags
  const ctx = { flag: x => flag(x.uid), icon, sanitize, rrTarget, say: t => textOnly.push(t) }
  for (const amp of runner.amps ?? []) if (!vehicleUids.has(amp.uid)) items.push(ampFeat(amp, ctx))

  const armors = []  // [Chummer item, feat system]
  for (const it of runner.items ?? []) {
    const doc = itemFeat(it, ctx)
    if (it.kind === 'armor') armors.push([it, doc.system])
    items.push(doc)
  }

  // sra2 sums every active armor feat; Chummer counts one worn chain (an add-on plus what it is worn over, as its
  // derive.ts worn()). The export doesn't say which is main: the highest-summing chain stays active (ties: first).
  if (armors.length > 1) {
    const under = new Set(armors.map(([it]) => it.armor?.over).filter(Boolean))
    const chain = top => {
      const out = []
      for (let a = top, d = 0; a && d < 4 && !out.includes(a); a = armors.find(([it]) => it.uid === a[0].armor?.over), d++) out.push(a)
      return out
    }
    const tops = armors.filter(([it]) => !under.has(it.uid))
    const sum = c => c.reduce((s, [it]) => s + (it.armor?.value ?? 0), 0)
    const best = (tops.length ? tops : armors).map(chain).reduce((a, b) => (sum(b) > sum(a) ? b : a))
    const off = armors.filter(a => !best.includes(a))
    for (const [, system] of off) system.active = false
    if (off.length) textOnly.push(`Armor: ${best.map(([it]) => it.name).join(' over ')} active (${sum(best)}); inactive: ${off.map(([it]) => it.name).join(', ')}`)
  }

  const vehicles = (runner.vehicles ?? []).map(v => {
    const actor = vehicleActor(v, ctx, (runner.amps ?? []).find(a => a.uid === v.uid))
    actor.flags[MODULE_ID].runner = runner.id
    return { items: [], actor }
  })

  for (const k of runner.knowledge ?? []) textOnly.push(`Knowledge: ${k.name} (${k.kind}${k.native ? ', native' : ''}) → notes`)

  const init = runner.initiative
  const facts = [
    `Real name: ${runner.realName ?? ''}`, `Metatype: ${runner.metatype?.name ?? ''}`, `Level: ${runner.level?.name ?? ''}`,
    `Edge: ${runner.edge ?? ''}`, `Essence: ${runner.essence ?? ''}`, `Lifestyle: ${runner.lifestyle?.name ?? ''}`,
    `Initiative: ${init ? `${init.level}${init.source ? ` (${init.source})` : ''}` : 'none'}`,
    `Armor: ${runner.armor?.main ?? 0} (alternative ${runner.armor?.alt ?? 0})`,
    ...(runner.ledger ?? []).map(l => `${String(l.at ?? '').slice(0, 10)} · ${l.summary} · ${l.amount}¥`),
    ...textOnly,
  ]
  const n = runner.narrative ?? {}
  // no img: Foundry's default artwork applies (apply.js sets img only from a portrait)
  const actor = { name: runner.streetName, type: 'character',
    flags: { [MODULE_ID]: { id: runner.id, exportedAt, appVersion } },
    system: {
      attributes: Object.fromEntries(Object.entries(ATTR).map(([k, v]) => [v, Math.max(1, runner.attributes?.[k] ?? 1)])),
      resources: { yens: Math.max(0, Math.trunc(runner.nuyen?.balance ?? 0)) },
      keywords: slots(n.keywords, 'keyword', 5), behaviors: slots(n.dispositions, 'behavior', 4), catchphrases: slots(n.cues, 'catchphrase', 4),
      bio: { background: sanitize(runner.background), notes: sanitize(runner.notes) + '<h3>From Chummer</h3>' + sanitize(facts.join('\n\n')) },
      reference: `Chummer Anarchy 2.0 ${appVersion}`, maxEssence: 6,
    } }
  return { actor, items, vehicles, textOnly }
}

// rr target per ruling: ATTR key / skill slug / spec slug under the skill that owns the spec (skills: [{ id, specs: [{ id, name, attr }] }]).
export const rrResolver = skills => l => {
  if (l.on === 'attribute') return Object.hasOwn(ATTR, l.id) ? ATTR[l.id] : null
  if (l.on === 'skill') return skillFor({ id: l.id }).slug
  if (l.on !== 'spec') return null
  const owner = skills.find(s => (s.specs ?? []).some(x => x.id === l.id))
  const skillId = l.skill ?? owner?.id
  if (!skillId) return null
  const spec = owner?.specs.find(x => x.id === l.id) ?? l
  return specFor(skillFor({ id: skillId }).slug, { id: l.id, name: spec.name, attr: spec.attr }).slug
}

// An amp's rr lines and text effects (shared by feats and vehicle actors, which both have rrList + narrativeEffects).
function ampParts(amp, { rrTarget, say: note }) {
  const narrative = [], rrList = []
  const say = (text, isNegative = false) => { narrative.push({ text, isNegative, value: 0 }); note(`${amp.name}: ${text} → narrative effect`) }
  for (const l of amp.rr ?? []) {
    const target = rrTarget(l), value = l.value ?? 1, label = l.name ?? l.id
    if (!target || !RR_TYPE[l.on]) { say(`Risk Reduction ${label} ${value}`); continue }
    rrList.push({ rrType: RR_TYPE[l.on], rrValue: Math.min(3, value), rrTarget: target })
    if (value > 3) note(`${amp.name}: Risk Reduction ${label} ${value} → 3 (sra2 maximum)`)
  }
  for (const e of amp.effects ?? []) {
    if (NOT_TEXT.has(e.id)) continue
    const extra = [e.param, e.value, e.note].filter(x => x != null && x !== '')
    say(extra.length ? `${e.name} (${extra.join(', ')})` : e.name, e.category === 'negative' || e.id === 'negative')
  }
  return { narrative, rrList }
}

/*
 * The amp/item/vehicle mapping shared by runners and books. ctx: { flag(x) -> flags object, sanitize (plain text -> HTML),
 * text? (for book text; default sanitize), rrTarget(rr line) -> sra2 slug | null, say(line) -> records a textOnly line,
 * icon(doc, key, x) -> doc with flags.icon (and img) }.
 */
export function ampFeat(amp, ctx) {
  const { sanitize, text = sanitize, say } = ctx
  const b = amp.bonuses ?? {}, type = featType(amp.type)
  const { narrative, rrList } = ampParts(amp, ctx)
  if (b.initiative > 0 && !(amp.effects ?? []).some(e => /^init-\d$/.test(e.id))) {
    narrative.push({ text: `Initiative ${b.initiative}`, isNegative: false, value: 0 })
    say(`${amp.name}: Initiative ${b.initiative} → narrative effect`)
  }
  // sra2 takes the runner's armor from armor feats; an amp's armor count stays text (the runner's totals are authoritative).
  if (b.armor > 0) say(`${amp.name}: Armor ${b.armor} → notes (runner armor comes from armor items)`)
  // book amps only (ctx.book): add-ons and a printed rating that differs from the computed one
  const notes = !ctx.book ? '' : (amp.mod ? sanitize('Add-on') : '')
    + (amp.printedRating != null && amp.printedRating !== amp.rating ? sanitize(`Printed rating: ${amp.printedRating}`) : '')
  const system = {
    featType: type, rating: amp.rating ?? 0, essenceCost: Math.max(0, amp.essence ?? 0), isBioware: amp.type === 'bioware',
    rrList, bonusLightDamage: b.light ?? 0, bonusSevereDamage: b.serious ?? 0, bonusMentalThreshold: b.mentalThreshold ?? 0,
    bonusMatrixThreshold: b.matrixThreshold ?? 0, narrativeEffects: narrative, cost: 'free-equipment', reference: ref(amp),
    description: text(amp.description) + notes + sanitize(`Chummer: ${amp.typeName ?? amp.type}${amp.source ? `, ${ref(amp)}` : ''}`) }
  // a deck's wound box is its own (the export gives it bonus 0): sra2's boolean deck field
  if (type === 'cyberdeck' && (amp.effects ?? []).some(e => e.id === 'wound-light')) system.cyberdeckBonusLightDamage = true
  return ctx.icon({ name: amp.name, type: 'feat', flags: ctx.flag(amp), system }, ampIconKey(amp), amp)
}

// A runner-shaped item ({ kind, weapon: { dv, dvText, ranges }, armor: { value }, price?, starting?, note? }) -> feat.
export function itemFeat(it, ctx) {
  const { sanitize, text = sanitize, say } = ctx
  let extra = ''
  const system = { featType: ITEM_FEAT[it.kind] ?? 'equipment', cost: it.starting ? 'free-equipment' : 'equipment', reference: ref(it) }
  if (it.kind === 'weapon') {
    const w = it.weapon ?? {}, r = w.ranges ?? {}
    const vd = parseDv(w.dv)
    if (!vd) { extra = sanitize(`Chummer DV: ${w.dvText || w.dv || ''}`); say(`${it.name}: DV ${w.dvText || w.dv || ''} → description (not understood)`) }
    Object.assign(system, { weaponType: weaponType(it.name), damageType: 'physical', ...vd ?? { damageValue: '0', vdMode: 'custom', vdCustomValue: 0 },
      meleeRange: r.melee ?? 'none', shortRange: r.short ?? 'none', mediumRange: r.medium ?? 'none', longRange: r.long ?? 'none' })
    // sra2 rolls a custom-weapon with these links (its defaults are Ranged Weapons / Athletics, wrong for melee)
    if (system.weaponType === 'custom-weapon') {
      const melee = system.meleeRange !== 'none' && [system.shortRange, system.mediumRange, system.longRange].every(x => x === 'none')
      Object.assign(system, melee
        ? { linkedAttackSkill: 'close-combat', linkedAttackSpecialization: '', linkedDefenseSkill: 'close-combat', linkedDefenseSpecialization: 'spec_defense' }
        : { linkedAttackSkill: 'ranged-weapons', linkedAttackSpecialization: '', linkedDefenseSkill: 'athletics', linkedDefenseSpecialization: 'spec_ranged-defense' })
    }
  }
  if (it.kind === 'armor') system.armorValue = Math.max(0, Math.min(5, it.armor?.value ?? 0))
  if (it.kind === 'spell') system.spellType = 'direct'
  system.description = text(it.description) + sanitize(it.note) + extra + (it.price != null ? sanitize(`Chummer price: ${it.price}¥`) : '')
  return ctx.icon({ name: it.name, type: 'feat', flags: ctx.flag(it), system }, itemIconKey(it), it)
}

// Always custom-vehicle: sra2 reads the custom* stats only then, and Chummer's numbers include upgrades.
// v is runner-shaped ({ uid, chassisId, chassis, count, flying, flyingSpeed?, ... }); amp is its vehicle amp, when there is one.
export function vehicleActor(v, ctx, amp = { name: v.name }) {
  const { sanitize, text = sanitize } = ctx
  const { narrative, rrList } = ampParts(amp, ctx)
  const chassis = v.chassis ?? v.name
  const type = vehicleType(v.chassisId ?? amp.vehicle, chassis)
  const about = `Chummer: ${chassis} (closest sra2 type: ${type}), mount: ${v.mount || 'none'}`
  return ctx.icon({ name: v.name, type: 'vehicle', flags: ctx.flag(v),
    system: { vehicleType: 'custom-vehicle', controlMode: 'rigged',
      customAutopilot: Math.min(12, v.pilot ?? 0), customStructure: v.body ?? 0, customHandling: v.handling ?? 0, customSpeed: v.speed ?? 0,
      customArmor: v.armor ?? 0, customWeaponMount: mountOf(v.mount), isFlying: !!v.flying, ...v.flying ? { customFlyingSpeed: v.flyingSpeed ?? v.speed ?? 0 } : {},
      rrList, narrativeEffects: narrative, reference: ref(amp),
      description: text(amp.description) + sanitize(about) + (v.count > 1 ? sanitize(`Chummer: ${v.count} × ${chassis}`) : '') } }, `vehicle/${type}`, { source: amp.source ?? v.source })
}
