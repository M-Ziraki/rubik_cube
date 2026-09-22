/**
 * One input: go anywhere, do anything, or say what you are stuck on.
 *
 * There were three. This one, which navigated; a command box in the study
 * panel, which carried out instructions; and a box for describing a
 * difficulty, which routed to an activity. Three inputs that take a sentence
 * and do different things with it is not three features, it is a guessing
 * game about which box to type in.
 *
 * The order of resolution is the important part, and it is deterministic
 * first: a substring match against translated names and aliases costs
 * nothing, cannot be wrong, and works with no key. Only when nothing matches
 * does the model get asked - and it is asked by itself, after a pause in
 * typing, rather than behind a button. A button to ask is a question about
 * the tool ("should I press this?") standing in front of the question the
 * person actually has, and it also asks them to predict whether the model
 * will be any use, which they cannot do until they have seen the answer.
 *
 * Whatever comes back is put in the same list as everything else, named for
 * exactly what it would do, and picked with the same arrow keys. So a
 * judgment never acts by itself, and there is one way to choose a result
 * rather than one way for names and another for sentences.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Sheet } from './Sheet';
import { JevFailure } from './JevBadge';
import { useI18n } from '../i18n/I18nProvider';
import { ROUTES, go } from '../state/navigation';
import { getSession, session, useSession } from '../state/session';
import { LESSONS } from '../lessons/registry';
import { useAppState } from '../state/store';
import { useAssistantContextValue } from '../jev/assistantContext';
import { useJevTask } from '../jev/useJevTask';
import { jevActive, useJevConfig } from '../jev/config';
import { learnerSignals } from '../jev/signals';
import { eligibleActivities, ruleBasedCommand } from '../jev/decisions';
import { ACTIVITIES } from '../jev/questions';
import {
  MUTATING_ACTIONS,
  type CommandAction, type CommandDecision, type DecisionSource, type StuckDecision,
} from '../jev/protocol';

/**
 * How long the input has to be still before the model is asked.
 *
 * Long enough that finishing a sentence does not fire a request per word,
 * short enough that a person who has stopped typing is not left wondering
 * whether anything is going to happen.
 */
const ASK_AFTER_MS = 900;

/** The shortest text worth sending anywhere. */
const MIN_ASK_CHARS = 3;

interface Entry {
  id: string;
  /** i18n'd heading this row sits under. */
  group: string;
  label: string;
  hint: string;
  /** Extra search terms, including names this destination used to have. */
  alias?: string;
  /** Present on a row the model proposed, for the mark and the confidence. */
  jev?: { source: DecisionSource; confidence?: number };
  /** True when choosing this row would change the cube, so it asks first. */
  mutates?: boolean;
  /** Test hook, so a browser check can name the kind of row it found. */
  probe?: string;
  run: () => void;
}

