// One Chummer runner (docs/export-format.md) -> sra2 v14.3.3 document data. Pure: no Foundry calls.
import { MODULE_ID } from './constants.js'
import { ATTR, featType, metatypeAnarchy, skillFor, specFor, vehicleType, weaponType } from './sra2.js'
import { ampIconKey, iconFor, itemIconKey, skillIconKey, withIcon } from './icons.js'

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
/** A Chummer item kind -> its book compendium's key (lib/books.js), the kind in its chummerID. */
export const PACK_OF = { weapon: 'weapons', armor: 'armor', gear: 'gear', spell: 'spells', 'complex-form': 'spells' }
// A runner's amp or item from a book: its catalog id and its book entry's chummerID (lib/chummer-id.js), for its
// compendium link (foundry/apply.js); a custom one: none.
const catalogFlags = x => {
  if (!x?.catalogId || !x.source || x.chassisId) return {}
  const kind = x.kind ? PACK_OF[x.kind] ?? 'gear' : 'amps'
  return { catalogId: x.catalogId, source: x.source, page: x.page ?? null, kind, chummerID: `${x.source}:${kind}:${x.catalogId}`, chummerAliases: [] }
}
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

  // a critter or spirit may have no metatype (id ''): no metatype item then
  if (!(runner.npc && !runner.metatype?.id)) {
    const metaName = runner.metatype?.name ?? 'Metatype', anarchyBonus = metatypeAnarchy(metaName)
    if (anarchyBonus == null) textOnly.push(`Metatype ${metaName}: not an sra2 metatype → Anarchy bonus 0`)
    items.push(icon({ name: metaName, type: 'metatype', flags: flag(runner.metatype?.id ?? 'metatype'),
      system: { ...metatypeMax(ranges), anarchyBonus: anarchyBonus ?? 0 } }, 'metatype'))
  }

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
  const ctx = { flag: x => { const f = flag(x.uid); Object.assign(f[MODULE_ID], catalogFlags(x)); return f }, icon, sanitize, rrTarget, say: t => textOnly.push(t) }
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

  const init = runner.initiative, sw = runner.switched
  const facts = [
    `Real name: ${runner.realName ?? ''}`, ...runner.gender ? [`Gender: ${runner.gender}`] : [], `Metatype: ${runner.metatype?.name ?? ''}`, `Level: ${runner.level?.name ?? ''}`,
    `Edge: ${runner.edge ?? ''}`, `Essence: ${runner.essence ?? ''}`, `Lifestyle: ${runner.lifestyle?.name ?? ''}`,
    `Initiative: ${init ? `${init.level}${init.source ? ` (${init.source})` : ''}` : 'none'}`,
    `Armor: ${bracket(runner.armor?.main ?? 0, sw?.armor?.main)} (alternative ${bracket(runner.armor?.alt ?? 0, sw?.armor?.alt)})`,
    ...effectFacts(runner),
    ...(runner.ledger ?? []).map(l => `${String(l.at ?? '').slice(0, 10)} · ${l.summary} · ${l.amount}¥`),
    ...textOnly,
  ]
  const n = runner.narrative ?? {}
  // no img: Foundry's default artwork applies (apply.js sets img only from a portrait)
  const actor = { name: runner.streetName, type: 'character',
    // the full career ledger in our flags (sra2 ignores them; it has no karma fields), for a ledger tab later
    flags: { [MODULE_ID]: { id: runner.id, exportedAt, appVersion, ledger: structuredClone(runner.ledger ?? []) } },
    system: {
      attributes: Object.fromEntries(Object.entries(ATTR).map(([k, v]) => [v, Math.max(1, runner.attributes?.[k] ?? 1)])),
      resources: { yens: Math.max(0, Math.trunc(runner.nuyen?.balance ?? 0)) },
      keywords: slots(n.keywords, 'keyword', 5), behaviors: slots(n.dispositions, 'behavior', 4), catchphrases: slots(n.cues, 'catchphrase', 4),
      bio: { background: sanitize(runner.background), notes: sanitize(runner.notes) + '<h3>From Chummer</h3>' + sanitize(facts.join('\n\n')) },
      reference: `Chummer Anarchy 2.0 ${appVersion}`, maxEssence: 6,
    } }
  // An NPC (sra2 has no NPC actor type): GM-only facts in the GM description, a hostile token, linked only for a prime
  // NPC, and the default icon as its image (a portrait, set by the importer, replaces it).
  if (runner.npc) {
    const n = runner.npc, key = n.kind === 'npc' ? 'npc' : `npc/${n.kind}`
    actor.flags[MODULE_ID].npc = { ...n }
    actor.system.bio.gmDescription = '<h3>NPC</h3>' + sanitize(npcLines(runner).join('\n\n'))
    actor.prototypeToken = { disposition: -1, actorLink: n.tier === 'prime' }
    const img = iconSet && iconFor(key, null, null, iconSet)
    if (img) { actor.img = img; actor.prototypeToken.texture = { src: img } }
  }
  return { actor, items, vehicles, textOnly }
}

