import { SPEED_PRESETS, actions, presetFor, useAppState } from '../state/store';
import { player, usePlayer } from '../state/player';
import { MOVE_NAMES } from '../cube/defs';
import { describeMove } from '../cube/notation';
import { Stat } from './ui';
import { useI18n } from '../i18n/I18nProvider';

/**
 * Transport controls for a queued move sequence.
 *
 * Every button acts on the store and the shared turn clock, never on a private
 * copy of the cube, so pausing mid-solution leaves the position exactly where
 * the last committed turn put it.
 */
export function Transport({ compact = false }: { compact?: boolean }): JSX.Element {
  const { t } = useI18n();
  const moves = useAppState((s) => s.moves);
  const cursor = useAppState((s) => s.cursor);
  const turnSpeed = useAppState((s) => s.turnSpeed);
  const { status } = usePlayer();

  const atEnd = cursor >= moves.length;
  const atStart = cursor === 0;
  const current = cursor > 0 ? moves[cursor - 1] : null;
  const upcoming = atEnd ? null : moves[cursor];
  const preset = presetFor(turnSpeed);

  return (
    <div className="stack">
      <div className="row" role="group" aria-label={t('transport.label')}>
        <button
          className="btn"
          data-transport="restart"
          onClick={() => player.restart()}
          disabled={atStart && status === 'idle'}
          title={t('transport.restartHint')}
        >
          <span className="tdir">⏮</span>{' '}
          <span className="btn-text">{t('transport.restart')}</span>
        </button>
        <button className="btn" data-transport="back"
          onClick={() => player.stepBack()} disabled={atStart}>
          <span className="tdir">◀</span>{' '}
          <span className="btn-text">{t('transport.previous')}</span>
        </button>
        <button
          className="btn primary"
          data-transport="toggle"
          onClick={() => player.toggle()}
          disabled={atEnd && status !== 'playing'}
        >
          {status === 'playing'
            ? <>❚❚ <span className="btn-text">{t('transport.pause')}</span></>
            : <><span className="tdir">▶</span> <span className="btn-text">{t('transport.play')}</span></>}
        </button>
        <button className="btn" data-transport="next"
          onClick={() => player.stepForward()} disabled={atEnd}>
          <span className="btn-text">{t('transport.next')}</span>{' '}
          <span className="tdir">▶</span>
        </button>
        <button className="btn" data-transport="stop"
          onClick={() => player.stop()} disabled={status === 'idle'}>
          ■ <span className="btn-text">{t('transport.stop')}</span>
        </button>
      </div>

      <div className="row" style={{ gap: 18, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 230 }}>
          <div className="card-note" style={{ marginBottom: 5 }}>{t('transport.speed')}</div>
          <div className="seg" style={{ flexWrap: 'wrap' }}>
            {SPEED_PRESETS.map((p) => (
              <button
                key={p.id}
                data-speed={p.id}
                aria-pressed={preset === p.id}
                onClick={() => actions.setTurnSpeed(p.ms)}
                title={p.ms === 0 ? t('speed.instantHint') : `${p.ms} ms`}
              >
                {t(`speed.${p.id}`)}
              </button>
            ))}
          </div>
          <div className="card-note" style={{ marginTop: 5 }}>
            {turnSpeed === 0 ? t('speed.noAnimation') : t('speed.perTurn', { ms: turnSpeed })}
          </div>
        </div>

        {!compact ? (
          <>
            <Stat
              value={current === null ? '—' : <bdi className="mono-ltr">{MOVE_NAMES[current]}</bdi>}
              label={t('transport.lastMove')}
              sub={current === null ? t('transport.nothingYet') : describeMove(current, t)}
            />
            <Stat
              value={upcoming === null ? '—' : <bdi className="mono-ltr">{MOVE_NAMES[upcoming]}</bdi>}
              label={t('transport.nextMove')}
            />
            <Stat
              value={<bdi className="mono-ltr">{cursor} / {moves.length}</bdi>}
              label={t('transport.progress')}
              sub={t('transport.remaining', { n: Math.max(0, moves.length - cursor) })}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
