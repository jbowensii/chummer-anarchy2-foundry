// applyRunner's Replace ordering and rollback, against a tiny fake of the Foundry globals it uses.
import { beforeEach, expect, test, vi } from 'vitest'
import { MODULE_ID } from '../scripts/lib/constants.js'
import { applyRunner } from '../scripts/foundry/apply.js'

let log, world, n
const flags = f => ({ [MODULE_ID]: { exportedAt: '2026-10-02T09:15:00.000Z', ...f } })
class FakeActor {
  constructor(data, failDelete = false) {
    Object.assign(this, { id: `a${++n}`, system: {}, ...data, failDelete })
    this.uuid = `Actor.${this.id}`
    this.items = (data.items ?? []).map(i => ({ ...i, id: `i${++n}` }))
    world.push(this)
  }
  async update(u) { log.push(`update ${this.name}`); Object.assign(this.system, u.system ?? {})
    if (u['system.linkedVehicles']) this.system.linkedVehicles = u['system.linkedVehicles'] }
  async createEmbeddedDocuments(_, arr) { const made = arr.map(i => ({ ...i, id: `i${++n}` })); this.items.push(...made); return made }
  async deleteEmbeddedDocuments(_, ids) {
    if (this.failDelete && ids.some(id => this.items.find(i => i.id === id)?.old)) throw new Error('delete failed')
    this.items = this.items.filter(i => !ids.includes(i.id))
  }
  async delete() { log.push(`delete ${this.name}`); world.splice(world.indexOf(this), 1) }
}

beforeEach(() => {
  log = [], world = [], n = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
  globalThis.game = { actors: world, folders: [] }
  globalThis.Folder = { create: async d => ({ id: 'f', ...d }) }
  globalThis.Actor = { create: async d => new FakeActor(d) }
  globalThis.foundry = { utils: { fromUuidSync: u => world.find(a => a.uuid === u) ?? null } }
})

const oldItem = { name: 'old', old: true, flags: flags({ id: 'x' }) }
const vehicle = id => ({ actor: { name: id, type: 'vehicle', flags: flags({ id, runner: 'r1' }), system: {} },
  items: [{ name: `${id} new`, flags: flags({ id: `${id}-i` }) }] })

test('replace: runner first; a vehicle failing rolls back only what this run created', async () => {
  const runner = new FakeActor({ name: 'R', flags: flags({ id: 'r1' }), items: [oldItem] })
  const vA = new FakeActor({ name: 'vA', flags: flags({ id: 'vA', runner: 'r1' }), items: [oldItem] })
  const vB = new FakeActor({ name: 'vB', flags: flags({ id: 'vB', runner: 'r1' }), items: [oldItem] }, true)
  runner.system.linkedVehicles = [vA.uuid, vB.uuid]
  const t = { actor: { name: 'R', flags: flags({ id: 'r1' }), system: {} }, items: [{ name: 'R new', flags: flags({ id: 'k' }) }],
    vehicles: [vehicle('vA'), vehicle('vB'), vehicle('vC')] }

  const res = await applyRunner(t, 'replace')
  expect(res.action).toBe('failed')
  expect(log.slice(0, 3)).toEqual(['update R', 'update vA', 'update vB'])  // vC was created before, via Actor.create
  expect(world.map(a => a.name)).toEqual(['R', 'vA', 'vB'])  // the new vC is gone
  expect(vA.items.map(i => i.name)).toEqual(['vA new'])      // completed replace untouched
  expect(vB.items.map(i => i.name)).toEqual(['old'])         // failing doc: its new items removed, old kept
  expect(runner.items.map(i => i.name)).toEqual(['R new'])
  expect(runner.system.linkedVehicles).toEqual([vA.uuid, vB.uuid])  // no link to the deleted vC
})

test('replace: success links matched and new vehicles', async () => {
  const runner = new FakeActor({ name: 'R', flags: flags({ id: 'r1' }), items: [oldItem] })
  const res = await applyRunner({ actor: { name: 'R', flags: flags({ id: 'r1' }), system: {} }, items: [], vehicles: [vehicle('vC')] }, 'replace')
  expect(res.action).toBe('replace')
  const vC = world.find(a => a.name === 'vC')
  expect(runner.system.linkedVehicles).toEqual([vC.uuid])
  expect(runner.items).toEqual([])
})

test('create: an NPC goes to the folder Chummer NPCs with its token settings, a runner to Chummer Anarchy', async () => {
  const made = []
  globalThis.Folder = { create: async d => { const f = { id: `f-${d.name}`, ...d }; made.push(f); return f } }
  const npc = { actor: { name: 'N', img: 'modules/x/npc.webp', flags: flags({ id: 'n1', npc: { kind: 'npc', tier: 'regular' } }), system: {},
    prototypeToken: { disposition: -1, actorLink: false, texture: { src: 'modules/x/npc.webp' } } }, items: [], vehicles: [] }
  const res = await applyRunner(npc, 'create')
  expect(res.action).toBe('create')
  expect(res.actor.folder).toBe('f-Chummer NPCs')
  expect(res.actor.prototypeToken).toEqual({ disposition: -1, actorLink: false, texture: { src: 'modules/x/npc.webp' } })
  const r = await applyRunner({ actor: { name: 'R', flags: flags({ id: 'r9' }), system: {} }, items: [], vehicles: [] }, 'create')
  expect(r.actor.folder).toBe('f-Chummer Anarchy')
  expect(r.actor.prototypeToken).toEqual({ actorLink: true })
})

