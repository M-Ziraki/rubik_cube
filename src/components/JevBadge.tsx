/**
 * The label that says where a judgment came from.
 *
 * It appears next to every AI-influenced result, and it is the one piece of
 * this integration that must never be decorative. A learner has to be able to
 * tell, at a glance and without reading documentation, whether what they are
 * looking at was chosen by a model or computed by the cube engine - because
 * those two things carry completely different weight.
 */

import { useI18n } from '../i18n/I18nProvider';
import type { DecisionSource } from '../jev/protocol';

export function JevBadge({ source, confidence }: {
  source: DecisionSource; confidence?: number;
}): JSX.Element {
  const { t } = useI18n();
  const tone = source === 'jev' ? 'jev' : source === 'jev-uncertain' ? 'warn' : '';
  const label = source === 'jev'
    ? t('jev.badge.jev')
    : source === 'jev-uncertain'
      ? t('jev.badge.uncertain')
      : t('jev.badge.deterministic');

  return (
    <span className={`tag ${tone}`} title={t(`jev.badge.${source}.help`)}>
      {source === 'deterministic' ? '∑' : '◇'} {label}
      {source !== 'deterministic' && confidence !== undefined ? (
        <bdi className="mono-ltr"> {Math.round(confidence * 100)}%</bdi>
      ) : null}
    </span>
  );
}

/** "Thinking", and an honest word about what that means. */
export function JevThinking(): JSX.Element {
  const { t } = useI18n();
  return (
    <div className="row tight jev-thinking">
      <span className="jev-pulse" aria-hidden="true" />
      <span className="card-note">{t('jev.thinking')}</span>
    </div>
  );
}

/** A failure, named plainly, with the fallback that took over. */
export function JevFailure({ code, retryAfter, onRetry }: {
  code: string; retryAfter?: number; onRetry?: () => void;
}): JSX.Element {
  const { t } = useI18n();
  return (
    <div className="row tight">
      <span className="tag warn">{t(`jev.error.${code}`)}</span>
      {retryAfter ? (
        <span className="card-note">{t('jev.error.retryAfter', { n: retryAfter })}</span>
      ) : null}
      {onRetry ? (
        <button className="btn small ghost" onClick={onRetry}>{t('jev.retry')}</button>
      ) : null}
    </div>
  );
}
