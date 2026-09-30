import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { MODULE_ID } from '../scripts/lib/constants.js'
import { translateRunner, escapeText } from '../scripts/lib/translate.js'

const file = JSON.parse(readFileSync('samples/test-export.json', 'utf8'))
const opts = { exportedAt: file.exportedAt, appVersion: file.app.version }
const [mara, two] = file.runners
const t = translateRunner(mara, opts)
const byName = name => t.items.find(i => i.name === name)
const flagId = d => d.flags?.[MODULE_ID]?.id

describe('translating a runner', () => {
  test('actor basics', () => {
    const s = t.actor.system
    expect(t.actor).toMatchObject({ name: 'Made-Up Mara', type: 'character', img: null })
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
    expect(m[0].system).toMatchObject({ maxAgility: 6, maxStrength: 6, anarchyBonus: 0 })
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
    expect(v.actor.flags[MODULE_ID]).toEqual({ id: 'v-drone', runner: 'r-mara', exportedAt: opts.exportedAt, appVersion: '0.6.0' })
  })

  test('every item carries its Chummer id and the export', () => {
    for (const i of t.items) expect(i.flags[MODULE_ID], i.name).toEqual({ id: expect.any(String), exportedAt: opts.exportedAt, appVersion: '0.6.0' })
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
    const odd = weapon('odd')
    expect(odd.s).toMatchObject({ vdMode: 'custom', vdCustomValue: 0 })
    expect(odd.s.description).toContain('Chummer DV: odd')
    expect(odd.x.textOnly.some(l => l.startsWith('Odd Thing: DV odd'))).toBe(true)
  })

  test('cyberdeck wound box, armor over, odd attributes', () => {
    const r = structuredClone(mara)
    r.amps.push({ uid: 'deck', type: 'cyberdeck', typeName: 'Cyberdeck', name: 'Deck', rating: 1, essence: 0, rr: [],
      effects: [{ id: 'wound-light', name: 'Extra light wound box', category: 'combat' }], bonuses: { light: 0 } })
    r.items[3].armor.over = true
    r.skills.push({ id: 'odd', name: 'Odd', attr: 'mag', rating: 1, specs: [{ id: 'odd.x', name: 'X', attr: 'res' }] })
    const x = translateRunner(r, opts)
    expect(x.items.find(i => i.name === 'Deck').system).toMatchObject({ featType: 'cyberdeck', cyberdeckBonusLightDamage: true })
    expect(x.textOnly.some(l => l.startsWith('Made-Up Vest: worn over'))).toBe(true)
    expect(x.items.find(i => i.name === 'Odd').system.linkedAttribute).toBe('strength')
    expect(x.items.find(i => i.name === 'Spec: X').system.linkedAttribute).toBe('strength')
    expect(x.textOnly.filter(l => l.includes('attribute mag') || l.includes('attribute res'))).toHaveLength(2)
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
