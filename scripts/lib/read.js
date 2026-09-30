// A Chummer Anarchy export file (chummer-anarchy2 docs/export-format.md): checked before anything in the world changes.
import { FORMAT, VERSION } from './constants.js'

const NOT_OURS = 'This file isn’t a Chummer Anarchy export.'
export function readExport(text) {
  let file
  try { file = JSON.parse(text) } catch { return { ok: false, reason: NOT_OURS } }
  if (!file || typeof file !== 'object' || file.format !== FORMAT) return { ok: false, reason: NOT_OURS }
  if (file.version !== VERSION) return { ok: false, reason: `This file is export format version ${file.version}; this module reads version ${VERSION}. Please update this module.` }
  if (file.kind === 'books') {
    if (!Array.isArray(file.books) || !file.books.length) return { ok: false, reason: 'This file has no books in it.' }
    for (const b of file.books)
      if (!b?.source || typeof b.source.id !== 'string' || typeof b.source.name !== 'string')
        return { ok: false, reason: 'This file is damaged: a book is missing its id or name.' }
    return { ok: true, file }
  }
  if (file.kind !== 'runners' || !Array.isArray(file.runners) || !file.runners.length) return { ok: false, reason: 'This file has no runners in it.' }
  for (const r of file.runners)
    if (!r || typeof r.id !== 'string' || typeof r.streetName !== 'string' || !r.attributes || typeof r.attributes !== 'object' || Array.isArray(r.attributes))
      return { ok: false, reason: 'This file is damaged: a runner is missing its id, name or attributes.' }
  return { ok: true, file }
}
