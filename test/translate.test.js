import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { MODULE_ID } from '../scripts/lib/constants.js'
import { averageHits, translateRunner, escapeText } from '../scripts/lib/translate.js'

const file = JSON.parse(readFileSync('samples/test-export.json', 'utf8'))
const opts = { exportedAt: file.exportedAt, appVersion: file.app.version }
const [mara, two] = file.runners
const t = translateRunner(mara, opts)
const byName = name => t.items.find(i => i.name === name)
const flagId = d => d.flags?.[MODULE_ID]?.id

describe('translating a runner', () => {
  test('actor basics', () => {
    const s = t.actor.system
    expect(t.actor).toMatchObject({ name: 'Made-Up Mara', type: 'character' })
    expect(t.actor).not.toHaveProperty('img') // Foundry's default artwork, not a null image
    expect(s.attributes).toEqual({ strength: 2, agility: 4, willpower: 3, logic: 2, charisma: 3 })
    expect(s.resources.yens).toBe(1200)
    expect(s.keywords).toEqual({ keyword1: 'Made-up alpha', keyword2: 'Made-up bravo', keyword3: 'Made-up charlie', keyword4: 'Made-up delta', keyword5: 'Made-up echo' })
    expect(s.behaviors.behavior4).toBe('Made-up blunt')
    expect(s.catchphrases.catchphrase1).toBe('Made-up cue one')
    expect(s.maxEssence).toBe(6)
    expect(s.reference).toBe('Chummer Anarchy 2.0 0.6.0')
    expect(s.bio.background).toBe('<p>Made-up background.</p>')
    expect(s.bio.notes).toContain('From Chummer')
    expect(s.bio.notes).toContain('Creation finished')
    expect(s.bio.notes).toContain('Mara Madeup')
    expect(t.actor.flags[MODULE_ID]).toMatchObject({ id: 'r-mara', exportedAt: opts.exportedAt, appVersion: '0.6.0' })
  })

  test('one metatype item with the ranges', () => {
    const m = t.items.filter(i => i.type === 'metatype')
    expect(m).toHaveLength(1)
    expect(m[0].system).toMatchObject({ maxAgility: 6, maxStrength: 6, anarchyBonus: 1 }) // sra2's Human
  })

  test('metatype caps are clamped to sra2’s 1-10', () => {
    const r = structuredClone(mara); r.metatype.ranges = { str: [1, 12], agi: [1, 0] }
    expect(translateRunner(r, opts).items[0].system).toMatchObject({ maxStrength: 10, maxAgility: 1, maxLogic: 6 })
  })

  test('metatype Anarchy bonus from sra2, by English name', () => {
    const as = name => { const r = structuredClone(mara); r.metatype.name = name; return translateRunner(r, opts) }
    expect(as('Troll').items[0].system.anarchyBonus).toBe(0)
    expect(as(' elf ').items[0].system.anarchyBonus).toBe(0)
    const odd = as('Made-Up Sasquatch')
    expect(odd.items[0].system.anarchyBonus).toBe(0)
    expect(odd.textOnly).toContain('Metatype Made-Up Sasquatch: not an sra2 metatype → Anarchy bonus 0')
  })

  test('skills and specs', () => {
    const skills = t.items.filter(i => i.type === 'skill')
    expect(skills.map(s => s.system.slug)).toEqual(['ranged-weapons', 'athletics', 'networking'])
    expect(byName('Ranged Weapons').system).toMatchObject({ rating: 4, linkedAttribute: 'agility' })
    expect(byName('Spec: Pistols').system).toMatchObject({ slug: 'spec_pistols', linkedSkill: 'ranged-weapons', linkedAttribute: 'agility' })
    expect(byName('Spec: Fixers').system).toMatchObject({ slug: 'spec_chummer-fixers', linkedSkill: 'networking', linkedAttribute: 'charisma' })
  })

  test('amps become feats', () => {
    const cyber = byName('Made-Up Reflex Wiring').system
    expect(cyber).toMatchObject({ featType: 'cyberware', rating: 1, essenceCost: 1, bonusLightDamage: 1, cost: 'free-equipment' })
    expect(cyber.rrList).toEqual([{ rrType: 'attribute', rrValue: 1, rrTarget: 'agility' }])
    expect(cyber.narrativeEffects).toEqual([]) // wound-light is a bonus, not text
    expect(byName('Made-Up Steady Hands').system.rrList).toEqual([{ rrType: 'specialization', rrValue: 1, rrTarget: 'spec_pistols' }])
    const adept = byName('Made-Up Quick Flow').system
    expect(adept.featType).toBe('adept-power')
    expect(adept.narrativeEffects).toContainEqual({ text: 'Narrative (Made-up edge in crowds)', isNegative: false, value: 0 })
    expect(adept.narrativeEffects).toContainEqual({ text: 'Initiative 2', isNegative: false, value: 0 })
    expect(t.textOnly).toContain('Made-Up Quick Flow: Initiative 2 → narrative effect')
  })

  test('descriptions are escaped', () => {
    const d = byName('Made-Up Reflex Wiring').system.description
    expect(d).not.toContain('<script')
    expect(d).toContain('&lt;script&gt;')
    expect(d).toContain('Chummer: Cyberware')
  })

  test('items become feats', () => {
    const w = byName('Made-Up Heavy Pistol').system
    expect(w).toMatchObject({ featType: 'weapon', weaponType: 'heavy-pistols', damageValue: '5', damageType: 'physical',
      meleeRange: 'ok', shortRange: 'ok', mediumRange: 'disadvantage', longRange: 'none', cost: 'equipment' })
    expect(w.description).toContain('Chummer price: 800¥')
    expect(byName('Made-Up Vest').system).toMatchObject({ featType: 'armor', armorValue: 2 })
    expect(byName('Made-Up Commlink').system).toMatchObject({ featType: 'equipment', cost: 'free-equipment' })
  })

  test('the vehicle amp is a vehicle actor, not a feat', () => {
    expect(byName('Made-Up Scout Drone')).toBeUndefined()
    expect(t.vehicles).toHaveLength(1)
    const v = t.vehicles[0]
    expect(v.items).toEqual([])
    expect(v.actor).toMatchObject({ name: 'Made-Up Scout Drone', type: 'vehicle' })
    expect(v.actor.system).toMatchObject({ vehicleType: 'custom-vehicle', controlMode: 'rigged', customAutopilot: 3, customStructure: 2,
      customHandling: 2, customSpeed: 3, customFlyingSpeed: 3, customArmor: 1, customWeaponMount: 'smg', isFlying: true })
    expect(v.actor.system.description).toContain('Chummer: Medium Drone (closest sra2 type: medium-drone), mount: Made-up light mount')
    expect(v.actor.flags[MODULE_ID]).toEqual({ id: 'v-drone', runner: 'r-mara', exportedAt: opts.exportedAt, appVersion: '0.6.0',
      icon: { key: 'vehicle/medium-drone', name: 'Made-Up Scout Drone', book: null } })
    expect(v.actor.img).toBeUndefined()  // no icons option: no img
  })

  test('every item carries its Chummer id and the export', () => {
    for (const i of t.items) expect(i.flags[MODULE_ID], i.name).toEqual({ id: expect.any(String), exportedAt: opts.exportedAt, appVersion: '0.6.0',
      icon: { key: expect.any(String), name: i.name, book: null } })
    expect(flagId(t.actor)).toBe('r-mara')
  })

  test('amp armor bonuses become text only', () => {
    const r = structuredClone(mara)
    r.amps[0].bonuses.armor = 1
    r.amps[0].effects.push({ id: 'armor-plus', name: 'Armor +1', category: 'combat' })
    const x = translateRunner(r, opts)
    expect(x.items.find(i => i.name === 'Made-Up Reflex Wiring').system.armorValue).toBeUndefined()
    expect(x.textOnly.some(s => s.startsWith('Made-Up Reflex Wiring: Armor 1'))).toBe(true)
    expect(x.actor.system.bio.notes).toContain('Armor 1')
  })

  test('the vehicle amp gives the vehicle its rr and effects', () => {
    const r = structuredClone(mara), amp = r.amps.find(a => a.uid === 'v-drone')
    amp.rr = [{ on: 'skill', id: 'piloting', name: 'Piloting', value: 5 }]
    amp.effects = [{ id: 'sensor', name: 'Sensor upgrade', category: 'vehicle' }]
    const x = translateRunner(r, opts), s = x.vehicles[0].actor.system
    expect(s.rrList).toEqual([{ rrType: 'skill', rrValue: 3, rrTarget: 'piloting' }])
    expect(s.narrativeEffects).toEqual([{ text: 'Sensor upgrade', isNegative: false, value: 0 }])
    expect(x.textOnly.some(l => l.includes('Risk Reduction Piloting 5 → 3'))).toBe(true)
  })

  const weapon = dv => { const r = structuredClone(mara); r.items[2] = { uid: 'w', kind: 'weapon', name: 'Odd Thing', price: 1, weapon: { dv, dvText: dv, ranges: {} } }
    const x = translateRunner(r, opts); return { s: x.items.find(i => i.name === 'Odd Thing').system, x } }
  test('custom weapon DV', () => {
    expect(weapon('4P').s).toMatchObject({ weaponType: 'custom-weapon', vdMode: 'custom', vdCustomValue: 4, damageValue: '4' })
    expect(weapon('STR+1').s).toMatchObject({ vdMode: 'attribute', vdAttribute: 'strength', vdBonus: 1, damageValue: 'FOR+1' })
    expect(weapon('FOR').s).toMatchObject({ vdMode: 'attribute', vdBonus: 0, damageValue: 'FOR' })
    expect(weapon('STR+2P').s).toMatchObject({ vdMode: 'attribute', vdAttribute: 'strength', vdBonus: 2, damageValue: 'FOR+2' })
    expect(weapon('FOR+1S').s).toMatchObject({ vdMode: 'attribute', vdBonus: 1, damageValue: 'FOR+1' })
    const odd = weapon('odd')
    expect(odd.s).toMatchObject({ vdMode: 'custom', vdCustomValue: 0 })
    expect(odd.s.description).toContain('Chummer DV: odd')
    expect(odd.x.textOnly.some(l => l.startsWith('Odd Thing: DV odd'))).toBe(true)
  })

  test('cyberdeck wound box, odd attributes', () => {
    const r = structuredClone(mara)
    r.amps.push({ uid: 'deck', type: 'cyberdeck', typeName: 'Cyberdeck', name: 'Deck', rating: 1, essence: 0, rr: [],
      effects: [{ id: 'wound-light', name: 'Extra light wound box', category: 'combat' }], bonuses: { light: 0 } })
    r.skills.push({ id: 'odd', name: 'Odd', attr: 'mag', rating: 1, specs: [{ id: 'odd.x', name: 'X', attr: 'res' }] })
    const x = translateRunner(r, opts)
    expect(x.items.find(i => i.name === 'Deck').system).toMatchObject({ featType: 'cyberdeck', cyberdeckBonusLightDamage: true })
    expect(x.items.find(i => i.name === 'Odd').system.linkedAttribute).toBe('strength')
    expect(x.items.find(i => i.name === 'Spec: X').system.linkedAttribute).toBe('strength')
    expect(x.textOnly.filter(l => l.includes('attribute mag') || l.includes('attribute res'))).toHaveLength(2)
  })

  test('armor: only the highest-summing worn chain is active', () => {
    expect(byName('Made-Up Vest').system).not.toHaveProperty('active') // a single armor stays sra2's default (active)
    const r = structuredClone(mara)
    r.items.push({ uid: 'a2', kind: 'armor', name: 'Jacket', price: 1, armor: { value: 2 } },
      { uid: 'a3', kind: 'armor', name: 'Helmet', price: 1, armor: { value: 1, over: 'a2' } })
    const x = translateRunner(r, opts), sys = n => x.items.find(i => i.name === n).system
    expect(sys('Helmet')).not.toHaveProperty('active')
    expect(sys('Jacket')).not.toHaveProperty('active')
    expect(sys('Made-Up Vest').active).toBe(false)
    expect(x.textOnly).toContain('Armor: Helmet over Jacket active (3); inactive: Made-Up Vest')
  })

  test('armor: a tie keeps the first chain', () => {
    const r = structuredClone(mara)
    r.items.push({ uid: 'a2', kind: 'armor', name: 'Coat', price: 1, armor: { value: 2 } })
    const x = translateRunner(r, opts), sys = n => x.items.find(i => i.name === n).system
    expect(sys('Made-Up Vest')).not.toHaveProperty('active')
    expect(sys('Coat').active).toBe(false)
    expect(x.textOnly).toContain('Armor: Made-Up Vest active (2); inactive: Coat')
  })

  test('custom weapons get the skill links sra2 rolls', () => {
    const r = structuredClone(mara), none = { short: 'none', medium: 'none', long: 'none' }
    r.items.push({ uid: 'w1', kind: 'weapon', name: 'Odd Stick', price: 1, weapon: { dv: 'STR+1', ranges: { melee: 'ok', ...none } } },
      { uid: 'w2', kind: 'weapon', name: 'Odd Sling', price: 1, weapon: { dv: '3', ranges: { melee: 'none', ...none, short: 'ok' } } },
      { uid: 'w3', kind: 'weapon', name: 'Short weapon', price: 1, weapon: { dv: 'STR+1', ranges: { melee: 'ok', ...none } } })
    const x = translateRunner(r, opts), sys = n => x.items.find(i => i.name === n).system
    expect(sys('Odd Stick')).toMatchObject({ weaponType: 'custom-weapon', linkedAttackSkill: 'close-combat', linkedAttackSpecialization: '',
      linkedDefenseSkill: 'close-combat', linkedDefenseSpecialization: 'spec_defense' })
    expect(sys('Odd Sling')).toMatchObject({ weaponType: 'custom-weapon', linkedAttackSkill: 'ranged-weapons', linkedAttackSpecialization: '',
      linkedDefenseSkill: 'athletics', linkedDefenseSpecialization: 'spec_ranged-defense' })
    expect(sys('Short weapon').weaponType).toBe('short-weapons')
    expect(sys('Short weapon')).not.toHaveProperty('linkedAttackSkill') // a known type: sra2 takes its own links
  })

  test('a runner with no amps, items or vehicles', () => {
    const x = translateRunner(two, opts)
    expect(x.vehicles).toEqual([])
    expect(x.items.map(i => i.type)).toEqual(['metatype', 'skill'])
    expect(x.actor.system.keywords.keyword1).toBe('')
    expect(x.actor.system.bio.background).toBe('')
  })

  test('escapeText', () => {
    expect(escapeText(`a & "b" 'c'\n\n<d>`)).toBe('<p>a &amp; &quot;b&quot; &#39;c&#39;</p><p>&lt;d&gt;</p>')
    expect(escapeText('')).toBe('')
  })
})

