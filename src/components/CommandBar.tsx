/**
 * A line you can type an intention into.
 *
 * Not a chatbot: there is no conversation, nothing is generated, and the set
 * of things it can do is a fixed list the learner can read. It maps a sentence
 * onto one of those actions and then gets out of the way.
 *
 * Anything that would turn a face asks first unless the routing was confident
 * *and* the sentence was judged unambiguous. Guessing wrong about "show me the
 * graph" costs a page load; guessing wrong about "scramble it" destroys work
 * the learner was in the middle of.
 */

import { useRef, useState } from 'react';
import { Card } from './ui';
import { JevBadge, JevFailure, JevThinking } from './JevBadge';
import { useI18n } from '../i18n/I18nProvider';
import { useJevTask } from '../jev/useJevTask';
import { ruleBasedCommand } from '../jev/decisions';
import { COMMAND_ROUTES } from '../jev/content';
import {
  COMMAND_ACTIONS, MUTATING_ACTIONS, type CommandAction, type CommandDecision, type DecisionSource,
} from '../jev/protocol';

export interface CommandBarProps {
  /** Runs an action. The page owns every one of these; this component owns none. */
  onAction: (action: CommandAction) => void;
}

interface Pending {
  action: CommandAction;
  source: DecisionSource;
  confidence?: number;
  needsConfirmation: boolean;
}

export function CommandBar({ onAction }: CommandBarProps): JSX.Element {
  const { t, lang } = useI18n();
  const task = useJevTask<CommandDecision>();
  const [text, setText] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const dispatch = (p: Pending): void => {
    if (p.action === 'none') { setPending(p); return; }
    const route = COMMAND_ROUTES[p.action];
    if (route) { window.location.hash = route; }
    else onAction(p.action);
    setPending(null);
    setText('');
  };

  const submit = async (): Promise<void> => {
    const utterance = text.trim();
    if (!utterance) return;
    setPending(null);

    if (!task.available) {
      // The keyword router is good enough for the sentences people actually
      // type, so the bar works perfectly well with no key at all.
      const action = ruleBasedCommand(utterance, lang);
      const p: Pending = {
        action,
        source: 'deterministic',
        needsConfirmation: action !== 'none' && MUTATING_ACTIONS.includes(action),
      };
      if (p.needsConfirmation || action === 'none') setPending(p);
      else dispatch(p);
      return;
    }

    const decision = await task.run({ task: 'command', utterance, language: lang });
    if (!decision) {
      const action = ruleBasedCommand(utterance, lang);
      setPending({
        action,
        source: 'deterministic',
        needsConfirmation: action !== 'none' && MUTATING_ACTIONS.includes(action),
      });
      return;
    }
    const p: Pending = {
      action: decision.action,
      source: decision.source,
      confidence: decision.confidence,
      needsConfirmation: decision.needsConfirmation,
    };
    if (p.needsConfirmation || p.action === 'none') setPending(p);
    else dispatch(p);
  };

  return (
    <Card
      title={t('jev.command.title')}
      note={task.available ? t('jev.command.noteAi') : t('jev.command.noteKeywords')}
      className="stack"
    >
      <div className="row">
        <input
          ref={inputRef}
          type="text"
          value={text}
          placeholder={t('jev.command.placeholder')}
          aria-label={t('jev.command.title')}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
          style={{ flex: 1, minWidth: 200 }}
        />
        <button className="btn" data-jev="command" onClick={() => void submit()} disabled={!text.trim()}>
          {t('jev.command.go')}
        </button>
      </div>

      {task.phase === 'thinking' ? <JevThinking /> : null}
      {task.phase === 'failed' ? (
        <JevFailure code={task.error ?? 'server'} retryAfter={task.retryAfter} />
      ) : null}

      {/* Confirmation, or an honest "I do not know what you meant". */}
      {pending?.action === 'none' ? (
        <div className="stack" style={{ gap: 6 }}>
          <div className="row tight">
            <JevBadge source={pending.source} confidence={pending.confidence} />
            <span className="card-note">{t('jev.command.noMatch')}</span>
          </div>
          <div className="row tight">
            {COMMAND_ACTIONS.filter((a) => a !== 'none').map((a) => (
              <button
                key={a}
                className="btn small ghost"
                onClick={() => dispatch({ action: a, source: 'deterministic', needsConfirmation: false })}
              >
                {t(`jev.action.${a}`)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {pending && pending.action !== 'none' ? (
        <div className="stack" style={{ gap: 6 }}>
          <div className="row tight">
            <JevBadge source={pending.source} confidence={pending.confidence} />
            <span>{t('jev.command.confirm', { action: t(`jev.action.${pending.action}`) })}</span>
          </div>
          <div className="row tight">
            <button className="btn small primary" onClick={() => dispatch({ ...pending, needsConfirmation: false })}>
              {t('jev.command.yes')}
            </button>
            <button className="btn small ghost" onClick={() => { setPending(null); inputRef.current?.focus(); }}>
              {t('jev.command.no')}
            </button>
          </div>
        </div>
      ) : null}

      <details>
        <summary className="card-note">{t('jev.command.whatItCanDo')}</summary>
        <ul style={{ marginTop: 8, marginBottom: 0 }}>
          {COMMAND_ACTIONS.filter((a) => a !== 'none').map((a) => (
            <li key={a}>{t(`jev.action.${a}`)}</li>
          ))}
        </ul>
      </details>
    </Card>
  );
}
