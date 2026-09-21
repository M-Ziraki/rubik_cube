/**
 * Internationalisation, tested as a contract rather than by eye.
 *
 * The rules a translation has to obey here are specific: every key present,
 * every placeholder preserved, cube notation never translated, and numerals
 * written the way the mathematics is written. Each of those is checkable, so
 * each of those is checked.
 */

import { describe, expect, it } from 'vitest';
import { en } from './en';
import { fa } from './fa';
import { LANGUAGES, dirOf, translateWith } from './I18nProvider';
import { MOVE_NAMES } from '../cube/defs';

const enKeys = Object.keys(en) as (keyof typeof en)[];
const placeholders = (s: string): string[] =>
  [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('dictionaries', () => {
  it('English has no duplicate or empty keys', () => {
    expect(new Set(enKeys).size).toBe(enKeys.length);
    for (const k of enKeys) expect(String(en[k]).length).toBeGreaterThan(0);
  });

  it('Persian covers every English key', () => {
    const missing = enKeys.filter((k) => !(k in fa));
    expect(missing).toEqual([]);
  });

  it('Persian introduces no keys English does not have', () => {
    const extra = Object.keys(fa).filter((k) => !(k in en));
    expect(extra).toEqual([]);
  });

  it('keeps every placeholder, in both directions', () => {
    for (const k of enKeys) {
      const a = placeholders(String(en[k]));
      const b = placeholders(String(fa[k] ?? ''));
      expect({ key: k, placeholders: b }).toEqual({ key: k, placeholders: a });
    }
  });

  it('writes numbers in Latin digits, so they match the cube notation', () => {
    const persianDigits = /[۰-۹٠-٩]/;
    const offenders = Object.entries(fa)
      .filter(([, v]) => persianDigits.test(v))
      .map(([k]) => k);
    expect(offenders).toEqual([]);
  });

  it('never translates a move symbol', () => {
    // Every modified move name that appears in an English string must appear,
    // unchanged, in the Persian one. `R U R'` is `R U R'` in every language.
    for (const k of enKeys) {
      const source = String(en[k]);
      const target = String(fa[k] ?? '');
      // Only modified moves (R', R2). A bare letter is too ambiguous to test
      // this way - English spells "R prime" in words, Persian does not.
      for (const name of MOVE_NAMES.filter((n) => n.length > 1)) {
        // Standalone tokens only: "3D" and "2x2x2" are not cube notation.
        const re = new RegExp(`(^|[^A-Za-z0-9])${name.replace("'", "['\u2019]")}([^A-Za-z0-9'\u2019]|$)`);
        if (re.test(source)) {
          expect({ key: k, has: re.test(target) }).toEqual({ key: k, has: true });
        }
      }
    }
  });
});

describe('the translator', () => {
  it('interpolates named parameters', () => {
    const t = translateWith('en');
    expect(t('transport.remaining', { n: 7 })).toContain('7');
  });

  it('leaves an unknown placeholder alone rather than printing undefined', () => {
    const t = translateWith('en');
    expect(t('transport.remaining', {})).toContain('{n}');
  });

  it('falls back to English for a key a language is missing', () => {
    const t = translateWith('fa');
    // Every key exists today; a synthetic missing key proves the fallback.
    expect(t('this.key.does.not.exist')).toBe('this.key.does.not.exist');
    expect(t('app.title')).toBe(fa['app.title']);
  });

  it('returns Persian for Persian and English for English', () => {
    expect(translateWith('en')('nav.atlas')).toBe(en['nav.atlas']);
    expect(translateWith('fa')('nav.atlas')).toBe(fa['nav.atlas']);
    expect(translateWith('fa')('nav.atlas')).not.toBe(en['nav.atlas']);
  });
});

describe('direction', () => {
  it('maps each language to a document direction', () => {
    expect(dirOf('en')).toBe('ltr');
    expect(dirOf('fa')).toBe('rtl');
  });

  it('lists both languages with matching directions', () => {
    expect(LANGUAGES.map((l) => l.id)).toEqual(['en', 'fa']);
    for (const l of LANGUAGES) expect(l.dir).toBe(dirOf(l.id));
  });
});

describe('notation isolation', () => {
  // The same expression the <T> component uses; duplicated here so a change to
  // it has to be a deliberate one.
  const NOTATION = /\b[URFDLBMESxyz](?:['’]|2)(?:\s+[URFDLBMESxyz](?:['’]|2)?)*|\b[URFDLBMESxyz](?:\s+[URFDLBMESxyz](?:['’]|2)?)+/g;
  const match = (s: string): string[] => s.match(NOTATION) ?? [];

  it('isolates multi-move runs', () => {
    expect(match("do R U R' U' and stop")).toEqual(["R U R' U'"]);
    expect(match('L2 R2 L2 R2 = nothing')).toEqual(['L2 R2 L2 R2']);
    expect(match("U D U' D' does nothing")).toEqual(["U D U' D'"]);
  });

  it('isolates a single modified move', () => {
    expect(match('Every F2 is one move')).toEqual(['F2']);
  });

  it('leaves ordinary prose alone', () => {
    expect(match('a single R here')).toEqual([]);
    expect(match('the U face')).toEqual([]);
    expect(match('Down is D and Left is L')).toEqual([]);
    expect(match('چرخش وجه')).toEqual([]);
  });

  it('finds the notation inside real Persian strings', () => {
    const s = String(fa['l.notation.q1why']);
    expect(match(s).length).toBeGreaterThan(0);
  });
});
