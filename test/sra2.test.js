import { describe, expect, test } from 'vitest'
import { featType, skillFor, specFor, SPECS, vehicleType, weaponType } from '../scripts/lib/sra2.js'

describe('sra2 tables', () => {
  test('skills', () => {
    expect(skillFor({ id: 'conjuring', name: 'Conjuring', attr: 'log' })).toMatchObject({ slug: 'conjuration', known: true })
    expect(skillFor({ id: 'network', name: 'Network', attr: 'cha' })).toMatchObject({ slug: 'networking', known: true })
    expect(skillFor({ id: 'ranged-weapons', name: 'Ranged Weapons', attr: 'agi' })).toMatchObject({ slug: 'ranged-weapons', attr: 'agility' })
    expect(skillFor({ id: 'made-up', name: 'Made Up', attr: 'log' })).toMatchObject({ slug: 'chummer-made-up', known: false })
  })
  test('specs by name, then a new slug', () => {
    expect(SPECS.length).toBe(91)
    expect(specFor('ranged-weapons', { id: 'ranged-weapons.pistols', name: 'Pistols', attr: 'agi' })).toMatchObject({ slug: 'spec_pistols', known: true })
    expect(specFor('networking', { id: 'custom:Fixers', name: 'Fixers', attr: 'cha', custom: true })).toMatchObject({ slug: 'spec_chummer-fixers', known: false })
  })
  test('feat types', () => {
    expect(['quality', 'bioware', 'adept', 'vehicle', 'something'].map(featType)).toEqual(['trait', 'cyberware', 'adept-power', 'equipment', 'equipment'])
  })
  test('weapon and vehicle types', () => {
    expect(weaponType('Made-up Heavy Pistol')).toBe('heavy-pistols')
    expect(weaponType('Made-up Katana')).toBe('long-weapons')
    expect(weaponType('Something odd')).toBe('custom-weapon')
    expect(vehicleType('medium-drone', 'x')).toBe('medium-drone')
    expect(vehicleType('crb.made-up-bike', 'Made-up Racing Motorcycle')).toBe('racing-motorcycle')
    expect(vehicleType('x', 'Odd thing')).toBe('custom-vehicle')
  })
  test('fix round 1', () => {
    const w = ['Submachine Gun', 'Sub-machine gun', 'Machine Pistol', 'Light Pistol', 'Sniper Rifle', 'Hunting Rifle', 'Throwing Knife', 'Longbow', 'Machine Gun', 'Combat Knife', 'Unarmed'].map(weaponType)
    expect(w).toEqual(['smgs', 'smgs', 'automatic-pistols', 'light-pistols', 'sniper-rifles', 'assault-rifles', 'throwing', 'bows', 'machine-guns', 'short-weapons', 'bare-hands'])
    expect(['Advanced Drone', 'Caravan', 'Vanguard', 'Cargo Van', 'Pickup Truck', 'Micro Drone', 'Minidrone'].map(n => vehicleType('x', n)))
      .toEqual(['custom-vehicle', 'custom-vehicle', 'custom-vehicle', 'van', 'suv-pickup', 'microdrone', 'minidrone'])
    // Pistols belongs to ranged-weapons; under another skill it must become a new spec on that skill
    expect(specFor('ranged-weapons', { id: 'a', name: 'Pistols', attr: 'agi' })).toMatchObject({ skill: 'ranged-weapons', known: true })
    expect(specFor('networking', { id: 'a', name: 'Pistols', attr: 'agi' })).toMatchObject({ slug: 'spec_chummer-pistols', skill: 'networking', known: false })
    expect(skillFor({ id: 'constructor', name: 'x', attr: 'log' })).toMatchObject({ slug: 'chummer-constructor', known: false })
    expect(featType('toString')).toBe('equipment')
    expect(specFor('networking', { id: 'custom:Fixers', name: '日本', attr: 'cha' }).slug).toBe('spec_chummer-custom-fixers')
    expect(specFor('technomancer', { id: 'x', name: 'Compilación', attr: 'log' }).known).toBe(false)
    expect(specFor('technomancer', { id: 'x', name: 'Compilation', attr: 'log' })).toMatchObject({ slug: 'spec_compilation', known: true })
  })
})