// A total as the books print a switchable bonus: `1`, or `1 (2)` when switching effects on changes it.
export const bracket = (off, on) => (on === undefined || on === null || String(on) === String(off) ? `${off}` : `${off} (${on})`)
/** A runner's effects beyond sra2's fields (Chummer's), as note lines: Advantages and Disadvantages on its Tests, Risk
 *  Reduction switching effects on adds (the sheet's brackets), social armor, sustained spells, VR and rigging. */
export function effectFacts(runner) {
  const out = [], sw = runner.switched, fx = runner.effects
  ;(runner.pools ?? []).forEach((p, i) => {
    const on = sw?.pools?.[i]?.rr
    if (on != null && on !== p.rr) out.push(`${p.label} (${String(p.attr).toUpperCase()}): RR ${bracket(p.rr, on)}`)
    for (const n of p.notes ?? []) out.push(`${p.label}: ${n.text} (${[n.from, n.how].filter(Boolean).join(', ')})`)
  })
  if (!fx) return out
  if (fx.socialArmor) out.push(`Social armor ${fx.socialArmor}${runner.thresholds?.social ? `: social thresholds ${runner.thresholds.social.join('/')}` : ''}`)
  if (fx.matrixArmor) out.push(`Matrix armor ${fx.matrixArmor}`)
  out.push(`Sustained spells: ${bracket(fx.sustain?.free, sw?.effects?.sustain?.free)} without a Disadvantage, ${bracket(fx.sustain?.max, sw?.effects?.sustain?.max)} at most`)
  if (fx.ignoreWounds || sw?.effects?.ignoreWounds) out.push(`Ignores ${fx.ignoreWounds ?? sw.effects.ignoreWounds} wound modifiers${fx.ignoreWounds ? '' : ' (switched on)'}`)
  if (fx.forcedRisk || sw?.effects?.forcedRisk) out.push(`Must take a High or Extreme Risk${fx.forcedRisk ? '' : ' (switched on)'}`)
  if (fx.vr) out.push(`${fx.vr === 'hot' ? 'Hot' : 'Cold'}-sim VR`)
  if (fx.rcc) out.push(`Rigger command console: ${fx.rcc} drones`)
  if (fx.vcr) out.push('Vehicle control rig')
  // what its items and racial quality do (an amp's own are its feat's narrative effects)
  for (const e of fx.list ?? []) if (e.type === 'item' || e.type === 'metatype') out.push(`${e.text} (${[e.from, e.how].filter(Boolean).join(', ')})`)
  return out
}

