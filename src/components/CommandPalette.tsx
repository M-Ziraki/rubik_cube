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
 * does the model get asked, and then it is offered as a choice rather than
 * acted on - two rows, named for what they would do, that the learner picks.
 * So the fast path stays fast, the offline path stays complete, and the
 * model is a fallback rather than a toll gate.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Sheet } from './Sheet';
import { JevBadge, JevFailure, JevThinking } from './JevBadge';
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
  type CommandAction, type CommandDecision, type StuckDecision,
} from '../jev/protocol';

interface Entry {
  id: string;
  label: string;
  hint: string;
  /** Extra search terms, including names this destination used to have. */
  alias?: string;
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
  const [asked, setAsked] = useState<'command' | 'stuck' | null>(null);
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
    setQuery(''); setActive(0); setAsked(null); setPending(null);
    command.cancel(); stuck.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = ROUTES.map((r) => ({
      id: `go-${r.id}`,
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
        label: t(`lesson.${lesson.id}.title`),
        hint: t('palette.lessonHint'),
        run: () => go(`#/learn/${lesson.id}`),
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
      run: () => { session.showWelcome(); go('#/cube'); },
    });
    return out;
  }, [t]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries.slice(0, 9);
    return entries
      .filter((e) => `${e.label} ${e.hint} ${e.alias ?? ''}`.toLowerCase().includes(q))
      .slice(0, 12);
  }, [entries, query]);

  useEffect(() => {
    setActive(0);
    /*
     * A new query invalidates whatever the model said about the last one, so
     * the old answer is hidden. It does not cancel the run: the task runner
     * already discards a result whose token is stale, and cancelling here
     * raced with the click that started the next one - the request landed,
     * the answer was thrown away, and the panel sat empty.
     */
    setAsked(null);
    setPending(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  /*
   * The two model-backed offers, and they are offers: shown only when the
   * deterministic list is empty, named for exactly what they would do, and
   * never run without being chosen. "Do it on the cube" appears only where
   * there is a cube to act on.
   */
  const text = query.trim();
  const canAsk = jevActive(config) && text.length >= 3;
  const signals = learnerSignals(state);
  const candidates = eligibleActivities(signals, state.progress.lessonsDone);

  const runCommand = async (): Promise<void> => {
    setAsked('command');
    const fallback = ruleBasedCommand(text, lang);
    const decision = await command.run({ task: 'command', utterance: text, language: lang });
    const action = decision && decision.action !== 'none' ? decision.action : fallback;
    if (action === 'none') return;
    // Same rule as everywhere else: a judgment may navigate on its own and
    // may not turn the cube without being asked twice.
    if ((decision?.needsConfirmation ?? true) && MUTATING_ACTIONS.includes(action)) {
      setPending(action);
      return;
    }
    ctx.commandSink?.(action);
    session.setPaletteOpen(false);
  };

  const runStuck = async (): Promise<void> => {
    setAsked('stuck');
    await stuck.run({ task: 'stuck', description: text, candidates, signals, language: lang });
  };

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
        {!matches.length ? (
          <li className="palette-empty">
            {canAsk ? t('palette.noMatchAsk') : t('palette.noMatch')}
          </li>
        ) : null}
      </ul>

      {!matches.length && canAsk ? (
        <div className="palette-ask" data-palette="ask">
          {asked === null ? (
            <div className="row tight">
              {ctx.commandSink ? (
                <button className="btn small" data-palette="do" onClick={() => void runCommand()}>
                  {t('palette.doIt')}
                </button>
              ) : null}
              <button className="btn small" data-palette="stuck" onClick={() => void runStuck()}>
                {t('palette.findMe')}
              </button>
            </div>
          ) : null}

          <div aria-live="polite">
            {command.phase === 'thinking' || stuck.phase === 'thinking' ? <JevThinking /> : null}
            {command.phase === 'failed' && command.error !== 'disabled' ? (
              <JevFailure code={command.error ?? 'server'} />
            ) : null}
            {stuck.phase === 'failed' && stuck.error !== 'disabled' ? (
              <JevFailure code={stuck.error ?? 'server'} />
            ) : null}

            {pending ? (
              <div className="stack" style={{ gap: 6 }}>
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

            {asked === 'stuck' && stuck.decision ? <StuckAnswer decision={stuck.decision} /> : null}
          </div>
        </div>
      ) : null}

      <footer className="palette-foot card-note">{t('palette.keys')}</footer>
    </Sheet>
  );
}

/** Where a described difficulty led, in the three ways it can end. */
function StuckAnswer({ decision }: { decision: StuckDecision }): JSX.Element {
  const { t } = useI18n();
  const activity = decision.activity
    ? ACTIVITIES.find((a) => a.id === decision.activity) ?? null
    : null;
  if (!activity) {
    return (
      <p className="card-note" data-palette={decision.needsDetail ? 'detail' : 'none'}>
        {decision.needsDetail ? t('assist.stuck.moreDetail') : t('assist.stuck.noMatch')}
      </p>
    );
  }
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row tight">
        <JevBadge source={decision.source} confidence={decision.confidence} />
      </div>
      <strong>{t(`jev.activity.${activity.id}`)}</strong>
      <span className="card-note">{t(`jev.activity.${activity.id}.why`)}</span>
      <div className="row tight">
        <button
          className="btn primary small" data-palette="go"
          onClick={() => { session.setPaletteOpen(false); go(activity.route); }}
        >
          {t('jev.tutor.go')}
        </button>
      </div>
    </div>
  );
}
