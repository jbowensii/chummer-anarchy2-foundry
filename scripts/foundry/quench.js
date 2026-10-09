// In-Foundry tests (Quench, https://github.com/Ethaks/FVTT-Quench). Registered from main.js on 'quenchReady'.
// They drive the window's own code paths: readExport -> findExisting/defaultChoice -> translateRunner -> applyRunner.
// Each batch makes its own Actors folder "Chummer Importer tests" and fresh runner ids; after() deletes exactly those.
import { MODULE_ID } from '../lib/constants.js'
import { readExport } from '../lib/read.js'
import { escapeText, translateRunner } from '../lib/translate.js'
import { defaultChoice, newVersionName } from '../lib/plan.js'
import { applyRunner, COMPENDIUM_FOLDER, findExisting, NPC_FOLDER } from './apply.js'
import { translateBook } from '../lib/books.js'
import { INDEX_FIELDS } from '../lib/chummer-id.js'
import { importBook } from './books.js'
import { applyIcons, loadIconIndex } from './icons.js'
import { iconFor, MODULE_ICON_ROOT, slugName } from '../lib/icons.js'

const TEST_FOLDER = 'Chummer Importer tests'
const SAMPLE = `modules/${MODULE_ID}/samples/test-export.json`
const BOOKS = `modules/${MODULE_ID}/samples/test-books.json`
const NPCS = `modules/${MODULE_ID}/samples/test-npcs.json`
const COMPENDIUM = `modules/${MODULE_ID}/samples/test-compendium.json`
const PREFIX = 'ca2test-'
const flagOf = d => d?.flags?.[MODULE_ID]

// The sample, with its runners given ids no real import uses, so findExisting only ever sees this run's actors.
async function loadSample(url = SAMPLE) {
  const text = await (await fetch(url)).text()
  const res = readExport(text)
  if (!res.ok) throw new Error(res.reason)
  const tag = `quench-${foundry.utils.randomID()}-`
  for (const r of res.file.runners) r.id = tag + r.id
  return { file: res.file, tag }
}