// Average hits on a dice pool dp with Risk Reduction rr (CRB p.81), as Chummer's engine/npc.ts.
export const averageHits = (dp, rr) => Math.round(dp / 3) + rr + 1
const KIND = { npc: 'NPC', critter: 'Critter', spirit: 'Spirit' }
// In our own words, as Chummer's NpcBlock.
const SPIRIT = {
  null: 'Avoids combat, surrenders if threatened',
  low: 'Stops at the first light wound, or when a quarter of the allies are down',
  high: 'Fights on through light wounds; stops at the first serious one, or when half the allies are down',
  extreme: 'Keeps going until incapacitated; stops only when three quarters of the allies are down',
}
// An NPC's GM lines (plain text): kind and tier, fighting spirit, and for a regular NPC each pool's average hits,
// "Ranged Weapons 5 (5+A, RR 1)" (skill rating without a spec's +2, attribute initial, Risk Reduction).
export function npcLines(runner) {
  const n = runner.npc, regular = n.tier === 'regular'
  const out = [`${KIND[n.kind] ?? n.kind}, ${n.tier} NPC. ${regular ? 'No Edge.' : `Edge ${runner.edge ?? 0}.`}`]
  if (n.fightingSpirit) out.push(`Fighting spirit: ${n.fightingSpirit[0].toUpperCase()}${n.fightingSpirit.slice(1)}.${SPIRIT[n.fightingSpirit] ? ` ${SPIRIT[n.fightingSpirit]}.` : ''}`)
  if (regular && runner.pools?.length) {
    const rating = id => runner.skills?.find(s => s.id === id)?.rating ?? 0
    out.push('Average hits (skill rating + attribute, Risk Reduction):',
      ...runner.pools.map(p => `${p.label} ${averageHits(p.dp ?? 0, p.rr ?? 0)} (${rating(p.skill)}+${String(p.attr ?? '?')[0].toUpperCase()}, RR ${p.rr ?? 0})`))
  }
  return out
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

// How an effect is turned on and whether it counts (Chummer's effects: switch, when, affects, unpriced, applied), as text.
export function effectHow(e) {
  const when = e.when && (/^(?:when|whenever|while|if|unless|as long as|during|at|in|once|against|on)\b/i.test(e.when) ? e.when : `when ${e.when}`)
  return [e.switch && e.switch !== 'conditional' ? e.switch : '', when, e.affects === 'target' ? 'affects target(s)' : '',
    e.unpriced ? 'unpriced by the rating' : '', e.applied === false && !e.when ? 'not applied' : ''].filter(Boolean).join(', ')
}
// An effect as a narrative line: its sheet line (Chummer's) or its name with param, value and note; and how.
export const effectText = e => {
  const extra = [e.param, e.value, e.note].filter(x => x != null && x !== '')
  const base = e.line ?? (extra.length ? `${e.name} (${extra.join(', ')})` : e.name), how = effectHow(e)
  return how ? `${base} (${how})` : base
}
// What an export's effect gives sra2 as narrative text: every effect but those that are sra2 fields (and counted).
const textEffects = effects => (effects ?? []).filter(e => !NOT_TEXT.has(e.id) || e.applied === false)

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
  for (const e of textEffects(amp.effects)) say(effectText(e), e.category === 'negative' || e.id === 'negative' || e.id === 'disadvantage')
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
  // sra2's own counts (Chummer's bonuses), within sra2's limits
  if (b.sustainedSpells) system.sustainedSpellCount = Math.min(2, b.sustainedSpells)
  if (b.summonedSpirits) system.summonedSpiritCount = Math.min(1, b.summonedSpirits)
  if (b.sustainedForms) system.sustainedComplexFormCount = b.sustainedForms
  if (b.riggerConsoles) system.riggerConsoleCount = b.riggerConsoles
  if (b.vehicleControlRig) system.hasVehicleControlWiring = true
  // a switchable amp (a drug's dose, a sustained power): off until the player switches it on, as the sheet's brackets
  if (amp.switch) { system.active = false; say(`${amp.name}: ${amp.switch}, imported switched off (sra2 feat "active")`) }
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
  // what it does (Chummer's): narrative effects; a spell's on its target(s) say so
  const fx = textEffects(it.effects)
  if (fx.length) system.narrativeEffects = fx.map(e => ({ text: effectText(e), isNegative: e.id === 'disadvantage' || e.id === 'self-wound', value: 0 }))
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
