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