// As the window does it (app.js #onImport): same sanitizer, same translate and apply calls; no portrait upload.
// images: { portrait, token } data URLs, uploaded as the window does (only the portrait and token batch passes them).
function importRunner(file, runner, choice, folder, icons, images = {}) {
  const clean = foundry.utils.cleanHTML ?? (h => h)
  const exportedAt = runner.exportedAt ?? file.exportedAt
  const t = translateRunner(runner, { exportedAt, appVersion: file.app?.version ?? '', sanitize: s => clean(escapeText(s)), icons })
  return applyRunner(t, choice, { exportedAt, folder, ...images })
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

// an entry of a pack by our chummerID (lib/chummer-id.js): Foundry picked its _id
async function byKey(pack, key) {
  const index = await pack.getIndex({ fields: INDEX_FIELDS })
  const hit = [...index.values()].find(i => i.flags?.[MODULE_ID]?.chummerID === key)
  return hit ? pack.getDocument(hit._id) : null
}

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
        assert.isNotEmpty(flagged.filter(i => oldFlagged.includes(i.id)), 'our items updated in place (same ids), not re-created')
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
    // "Chummer Importer tests". before() and after() both clean up (cleanBooks), so a crashed run leaves nothing behind.
    // ponytail: the pregen's portrait file stays in worlds/<world>/chummer/portraits (Foundry has no call to delete an
    // uploaded file); its name is fixed (MUC-muc-sample-max-<export time>.png), so every run overwrites the same file.
    describe('importing the book-data sample', function () {
      this.timeout(60000)
      const clean = foundry.utils.cleanHTML ?? (h => h)
      const EMPTY = { source: { id: 'EMP', name: 'Made-Up Empty', publisher: 'Made-Up Press', canon: true } }
      let file, muc, mux, res, muxRes, emptyRes
      const pack = (k, book = 'muc') => game.packs.get(`world.${PREFIX}ca2-${book}-${k}`)
      const sorted = j => j.pages.contents.sort((a, b) => a.sort - b.sort).map(p => [p.title.level, p.name])
      // Every world pack named ca2test-… (only these tests make them), then the sample books' Compendium folders inside
      // the top-level Compendium folder "Chummer Importer tests", then that folder.
      const cleanBooks = async () => {
        for (const p of game.packs.filter(p => p.collection.startsWith(`world.${PREFIX}`))) await p.deleteCompendium()
        const top = game.folders.find(f => f.type === 'Compendium' && f.name === TEST_FOLDER && !f.folder)
        if (!top) return
        const names = new Set([...file.books, EMPTY].map(b => `${b.source.name} (${b.source.id})`))
        for (const f of game.folders.filter(f => f.type === 'Compendium' && f.folder?.id === top.id && names.has(f.name))) await f.delete()
        await top.delete()
      }
      const translate = book => translateBook(book, { exportedAt: book.exportedAt ?? file.exportedAt,
        appVersion: file.app?.version ?? '', descriptions: file.descriptions === true, sanitize: s => clean(escapeText(s)) })
      const run = book => importBook(translate(book), { prefix: PREFIX, topFolder: TEST_FOLDER })
      before(async function () {
        const r = readExport(await (await fetch(BOOKS)).text())
        if (!r.ok) throw new Error(r.reason)
        file = r.file; [muc, mux] = file.books
        await cleanBooks()
        res = await run(muc)
        muxRes = await run(mux)
        emptyRes = await run(EMPTY)
      })
      after(async function () { if (file) await cleanBooks() })

      it('imports every pack without a failure', () => {
        for (const r of [res, muxRes, emptyRes]) assert.isEmpty(r.failed, r.failed.map(f => f.error?.message).join('; '))
      })
      it('puts the packs in the book folder inside the test folder', () => {
        for (const k of ['amps', 'weapons', 'armor', 'gear', 'spells', 'vehicles', 'characters', 'npcs', 'metatypes', 'skills', 'rules']) {
          const p = pack(k)
          assert.ok(p, `pack ${k}`)
          assert.equal(p.folder?.name, 'Made-Up Core (MUC)', k)
          assert.equal(p.folder?.folder?.name, TEST_FOLDER, k)
        }
      })
      it('has the expected entry counts', () => {
        const n = k => pack(k)?.index.size
        assert.deepEqual({ amps: n('amps'), weapons: n('weapons'), armor: n('armor'), gear: n('gear'), spells: n('spells'),
          vehicles: n('vehicles'), characters: n('characters'), npcs: n('npcs'), metatypes: n('metatypes'), skills: n('skills'), rules: n('rules') },
        { amps: 2, weapons: 1, armor: 1, gear: 1, spells: 1, vehicles: 1, characters: 2, npcs: 1, metatypes: 1, skills: 3, rules: 2 })
      })
      it('has the book’s spirit as an unlinked hostile character with its GM description and no metatype', async () => {
        const wisp = await byKey(pack('npcs'), 'MUC:npc:muc-npc-wisp')
        assert.ok(wisp, 'NPC')
        assert.equal(pack('npcs').title, 'NPCs & Critters — MUC')
        assert.equal(wisp.type, 'character')
        assert.include(wisp.prototypeToken, { actorLink: false, disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE })
        assert.include(wisp.system.bio.gmDescription, 'Spirit, regular NPC')
        assert.isEmpty(itemsOf(wisp, 'metatype'))
      })
      it('makes no pack for a type the book lacks, and no folder for a book with nothing', () => {
        assert.sameMembers(game.packs.filter(p => p.collection.startsWith(`world.${PREFIX}ca2-mux-`)).map(p => p.collection),
          [`world.${PREFIX}ca2-mux-amps`])
        assert.isEmpty(Object.keys(emptyRes.counts))
        assert.isEmpty(game.packs.filter(p => p.collection.startsWith(`world.${PREFIX}ca2-emp-`)))
        assert.notOk(game.folders.find(f => f.type === 'Compendium' && f.name === 'Made-Up Empty (EMP)'), 'empty book folder')
      })
      it('has the weapon’s damage, flags and reference', async () => {
        const blade = await byKey(pack('weapons'), 'MUC:weapons:muc.made-up-blade')
        assert.include(blade.system, { featType: 'weapon', weaponType: 'short-weapons', vdMode: 'attribute', vdBonus: 1,
          meleeRange: 'ok', reference: 'MUC p.20' })
        assert.include(flagOf(blade), { id: 'muc.made-up-blade', source: 'MUC', page: 20, canon: true, exportedAt: file.exportedAt })
      })
      it('links the amp’s Risk Reduction to the sra2 spec', async () => {
        const knack = await byKey(pack('amps'), 'MUC:amps:muc.made-up-knack')
        // sra2 adds its own fields to each line (rrLabel), so match the three that matter
        assert.ok(knack.system.rrList.some(r => r.rrType === 'specialization' && r.rrValue === 1 && r.rrTarget === 'spec_pistols'),
          JSON.stringify(knack.system.rrList))
      })
      it('has a rules journal per sheet: level-1 section pages, then their level-2 rule pages, in order', async () => {
        const journals = await pack('rules').getDocuments()
        assert.sameMembers(journals.map(j => j.name), ['Core', 'Optional rules'])
        assert.deepEqual(sorted(journals.find(j => j.name === 'Core')),
          [[1, 'Made-Up Basics'], [2, 'Rule One'], [2, 'Rule Two'], [1, 'Made-Up Extras'], [2, 'Rule Three']])
        assert.deepEqual(sorted(journals.find(j => j.name === 'Optional rules')), [[1, 'Optional rules'], [2, 'Rule Four']])
        const one = journals.find(j => j.name === 'Core').pages.find(p => flagOf(p)?.chummerID === 'MUC:rules:muc.rule-one')
        assert.include(flagOf(one), { id: 'muc.rule-one', source: 'MUC', page: 50 })
      })
      it('has the pregen with its skills, its portrait on img and token, and its vehicle', async () => {
        const max = await byKey(pack('characters'), 'MUC:character:muc-sample-max')
        assert.ok(max, 'pregen')
        assert.sameMembers(itemsOf(max, 'skill').map(i => i.system.slug), ['athletics'])
        assert.match(max.img, /chummer\/portraits\/MUC-muc-sample-max-\d+\.png$/)
        assert.equal(max.prototypeToken.texture.src, max.img)
        assert.isTrue(max.prototypeToken.actorLink)
        const drone = await byKey(pack('characters'), 'MUC:vehicle:muc-sample-max:v-drone')
        assert.equal(drone?.name, 'Made-Up Max — Made-Up Scout Drone')
        assert.equal(drone?.type, 'vehicle')
      })
      it('a pregen taken into the world is never offered for Replace by a runner file', async () => {
        const data = (await byKey(pack('characters'), 'MUC:character:muc-sample-max')).toObject()
        delete data._id
        const copy = await Actor.create(data)
        try { assert.isNull(findExisting('muc-sample-max')) } finally { await copy.delete() }
      })
      it('has the metatype with its caps', async () => {
        const gnome = await byKey(pack('metatypes'), 'MUC:metatypes:muc.made-up-gnome')
        assert.include(gnome.system, { maxStrength: 4, maxAgility: 6, maxWillpower: 7, maxLogic: 7, maxCharisma: 6, anarchyBonus: 0 })
      })
      it('re-import updates its own entries in place by chummerID (same _id) and leaves what the GM added', async () => {
        const amps = pack('amps'), id = (await byKey(pack('amps'), 'MUC:amps:muc.made-up-knack')).id, maxId = (await byKey(pack('characters'), 'MUC:character:muc-sample-max')).id
        const gm = await Item.create({ name: 'GM-made amp', type: 'feat', system: { featType: 'equipment' } }, { pack: amps.collection })
        const coreId = (await pack('rules').getDocuments()).find(j => j.name === 'Core').id
        const gmPage = (await (await pack('rules').getDocument(coreId)).createEmbeddedDocuments('JournalEntryPage',
          [{ name: 'GM page', type: 'text', text: { content: '<p>mine</p>' } }]))[0]
        const gmItem = (await (await pack('characters').getDocument(maxId)).createEmbeddedDocuments('Item',
          [{ name: 'GM note item', type: 'feat', system: { featType: 'equipment' } }]))[0]
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
        const core = await pack('rules').getDocument(coreId)
        assert.equal(core.pages.get(gmPage.id)?.text.content, '<p>mine</p>', 'GM page kept')
        assert.include(core.pages.map(p => p.name), 'GM page')
        const max = await pack('characters').getDocument(maxId)
        assert.ok(max.items.get(gmItem.id), 'GM item on the pregen kept')
        assert.lengthOf(itemsOf(max, 'skill'), 1, 'imported items rebuilt, not doubled')
      })
    })
  })

  batch('compendium', ({ describe, it, assert, before, after }) => {
    // Imports the made-up compendium file as the window does (no topFolder: a compendium book goes to the Compendium
    // folder "Chummer compendiums"), into packs named ca2test-ca2-myh-…. Cleanup deletes those packs, the book folder,
    // and "Chummer compendiums" only when this batch made it and it is left empty.
    describe('importing the compendium sample', function () {
      this.timeout(60000)
      const clean = foundry.utils.cleanHTML ?? (h => h)
      let file, house, res, hadTop
      const pack = k => game.packs.get(`world.${PREFIX}ca2-myh-${k}`)
      const top = () => game.folders.find(f => f.type === 'Compendium' && f.name === COMPENDIUM_FOLDER && !f.folder)
      const bookFolder = () => game.folders.find(f => f.type === 'Compendium' && f.name === 'Made-Up House Stuff (MYH)' && f.folder?.id === top()?.id)
      const run = book => importBook(translateBook(book, { exportedAt: file.exportedAt, appVersion: file.app?.version ?? '',
        descriptions: true, sanitize: s => clean(escapeText(s)) }), { prefix: PREFIX })
      const cleanUpHouse = async () => {
        for (const p of game.packs.filter(p => p.collection.startsWith(`world.${PREFIX}ca2-myh-`))) await p.deleteCompendium()
        await bookFolder()?.delete()
        const t = top()
        if (t && !hadTop && !t.getSubfolders().length && !game.packs.some(p => p.folder?.id === t.id)) await t.delete()
      }
      before(async function () {
        const r = readExport(await (await fetch(COMPENDIUM)).text())
        if (!r.ok) throw new Error(r.reason)
        file = r.file; [house] = file.books
        hadTop = !!top()
        await cleanUpHouse()
        res = await run(house)
      })
      after(async function () { if (file) await cleanUpHouse() })

      it('imports every pack into "Chummer compendiums/<name> (<id>)", labelled (House)', () => {
        assert.isEmpty(res.failed, res.failed.map(f => f.error?.message).join('; '))
        for (const k of ['amps', 'weapons', 'armor', 'gear', 'spells', 'vehicles', 'npcs']) {
          const p = pack(k)
          assert.ok(p, `pack ${k}`)
          assert.equal(p.folder?.name, 'Made-Up House Stuff (MYH)', k)
          assert.equal(p.folder?.folder?.name, COMPENDIUM_FOLDER, k)
          assert.match(p.title, / — MYH \(House\)$/, k)
        }
      })
      it('has the NPC actor, flagged compendium', async () => {
        const wisp = await byKey(pack('npcs'), 'MYH:npc:myh-npc-wisp')
        assert.ok(wisp, 'NPC')
        assert.equal(wisp.name, 'House Wisp')
        assert.include(flagOf(wisp), { source: 'MYH', canon: false, compendium: true })
      })
      it('re-import updates its entries in place by chummerID (same _id) and leaves what the GM added', async () => {
        const weapons = pack('weapons'), id = (await byKey(pack('weapons'), 'MYH:weapons:myh.made-up-blade')).id
        const gm = await Item.create({ name: 'GM-made weapon', type: 'feat', system: { featType: 'weapon' } }, { pack: weapons.collection })
        const changed = structuredClone(house)
        changed.items[0].name = 'House Short Blade II'
        const again = await run(changed)
        assert.isEmpty(again.failed, again.failed.map(f => f.error?.message).join('; '))
        assert.equal(again.counts[`${PREFIX}ca2-myh-weapons`].replaced, 1)
        assert.equal((await weapons.getDocument(id))?.name, 'House Short Blade II')
        assert.ok(await weapons.getDocument(gm.id), 'GM entry kept')
        assert.equal(weapons.index.size, 2)
      })
    })
  })

  batch('NPCs', ({ describe, it, assert, before, after }) => {
    // Imports the made-up NPC file as the window does, without a folder: NPCs go to the Actors folder "Chummer NPCs".
    // after() deletes this run's actors, and that folder only when this batch made it and it is left empty.
    describe('importing the NPC sample', function () {
      this.timeout(30000)
      let tag, file, ganger, hound, hadFolder, index
      const npcFolder = () => game.folders.find(f => f.type === 'Actor' && f.name === NPC_FOLDER && !f.folder)
      before(async function () {
        index = await loadIconIndex()
        hadFolder = !!npcFolder()
        const s = await loadSample(NPCS); tag = s.tag; file = s.file
        const results = []
        for (const r of file.runners) results.push(await importRunner(file, r, 'create', undefined, index))
        for (const r of results) assert.equal(r.action, 'create', r.error?.message)
        ;[ganger, hound] = results.map(r => r.actor)
      })
      after(async function () {
        await cleanUp(tag, null)
        const f = npcFolder()
        if (f && !hadFolder && !f.contents.length && !f.getSubfolders().length) await f.delete()
      })

      it('puts NPCs in the folder Chummer NPCs', () => {
        assert.equal(ganger.folder?.name, NPC_FOLDER)
        assert.equal(hound.folder?.name, NPC_FOLDER)
      })
      it('writes the GM description: kind, tier, fighting spirit, average hits', () => {
        const gm = ganger.system.bio.gmDescription
        assert.include(gm, 'NPC, regular NPC')
        assert.include(gm, 'Fighting spirit: Low')
        assert.include(gm, 'Ranged Weapons 5 (5+A, RR 1)')
      })
      it('makes hostile tokens, linked only for a prime NPC', () => {
        assert.include(ganger.prototypeToken, { disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE, actorLink: false })
        assert.include(hound.prototypeToken, { disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE, actorLink: true })
      })
      it('gives a critter without a metatype no metatype item, and the critter icon', () => {
        assert.isEmpty(itemsOf(hound, 'metatype'))
        assert.lengthOf(itemsOf(ganger, 'metatype'), 1)
        assert.equal(hound.img, `${MODULE_ICON_ROOT}icons/defaults/npc/critter.webp`)
        assert.equal(hound.prototypeToken.texture.src, hound.img)
      })
      it('Replace updates the same NPC in place', async () => {
        const newer = structuredClone(file.runners[0])
        newer.exportedAt = '2026-10-05T12:00:00.000Z'
        newer.npc.fightingSpirit = 'extreme'
        assert.equal(defaultChoice(flagOf(findExisting(newer.id)), newer), 'replace')
        const res = await importRunner(file, newer, 'replace', undefined, index)
        assert.equal(res.action, 'replace', res.error?.message)
        assert.equal(res.actor.id, ganger.id)
        assert.include(game.actors.get(ganger.id).system.bio.gmDescription, 'Fighting spirit: Extreme')
      })
    })
  })

  batch('portrait and token', ({ describe, it, assert, before, after }) => {
    // Imports the sample runner with a made-up portrait and a different made-up token image, as the window does (uploads
    // included). ponytail: the two files stay in worlds/<world>/chummer/portraits|tokens (Foundry has no call to delete
    // an uploaded file); the runner id is fixed here, so every run overwrites the same two files.
    describe('a runner with its own token image', function () {
      this.timeout(30000)
      const ID = 'quench-token-test', AT = '2026-10-02T09:15:00.000Z'
      // made-up 1x1 images: a PNG portrait, a JPEG-typed token (any bytes: only the file name and folder are checked)
      const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
      const TOKEN = PNG.replace('image/png', 'image/jpeg')
      let file, runner, folder, a
      before(async function () {
        await cleanUp(ID, null)
        file = (await loadSample()).file
        runner = { ...file.runners[0], id: ID, exportedAt: AT, vehicles: [], amps: file.runners[0].amps.filter(x => x.type !== 'vehicle') }
        folder = await makeFolder()
        const res = await importRunner(file, runner, 'create', folder, null, { portrait: PNG, token: TOKEN })
        assert.equal(res.action, 'create', res.error?.message)
        a = res.actor
      })
      after(() => cleanUp(ID, folder))

      it('has the portrait as img and the token image on its prototype token', () => {
        assert.match(a.img, /chummer\/portraits\/quench-token-test-\d+\.png$/)
        assert.match(a.prototypeToken.texture.src, /chummer\/tokens\/quench-token-test-\d+\.jpg$/)
      })
      it('Replace keeps a token image the GM chose', async () => {
        await a.update({ 'prototypeToken.texture.src': 'icons/environment/people/commoner.webp' })
        const res = await importRunner(file, { ...runner, exportedAt: '2026-10-05T12:00:00.000Z' }, 'replace', folder, null, { portrait: PNG, token: TOKEN })
        assert.equal(res.action, 'replace', res.error?.message)
        assert.equal(game.actors.get(a.id).prototypeToken.texture.src, 'icons/environment/people/commoner.webp')
      })
    })
  })

  batch('icons', ({ describe, it, assert, before, after }) => {
    // Imports the sample runner with the shipped icon index into this batch's own Actors folder, then runs Apply icons
    // over that runner only (never the rest of the world); after() deletes it.
    describe('icons on import and Apply icons', function () {
      this.timeout(30000)
      const PISTOL = 'Made-Up Heavy Pistol'
      let tag, folder, index, mara, file
      const flagIcon = i => flagOf(i).icon
      before(async function () {
        index = await loadIconIndex()
        assert.isArray(index, 'icons/index.json')
        const s = await loadSample(); tag = s.tag; file = s.file
        // a made-up spell with the catalog category (export v1, optional)
        file.runners[0].items.push({ uid: 'i-bolt', kind: 'spell', name: 'Made-Up Bolt', canon: false, price: 0, category: 'combat' })
        folder = await makeFolder()
        const res = await importRunner(s.file, s.file.runners[0], 'create', folder, index)
        assert.equal(res.action, 'create', res.error?.message)
        mara = res.actor
      })
      after(() => cleanUp(tag, folder))

      it('an imported weapon gets its default icon', () => {
        const pistol = byName(mara, PISTOL), f = flagIcon(pistol)
        assert.match(f.key, /^weapon\//)
        assert.equal(pistol.img, `${MODULE_ICON_ROOT}icons/defaults/${f.key}.webp`)
      })
      it('a runner spell with a category gets that category’s icon, as from a book', () => {
        const bolt = byName(mara, 'Made-Up Bolt')
        assert.equal(flagIcon(bolt).key, 'spell/combat')
        assert.equal(bolt.img, `${MODULE_ICON_ROOT}icons/defaults/spell/combat.webp`)
      })
      it('Apply icons keeps a chosen image, replaces a stock default, and upgrades to more specific art', async () => {
        const [custom, stock] = mara.items.filter(i => flagOf(i)?.icon && i.name !== PISTOL && i.name !== 'Made-Up Bolt')
        const pistol = byName(mara, PISTOL)
        await mara.updateEmbeddedDocuments('Item', [{ _id: custom.id, img: 'worlds/x/custom.webp' },
          { _id: stock.id, img: 'icons/svg/item-bag.svg' }])
        // a specific file for the pistol, by name (not shipped: only the index says it exists)
        const specific = `icons/items/${slugName(PISTOL)}.webp`
        const counts = await applyIcons({ index: [...index, specific], items: [], actors: [mara], packs: [] })
        assert.include(counts, { updated: 2, kept: 1 })
        const a = game.actors.get(mara.id)
        assert.equal(a.items.get(custom.id).img, 'worlds/x/custom.webp')
        const sf = flagIcon(stock)
        assert.equal(a.items.get(stock.id).img, iconFor(sf.key, sf.name, sf.book, index))
        assert.equal(a.items.get(pistol.id).img, MODULE_ICON_ROOT + specific)
      })
      it('Replace keeps an image the user chose on an imported weapon', async () => {
        const CUSTOM = 'worlds/test/custom.webp'
        await mara.updateEmbeddedDocuments('Item', [{ _id: byName(mara, PISTOL).id, img: CUSTOM }])
        const newer = structuredClone(file.runners[0])
        newer.exportedAt = '2026-10-05T12:00:00.000Z'
        const res = await importRunner(file, newer, 'replace', folder, index)
        assert.equal(res.action, 'replace', res.error?.message)
        assert.equal(byName(game.actors.get(mara.id), PISTOL)?.img, CUSTOM)
      })
    })
  })
}
