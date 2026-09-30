// One Chummer runner (docs/export-format.md) -> sra2 v14.3.3 document data. Pure: no Foundry calls.
import { MODULE_ID } from './constants.js'
import { ATTR, featType, skillFor, specFor, vehicleType, weaponType } from './sra2.js'

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
// Plain text -> HTML: escaped, one <p> per paragraph (blank-line separated).
export const escapeText = s => String(s ?? '').split(/\r?\n\s*\r?\n/).map(p => p.trim()).filter(Boolean)
  .map(p => `<p>${p.replace(/[&<>"']/g, c => ESC[c])}</p>`).join('')

// Effects that become sra2 fields (Risk Reduction, wound boxes, thresholds) or runner totals (armor), not narrative text.
const NOT_TEXT = new Set(['rr-attr', 'rr-skill', 'rr-spec', 'wound-light', 'wound-serious', 'mental-armor', 'firewall-plus', 'armor-plus'])
const RR_TYPE = { attribute: 'attribute', skill: 'skill', spec: 'specialization' }
const ITEM_FEAT = { weapon: 'weapon', armor: 'armor', gear: 'equipment', spell: 'spell', 'complex-form': 'complex-form' }

const flag = id => ({ [MODULE_ID]: { id } })
const ref = x => (x.source ? `${x.source}${x.page ? ` p.${x.page}` : ''}` : '')
const slots = (list, key, n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`${key}${i + 1}`, String(list?.[i] ?? '')]))

