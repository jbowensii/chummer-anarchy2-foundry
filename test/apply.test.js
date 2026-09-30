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
