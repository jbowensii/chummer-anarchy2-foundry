import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { docId } from '../scripts/lib/ids.js'

test('docId: 16 chars of [A-Za-z0-9], the same for the same input', () => {
  expect(docId('muc.made-up-blade')).toMatch(/^[A-Za-z0-9]{16}$/)
  expect(docId('muc.made-up-blade')).toBe(docId('muc.made-up-blade'))
  expect(docId('')).toMatch(/^[A-Za-z0-9]{16}$/)
  expect(docId('a')).not.toBe(docId('b'))
})

test('docId: no collisions over the sample ids and 10,000 random strings', () => {
  const ids = new Set()
  JSON.stringify(JSON.parse(readFileSync('samples/test-books.json', 'utf8')), (k, v) => { if (k === 'id' && typeof v === 'string') ids.add(v); return v })
  expect(ids.size).toBeGreaterThan(10)
  let seed = 1
  const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296  // 32-bit LCG, reproducible
  while (ids.size < 10000 + 20) ids.add(Array.from({ length: 1 + Math.floor(rnd() * 30) }, () => String.fromCharCode(32 + Math.floor(rnd() * 95))).join(''))
  expect(new Set([...ids].map(docId)).size).toBe(ids.size)
})
