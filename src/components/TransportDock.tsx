/**
 * Playback controls, pinned where they can always be reached.
 *
 * A twenty-move solution at nine hundred milliseconds a move runs for eighteen
 * seconds, and the whole point of slowing it down is that the learner watches
 * it. Watching means pausing, stepping back, and watching the same turn again -
 * so pause and step must be reachable at the moment the interesting thing
 * happens, not after scrolling to find them. Before this they were a thousand
 * pixels below the cube.
 *
 * Sticky rather than fixed: it belongs to the workspace and scrolls away with
 * it, instead of following the learner onto pages that have nothing to play.
 */

import { SPEED_PRESETS, actions, presetFor, useAppState } from '../state/store';
import { player, usePlayer } from '../state/player';
import { MOVE_NAMES } from '../cube/defs';
import { describeMove } from '../cube/notation';
import { useI18n } from '../i18n/I18nProvider';

export function TransportDock(): JSX.Element {
  const { t } = useI18n();
  const moves = useAppState((s) => s.moves);
  const cursor = useAppState((s) => s.cursor);
  const turnSpeed = useAppState((s) => s.turnSpeed);
  const { status } = usePlayer();

  const atEnd = cursor >= moves.length;
  const atStart = cursor === 0;
  const upcoming = atEnd ? null : moves[cursor];
  const preset = presetFor(turnSpeed);
  const empty = moves.length === 0;

  return (
    <div className="transport-dock" role="group" aria-label={t('transport.label')}>
      <div className="transport-buttons">
        <button
          className="btn icon" data-transport="restart" onClick={() => player.restart()}
          disabled={atStart && status === 'idle'} title={t('transport.restartHint')}
          aria-label={t('transport.restart')}
        >
          <span className="tdir" aria-hidden="true">⏮</span>
        </button>
        <button
          className="btn icon" data-transport="back" onClick={() => player.stepBack()}
          disabled={atStart} aria-label={t('transport.previous')} title={t('transport.previous')}
        >
          <span className="tdir" aria-hidden="true">◀</span>
        </button>
        <button
          className="btn primary transport-play" data-transport="toggle"
          onClick={() => player.toggle()} disabled={atEnd && status !== 'playing'}
        >
          {status === 'playing'
            ? <>❚❚ <span className="btn-text">{t('transport.pause')}</span></>
            : <><span className="tdir" aria-hidden="true">▶</span> <span className="btn-text">{t('transport.play')}</span></>}
        </button>
        <button
          className="btn icon" data-transport="next" onClick={() => player.stepForward()}
          disabled={atEnd} aria-label={t('transport.next')} title={t('transport.next')}
        >
          <span className="tdir" aria-hidden="true">▶</span>
        </button>
        <button
          className="btn icon" data-transport="stop" onClick={() => player.stop()}
          disabled={status === 'idle'} aria-label={t('transport.stop')} title={t('transport.stop')}
        >
          <span aria-hidden="true">■</span>
        </button>
      </div>

      {/*
        The position in the sequence, as a bar rather than a pair of numbers.
        A learner watching a solution wants to know how much is left; "7 / 18"
        makes them do the arithmetic, a filled bar does not.
      */}
      <div className="transport-progress">
        <div className="meter" aria-hidden="true">
          <i style={{ width: `${moves.length ? (cursor / moves.length) * 100 : 0}%` }} />
        </div>
        <span className="card-note transport-count">
          {empty ? t('transport.nothingQueued') : (
            <>
              <bdi className="mono-ltr">{cursor} / {moves.length}</bdi>
              {upcoming !== null ? (
                <> · {t('transport.nextIs')} <bdi className="mono-ltr">{MOVE_NAMES[upcoming]}</bdi></>
              ) : null}
            </>
          )}
        </span>
      </div>

      <div className="transport-speed">
        <label className="card-note" htmlFor="speed-group">{t('transport.speed')}</label>
        <div className="seg" id="speed-group" role="group" aria-label={t('transport.speed')}>
          {SPEED_PRESETS.map((p) => (
            <button
              key={p.id} data-speed={p.id} aria-pressed={preset === p.id}
              onClick={() => actions.setTurnSpeed(p.ms)}
              title={p.ms === 0 ? t('speed.instantHint') : `${p.ms} ms`}
            >
              {t(`speed.${p.id}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Announced, not just drawn: a learner using a screen reader needs to
          know which turn just happened as much as a sighted one does. */}
      <span className="sr-only" aria-live="polite">
        {cursor > 0 ? describeMove(moves[cursor - 1], t) : ''}
      </span>
    </div>
  );
}
