// Deterministic Foundry document ids from Chummer ids, so a re-import replaces the same document (and links keep working).
const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

// cyrb53: a fast 53-bit string hash (public domain, bryc).
function cyrb53(str, seed) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return BigInt(4294967296 * (2097151 & h2) + (h1 >>> 0))
}

// 16 base62 chars (~95 bits) from two seeded 53-bit hashes.
export function docId(chummerId) {
  const s = String(chummerId)
  let n = (cyrb53(s, 1) << 53n) | cyrb53(s, 2), out = ''
  for (let i = 0; i < 16; i++) { out += B62[Number(n % 62n)]; n /= 62n }
  return out
}
