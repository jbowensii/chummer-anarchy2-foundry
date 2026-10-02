// "Apply icons": point imported documents at the best shipped icon again (lib/icons.js iconFor), replacing only images
// that are empty, a stock default or the module's own art (replaceable). Foundry globals only inside functions.
import { MODULE_ID } from '../lib/constants.js'
import { iconFor, replaceable } from '../lib/icons.js'

export const INDEX = `modules/${MODULE_ID}/icons/index.json`

// icons/index.json, or null (logged) when it can't be read: the importer then sets no images.
export async function loadIconIndex() {
  try {
    const res = await fetch(INDEX)
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    const list = await res.json()
    if (!Array.isArray(list)) throw new Error('not a list')
    return list
  } catch (e) {
    console.error(`${MODULE_ID} | ${INDEX} could not be read; imports get no icons`, e)
    return null
  }
}

// The update writes for these items and actors: a vehicle's own img, every actor's embedded items. Character
// actors' img and tokens are never touched (portraits come later).
function writesFor(items, actors, change, op) {
  const writes = []
  const itemUps = items.map(change).filter(Boolean)
  if (itemUps.length) writes.push(() => Item.updateDocuments(itemUps, op))
  const actorUps = actors.filter(a => a.type === 'vehicle').map(change).filter(Boolean)
  if (actorUps.length) writes.push(() => Actor.updateDocuments(actorUps, op))
  for (const a of actors) {
    const ups = a.items.map(change).filter(Boolean)
    if (ups.length) writes.push(() => a.updateEmbeddedDocuments('Item', ups))
  }
  return writes
}

/**
 * Re-apply icons to every document with flags.icon. Defaults: world items, world actors, and the module's world
 * compendiums (world.ca2-…, unlocked for the write and locked again). The Quench tests pass their own lists.
 * Returns { updated, kept (an image the user chose), unchanged }.
 */
export async function applyIcons({ index, items = game.items.contents, actors = game.actors.contents,
  packs = game.packs.filter(p => p.collection.startsWith('world.ca2-')) } = {}) {
  const has = new Set(index ?? []), counts = { updated: 0, kept: 0, unchanged: 0 }
  const change = d => {
    const f = d.flags?.[MODULE_ID]?.icon
    if (!f) return null
    if (!replaceable(d.img)) { counts.kept++; return null }
    const img = iconFor(f.key, f.name, f.book, has)
    if (!img || img === d.img) { counts.unchanged++; return null }
    counts.updated++
    return { _id: d.id, img }
  }
  for (const w of writesFor(items, actors, change)) await w()
  for (const pack of packs) {
    if (pack.documentName !== 'Item' && pack.documentName !== 'Actor') continue
    const docs = await pack.getDocuments()
    const writes = pack.documentName === 'Item' ? writesFor(docs, [], change, { pack: pack.collection })
      : writesFor([], docs, change, { pack: pack.collection })
    if (!writes.length) continue
    // V14 refuses writes to a locked pack (as books.js writePack)
    const locked = pack.locked
    if (locked) await pack.configure({ locked: false })
    try { for (const w of writes) await w() } finally { if (locked) await pack.configure({ locked: true }) }
  }
  return counts
}

// The settings menu window: an explanation, one button, the result. getIndex() -> the loaded index or null.
export function createIconsApp(getIndex) {
  const { ApplicationV2 } = foundry.applications.api
  const L = k => game.i18n.localize(k), F = (k, d) => game.i18n.format(k, d)
  return class ApplyIconsApp extends ApplicationV2 {
    static DEFAULT_OPTIONS = {
      id: 'ca2i-apply-icons',
      classes: ['ca2i-app'],
      window: { title: 'CA2I.Icons.Title', icon: 'fas fa-image' },
      position: { width: 440, height: 'auto' },
      actions: { apply: ApplyIconsApp.#onApply },
    }
    busy = false; result = ''

    async _renderHTML() {
      const el = (tag, text, cls) => { const e = document.createElement(tag); e.textContent = text; if (cls) e.className = cls; return e }
      const root = el('div', '', 'ca2i')
      const button = el('button', L('CA2I.Icons.Button'))
      Object.assign(button, { type: 'button', disabled: this.busy })
      button.dataset.action = 'apply'
      root.append(el('p', L('CA2I.Icons.Explain')), button)
      if (this.result) root.append(el('p', this.result, 'ca2i-report'))
      return root
    }
    _replaceHTML(result, content) { content.replaceChildren(result) }

    static async #onApply() {
      if (this.busy || !game.user.isGM) return
      const index = getIndex()
      if (!index) { this.result = L('CA2I.Icons.NoIndex'); return this.render() }
      this.busy = true; this.result = L('CA2I.Icons.Working'); this.render()
      try { this.result = F('CA2I.Icons.Done', await applyIcons({ index })) } catch (e) {
        console.error(`${MODULE_ID} | Apply icons`, e)
        this.result = F('CA2I.Failed', { reason: e?.message ?? String(e) })
      }
      this.busy = false
      this.render()
    }
  }
}
