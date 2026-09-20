/** Ranking and unranking helpers shared by every coordinate in the solver. */

const CNK: number[][] = (() => {
  const t: number[][] = [];
  for (let n = 0; n <= 16; n++) {
    t[n] = [];
    for (let k = 0; k <= 16; k++) {
      if (k === 0) t[n][k] = 1;
      else if (k > n) t[n][k] = 0;
      else t[n][k] = t[n - 1][k - 1] + t[n - 1][k];
    }
  }
  return t;
})();

export function Cnk(n: number, k: number): number {
  if (n < 0 || k < 0 || n > 16 || k > 16) return 0;
  return CNK[n][k];
}

export const FACTORIAL: number[] = (() => {
  const f = [1];
  for (let i = 1; i <= 12; i++) f[i] = f[i - 1] * i;
  return f;
})();

/** Lehmer rank of a permutation of 0..n-1. Identity ranks 0. */
export function permToIndex(p: ArrayLike<number>, n: number): number {
  let idx = 0;
  for (let i = 0; i < n; i++) {
    let c = 0;
    for (let j = i + 1; j < n; j++) if (p[j] < p[i]) c++;
    idx = idx * (n - i) + c;
  }
  return idx;
}

export function indexToPerm(idx: number, n: number, out?: Uint8Array): Uint8Array {
  const lehmer = new Uint8Array(n);
  for (let i = n - 1; i >= 0; i--) {
    const radix = n - i;
    lehmer[i] = idx % radix;
    idx = Math.floor(idx / radix);
  }
  const avail: number[] = [];
  for (let i = 0; i < n; i++) avail.push(i);
  const p = out ?? new Uint8Array(n);
  for (let i = 0; i < n; i++) p[i] = avail.splice(lehmer[i], 1)[0];
  return p;
}

/**
 * Rank an ordered choice of k slots out of n ("where did pieces t0..t(k-1)
 * end up"). Used by the partial-edge pattern databases.
 */
export function partialPermToIndex(loc: ArrayLike<number>, k: number, n: number): number {
  let idx = 0;
  for (let i = 0; i < k; i++) {
    let c = loc[i];
    for (let j = 0; j < i; j++) if (loc[j] < loc[i]) c--;
    idx = idx * (n - i) + c;
  }
  return idx;
}

export function indexToPartialPerm(idx: number, k: number, n: number, out: Uint8Array): Uint8Array {
  const digits = new Uint8Array(k);
  for (let i = k - 1; i >= 0; i--) {
    const radix = n - i;
    digits[i] = idx % radix;
    idx = Math.floor(idx / radix);
  }
  const avail: number[] = [];
  for (let i = 0; i < n; i++) avail.push(i);
  for (let i = 0; i < k; i++) out[i] = avail.splice(digits[i], 1)[0];
  return out;
}