export function translateRunner(runner, { exportedAt, appVersion, sanitize = escapeText }) {
  const textOnly = [], items = []
  const skills = runner.skills ?? []
  const vehicleUids = new Set((runner.vehicles ?? []).map(v => v.uid))
  const ranges = runner.metatype?.ranges ?? {}

  items.push({ name: runner.metatype?.name ?? 'Metatype', type: 'metatype', flags: flag(runner.metatype?.id ?? 'metatype'),
    system: { maxStrength: ranges.str?.[1] ?? 6, maxAgility: ranges.agi?.[1] ?? 6, maxWillpower: ranges.wil?.[1] ?? 6,
      maxLogic: ranges.log?.[1] ?? 6, maxCharisma: ranges.cha?.[1] ?? 6, anarchyBonus: 0 } })

  for (const sk of skills) {
    const s = skillFor(sk)
    items.push({ name: s.known ? s.name : sk.name, type: 'skill', flags: flag(sk.id), system: { rating: sk.rating ?? 0, linkedAttribute: s.attr, slug: s.slug } })
    for (const sp of sk.specs ?? []) {
      const p = specFor(s.slug, sp)
      items.push({ name: `Spec: ${p.name}`, type: 'specialization', flags: flag(sp.id), system: { linkedSkill: s.slug, linkedAttribute: p.attr, slug: p.slug } })
    }
  }

  // rr target per ruling: ATTR key / skill slug / spec slug under the skill that owns the spec.
  function rrTarget(l) {
    if (l.on === 'attribute') return Object.hasOwn(ATTR, l.id) ? ATTR[l.id] : null
    if (l.on === 'skill') return skillFor({ id: l.id }).slug
    if (l.on !== 'spec') return null
    const owner = skills.find(s => (s.specs ?? []).some(x => x.id === l.id))
    const skillId = l.skill ?? owner?.id
    if (!skillId) return null
    const spec = owner?.specs.find(x => x.id === l.id) ?? l
    return specFor(skillFor({ id: skillId }).slug, { id: l.id, name: spec.name, attr: spec.attr }).slug
  }

  for (const amp of runner.amps ?? []) {
    if (vehicleUids.has(amp.uid)) continue
    const b = amp.bonuses ?? {}, effects = amp.effects ?? []
    const narrative = [], rrList = []
    const say = text => { narrative.push({ text, isNegative: false, value: 0 }); textOnly.push(`${amp.name}: ${text} → narrative effect`) }
    for (const l of amp.rr ?? []) {
      const target = rrTarget(l)
      if (target && RR_TYPE[l.on]) rrList.push({ rrType: RR_TYPE[l.on], rrValue: Math.min(3, l.value ?? 1), rrTarget: target })
      else say(`Risk Reduction ${l.name ?? l.id} ${l.value ?? 1}`)
    }
    for (const e of effects) {
      if (NOT_TEXT.has(e.id)) continue
      const extra = [e.param, e.value, e.note].filter(x => x != null && x !== '')
      const text = extra.length ? `${e.name} (${extra.join(', ')})` : e.name
      narrative.push({ text, isNegative: e.category === 'negative' || e.id === 'negative', value: 0 })
      textOnly.push(`${amp.name}: ${text} → narrative effect`)
    }
    if (b.initiative > 0 && !effects.some(e => /^init-\d$/.test(e.id))) say(`Initiative ${b.initiative}`)
    // sra2 takes the runner's armor from armor feats; an amp's armor count stays text (the runner's totals are authoritative).
    if (b.armor > 0) textOnly.push(`${amp.name}: Armor ${b.armor} → notes (runner armor comes from armor items)`)
    items.push({ name: amp.name, type: 'feat', flags: flag(amp.uid), system: {
      featType: featType(amp.type), rating: amp.rating ?? 0, essenceCost: Math.max(0, amp.essence ?? 0), isBioware: amp.type === 'bioware',
      rrList, bonusLightDamage: b.light ?? 0, bonusSevereDamage: b.serious ?? 0, bonusMentalThreshold: b.mentalThreshold ?? 0,
      bonusMatrixThreshold: b.matrixThreshold ?? 0, narrativeEffects: narrative, cost: 'free-equipment', reference: ref(amp),
      description: sanitize(amp.description) + sanitize(`Chummer: ${amp.typeName ?? amp.type}${amp.source ? `, ${ref(amp)}` : ''}`) } })
  }

  for (const it of runner.items ?? []) {
    const system = { featType: ITEM_FEAT[it.kind] ?? 'equipment', cost: it.starting ? 'free-equipment' : 'equipment', reference: ref(it),
      description: sanitize(it.description) + sanitize(it.note) + sanitize(`Chummer price: ${it.price ?? 0}¥`) }
    if (it.kind === 'weapon') {
      const w = it.weapon ?? {}, r = w.ranges ?? {}
      Object.assign(system, { weaponType: weaponType(it.name), damageValue: String(w.dv ?? '0'), damageType: 'physical',
        meleeRange: r.melee ?? 'none', shortRange: r.short ?? 'none', mediumRange: r.medium ?? 'none', longRange: r.long ?? 'none' })
      // sra2's sheet shows a custom weapon's DV from vdCustomValue
      if (/^\d+$/.test(system.damageValue)) system.vdCustomValue = Number(system.damageValue)
    }
    if (it.kind === 'armor') system.armorValue = Math.max(0, Math.min(5, it.armor?.value ?? 0))
    if (it.kind === 'spell') system.spellType = 'direct'
    items.push({ name: it.name, type: 'feat', flags: flag(it.uid), system })
  }

  const vehicles = (runner.vehicles ?? []).map(v => {
    const amp = (runner.amps ?? []).find(a => a.uid === v.uid) ?? {}
    return { items: [], actor: { name: v.name, type: 'vehicle',
      flags: { [MODULE_ID]: { id: v.uid, runner: runner.id, exportedAt, appVersion } },
      system: { vehicleType: vehicleType(v.chassisId ?? amp.vehicle, v.chassis ?? v.name), controlMode: 'rigged',
        customAutopilot: Math.min(12, v.pilot ?? 0), customStructure: v.body ?? 0, customHandling: v.handling ?? 0, customSpeed: v.speed ?? 0,
        customArmor: v.armor ?? 0, customWeaponMount: v.mount || 'none', isFlying: !!v.flying, reference: ref(amp),
        description: sanitize(amp.description) + (v.count > 1 ? sanitize(`Chummer: ${v.count} × ${v.chassis ?? v.name}`) : '') } } }
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
  const actor = { name: runner.streetName, type: 'character', img: null,
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