// uploadPortrait against a fake FilePicker: the path is <dir>/<file name>. A made-up 1x1 PNG as the data URL.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const fakeUploads = () => {
  globalThis.game.world = { id: 'w' }
  globalThis.foundry.applications = { apps: { FilePicker: { implementation: {
    browse: async () => ({}), createDirectory: async () => ({}), upload: async (_, dir, file) => ({ path: `${dir}/${file.name}` }) } } } }
}

test('create: img is the portrait, the token its own image; without a token the token shows the portrait', async () => {
  fakeUploads()
  const t = id => ({ actor: { name: id, flags: flags({ id }), system: {} }, items: [], vehicles: [] })
  const a = (await applyRunner(t('r1'), 'create', { portrait: PNG, token: PNG })).actor
  expect(a.img).toMatch(/^worlds\/w\/chummer\/portraits\/r1-\d+\.png$/)
  expect(a.prototypeToken.texture.src).toMatch(/^worlds\/w\/chummer\/tokens\/r1-\d+\.png$/)
  const b = (await applyRunner(t('r2'), 'create', { portrait: PNG })).actor
  expect(b.prototypeToken.texture.src).toBe(b.img)
})

test('replace: the token image changes only while it shows module art; a chosen one stays', async () => {
  fakeUploads()
  const ups = []
  const make = src => {
    const r = new FakeActor({ name: 'R', flags: flags({ id: 'r1' }), img: 'worlds/w/chummer/portraits/old.png', prototypeToken: { texture: { src } } })
    r.update = async u => { ups.push(u) }
    return r
  }
  const t = { actor: { name: 'R', flags: flags({ id: 'r1' }), system: {} }, items: [], vehicles: [] }
  make('worlds/w/chummer/portraits/old.png')
  expect((await applyRunner(t, 'replace', { portrait: PNG, token: PNG })).action).toBe('replace')
  expect(ups[0]['prototypeToken.texture.src']).toMatch(/chummer\/tokens\/r1-/)
  expect(ups[0].img).toMatch(/chummer\/portraits\/r1-/)
  world.length = 0
  make('worlds/w/my-token.webp')
  await applyRunner(t, 'replace', { portrait: PNG, token: PNG })
  expect(ups[1]).not.toHaveProperty('prototypeToken.texture.src')
})

test('create: a runner’s amp from a book links its compendium entry by chummerID; a tie is reported, a custom item left alone', async () => {
  const M = MODULE_ID
  const index = new Map([['F1', { _id: 'F1', uuid: 'Compendium.world.ca2-muc-amps.Item.F1', type: 'feat', name: 'Knack', flags: { [M]: { chummerID: 'MUC:amps:muc.knack', kind: 'amps', page: 5 } } }],
    ['G1', { _id: 'G1', uuid: 'U-G1', type: 'feat', name: 'Rope', flags: { [M]: { kind: 'gear', page: 9 } } }],
    ['G2', { _id: 'G2', uuid: 'U-G2', type: 'feat', name: 'Rope', flags: { [M]: { kind: 'gear', page: 9 } } }]])
  game.packs = { filter: f => [{ documentName: 'Item', collection: 'world.ca2-muc-amps', getIndex: async () => index }].filter(f) }
  const it = (name, f) => ({ name, type: 'feat', flags: flags(f), system: {} })
  const items = [it('Knack', { id: 'a1', catalogId: 'muc.knack', source: 'MUC', kind: 'amps', chummerID: 'MUC:amps:muc.knack' }),
    it('Rope', { id: 'i1', catalogId: 'muc.rope', source: 'MUC', kind: 'gear', chummerID: 'MUC:gear:muc.rope', page: 9 }),
    it('Lucky Coin', { id: 'i2' })]
  const res = await applyRunner({ actor: { name: 'R', flags: flags({ id: 'r9' }), system: {} }, items, vehicles: [] }, 'create')
  expect(res.action).toBe('create')
  const made = res.actor.items
  expect(made[0]._stats).toEqual({ compendiumSource: 'Compendium.world.ca2-muc-amps.Item.F1' })
  expect(made[1]).not.toHaveProperty('_stats')
  expect(made[2]).not.toHaveProperty('_stats')
  expect(res.notes).toEqual(['Rope: 2 compendium entries match (Rope [gear] p.9, Rope [gear] p.9) → not linked'])
})
