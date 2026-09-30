// In-Foundry tests (Quench, https://github.com/Ethaks/FVTT-Quench). Registered from main.js on 'quenchReady'.
// They drive the window's own code paths: readExport -> findExisting/defaultChoice -> translateRunner -> applyRunner.
// Everything they create sits in the Actors folder "Chummer Importer tests" under fresh runner ids, deleted in after().
import { MODULE_ID } from '../lib/constants.js'
import { readExport } from '../lib/read.js'
import { escapeText, translateRunner } from '../lib/translate.js'
import { defaultChoice, newVersionName } from '../lib/plan.js'
import { applyRunner, findExisting } from './apply.js'

const TEST_FOLDER = 'Chummer Importer tests'
const SAMPLE = `modules/${MODULE_ID}/samples/test-export.json`
const flagOf = d => d?.flags?.[MODULE_ID]

// The sample, with its runners given ids no real import uses, so findExisting only ever sees this run's actors.
async function loadSample() {
  const text = await (await fetch(SAMPLE)).text()
  const res = readExport(text)
  if (!res.ok) throw new Error(res.reason)
  const tag = `quench-${foundry.utils.randomID()}-`
  for (const r of res.file.runners) r.id = tag + r.id
  return { file: res.file, tag }
}

// As the window does it (app.js #onImport): same sanitizer, same translate and apply calls; no portrait upload.
function importRunner(file, runner, choice) {
  const clean = foundry.utils.cleanHTML ?? (h => h)
  const exportedAt = runner.exportedAt ?? file.exportedAt
  const t = translateRunner(runner, { exportedAt, appVersion: file.app?.version ?? '', sanitize: s => clean(escapeText(s)) })
  return applyRunner(t, choice, { exportedAt, folder: TEST_FOLDER })
}

// Delete this run's actors (runners and vehicles, by flagged id) and the test folder with anything left in it.
async function cleanUp(tag) {
  const ids = game.actors.filter(a => String(flagOf(a)?.runner ?? flagOf(a)?.id ?? '').startsWith(tag)).map(a => a.id)
  if (ids.length) await Actor.deleteDocuments(ids)
  const folder = game.folders.find(f => f.type === 'Actor' && f.name === TEST_FOLDER && !f.folder)
  if (folder) await folder.delete({ deleteSubfolders: true, deleteContents: true })
}

const itemsOf = (actor, type) => actor.items.filter(i => i.type === type)
const byName = (actor, name) => actor.items.find(i => i.name === name)

