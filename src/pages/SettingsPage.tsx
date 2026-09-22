import { useEffect, useRef, useState } from 'react';
import { Callout, Card } from '../components/ui';
import { actions, useAppState } from '../state/store';
import { LANGUAGES, T, useI18n } from '../i18n/I18nProvider';
import { usePublishAssistantContext } from '../jev/assistantContext';
import { go } from '../state/navigation';
import { jevConfig, keySource, useJevConfig } from '../jev/config';
import { JevError, probeJevStatus, testJevConnection } from '../jev/client';

type TestState =
  | { phase: 'idle' }
  | { phase: 'testing' }
  | { phase: 'ok'; models: string[] }
  | { phase: 'failed'; code: string; retryAfter?: number };

/**
 * Settings, including the Jev integration.
 *
 * The page exists because an optional integration needs somewhere to be
 * optional *in*. Everything here is off by default, the application is
 * complete without any of it, and the page says so rather than implying that
 * a learner is missing out until they find a key.
 */
export function SettingsPage(): JSX.Element {
  // What the study panel offers from this page. The panel itself always
  // carries the universal help; these are the jumps that only make sense
  // from here.
  usePublishAssistantContext(() => ({ labelKey: 'nav.settings', actions: [
      { id: 'ai-lab', labelKey: 'assist.act.aiLab', noteKey: 'assist.act.aiLab.note',
        run: () => go('#/settings/jev') },
    ] }), []);

  const { t, lang, setLang } = useI18n();
  const theme = useAppState((s) => s.theme);
  const config = useJevConfig();
  const [draft, setDraft] = useState('');
  const [test, setTest] = useState<TestState>({ phase: 'idle' });
  const abort = useRef<AbortController | null>(null);

  // One cheap request on arrival, to learn whether the server has a key. It
  // makes no upstream call and costs nothing; the alternative is guessing.
  useEffect(() => {
    const controller = new AbortController();
    probeJevStatus(controller.signal)
      .then((s) => jevConfig.setServerStatus(s.serverKey, s.model))
      .catch(() => jevConfig.markProbed());
    return () => controller.abort();
  }, []);

  useEffect(() => () => abort.current?.abort(), []);

  const source = keySource(config);
  const status: 'unconfigured' | 'disabled' | 'connected' | 'error' =
    test.phase === 'failed' ? 'error'
      : source === 'none' ? 'unconfigured'
        : config.enabled ? 'connected' : 'disabled';

  const runTest = (): void => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setTest({ phase: 'testing' });
    testJevConnection(controller.signal)
      .then((s) => {
        jevConfig.setServerStatus(s.serverKey, s.model);
        setTest({ phase: 'ok', models: s.models ?? [] });
      })
      .catch((err: unknown) => {
        if (err instanceof JevError && err.code === 'aborted') return;
        setTest({
          phase: 'failed',
          code: err instanceof JevError ? err.code : 'server',
          retryAfter: err instanceof JevError ? err.retryAfter : undefined,
        });
      });
  };

  return (
    <>

      <Card title={t('settings.appearance')}>
        <div className="split">
          <div className="row" style={{ justifyContent: 'space-between' }}>
              <span>{t('chrome.language')}</span>
              <div className="seg" role="group" aria-label={t('chrome.language')}>
                {LANGUAGES.map((l) => (
                  <button
                    key={l.id}
                    data-lang={l.id}
                    aria-pressed={lang === l.id}
                    lang={l.id}
                    onClick={() => setLang(l.id)}
                  >
                    {l.label}
                  </button>
                ))}
            </div>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>{t('chrome.theme')}</span>
            <div className="seg" role="group" aria-label={t('chrome.theme')}>
              {(['auto', 'light', 'dark'] as const).map((mode) => (
                <button key={mode} aria-pressed={theme === mode} onClick={() => actions.setTheme(mode)}>
                  {t(`chrome.theme.${mode}`)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Read as a pair - what is sent, and what turns the sending on - so
          they are levelled rather than left to end wherever they end. */}
      <div className="split level">
        <Card title={t('settings.privacy')}>
          <div className="prose">
            <p style={{ marginBottom: 8 }}>{t('settings.privacyBody')}</p>
            <ul style={{ marginBottom: 0 }}>
              <li>{t('settings.privacy.b1')}</li>
              <li>{t('settings.privacy.b2')}</li>
              <li>{t('settings.privacy.b3')}</li>
            </ul>
          </div>
        </Card>

        <Card
            title={t('settings.jev')}
            note={t('settings.jevOptional')}
            actions={<span className={`tag ${status === 'connected' ? 'ok' : status === 'error' ? 'danger' : ''}`}>
              {t(`settings.status.${status}`)}
            </span>}
            className="stack"
          >
            <p className="card-note" style={{ margin: 0 }}>{t('settings.jevBody')}</p>

            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span>{t('settings.enable')}</span>
              <div className="seg" role="group">
                <button
                  data-jev="off"
                  aria-pressed={!config.enabled}
                  onClick={() => jevConfig.setEnabled(false)}
                >
                  {t('settings.off')}
                </button>
                <button
                  data-jev="on"
                  aria-pressed={config.enabled}
                  disabled={source === 'none'}
                  onClick={() => jevConfig.setEnabled(true)}
                >
                  {t('settings.on')}
                </button>
              </div>
            </div>

            <div>
              <div className="card-note" style={{ marginBottom: 4 }}>
                {t(`settings.keySource.${source}`)}
              </div>
              {config.serverKey ? null : (
                <>
                  <div className="row">
                    <input
                      type="password"
                      className="mono-ltr"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder={t('settings.keyPlaceholder')}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      style={{ flex: 1, minWidth: 180 }}
                    />
                    <button
                      className="btn"
                      disabled={!draft.trim()}
                      onClick={() => { jevConfig.setSessionKey(draft); setDraft(''); setTest({ phase: 'idle' }); }}
                    >
                      {t('settings.saveKey')}
                    </button>
                  </div>
                  <p className="card-note" style={{ marginTop: 6, marginBottom: 0 }}>
                    {t('settings.sessionOnly')}
                  </p>
                </>
              )}
            </div>

            <div className="row">
              <button
                className="btn"
                data-jev="test"
                onClick={runTest}
                disabled={source === 'none' || test.phase === 'testing'}
              >
                {test.phase === 'testing' ? t('settings.testing') : t('settings.test')}
              </button>
              {config.sessionKey ? (
                <button
                  className="btn ghost"
                  onClick={() => { jevConfig.setSessionKey(null); setTest({ phase: 'idle' }); }}
                >
                  {t('settings.clearKey')}
                </button>
              ) : null}
            </div>

            {test.phase === 'ok' ? (
              <Callout title={t('settings.testOk')}>
                <p style={{ margin: 0 }}>
                  {t('settings.testOkBody', { model: config.model })}
                  {test.models.length ? (
                    <> <bdi className="mono-ltr">{test.models.join(', ')}</bdi></>
                  ) : null}
                </p>
              </Callout>
            ) : null}
            {test.phase === 'failed' ? (
              <Callout kind="danger" title={t('settings.testFailed')}>
                <p style={{ margin: 0 }}>
                  {t(`jev.error.${test.code}`)}
                  {test.retryAfter ? ` ${t('jev.error.retryAfter', { n: test.retryAfter })}` : ''}
                </p>
              </Callout>
            ) : null}
        </Card>
      </div>

      <Card title={t('settings.whatItAffects')}>
        <div className="scroll-x">
          <table className="data">
            <thead>
              <tr>
                <th>{t('settings.feature')}</th>
                <th>{t('settings.withJev')}</th>
                <th>{t('settings.withoutJev')}</th>
              </tr>
            </thead>
            <tbody>
              {['tutor', 'misconception', 'hints', 'command'].map((f) => (
                <tr key={f}>
                  <td><strong>{t(`settings.f.${f}`)}</strong></td>
                  <td><T k={`settings.f.${f}.with`} /></td>
                  <td><T k={`settings.f.${f}.without`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="card-note" style={{ marginTop: 10, marginBottom: 0 }}>
          {t('settings.noRequests')}
        </p>
      </Card>

    </>
  );
}