import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { MODULE_ID } from '../scripts/lib/constants.js'
import { translateRunner } from '../scripts/lib/translate.js'
import { defaultChoice, newVersionName, replaceUpdate } from '../scripts/lib/plan.js'

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
    expect(newVersionName('Made-Up Mara', '2026-10-02T09:15:00.000Z')).toBe('Made-Up Mara (2 Oct 2026)')
    expect(newVersionName('X', '2026-09-30T23:59:00.000Z')).toBe('X (30 Sep 2026)')
  })

  test('replace update keeps play state', () => {
    const u = replaceUpdate({ ...t.actor, img: 'worlds/w/chummer/portraits/p.png' })
    const keys = flat(u)
    expect(keys.some(k => k.startsWith('system.attributes.'))).toBe(true)
    expect(keys).toContain('system.bio.notes')
    expect(keys).toContain('system.resources.yens')
    expect(keys).toContain('prototypeToken.texture.src')
    expect(u.flags[MODULE_ID].id).toBe('r-mara')
    for (const bad of ['system.damage', 'system.anarchySpent', 'system.tempAnarchy', 'ownership', 'items', 'type'])
      expect(keys.some(k => k === bad || k.startsWith(`${bad}.`) || k.startsWith(bad))).toBe(false)
  })

  test('replace update without a portrait leaves the image alone', () => {
    const keys = flat(replaceUpdate(t.actor))
    expect(keys).not.toContain('img')
    expect(keys.some(k => k.startsWith('prototypeToken'))).toBe(false)
  })

  test('replace update does not share objects with the translation', () => {
    const u = replaceUpdate(t.actor)
    u.system.attributes.strength = 99
    expect(t.actor.system.attributes.strength).not.toBe(99)
  })
})
