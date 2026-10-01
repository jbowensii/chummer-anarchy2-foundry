// Pins translateRunner's output so refactors (shared amp/item/vehicle mapping) keep runner imports identical.
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { translateRunner } from '../scripts/lib/translate.js'

test('translateRunner output is unchanged for the sample runners', () => {
  const file = JSON.parse(readFileSync('samples/test-export.json', 'utf8'))
  const want = JSON.parse(readFileSync('test/fixtures/runner-translation.json', 'utf8'))
  const got = file.runners.map(r => translateRunner(r, { exportedAt: file.exportedAt, appVersion: file.app.version }))
  expect(JSON.parse(JSON.stringify(got))).toEqual(want)
})

test('book-only amp fields (mod, printedRating) change nothing on a runner', () => {
  const file = JSON.parse(readFileSync('samples/test-export.json', 'utf8'))
  const opts = { exportedAt: file.exportedAt, appVersion: file.app.version }
  const r = structuredClone(file.runners[0])
  for (const a of r.amps) Object.assign(a, { mod: true, printedRating: (a.rating ?? 0) + 5 })
  expect(translateRunner(r, opts)).toEqual(translateRunner(file.runners[0], opts))
})
