#!/usr/bin/env node
/**
 * Guards against filenames that only differ in case.
 *
 * Linux filesystems are case-sensitive, so `stickerMap.ts` and `StickerMap.tsx`
 * are two different modules and everything compiles. On macOS and Windows they
 * are the same file, and TypeScript refuses to build with TS1149/TS1261. The
 * bug is therefore invisible on the machine that introduces it, which is
 * exactly the kind of thing that belongs in a check rather than in a reviewer's
 * memory.
 *
 * Two names collide if, within one directory, they are equal once lowercased -
 * both with and without their extension, since an import specifier normally
 * omits it.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SKIP = new Set(['node_modules', 'dist', '.git', '.vite']);
const CODE = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css']);

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else files.push(full);
  }
})(ROOT);

const clashes = [];
const seenExact = new Map();
const seenStem = new Map();

for (const full of files) {
  const rel = relative(ROOT, full);
  const dir = dirname(rel);
  const ext = extname(rel);

  const exact = `${dir}/${basename(rel).toLowerCase()}`;
  if (seenExact.has(exact) && seenExact.get(exact) !== rel) {
    clashes.push([seenExact.get(exact), rel, 'identical once lowercased']);
  } else {
    seenExact.set(exact, rel);
  }

  // Only code files are reachable by an extension-less import specifier.
  if (!CODE.has(ext)) continue;
  const stem = `${dir}/${basename(rel, ext).toLowerCase()}`;
  const prev = seenStem.get(stem);
  if (prev && prev !== rel && basename(prev, extname(prev)) !== basename(rel, ext)) {
    clashes.push([prev, rel, 'same import specifier on a case-insensitive filesystem']);
  } else if (!prev) {
    seenStem.set(stem, rel);
  }
}

/**
 * The mirror-image bug: an import written with different casing from the file
 * it names. That resolves happily on macOS and Windows and fails on Linux, so
 * it is just as invisible - only to the other half of the world.
 */
const EXTS = ['', '.ts', '.tsx', '.js', '.jsx', '.json', '.css'];
const badImports = [];
const SPEC = /(?:from|import)\s*\(?\s*['"](\.[^'"]*)['"]/g;

for (const full of files) {
  const ext = extname(full);
  if (!['.ts', '.tsx', '.mjs'].includes(ext)) continue;
  const src = readFileSync(full, 'utf8');
  for (const m of src.matchAll(SPEC)) {
    const spec = m[1];
    const base = resolve(dirname(full), spec);
    const hit = EXTS.map((e) => base + e).find((c) => existsSync(c) && statSync(c).isFile())
      ?? EXTS.map((e) => join(base, `index${e}`)).find((c) => existsSync(c) && statSync(c).isFile());
    if (!hit) badImports.push([relative(ROOT, full), spec, 'does not resolve']);
  }
}

if (badImports.length) {
  console.error('Imports that do not resolve with the casing written:\n');
  for (const [file, spec, why] of badImports) console.error(`  ${file}: '${spec}' -> ${why}`);
  process.exit(1);
}

if (clashes.length) {
  console.error('Filenames that differ only in case:\n');
  for (const [a, b, why] of clashes) console.error(`  ${a}\n  ${b}\n    -> ${why}\n`);
  console.error('Rename one of each pair. These build on Linux and fail on macOS and Windows.');
  process.exit(1);
}
console.log(`filename casing: ${files.length} files, no collisions, every relative import resolves`);