export function registerQuench(quench) {
  const batch = (name, fn) => quench.registerBatch(`${MODULE_ID}.${name.replace(/\W+/g, '-')}`, fn,
    { displayName: `Chummer Importer: ${name}` })

  batch('file checks', ({ describe, it, assert }) => {
    describe('readExport refuses what it cannot read, with a reason', function () {
      const refused = (text, re) => { const r = readExport(text); assert.isFalse(r.ok); assert.match(r.reason, re) }
      it('not JSON', () => refused('not json {', /isn’t a Chummer Anarchy export/))
      it('another format', () => refused(JSON.stringify({ format: 'something-else' }), /isn’t a Chummer Anarchy export/))
      it('a newer format version', () => refused(JSON.stringify({ format: 'chummer-anarchy2-export', version: 99 }), /version 99.*update this module/))
      it('book data', () => refused(JSON.stringify({ format: 'chummer-anarchy2-export', version: 1, kind: 'books' }), /book data file/))
      it('no runners', () => refused(JSON.stringify({ format: 'chummer-anarchy2-export', version: 1, kind: 'runners', runners: [] }), /no runners/))
      it('a damaged runner', () => refused(JSON.stringify({ format: 'chummer-anarchy2-export', version: 1, kind: 'runners', runners: [{ id: 'x' }] }), /damaged/))
      it('the sample file is accepted', async () => { const { file } = await loadSample(); assert.lengthOf(file.runners, 2) })
    })
  })

  batch('runners', ({ describe, it, assert, before, after }) => {
    describe('importing the sample file', function () {
      this.timeout(30000)
      let tag, mara, drone
      before(async function () {
        const s = await loadSample(); tag = s.tag
        const runner = s.file.runners[0]
        assert.equal(defaultChoice(flagOf(findExisting(runner.id)), runner), 'create')
        const res = await importRunner(s.file, runner, 'create')
        assert.equal(res.action, 'create', res.error?.message)
        mara = res.actor
        drone = game.actors.find(a => flagOf(a)?.runner === runner.id)
      })
      after(() => cleanUp(tag))

      it('is in the test folder with its attributes', () => {
        assert.equal(mara.folder?.name, TEST_FOLDER)
        assert.deepInclude(mara.system.attributes, { strength: 2, agility: 4, willpower: 3, logic: 2, charisma: 3 })
      })
      it('has its skills and specs with sra2 slugs', () => {
        assert.sameMembers(itemsOf(mara, 'skill').map(i => i.system.slug), ['ranged-weapons', 'athletics', 'networking'])
        assert.include(byName(mara, 'Spec: Pistols').system, { slug: 'spec_pistols', linkedSkill: 'ranged-weapons' })
        assert.include(byName(mara, 'Spec: Fixers').system, { slug: 'spec_chummer-fixers', linkedSkill: 'networking' })
      })
      it('has its metatype caps', () => {
        const m = itemsOf(mara, 'metatype')[0]
        assert.ok(m, 'metatype item')
        assert.include(m.system, { maxStrength: 6, maxAgility: 6, maxWillpower: 6, maxLogic: 6, maxCharisma: 6 })
      })
      it('puts Risk Reduction on the cyberware feat, and escapes its text', () => {
        const cyber = byName(mara, 'Made-Up Reflex Wiring')
        assert.lengthOf(cyber.system.rrList, 1)
        assert.include(cyber.system.rrList[0], { rrType: 'attribute', rrValue: 1, rrTarget: 'agility' })
        assert.notInclude(cyber.system.description, '<script')
      })
      it('has the weapon damage and ranges', () => {
        assert.include(byName(mara, 'Made-Up Heavy Pistol').system,
          { damageValue: '5', meleeRange: 'ok', shortRange: 'ok', mediumRange: 'disadvantage', longRange: 'none' })
      })
      it('creates the vehicle, flagged and linked', () => {
        assert.ok(drone, 'vehicle actor')
        assert.equal(drone.type, 'vehicle')
        assert.equal(flagOf(drone).id, 'v-drone')
        assert.include(mara.system.linkedVehicles, drone.uuid)
      })
    })
  })

  batch('replace and new version', ({ describe, it, assert, before, after }) => {
    describe('importing a runner that is already in the world', function () {
      this.timeout(30000)
      const testUser = foundry.utils.randomID()
      let tag, file, runner, first, oldFlagged, noteId
      before(async function () {
        const s = await loadSample(); tag = s.tag; file = s.file; runner = file.runners[0]
        first = (await importRunner(file, runner, 'create')).actor
        // play state the GM added: a wound, a player's ownership, their own item
        const light = [...(first.system.damage?.light ?? [false])]; light[0] = true
        await first.update({ 'system.damage.light': light, [`ownership.${testUser}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER })
        noteId = (await first.createEmbeddedDocuments('Item', [{ name: 'GM note item', type: 'feat', system: { featType: 'equipment' } }]))[0].id
        oldFlagged = first.items.filter(i => flagOf(i)).map(i => i.id)
      })
      after(() => cleanUp(tag))

      it('Replace with a newer file updates the same actor and keeps play state', async () => {
        const newer = structuredClone(runner)
        newer.exportedAt = '2026-10-05T12:00:00.000Z'
        newer.attributes.str = 5
        assert.equal(defaultChoice(flagOf(findExisting(newer.id)), newer), 'replace')
        const res = await importRunner(file, newer, 'replace')
        assert.equal(res.action, 'replace', res.error?.message)
        const a = game.actors.get(first.id)
        assert.equal(res.actor.id, first.id)
        assert.equal(a.system.attributes.strength, 5)
        assert.isTrue(a.system.damage.light[0], 'wound kept')
        assert.equal(a.ownership[testUser], CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER, 'ownership kept')
        assert.ok(a.items.get(noteId), 'unflagged item kept')
        const flagged = a.items.filter(i => flagOf(i))
        assert.isNotEmpty(flagged)
        assert.isEmpty(flagged.filter(i => oldFlagged.includes(i.id)), 'flagged items rebuilt')
        assert.equal(flagOf(a).exportedAt, newer.exportedAt)
      })
      it('Add as new version makes a second actor named with the date', async () => {
        const res = await importRunner(file, runner, 'new')
        assert.equal(res.action, 'new', res.error?.message)
        assert.notEqual(res.actor.id, first.id)
        assert.equal(res.actor.name, newVersionName(runner.streetName, runner.exportedAt))
        assert.equal(res.actor.folder?.name, TEST_FOLDER)
      })
      it('an older file defaults to Skip', () => {
        const older = { exportedAt: '2026-09-01T00:00:00.000Z' }
        assert.equal(defaultChoice(flagOf(findExisting(runner.id)), older), 'skip')
      })
    })
  })
}