describe('translating an NPC', () => {
  const npcs = JSON.parse(readFileSync('samples/test-npcs.json', 'utf8'))
  const icons = JSON.parse(readFileSync('icons/index.json', 'utf8'))
  const [ganger, hound] = npcs.runners
  const g = translateRunner(ganger, { ...opts, icons }), h = translateRunner(hound, { ...opts, icons })

  test('average hits: round(DP/3) + RR + 1', () => {
    expect([[2, 0], [4, 0], [5, 0], [8, 1], [10, 1], [16, 3]].map(([dp, rr]) => averageHits(dp, rr))).toEqual([2, 2, 3, 5, 5, 9])
  })
  test('a regular NPC: GM description with kind, tier, fighting spirit and average hits per pool', () => {
    expect(g.actor.system.bio.gmDescription).toBe('<h3>NPC</h3><p>NPC, regular NPC. No Edge.</p>'
      + '<p>Fighting spirit: Low. Stops at the first light wound, or when a quarter of the allies are down.</p>'
      + '<p>Average hits (skill rating + attribute, Risk Reduction):</p><p>Ranged Weapons 5 (5+A, RR 1)</p>'
      + '<p>Ranged Weapons (Pistols) 5 (5+A, RR 1)</p><p>Athletics 3 (2+S, RR 0)</p>')
    expect(g.actor.flags[MODULE_ID].npc).toEqual({ kind: 'npc', tier: 'regular', fightingSpirit: 'low' })
  })
  test('a regular NPC: hostile, unlinked token; the NPC default icon; a metatype item', () => {
    expect(g.actor.img).toBe('modules/chummer-anarchy2-importer/icons/defaults/npc.webp')
    expect(g.actor.prototypeToken).toEqual({ disposition: -1, actorLink: false, texture: { src: g.actor.img } })
    expect(g.items.filter(i => i.type === 'metatype')).toHaveLength(1)
  })
  test('a prime critter without a metatype: linked token, Edge, no average hits, no metatype item, critter icon', () => {
    expect(h.actor.prototypeToken).toMatchObject({ disposition: -1, actorLink: true })
    expect(h.actor.img).toBe('modules/chummer-anarchy2-importer/icons/defaults/npc/critter.webp')
    expect(h.items.map(i => i.type)).toEqual(['skill'])
    expect(h.textOnly.join()).not.toContain('Metatype')
    expect(h.actor.system.bio.gmDescription).toContain('<p>Critter, prime NPC. Edge 1.</p>')
    expect(h.actor.system.bio.gmDescription).not.toContain('Average hits')
  })
  test('without the icon index no image is set; a runner gets no NPC fields', () => {
    expect(translateRunner(ganger, opts).actor).not.toHaveProperty('img')
    expect(t.actor).not.toHaveProperty('prototypeToken')
    expect(t.actor.system.bio).not.toHaveProperty('gmDescription')
    expect(t.actor.flags[MODULE_ID]).not.toHaveProperty('npc')
  })
  test('GM text is escaped', () => {
    const r = structuredClone(ganger); r.pools[0].label = '<script>x</script>'
    expect(translateRunner(r, opts).actor.system.bio.gmDescription).not.toContain('<script>')
  })
})