export function CommandPalette(): JSX.Element | null {
  const { t, lang } = useI18n();
  const open = useSession((s) => s.paletteOpen);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const state = useAppState((s) => s);
  const ctx = useAssistantContextValue();
  const config = useJevConfig();
  const command = useJevTask<CommandDecision>();
  const stuck = useJevTask<StuckDecision>();
  /** The text the model has already been asked about, so it is asked once. */
  const [askedFor, setAskedFor] = useState('');
  const [pending, setPending] = useState<CommandAction | null>(null);

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

  useEffect(() => {
    if (!open) return;
    setQuery(''); setActive(0); setAskedFor(''); setPending(null);
    command.cancel(); stuck.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const text = query.trim();

  /* --------------------------------------------- what matches for certain --- */

  const entries = useMemo<Entry[]>(() => {
    const goTo = t('palette.group.goTo');
    const out: Entry[] = ROUTES.map((r) => ({
      id: `go-${r.id}`,
      group: goTo,
      label: t(r.labelKey),
      hint: t(r.blurbKey),
      alias: r.aliasKey ? t(r.aliasKey) : undefined,
      run: () => go(`#/${r.id}`),
    }));
    /*
     * The tabs, by name. Several of these used to be pages, and somebody who
     * types "solvers" should still land on the solvers rather than being told
     * there is no such thing - that is the whole bargain of folding nine
     * destinations into five.
     */
    for (const route of ROUTES) {
      for (const tab of route.tabs ?? []) {
        out.push({
          id: `tab-${route.id}-${tab.id}`,
          group: goTo,
          label: t(tab.labelKey),
          hint: t(route.labelKey),
          alias: tab.aliasKey ? t(tab.aliasKey) : undefined,
          run: () => go(`#/${route.id}/${tab.id}`),
        });
      }
    }
    for (const lesson of LESSONS) {
      out.push({
        id: `lesson-${lesson.id}`,
        group: t('palette.group.lessons'),
        label: t(`lesson.${lesson.id}.title`),
        hint: t('palette.lessonHint'),
        run: () => go(`#/learn/${lesson.id}`),
      });
    }
    /*
     * What the page under the palette can do. These used to be reachable only
     * from the study panel, which meant the one input that took a sentence
     * could not do the things the page was already offering.
     */
    for (const action of ctx.actions) {
      out.push({
        id: `page-${action.id}`,
        group: t('palette.group.onThisPage'),
        label: t(action.labelKey),
        hint: t(action.noteKey),
        run: action.run,
      });
    }
    out.push({
      id: 'open-assistant',
      group: t('palette.group.onThisPage'),
      label: t('assist.open'),
      hint: t('assist.shortcut'),
      run: () => session.setAssistantOpen(true),
    });
    out.push({
      id: 'show-welcome',
      group: t('palette.group.onThisPage'),
      label: t('welcome.reopen'),
      hint: t('welcome.reopenHint'),
      run: () => { session.showWelcome(); go('#/cube'); },
    });
    return out;
  }, [t, ctx]);

  const matches = useMemo(() => {
    const q = text.toLowerCase();
    if (!q) return entries.slice(0, 9);
    return entries
      .filter((e) => `${e.label} ${e.hint} ${e.alias ?? ''}`.toLowerCase().includes(q))
      .slice(0, 12);
  }, [entries, text]);

  /* ------------------------------------------------- what the model added --- */

  const signals = learnerSignals(state);
  const candidates = eligibleActivities(signals, state.progress.lessonsDone);
  const canAsk = jevActive(config) && text.length >= MIN_ASK_CHARS;
  const unmatched = matches.length === 0 && text.length >= MIN_ASK_CHARS;

  /*
   * A keyword route, which needs no key and no network. It is deterministic,
   * so it is offered as soon as nothing else matches rather than waiting for
   * the pause, and it is what the no-key path has instead of an apology.
   */
  const ruleAction = unmatched ? ruleBasedCommand(text, lang) : 'none';

  const suggestions = useMemo<Entry[]>(() => {
    if (!unmatched) return [];
    const out: Entry[] = [];
    const heading = t('palette.group.jev');
    const doRow = (action: CommandAction, jev?: Entry['jev']): Entry => ({
      id: `do-${action}`,
      group: heading,
      label: t(`jev.action.${action}`),
      hint: t('palette.doHint'),
      jev,
      mutates: MUTATING_ACTIONS.includes(action),
      probe: 'do',
      run: () => {
        // A judgment may carry you somewhere; it may not turn the cube
        // without being asked a second time.
        if (MUTATING_ACTIONS.includes(action)) { setPending(action); return; }
        ctx.commandSink?.(action);
        session.setPaletteOpen(false);
      },
    });

    const decided = command.decision;
    const action = decided && decided.action !== 'none' ? decided.action : ruleAction;
    if (action !== 'none' && ctx.commandSink) {
      out.push(doRow(action, decided && decided.action !== 'none'
        ? { source: decided.source, confidence: decided.confidence }
        : { source: 'deterministic' }));
    }

    const answer = stuck.decision;
    const activity = answer?.activity
      ? ACTIVITIES.find((a) => a.id === answer.activity) ?? null
      : null;
    if (activity) {
      out.push({
        id: `activity-${activity.id}`,
        group: heading,
        label: t(`jev.activity.${activity.id}`),
        hint: t(`jev.activity.${activity.id}.why`),
        jev: { source: answer!.source, confidence: answer!.confidence },
        probe: 'go',
        run: () => { session.setPaletteOpen(false); go(activity.route); },
      });
    }
    return out;
  }, [unmatched, command.decision, stuck.decision, ruleAction, ctx, t]);

  /** Everything arrowable, deterministic rows first. */
  const rows = useMemo(() => [...matches, ...suggestions], [matches, suggestions]);

  /*
   * Ask, once, when the typing has stopped and nothing certain matched. The
   * two tasks are independent questions about the same sentence, so they go
   * together rather than one after the other; the command one is skipped
   * where there is no cube to act on.
   */
  useEffect(() => {
    if (!open || !canAsk || !unmatched) return;
    if (askedFor === text) return;
    const timer = setTimeout(() => {
      setAskedFor(text);
      if (ctx.commandSink) void command.run({ task: 'command', utterance: text, language: lang });
      void stuck.run({ task: 'stuck', description: text, candidates, signals, language: lang });
    }, ASK_AFTER_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, canAsk, unmatched, text, askedFor]);

  useEffect(() => {
    setActive(0);
    setPending(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Keep the highlighted row on screen as the arrows move it.
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, rows.length]);

  if (!open) return null;

  const choose = (entry: Entry | undefined): void => {
    if (!entry) return;
    // A row that needs confirming keeps the palette open and says so; every
    // other row closes it and does its thing.
    if (entry.mutates) { entry.run(); return; }
    session.setPaletteOpen(false);
    entry.run();
  };

  const thinking = command.phase === 'thinking' || stuck.phase === 'thinking';
  const failure = [command, stuck].find((k) => k.phase === 'failed' && k.error !== 'disabled');
  const answered = askedFor === text && !thinking;
  /** True once there is nothing further coming and nothing to show. */
  const exhausted = unmatched && suggestions.length === 0
    && (!canAsk || (answered && !failure));

  let last = '';
  return (
    <Sheet
      open={open}
      onClose={() => session.setPaletteOpen(false)}
      label={t('palette.title')}
      side="centre"
      className="palette"
    >
      <div className="palette-field">
        <span className="palette-glyph" aria-hidden="true">
          <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="7" cy="7" r="4.4" /><path d="M10.4 10.4 14 14" strokeLinecap="round" />
          </svg>
        </span>
        <input
          type="text"
          className="palette-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('palette.placeholder')}
          aria-label={t('palette.title')}
          aria-controls="palette-list"
          aria-activedescendant={rows[active] ? `palette-${rows[active].id}` : undefined}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(rows.length - 1, i + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
            else if (e.key === 'Enter') { e.preventDefault(); choose(rows[active]); }
          }}
        />
        {query ? (
          <button
            className="palette-clear" onClick={() => setQuery('')}
            aria-label={t('palette.clear')}
          >
            ×
          </button>
        ) : null}
      </div>

      {pending ? (
        <div className="palette-confirm" data-palette="pending">
          <span>{t('assist.command.confirm', { action: t(`jev.action.${pending}`) })}</span>
          <div className="row tight">
            <button
              className="btn primary small" data-palette="confirm"
              onClick={() => {
                ctx.commandSink?.(pending);
                setPending(null);
                session.setPaletteOpen(false);
              }}
            >
              {t('assist.command.doIt')}
            </button>
            <button className="btn small" onClick={() => setPending(null)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      ) : null}

      <ul className="palette-list" id="palette-list" role="listbox" ref={listRef}>
        {rows.map((e, i) => {
          const heading = e.group !== last ? e.group : null;
          last = e.group;
          return (
            <li key={e.id} className="palette-slot">
              {heading ? <p className="palette-group" role="presentation">{heading}</p> : null}
              <div
                id={`palette-${e.id}`}
                role="option"
                aria-selected={i === active}
                className={`palette-row${i === active ? ' active' : ''}`}
                data-palette={e.probe}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(e)}
              >
                <span className="palette-label">
                  {e.jev ? (
                    <span className="palette-mark" aria-hidden="true">
                      {e.jev.source === 'deterministic' ? '∑' : '◇'}
                    </span>
                  ) : null}
                  {e.label}
                </span>
                <span className="card-note">{e.hint}</span>
                {e.jev && e.jev.source !== 'deterministic' && e.jev.confidence !== undefined ? (
                  <bdi className="palette-conf mono-ltr">{Math.round(e.jev.confidence * 100)}%</bdi>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {/*
        * The one place the model's state is visible. It is a line of status,
        * not a control: there is nothing here to press, and nothing waits on
        * being pressed.
        */}
      <div className="palette-state" aria-live="polite" data-palette={unmatched ? 'ask' : undefined}>
        {thinking ? (
          <p className="palette-note working">
            <span className="palette-mark" aria-hidden="true">◇</span>
            {t('palette.reading')}
          </p>
        ) : null}
        {!thinking && failure ? <JevFailure code={failure.error ?? 'server'} /> : null}
        {!thinking && !failure && unmatched && canAsk && !answered && suggestions.length === 0 ? (
          <p className="palette-note">{t('palette.willRead')}</p>
        ) : null}
        {!thinking && stuck.decision?.needsDetail && !suggestions.length ? (
          <p className="palette-note" data-palette="detail">{t('assist.stuck.moreDetail')}</p>
        ) : exhausted ? (
          <p className="palette-note" data-palette={canAsk ? 'none' : 'nokey'}>
            {t('palette.noMatch')}
            {' '}
            {canAsk ? t('palette.jevNoMatch') : t('palette.noMatchOffline')}
          </p>
        ) : null}
      </div>

      <footer className="palette-foot card-note">{t('palette.keys')}</footer>
    </Sheet>
  );
}
