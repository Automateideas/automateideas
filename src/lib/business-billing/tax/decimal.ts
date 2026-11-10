// Exact decimal helpers for money. Amounts are whole paise (safe integers);
// rates and quantities are decimal strings turned into scaled BigInts, so no
// step ever goes through floating point.

/** "18.5" at scale 4 → BigInt(185000). Returns null for anything that isn't a plain non-negative decimal. */
export function toScaled(value: string, scale: number): bigint | null {
  const m = /^(\d{1,15})(?:\.(\d+))?$/.exec(value.trim());
  if (!m) return null;
  const frac = m[2] ?? "";
  if (frac.length > scale) return null;
  return BigInt(m[1]) * BigInt(10) ** BigInt(scale) + BigInt(frac.padEnd(scale, "0") || "0");
}

/** round(a × b ÷ d), halves rounded away from zero. d must be positive. */
export function mulDivRound(a: bigint, b: bigint, d: bigint): bigint {
  const n = a * b;
  const q = n / d;
  const r = n % d;
  const twice = (r < BigInt(0) ? -r : r) * BigInt(2);
  if (twice >= d) return n < BigInt(0) ? q - BigInt(1) : q + BigInt(1);
  return q;
}

/** BigInt paise back to a number, checking it stays a safe integer. */
export function toPaise(v: bigint): number {
  if (v > BigInt(Number.MAX_SAFE_INTEGER) || v < -BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("Amount out of range.");
  return Number(v);
}

/**
 * Splits `total` into parts proportional to `weights`, summing exactly to
 * `total` (largest remainder; ties go to the earlier part).
 */
export function allocate(total: bigint, weights: bigint[]): bigint[] {
  const sum = weights.reduce((a, b) => a + b, BigInt(0));
  if (sum === BigInt(0) || total === BigInt(0)) return weights.map(() => BigInt(0));
  const parts = weights.map((w) => (total * w) / sum);
  let left = total - parts.reduce((a, b) => a + b, BigInt(0));
  const order = weights
    .map((w, i) => ({ i, rem: (total * w) % sum }))
    .sort((a, b) => (a.rem === b.rem ? a.i - b.i : a.rem > b.rem ? -1 : 1));
  for (const { i } of order) {
    if (left === BigInt(0)) break;
    if (weights[i] === BigInt(0)) continue;
    parts[i] += BigInt(1);
    left -= BigInt(1);
  }
  return parts;
}
