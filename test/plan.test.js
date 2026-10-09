import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { MODULE_ID } from '../scripts/lib/constants.js'
import { translateRunner } from '../scripts/lib/translate.js'
import { defaultChoice, keepArt, keepItemArt, mergeActorItems, newVersionName, replaceUpdate, tokenUpdate } from '../scripts/lib/plan.js'

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
    const doc = src => ({ img: 'worlds/w/chummer/portraits/old.png', prototypeToken: { texture: { src } } })
    expect(tokenUpdate(doc('worlds/w/chummer/portraits/old.png'), 'new.png')).toEqual({ 'prototypeToken.texture.src': 'new.png' })
    expect(tokenUpdate(doc('gm-token.webp'), 'new.png')).toEqual({}) // a GM's custom token image stays
    expect(tokenUpdate(doc('worlds/w/chummer/portraits/old.png'), undefined)).toEqual({}) // no portrait in the file
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

describe('planning a pack write', () => {



  test('mergeActorItems rebuilds flagged items and keeps the GM’s unflagged ones after them', () => {
    const gm = { _id: 'gm', name: 'GM note item', flags: {} }, old = { _id: 'o', name: 'Old', flags: { [MODULE_ID]: { id: 'x' } } }
    const fresh = { name: 'New', flags: { [MODULE_ID]: { id: 'x' } } }
    expect(mergeActorItems([old, gm], [fresh])).toEqual([fresh, gm])
    expect(mergeActorItems(undefined, [fresh])).toEqual([fresh])
  })

  describe('re-import never overwrites art the user chose', () => {
    const M = 'modules/chummer-anarchy2-importer/'
    const it = (id, img) => ({ name: id, img, flags: { [MODULE_ID]: { id } } })
    test('replaceUpdate and tokenUpdate change the image only while it is replaceable', () => {
      const v = { ...t.vehicles[0].actor, img: M + 'icons/defaults/vehicle.webp' }
      expect(replaceUpdate(v, 'x', 'worlds/test/custom.webp').img).toBeUndefined()
      expect(replaceUpdate(v, 'x', 'icons/svg/mystery-man.svg').img).toBe(v.img)
      expect(replaceUpdate(v, 'x', 'worlds/w/chummer/portraits/r.png').img).toBe(v.img)
      const doc = img => ({ img, prototypeToken: { texture: { src: img } } })
      expect(tokenUpdate(doc('worlds/test/custom.webp'), 'new.png')).toEqual({})
      expect(tokenUpdate(doc('icons/svg/mystery-man.svg'), 'new.png')).toEqual({ 'prototypeToken.texture.src': 'new.png' })
    })
    test('keepItemArt: rebuilt items keep a chosen image, by flag id', () => {
      const old = [it('a', 'worlds/test/custom.webp'), it('b', M + 'icons/defaults/armor.webp'), { name: 'gm', img: 'worlds/x.webp', flags: {} }]
      const fresh = [it('a', M + 'icons/defaults/weapon.webp'), it('b', M + 'icons/items/vest.webp'), it('c', undefined)]
      expect(keepItemArt(old, fresh).map(i => i.img)).toEqual(['worlds/test/custom.webp', M + 'icons/items/vest.webp', undefined])
      expect(keepItemArt(undefined, fresh)).toEqual(fresh)
    })
    test('keepArt: a replaced pack entry and its items keep chosen images', () => {
      const old = { _id: 'p', img: 'worlds/test/custom.webp', items: [it('a', 'worlds/test/a.webp')] }
      const fresh = { _id: 'p', img: M + 'icons/defaults/x.webp', items: [it('a', M + 'icons/defaults/y.webp')] }
      const k = keepArt(old, fresh)
      expect(k.img).toBe('worlds/test/custom.webp')
      expect(k.items[0].img).toBe('worlds/test/a.webp')
      expect(keepArt({ img: 'icons/svg/item-bag.svg' }, { img: 'new.webp' }).img).toBe('new.webp')
      expect(keepArt({ pages: [] }, { name: 'J', pages: [] })).toEqual({ name: 'J', pages: [] }) // journals: no img added
    })
  })
})

describe('separate token image (0.7.0)', () => {
  const doc = (img, src) => ({ img, prototypeToken: { texture: { src } } })
  test('tokenUpdate: an uploaded token or portrait on the token is replaced; a token the GM chose stays', () => {
    const up = { 'prototypeToken.texture.src': 'worlds/w/chummer/tokens/new.png' }
    expect(tokenUpdate(doc('worlds/w/chummer/portraits/p.png', 'worlds/w/chummer/tokens/old.png'), 'worlds/w/chummer/tokens/new.png')).toEqual(up)
    expect(tokenUpdate(doc('worlds/w/chummer/portraits/p.png', 'worlds/w/chummer/portraits/p.png'), 'worlds/w/chummer/tokens/new.png')).toEqual(up)
    expect(tokenUpdate(doc('worlds/w/chummer/portraits/p.png', 'worlds/w/gm-token.webp'), 'worlds/w/chummer/tokens/new.png')).toEqual({})
    expect(tokenUpdate(doc('worlds/w/mine.webp', 'worlds/w/mine.webp'), 'worlds/w/chummer/tokens/new.png')).toEqual({})
  })
  test('keepArt keeps a token image the GM chose, and only that', () => {
    const fresh = { _id: 'p', prototypeToken: { actorLink: true } }
    expect(keepArt(doc('worlds/w/chummer/portraits/p.png', 'worlds/w/gm-token.webp'), fresh).prototypeToken)
      .toEqual({ actorLink: true, texture: { src: 'worlds/w/gm-token.webp' } })
    expect(keepArt(doc('worlds/w/chummer/portraits/p.png', 'worlds/w/chummer/tokens/t.png'), fresh).prototypeToken).toEqual({ actorLink: true })
  })
})
