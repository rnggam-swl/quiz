/**
 * Deterministic PRNG so shuffles are reproducible from a stored seed:
 * a participant who reloads sees the same question/option order, and the
 * server can rebuild that order to map answers back (docs/04-question-types.md).
 */

/** mulberry32 — returns floats in [0, 1). */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Mix an attempt seed with a key (e.g. a question id) into an independent seed,
 * so every question in an attempt shuffles differently (FNV-1a over the key).
 */
export function deriveSeed(seed: number, key: string): number {
  let hash = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** Random 32-bit unsigned seed for a new attempt. */
export function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]!;
}

/** Fisher–Yates shuffle into a new array; the input is not mutated. */
export function shuffle<T>(items: readonly T[], seed: number): T[] {
  const out = items.slice();
  const random = createRandom(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Shuffle that never returns the original order (when that is possible),
 * e.g. for Sequencing where an unshuffled list would give the answer away.
 */
export function shuffleAvoidingIdentity<T>(items: readonly T[], seed: number): T[] {
  if (items.length < 2) return items.slice();
  let attempt = 0;
  let out = shuffle(items, seed);
  while (out.every((item, i) => item === items[i]) && attempt < 16) {
    attempt++;
    out = shuffle(items, seed + attempt);
  }
  if (out.every((item, i) => item === items[i])) {
    // Items are all identical values or we were unlucky 17 times: rotate by one.
    out = [...items.slice(1), items[0]!];
  }
  return out;
}

/** Pick `count` distinct items (a question pool draw). */
export function sample<T>(items: readonly T[], count: number, seed: number): T[] {
  return shuffle(items, seed).slice(0, Math.max(0, Math.min(count, items.length)));
}
