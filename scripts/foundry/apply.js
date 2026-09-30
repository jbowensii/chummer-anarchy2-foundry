// Apply one translated runner to the world. Foundry globals are only touched inside functions (node --check clean).
import { MODULE_ID } from '../lib/constants.js'
import { newVersionName, replaceUpdate } from '../lib/plan.js'

export const FOLDER = 'Chummer Anarchy'
const flagOf = d => d?.flags?.[MODULE_ID]
const time = f => Date.parse(f?.exportedAt ?? '') || 0
const newest = docs => docs.sort((a, b) => time(flagOf(b)) - time(flagOf(a)))[0] ?? null

// The world copy of a runner: flagged with its id (vehicles also carry `runner`, runners don't); newest export wins.
export const findExisting = runnerId =>
  newest(game.actors.filter(a => flagOf(a)?.id === runnerId && !flagOf(a).runner))

async function ensureFolder(name, parent = null) {
  const found = game.folders.find(f => f.type === 'Actor' && f.name === name && (f.folder?.id ?? null) === (parent?.id ?? null))
  return found ?? Folder.create({ name, type: 'Actor', folder: parent?.id ?? null })
}

// data URL -> world file; returns its path. As sra2 does (helpers/gemini-image.ts): browse, and on failure create each
// level, swallowing "already exists"; a real problem surfaces as the upload failing.
async function uploadPortrait(dataUrl, runnerId, exportedAt) {
  const FP = foundry.applications.apps.FilePicker.implementation
  const base = `worlds/${game.world.id}/chummer`, dir = `${base}/portraits`
  try { await FP.browse('data', dir) } catch {
    for (const d of [base, dir]) { try { await FP.createDirectory('data', d, {}) } catch { /* may already exist */ } }
  }
  const blob = await (await fetch(dataUrl)).blob()
  const ext = /jpe?g/i.test(blob.type) ? 'jpg' : 'png'
  const file = new File([blob], `${runnerId}-${String(exportedAt).replace(/\D/g, '')}.${ext}`, { type: blob.type })
  const res = await FP.upload('data', dir, file, {}, { notify: false })
  if (!res?.path) throw new Error(`Portrait upload failed for ${runnerId}`)
  return res.path
}

// Replace in place: rebuild the translated fields and every flagged embedded item; unflagged items and play state stay.
// Update first, then new items, old items deleted last. If deleting the old ones fails, this document's new items are
// removed again, so a failure never leaves it without its Chummer items or with them twice. Throws on failure.
async function replaceDoc(doc, t) {
  const old = doc.items.filter(i => flagOf(i)).map(i => i.id)
  await doc.update(replaceUpdate(t.actor, doc.name))
  const made = t.items.length ? await doc.createEmbeddedDocuments('Item', t.items) : []
  try { if (old.length) await doc.deleteEmbeddedDocuments('Item', old) } catch (e) {
    try { await doc.deleteEmbeddedDocuments('Item', made.map(i => i.id)) } catch {}
    throw e
  }
}
// Vehicles are linked actors, as sra2 makes them when it links a vehicle (helpers/sheet-helpers.ts).
const createVehicle = (v, name, folder) =>
  Actor.create({ ...v.actor, name, folder: folder.id, items: v.items, prototypeToken: { actorLink: true } })

/**
 * choice: 'create' | 'new' | 'replace' | 'skip'. Never throws: a failure deletes what this runner created and returns
 * { actor: null, action: 'failed', error } so the caller reports it and carries on with the other runners.
 */
export async function applyRunner(t, choice, { portrait, exportedAt } = {}) {
  const runnerId = flagOf(t.actor).id
  if (choice === 'skip') return { actor: findExisting(runnerId), action: 'skip' }
  const created = []  // actors created in this run: all a failure deletes
  let doc = null, linksWritten = false
  try {
    const actor = structuredClone(t.actor)
    if (portrait) actor.img = await uploadPortrait(portrait, runnerId, exportedAt ?? flagOf(t.actor).exportedAt)
    const root = await ensureFolder(FOLDER)
    const vFolder = t.vehicles.length ? await ensureFolder(`${t.actor.name} vehicles`, root) : null

    if (choice === 'replace') {
      doc = findExisting(runnerId)
      if (!doc) throw new Error(`${t.actor.name}: nothing to replace`)
      const links = doc.system.linkedVehicles ?? []
      // Match each vehicle to the world copy; missing ones are created first so the runner's links can be written.
      const matched = [], ours = []
      for (const v of t.vehicles) {
        const vf = flagOf(v.actor)
        const matches = game.actors.filter(a => flagOf(a)?.runner === vf.runner && flagOf(a)?.id === vf.id)
        const match = matches.find(a => links.includes(a.uuid)) ?? newest(matches)
        if (match) { matched.push([match, v]); ours.push(match.uuid) }
        else { const nv = await createVehicle(v, v.actor.name, vFolder); created.push(nv); ours.push(nv.uuid) }
      }
      // keep links to the GM's own vehicles; drop ours not in this export and dangling ones
      const kept = links.filter(u => { const d = foundry.utils.fromUuidSync(u); return d && !flagOf(d) && !ours.includes(u) })
      actor.system.linkedVehicles = [...ours, ...kept]
      // the runner first, then its vehicles
      linksWritten = true
      await replaceDoc(doc, { actor, items: t.items })
      for (const [match, v] of matched) await replaceDoc(match, v)
      return { actor: doc, action: 'replace' }
    }

    const suffix = choice === 'new' ? n => newVersionName(n, flagOf(t.actor).exportedAt) : n => n
    const vUuids = []
    for (const v of t.vehicles) {
      const nv = await createVehicle(v, suffix(v.actor.name), vFolder)
      created.push(nv); vUuids.push(nv.uuid)
    }
    actor.system.linkedVehicles = vUuids
    doc = await Actor.create({ ...actor, name: suffix(actor.name), folder: root.id, items: t.items,
      prototypeToken: { actorLink: true, ...actor.img ? { texture: { src: actor.img } } : {} } })
    created.push(doc)
    return { actor: doc, action: choice === 'new' ? 'new' : 'create' }
  } catch (error) {
    // Rollback: delete the actors this run created. A replaced document cleans up its own new items (replaceDoc), and a
    // replace that completed stays as it is, items included. ponytail: an update already applied stays (the runner's,
    // or a vehicle's whose items failed); re-running the import finishes the job. The runner's links to vehicles
    // deleted here are removed so it is never left pointing at nothing.
    for (const d of created.reverse()) { try { await d.delete() } catch {} }
    if (linksWritten && created.length) {
      const gone = new Set(created.map(d => d.uuid))
      try { await doc.update({ 'system.linkedVehicles': doc.system.linkedVehicles.filter(u => !gone.has(u)) }) } catch {}
    }
    console.error(`${MODULE_ID} | ${t.actor.name}`, error)
    return { actor: null, action: 'failed', error }
  }
}
