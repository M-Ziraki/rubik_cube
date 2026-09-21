/**
 * Bilingual support.
 *
 * English is the source of truth: every key exists in `en`, and Persian falls
 * back to it when a string has not been translated yet. A missing translation
 * therefore shows readable English rather than a raw key, and
 * `npm run i18n:report` says exactly how much is covered instead of leaving it
 * to guesswork.
 *
 * Direction is handled at the document level - `dir="rtl"` on <html> - so the
 * whole layout mirrors rather than the text merely right-aligning. Technical
 * content that must stay left-to-right inside Persian prose (move notation,
 * sequences, formulae) is wrapped in `.mono-ltr`, which sets `direction: ltr`
 * and `unicode-bidi: isolate` so it reads correctly either way.
 */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react';
import { en } from './en';
import { fa } from './fa';

export type Lang = 'en' | 'fa';
export type TranslationKey = keyof typeof en;
export type Translate = (key: string, params?: Record<string, string | number>) => string;

const DICTS: Record<Lang, Partial<Record<string, string>>> = { en, fa };
const LANG_KEY = 'cube-atlas.lang.v1';

export const LANGUAGES: { id: Lang; label: string; dir: 'ltr' | 'rtl' }[] = [
  { id: 'en', label: 'English', dir: 'ltr' },
  { id: 'fa', label: 'فارسی', dir: 'rtl' },
];

export function dirOf(lang: Lang): 'ltr' | 'rtl' {
  return lang === 'fa' ? 'rtl' : 'ltr';
}

function readStoredLang(): Lang {
  try {
    const raw = localStorage.getItem(LANG_KEY);
    if (raw === 'en' || raw === 'fa') return raw;
  } catch { /* storage may be blocked */ }
  return 'en';
}

function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    (name in params ? String(params[name]) : whole));
}

interface I18nValue {
  lang: Lang;
  dir: 'ltr' | 'rtl';
  setLang: (lang: Lang) => void;
  t: Translate;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }): JSX.Element {
  const [lang, setLangState] = useState<Lang>(readStoredLang);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = dirOf(lang);
    root.dataset.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try { localStorage.setItem(LANG_KEY, next); } catch { /* storage may be blocked */ }
  }, []);

  const t = useCallback<Translate>((key, params) => {
    const dict = DICTS[lang];
    const value = dict[key] ?? en[key as TranslationKey] ?? key;
    return interpolate(value, params);
  }, [lang]);

  const value = useMemo(() => ({ lang, dir: dirOf(lang), setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}

/** Translate outside React, for code that has no hook available. */
export function translateWith(lang: Lang): Translate {
  return (key, params) => interpolate(DICTS[lang][key] ?? en[key as TranslationKey] ?? key, params);
}

/**
 * Runs of cube notation inside ordinary prose.
 *
 * Matched deliberately narrowly: a single bare letter like "R" needs no help,
 * because one strong left-to-right character is placed correctly by the bidi
 * algorithm on its own. What does need help is a *run* - `R U R' U'`, `L2 R2`,
 * `U D U' D'` - which right-to-left text would otherwise reorder into a
 * different algorithm. Those are wrapped and isolated.
 */
const NOTATION = /\b[URFDLBMESxyz](?:['’]|2)(?:\s+[URFDLBMESxyz](?:['’]|2)?)*|\b[URFDLBMESxyz](?:\s+[URFDLBMESxyz](?:['’]|2)?)+/g;

/**
 * A translated string, rendered with its cube notation kept left-to-right.
 *
 * Use this instead of bare `t()` anywhere the string is prose that might
 * contain a move sequence. `R U R' U'` then reads in that order inside a
 * Persian paragraph, and its meaning is unchanged by the language.
 */
export function T({ k, params, className }: {
  k: string; params?: Record<string, string | number>; className?: string;
}): JSX.Element {
  const { t } = useI18n();
  return <Notation text={t(k, params)} className={className} />;
}

/** The same isolation, for a string you already have in hand. */
export function Notation({ text, className }: { text: string; className?: string }): JSX.Element {
  const parts: ReactNode[] = [];
  let last = 0;
  NOTATION.lastIndex = 0;
  for (let m = NOTATION.exec(text); m; m = NOTATION.exec(text)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(<bdi className="mono-ltr" key={m.index}>{m[0]}</bdi>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <span className={className}>{parts}</span>;
}
