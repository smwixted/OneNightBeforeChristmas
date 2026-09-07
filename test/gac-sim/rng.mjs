// Seeded PRNG (mulberry32) so every simulated game is reproducible from a
// single integer seed -- when a simulated game finds a real discrepancy, the
// seed is enough to replay it exactly, byte for byte, later.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// Picks n distinct elements (order of picking matters for reproducibility,
// so this is a partial Fisher-Yates, not a sort-by-random-key).
export function pickN(rng, arr, n) {
  const pool = arr.slice();
  const out = [];
  while (out.length < n && pool.length) {
    const i = Math.floor(rng() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

export function chance(rng, p) {
  return rng() < p;
}
