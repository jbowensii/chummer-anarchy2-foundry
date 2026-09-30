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

// data URL -> world file; returns its path. createDirectory rejects when the directory is already there.
async function uploadPortrait(dataUrl, runnerId, exportedAt) {
  const FP = foundry.applications.apps.FilePicker.implementation
  const dir = `worlds/${game.world.id}/chummer/portraits`
  for (const d of [`worlds/${game.world.id}/chummer`, dir]) {
    try { await FP.createDirectory('data', d, {}) } catch (e) { if (!/exist/i.test(String(e?.message ?? e))) throw e }
  }
  const blob = await (await fetch(dataUrl)).blob()
  const ext = /jpe?g/i.test(blob.type) ? 'jpg' : 'png'
  const file = new File([blob], `${runnerId}-${String(exportedAt).replace(/\D/g, '')}.${ext}`, { type: blob.type })
  const res = await FP.upload('data', dir, file, {}, { notify: false })
  if (!res?.path) throw new Error(`Portrait upload failed for ${runnerId}`)
  return res.path
}

// Replace in place: rebuild the translated fields and every flagged embedded item; unflagged items and play state stay.
// New items are created before the old ones go, so a failure never leaves the actor without its items.
async function replaceDoc(doc, t, created) {
  const old = doc.items.filter(i => flagOf(i)).map(i => i.id)
  if (t.items.length) created.push(...await doc.createEmbeddedDocuments('Item', t.items))
  if (old.length) await doc.deleteEmbeddedDocuments('Item', old)
  await doc.update(replaceUpdate(t.actor))
}

/**
 * choice: 'create' | 'new' | 'replace' | 'skip'. Never throws: a failure deletes what this runner created and returns
 * { actor: null, action: 'failed', error } so the caller reports it and carries on with the other runners.
 */
export async function applyRunner(t, choice, { portrait, exportedAt } = {}) {
  const runnerId = flagOf(t.actor).id
  if (choice === 'skip') return { actor: findExisting(runnerId), action: 'skip' }
  const created = []
  try {
    const actor = structuredClone(t.actor)
    if (portrait) actor.img = await uploadPortrait(portrait, runnerId, exportedAt ?? flagOf(t.actor).exportedAt)
    const root = await ensureFolder(FOLDER)
    const vFolder = t.vehicles.length ? await ensureFolder(`${t.actor.name} vehicles`, root) : null

    if (choice === 'replace') {
      const doc = findExisting(runnerId)
      if (!doc) throw new Error(`${t.actor.name}: nothing to replace`)
      const links = doc.system.linkedVehicles ?? []
      const linkedDoc = u => foundry.utils.fromUuidSync(u)
      const ours = []
      for (const v of t.vehicles) {
        const vf = flagOf(v.actor)
        const matches = game.actors.filter(a => flagOf(a)?.runner === vf.runner && flagOf(a)?.id === vf.id)
        const match = matches.find(a => links.includes(a.uuid)) ?? newest(matches)
        if (match) { await replaceDoc(match, v, created); ours.push(match.uuid) }
        else { const nv = await Actor.create({ ...v.actor, folder: vFolder.id, items: v.items }); created.push(nv); ours.push(nv.uuid) }
      }
      const kept = links.filter(u => !flagOf(linkedDoc(u)) && !ours.includes(u))
      actor.system.linkedVehicles = [...ours, ...kept]
      await replaceDoc(doc, { actor, items: t.items }, created)
      return { actor: doc, action: 'replace' }
    }

    const suffix = choice === 'new' ? n => newVersionName(n, flagOf(t.actor).exportedAt) : n => n
    const vUuids = []
    for (const v of t.vehicles) {
      const nv = await Actor.create({ ...v.actor, name: suffix(v.actor.name), folder: vFolder.id, items: v.items })
      created.push(nv); vUuids.push(nv.uuid)
    }
    actor.system.linkedVehicles = vUuids
    const doc = await Actor.create({ ...actor, name: suffix(actor.name), folder: root.id, items: t.items,
      prototypeToken: { actorLink: true, ...actor.img ? { texture: { src: actor.img } } : {} } })
    created.push(doc)
    return { actor: doc, action: choice === 'new' ? 'new' : 'create' }
  } catch (error) {
    // ponytail: rollback deletes created documents only; an update already applied to a replaced actor stays.
    for (const d of created.reverse()) { try { await d.delete() } catch {} }
    console.error(`${MODULE_ID} | ${t.actor.name}`, error)
    return { actor: null, action: 'failed', error }
  }
}
