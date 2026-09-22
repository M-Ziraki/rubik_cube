/**
 * Everything the application can do, reachable by typing part of its name.
 *
 * This exists for the experienced user. Navigation that is good for a
 * beginner - grouped, labelled, explained - is slow for someone who already
 * knows the place and wants to be in the solver now. Rather than compromise
 * the navigation, the fast path is a second, optional one.
 *
 * It is not a Jev feature and is careful not to look like one. Matching here
 * is a substring test against translated labels: entirely deterministic,
 * available with no key, and no slower than the keystroke. The assistant's
 * command box, which can interpret a sentence, is a different thing in a
 * different place, and the two are not dressed alike.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Sheet } from './Sheet';
import { useI18n } from '../i18n/I18nProvider';
import { ROUTES, go } from '../state/navigation';
import { getSession, session, useSession } from '../state/session';
import { LESSONS } from '../lessons/registry';

interface Entry {
  id: string;
  label: string;
  hint: string;
  run: () => void;
}

export function CommandPalette(): JSX.Element | null {
  const { t } = useI18n();
  const open = useSession((s) => s.paletteOpen);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        session.setPaletteOpen(!getSession().paletteOpen);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => { if (open) { setQuery(''); setActive(0); } }, [open]);

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = ROUTES.map((r) => ({
      id: `go-${r.id}`,
      label: t(r.labelKey),
      hint: t(r.blurbKey),
      run: () => go(`#/${r.id}`),
    }));
    for (const lesson of LESSONS) {
      out.push({
        id: `lesson-${lesson.id}`,
        label: t(`lesson.${lesson.id}.title`),
        hint: t('palette.lessonHint'),
        run: () => go(`#/course/${lesson.id}`),
      });
    }
    out.push({
      id: 'open-assistant',
      label: t('assist.open'),
      hint: t('assist.shortcut'),
      run: () => session.setAssistantOpen(true),
    });
    out.push({
      id: 'show-welcome',
      label: t('welcome.reopen'),
      hint: t('welcome.reopenHint'),
      run: () => { session.showWelcome(); go('#/atlas'); },
    });
    return out;
  }, [t]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries.slice(0, 9);
    return entries
      .filter((e) => `${e.label} ${e.hint}`.toLowerCase().includes(q))
      .slice(0, 12);
  }, [entries, query]);

  useEffect(() => { setActive(0); }, [query]);

  // Keep the highlighted row on screen as the arrows move it.
  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const choose = (entry: Entry | undefined): void => {
    if (!entry) return;
    session.setPaletteOpen(false);
    entry.run();
  };

  return (
    <Sheet
      open={open}
      onClose={() => session.setPaletteOpen(false)}
      label={t('palette.title')}
      side="centre"
      className="palette"
    >
      <input
        type="text"
        className="palette-input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('palette.placeholder')}
        aria-label={t('palette.title')}
        aria-controls="palette-list"
        aria-activedescendant={matches[active] ? `palette-${matches[active].id}` : undefined}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(matches.length - 1, i + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
          else if (e.key === 'Enter') { e.preventDefault(); choose(matches[active]); }
        }}
      />
      <ul className="palette-list" id="palette-list" role="listbox" ref={listRef}>
        {matches.map((e, i) => (
          <li
            key={e.id}
            id={`palette-${e.id}`}
            role="option"
            aria-selected={i === active}
            className={i === active ? 'active' : ''}
            onMouseEnter={() => setActive(i)}
            onClick={() => choose(e)}
          >
            <span className="palette-label">{e.label}</span>
            <span className="card-note">{e.hint}</span>
          </li>
        ))}
        {!matches.length ? <li className="palette-empty">{t('palette.noMatch')}</li> : null}
      </ul>
      <footer className="palette-foot card-note">{t('palette.keys')}</footer>
    </Sheet>
  );
}
