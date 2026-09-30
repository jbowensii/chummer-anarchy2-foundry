// In-Foundry tests (Quench, https://github.com/Ethaks/FVTT-Quench). Registered from main.js on 'quenchReady'.
// They drive the window's own code paths: readExport -> findExisting/defaultChoice -> translateRunner -> applyRunner.
// Each batch makes its own Actors folder "Chummer Importer tests" and fresh runner ids; after() deletes exactly those.
import { MODULE_ID } from '../lib/constants.js'
import { readExport } from '../lib/read.js'
import { escapeText, translateRunner } from '../lib/translate.js'
import { defaultChoice, newVersionName } from '../lib/plan.js'
import { applyRunner, findExisting } from './apply.js'
import { translateBook } from '../lib/books.js'
import { docId } from '../lib/ids.js'
import { importBook } from './books.js'

const TEST_FOLDER = 'Chummer Importer tests'
const SAMPLE = `modules/${MODULE_ID}/samples/test-export.json`
const BOOKS = `modules/${MODULE_ID}/samples/test-books.json`
const PREFIX = 'ca2test-'
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
function importRunner(file, runner, choice, folder) {
  const clean = foundry.utils.cleanHTML ?? (h => h)
  const exportedAt = runner.exportedAt ?? file.exportedAt
  const t = translateRunner(runner, { exportedAt, appVersion: file.app?.version ?? '', sanitize: s => clean(escapeText(s)) })
  return applyRunner(t, choice, { exportedAt, folder })
}

// This batch's folder, created fresh: a folder of the same name the GM already has is never used or deleted.
const makeFolder = () => Folder.create({ name: TEST_FOLDER, type: 'Actor', folder: null })

