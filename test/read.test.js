import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, test } from 'vitest'
import { readExport } from '../scripts/lib/read.js'

const sample = readFileSync('samples/test-export.json', 'utf8')
describe('reading a Chummer file', () => {
  test('the sample is a valid v1 runners file', () => {
    const check = new Ajv2020({ strict: false, validateFormats: false }).compile(JSON.parse(readFileSync('schema/export.schema.json', 'utf8')))
    expect(check(JSON.parse(sample)), JSON.stringify(check.errors)).toBe(true)
  })
  test('reads it', () => {
    const r = readExport(sample)
    expect(r.ok && r.file.runners.map(x => x.streetName)).toEqual(['Made-Up Mara', 'Test Two'])
  })
  test.each([
    ['not JSON', 'nope', /isn’t a Chummer Anarchy export/],
    ['another format', JSON.stringify({ format: 'x', version: 1 }), /isn’t a Chummer Anarchy export/],
    ['a newer version', JSON.stringify({ format: 'chummer-anarchy2-export', version: 2, kind: 'runners' }), /version 2.*update this module/],
    ['book data', JSON.stringify({ format: 'chummer-anarchy2-export', version: 1, kind: 'books', books: [] }), /Book data import comes in a later version/],
    ['a runner with null attributes', JSON.stringify({ format: 'chummer-anarchy2-export', version: 1, kind: 'runners', runners: [{ id: 'a', streetName: 'A', attributes: null }] }), /damaged/],
    ['a runner with array attributes', JSON.stringify({ format: 'chummer-anarchy2-export', version: 1, kind: 'runners', runners: [{ id: 'a', streetName: 'A', attributes: [] }] }), /damaged/],
    ['a runner with null attributes', JSON.stringify({ format: 'chummer-anarchy2-export', version: 1, kind: 'runners', runners: [{ id: 'a', streetName: 'A', attributes: null }] }), /damaged/],
    ['a runner with array attributes', JSON.stringify({ format: 'chummer-anarchy2-export', version: 1, kind: 'runners', runners: [{ id: 'a', streetName: 'A', attributes: [] }] }), /damaged/],
    ['no runners', JSON.stringify({ format: 'chummer-anarchy2-export', version: 1, kind: 'runners' }), /no runners/],
  ])('refuses %s', (_, text, reason) => {
    const r = readExport(text)
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(reason)
  })
})
