import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { MODULE_ID } from '../scripts/lib/constants.js'
import { translateRunner } from '../scripts/lib/translate.js'
import { defaultChoice, newVersionName, replaceUpdate, tokenUpdate } from '../scripts/lib/plan.js'

const file = JSON.parse(readFileSync('samples/test-export.json', 'utf8'))
const t = translateRunner(file.runners[0], { exportedAt: file.exportedAt, appVersion: file.app.version })
const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) =>
  v && typeof v === 'object' && !Array.isArray(v) ? flat(v, `${p}${k}.`) : [`${p}${k}`])

describe('planning an import', () => {
  test('default choice', () => {
    const at = '2026-10-02T09:15:00.000Z'
    expect(defaultChoice(null, { exportedAt: at })).toBe('create')
    expect(defaultChoice({ exportedAt: '2026-10-03T00:00:00.000Z' }, { exportedAt: at })).toBe('skip')
    expect(defaultChoice({ exportedAt: at }, { exportedAt: at })).toBe('replace')
    expect(defaultChoice({ exportedAt: '2026-10-01T00:00:00.000Z' }, { exportedAt: at })).toBe('replace')
  })

  test('new version name', () => {
    // built from local noon, so the local date is the same in every timezone
    expect(newVersionName('Made-Up Mara', new Date(2026, 9, 2, 12).toISOString())).toBe('Made-Up Mara (2 Oct 2026)')
    expect(newVersionName('X', new Date(2026, 8, 30, 12).toISOString())).toBe('X (30 Sep 2026)')
  })

  test('replace update keeps play state', () => {
    const u = replaceUpdate({ ...t.actor, img: 'worlds/w/chummer/portraits/p.png' })
    const keys = flat(u)
    expect(keys.some(k => k.startsWith('system.attributes.'))).toBe(true)
    expect(keys).toContain('system.bio.notes')
    expect(keys).toContain('system.resources.yens')
    expect(keys).toContain('img')
    expect(keys.some(k => k.startsWith('prototypeToken'))).toBe(false) // a GM's custom token image stays
    expect(u.flags[MODULE_ID].id).toBe('r-mara')
    for (const bad of ['system.damage', 'system.anarchySpent', 'system.tempAnarchy', 'ownership', 'items', 'type'])
      expect(keys.some(k => k.startsWith(bad))).toBe(false)
  })

  test('the token image follows a new portrait only while it shows the actor image', () => {
    const doc = src => ({ img: 'old.png', prototypeToken: { texture: { src } } })
    expect(tokenUpdate(doc('old.png'), 'new.png')).toEqual({ 'prototypeToken.texture.src': 'new.png' })
    expect(tokenUpdate(doc('gm-token.webp'), 'new.png')).toEqual({}) // a GM's custom token image stays
    expect(tokenUpdate(doc('old.png'), undefined)).toEqual({}) // no portrait in the file
  })

  test('replace update without a portrait leaves the image alone', () => {
    const keys = flat(replaceUpdate(t.actor))
    expect(keys).not.toContain('img')
    expect(keys.some(k => k.startsWith('prototypeToken'))).toBe(false)
  })

  test('replace update keeps a new-version name, otherwise uses the street name', () => {
    expect(replaceUpdate(t.actor, 'Made-Up Mara (2 Oct 2026)').name).toBe('Made-Up Mara (2 Oct 2026)')
    expect(replaceUpdate(t.actor, 'Mara renamed').name).toBe('Made-Up Mara')
    expect(replaceUpdate(t.actor, 'Mara (2 Octo 2026)').name).toBe('Made-Up Mara')
  })

  test('vehicle replace update leaves starting choices alone', () => {
    const v = t.vehicles[0].actor
    expect(v.system.controlMode).toBeDefined()
    const u = replaceUpdate(v)
    expect(u.system).not.toHaveProperty('controlMode')
    expect(u.system.customStructure).toBe(v.system.customStructure)
    expect(v.system.controlMode).toBeDefined()
  })

  test('replace update does not share objects with the translation', () => {
    const u = replaceUpdate(t.actor)
    u.system.attributes.strength = 99
    expect(t.actor.system.attributes.strength).not.toBe(99)
  })
})
