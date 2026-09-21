/**
 * Progressive hints, computed from a verified solution.
 *
 * The content of every rung comes from the optimal solver: the face to look
 * at, the twenty stickers a turn would move, the concept behind that kind of
 * turn, and finally the move itself. All four are arithmetic on a solution the
 * solver has proved, so a hint cannot say something untrue about the cube.
 *
 * Jev's only job is choosing which rung to start at. It can raise the level
 * but never lower it, and the learner can always climb further by hand - an AI
 * judgment must not stand between someone and the answer they asked for.
 */

import { useEffect, useRef, useState } from 'react';
import { Callout } from './ui';
import { JevBadge, JevFailure, JevThinking } from './JevBadge';
import { Notation, useI18n } from '../i18n/I18nProvider';
import { useJevTask } from '../jev/useJevTask';
import { MAX_HINT_LEVEL, ruleBasedHintLevel } from '../jev/decisions';
import { hintLadder } from '../jev/content';
import type { HintLevelDecision, HintSituation } from '../jev/protocol';

export interface HintLadderProps {
  /** First move of a verified optimal solution for the position on screen. */
  nextMove: number | null;
  situation: HintSituation;
  /** Lets the page light up the stickers a rung points at. */
  onEmphasis: (facelets: number[] | null) => void;
  /** Told each time the learner takes a hint, so the situation stays honest. */
  onHintTaken: () => void;
}

export function HintLadder({
  nextMove, situation, onEmphasis, onHintTaken,
}: HintLadderProps): JSX.Element {
  const { t, lang } = useI18n();
  const task = useJevTask<HintLevelDecision>();
  const [shown, setShown] = useState<number | null>(null);
  const requested = useRef(false);

  const ladder = nextMove === null ? [] : hintLadder(nextMove);

  // Clear the highlight when the component goes away or the position changes.
  useEffect(() => () => onEmphasis(null), [onEmphasis]);
  useEffect(() => { setShown(null); requested.current = false; }, [nextMove]);

  const reveal = (level: number): void => {
    const clamped = Math.min(MAX_HINT_LEVEL, Math.max(0, level));
    setShown(clamped);
    onEmphasis(ladder[clamped]?.emphasis ?? null);
    onHintTaken();
  };

  const askForHint = async (): Promise<void> => {
    requested.current = true;
    if (!task.available) { reveal(ruleBasedHintLevel(situation)); return; }
    const decision = await task.run({ task: 'hint-level', situation, language: lang });
    reveal(decision ? decision.level : ruleBasedHintLevel(situation));
  };

  if (nextMove === null) {
    return <p className="card-note" style={{ margin: 0 }}>{t('jev.hint.unavailable')}</p>;
  }

  const hint = shown === null ? null : ladder[shown];
  const canEscalate = shown !== null && shown < MAX_HINT_LEVEL;

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row tight">
        <button className="btn small" data-jev="hint" onClick={() => void askForHint()}>
          {shown === null ? t('jev.hint.ask') : t('jev.hint.askAgain')}
        </button>
        {canEscalate ? (
          <button className="btn small ghost" onClick={() => reveal((shown ?? 0) + 1)}>
            {t('jev.hint.more')}
          </button>
        ) : null}
        {shown !== null ? (
          <span className="card-note">
            {t('jev.hint.level', { n: shown + 1, total: MAX_HINT_LEVEL + 1 })}
          </span>
        ) : null}
      </div>

      {task.phase === 'thinking' ? <JevThinking /> : null}
      {task.phase === 'failed' && requested.current ? (
        <JevFailure code={task.error ?? 'server'} retryAfter={task.retryAfter} />
      ) : null}

      {hint ? (
        <Callout title={t('jev.hint.title')}>
          <div className="row tight" style={{ marginBottom: 8 }}>
            <JevBadge
              source={task.decision ? task.decision.source : 'deterministic'}
              confidence={task.decision?.confidence}
            />
            <span className="tag">{t('jev.hint.verified')}</span>
          </div>
          <p style={{ marginBottom: hint.route ? 8 : 0 }}>
            {hint.revealsMove
              ? <>{t('jev.hint.move.prefix')} <bdi className="mono-ltr">{hint.params.move}</bdi></>
              : (
                <Notation
                  text={t(hint.key, {
                    ...hint.params,
                    ...(hint.params.face ? { face: t(String(hint.params.face)) } : {}),
                  })}
                />
              )}
          </p>
          {hint.route ? (
            <a className="btn small ghost" href={hint.route}>
              {t(hint.routeLabel ?? 'jev.check.readMore')}
            </a>
          ) : null}
        </Callout>
      ) : null}
    </div>
  );
}