// Delete this run's actors (runners and vehicles, by flagged id), then this batch's folder and its vehicle subfolders.
async function cleanUp(tag, folder) {
  const ids = game.actors.filter(a => String(flagOf(a)?.runner ?? flagOf(a)?.id ?? '').startsWith(tag)).map(a => a.id)
  if (ids.length) await Actor.deleteDocuments(ids)
  if (folder && game.folders.get(folder.id)) await folder.delete({ deleteSubfolders: true, deleteContents: true })
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
      it('the book-data sample is accepted', async () => {
        const r = readExport(await (await fetch(BOOKS)).text())
        assert.isTrue(r.ok, r.reason)
        assert.equal(r.file.kind, 'books')
        assert.lengthOf(r.file.books, 2)
      })
      it('no books', () => refused(JSON.stringify({ format: 'chummer-anarchy2-export', version: 1, kind: 'books', books: [] }), /no books/))
      it('no runners', () => refused(JSON.stringify({ format: 'chummer-anarchy2-export', version: 1, kind: 'runners', runners: [] }), /no runners/))
      it('a damaged runner', () => refused(JSON.stringify({ format: 'chummer-anarchy2-export', version: 1, kind: 'runners', runners: [{ id: 'x' }] }), /damaged/))
      it('the sample file is accepted', async () => { const { file } = await loadSample(); assert.lengthOf(file.runners, 2) })
    })
  })

  batch('runners', ({ describe, it, assert, before, after }) => {
    describe('importing the sample file', function () {
      this.timeout(30000)
      let tag, folder, mara, drone
      before(async function () {
        const s = await loadSample(); tag = s.tag
        folder = await makeFolder()
        const runner = s.file.runners[0]
        assert.equal(defaultChoice(flagOf(findExisting(runner.id)), runner), 'create')
        const res = await importRunner(s.file, runner, 'create', folder)
        assert.equal(res.action, 'create', res.error?.message)
        mara = res.actor
        drone = game.actors.find(a => flagOf(a)?.runner === runner.id)
      })
      after(() => cleanUp(tag, folder))

      it('is in the test folder with its attributes', () => {
        assert.equal(mara.folder?.id, folder.id)
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
        assert.include(m.system, { maxStrength: 6, maxAgility: 6, maxWillpower: 6, maxLogic: 6, maxCharisma: 6, anarchyBonus: 1 })
      })
      it('has Foundry’s default artwork without a portrait', () => assert.ok(mara.img, 'actor img'))
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
    // These tests run in order and build on each other: Replace, then Add as new version, then the older-file check.
    describe('importing a runner that is already in the world', function () {
      this.timeout(30000)
      const OWNER = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
      let tag, folder, file, runner, first, oldFlagged, noteId, testUser
      before(async function () {
        // a real user other than me (a player if there is one); without one the ownership check is skipped
        testUser = game.users.find(u => !u.isGM && u.id !== game.user.id) ?? game.users.find(u => u.id !== game.user.id)
        const s = await loadSample(); tag = s.tag; file = s.file; runner = file.runners[0]
        folder = await makeFolder()
        first = (await importRunner(file, runner, 'create', folder)).actor
        // play state the GM added: a wound, a user's ownership, their own item
        const light = [...(first.system.damage?.light ?? [false])]; light[0] = true
        await first.update({ 'system.damage.light': light, ...testUser ? { [`ownership.${testUser.id}`]: OWNER } : {} })
        assert.isTrue(first.system.damage.light[0], 'setup: wound marked')
        if (testUser) assert.equal(first.ownership[testUser.id], OWNER, 'setup: ownership set')
        noteId = (await first.createEmbeddedDocuments('Item', [{ name: 'GM note item', type: 'feat', system: { featType: 'equipment' } }]))[0].id
        oldFlagged = first.items.filter(i => flagOf(i)).map(i => i.id)
      })
      after(() => cleanUp(tag, folder))

      it('Replace with a newer file updates the same actor and keeps play state', async () => {
        const newer = structuredClone(runner)
        newer.exportedAt = '2026-10-05T12:00:00.000Z'
        newer.attributes.str = 5
        assert.equal(defaultChoice(flagOf(findExisting(newer.id)), newer), 'replace')
        const res = await importRunner(file, newer, 'replace', folder)
        assert.equal(res.action, 'replace', res.error?.message)
        const a = game.actors.get(first.id)
        assert.equal(res.actor.id, first.id)
        assert.equal(a.system.attributes.strength, 5)
        assert.isTrue(a.system.damage.light[0], 'wound kept')
        assert.ok(a.items.get(noteId), 'unflagged item kept')
        const flagged = a.items.filter(i => flagOf(i))
        assert.isNotEmpty(flagged)
        assert.isEmpty(flagged.filter(i => oldFlagged.includes(i.id)), 'flagged items rebuilt')
        assert.equal(flagOf(a).exportedAt, newer.exportedAt)
      })
      it('Replace kept the user’s ownership', function () {
        if (!testUser) {
          console.warn(`${MODULE_ID} | ownership test skipped: this world has no other user to own the test actor`)
          this.skip()
        }
        assert.equal(game.actors.get(first.id).ownership[testUser.id], OWNER)
      })
      it('Add as new version makes a second actor named with the date', async () => {
        const res = await importRunner(file, runner, 'new', folder)
        assert.equal(res.action, 'new', res.error?.message)
        assert.notEqual(res.actor.id, first.id)
        assert.equal(res.actor.name, newVersionName(runner.streetName, runner.exportedAt))
        assert.equal(res.actor.folder?.id, folder.id)
      })
      it('an older file defaults to Skip', () => {
        const older = { exportedAt: '2026-09-01T00:00:00.000Z' }
        assert.equal(defaultChoice(flagOf(findExisting(runner.id)), older), 'skip')
      })
    })
  })

  batch('book data', ({ describe, it, assert, before, after }) => {
    // Imports the made-up book file as the window does, into packs named ca2test-… in the Compendium folder
    // "Chummer Importer tests". after() deletes only the packs and folders this run created (by id).
    describe('importing the book-data sample', function () {
      this.timeout(60000)
      const clean = foundry.utils.cleanHTML ?? (h => h)
      let file, muc, res
      const made = { packs: [], folders: [] }
      const pack = k => game.packs.get(`world.${PREFIX}ca2-muc-${k}`)
      const translate = book => translateBook(book, { exportedAt: book.exportedAt ?? file.exportedAt,
        appVersion: file.app?.version ?? '', descriptions: file.descriptions === true, sanitize: s => clean(escapeText(s)) })
      const run = book => importBook(translate(book), { prefix: PREFIX, topFolder: TEST_FOLDER })
      before(async function () {
        const r = readExport(await (await fetch(BOOKS)).text())
        if (!r.ok) throw new Error(r.reason)
        file = r.file; muc = file.books[0]
        const packsBefore = new Set(game.packs.keys()), foldersBefore = new Set(game.folders.map(f => f.id))
        res = await run(muc)
        made.packs = [...game.packs.keys()].filter(k => !packsBefore.has(k) && k.startsWith(`world.${PREFIX}`))
        made.folders = game.folders.filter(f => f.type === 'Compendium' && !foldersBefore.has(f.id)).map(f => f.id)
      })
      after(async function () {
        for (const k of made.packs) await game.packs.get(k)?.deleteCompendium()
        for (const id of made.folders) await game.folders.get(id)?.delete()
      })

      it('imports every pack without a failure', () => assert.isEmpty(res.failed, res.failed.map(f => f.error?.message).join('; ')))
      it('puts the packs in the book folder inside the test folder', () => {
        for (const k of ['amps', 'weapons', 'armor', 'gear', 'spells', 'vehicles', 'skills', 'rules']) {
          const p = pack(k)
          assert.ok(p, `pack ${k}`)
          assert.equal(p.folder?.name, 'Made-Up Core (MUC)', k)
          assert.equal(p.folder?.folder?.name, TEST_FOLDER, k)
        }
      })
      it('has the expected entry counts', () => {
        const n = k => pack(k)?.index.size
        assert.deepEqual({ amps: n('amps'), weapons: n('weapons'), armor: n('armor'), gear: n('gear'), spells: n('spells'),
          vehicles: n('vehicles'), skills: n('skills'), rules: n('rules') },
        { amps: 2, weapons: 1, armor: 1, gear: 1, spells: 1, vehicles: 1, skills: 3, rules: 2 })
      })
      it('has the weapon’s damage, flags and reference', async () => {
        const blade = await pack('weapons').getDocument(docId('muc.made-up-blade'))
        assert.include(blade.system, { featType: 'weapon', weaponType: 'short-weapons', vdMode: 'attribute', vdBonus: 1,
          meleeRange: 'ok', reference: 'MUC p.20' })
        assert.include(flagOf(blade), { id: 'muc.made-up-blade', source: 'MUC', page: 20, canon: true, exportedAt: file.exportedAt })
      })
      it('links the amp’s Risk Reduction to the sra2 spec', async () => {
        const knack = await pack('amps').getDocument(docId('muc.made-up-knack'))
        assert.deepInclude(knack.system.rrList, { rrType: 'specialization', rrValue: 1, rrTarget: 'spec_pistols' })
      })
      it('has a rules journal per section with pages sorted by page', async () => {
        const basics = (await pack('rules').getDocuments()).find(j => j.name === 'Made-Up Basics')
        assert.ok(basics, 'journal')
        assert.deepEqual(basics.pages.contents.sort((a, b) => a.sort - b.sort).map(p => p.name), ['Rule One', 'Rule Two'])
      })
      it('re-import replaces its own entries by id and leaves a GM-made entry', async () => {
        const amps = pack('amps'), id = docId('muc.made-up-knack')
        const gm = await Item.create({ name: 'GM-made amp', type: 'feat', system: { featType: 'equipment' } }, { pack: amps.collection })
        const changed = structuredClone(muc)
        changed.amps[0].rating = 3
        const again = await run(changed)
        assert.isEmpty(again.failed, again.failed.map(f => f.error?.message).join('; '))
        assert.equal(again.counts[`${PREFIX}ca2-muc-amps`].replaced, 2)
        const knack = await amps.getDocument(id)
        assert.equal(knack?.id, id)
        assert.equal(knack?.system.rating, 3)
        assert.ok(await amps.getDocument(gm.id), 'GM entry kept')
        assert.equal(amps.index.size, 3)
      })
    })
  })
}
