import { useEffect, useMemo, useState } from 'react';
import { Card, Meter } from '../components/ui';
import { actions, useAppState } from '../state/store';
import { LESSONS, LESSON_PARTS, lessonIndex } from '../lessons/registry';
import { useI18n } from '../i18n/I18nProvider';
import { TutorPanel } from '../components/TutorPanel';

export function CoursePage(): JSX.Element {
  const { t } = useI18n();
  const done = useAppState((s) => s.progress.lessonsDone);
  const [openId, setOpenId] = useState<string | null>(() => {
    const raw = window.location.hash.split('/')[2];
    return LESSONS.some((l) => l.id === raw) ? raw : null;
  });

  useEffect(() => {
    const onHash = (): void => {
      const raw = window.location.hash.split('/')[2];
      setOpenId(LESSONS.some((l) => l.id === raw) ? raw : null);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const open = useMemo(() => LESSONS.find((l) => l.id === openId) ?? null, [openId]);

  if (open) {
    const idx = lessonIndex(open.id);
    const prev = LESSONS[idx - 1];
    const next = LESSONS[idx + 1];
    const Body = open.component;
    const isDone = done.includes(open.id);
    return (
      <>
        <header className="page-head">
          <div className="eyebrow">
            {t('course.lessonOf', {
              part: t(`part.${open.part}`),
              n: idx + 1,
              total: LESSONS.length,
            })}
          </div>
          <h1>{t(`lesson.${open.id}.title`)}</h1>
          <p className="lede">{t(`lesson.${open.id}.summary`)}</p>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn ghost" onClick={() => { window.location.hash = '#/course'; }}>
              {t('course.allLessons')}
            </button>
            <div className="spacer" />
            {prev ? (
              <button
                className="btn"
                onClick={() => { window.location.hash = `#/course/${prev.id}`; }}
              >
                {t(`lesson.${prev.id}.title`)}
              </button>
            ) : null}
            {next ? (
              <button
                className="btn"
                onClick={() => { window.location.hash = `#/course/${next.id}`; }}
              >
                {t(`lesson.${next.id}.title`)}
              </button>
            ) : null}
          </div>
        </header>

        <Body />

        <div className="row" style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--line)' }}>
          <button
            className={`btn ${isDone ? '' : 'primary'}`}
            onClick={() => {
              actions.markLesson(open.id);
              window.location.hash = next ? `#/course/${next.id}` : '#/course';
            }}
          >
            {isDone
              ? t('course.alreadyComplete')
              : next ? t('course.markCompleteAndContinue') : t('course.markComplete')}
          </button>
          {isDone ? <span className="tag ok">{t('course.complete')}</span> : null}
        </div>
      </>
    );
  }

  return (
    <>
      <header className="page-head">
        <div className="eyebrow">{t('course.eyebrow')}</div>
        <h1>{t('course.title')}</h1>
        <p className="lede">{t('course.lede')}</p>
        <div style={{ maxWidth: 360, marginTop: 14 }}>
          <Meter
            value={done.length}
            max={LESSONS.length}
            label={t('course.progress', { done: done.length, total: LESSONS.length })}
          />
        </div>
      </header>

      <div style={{ marginBottom: 24 }}>
        <TutorPanel />
      </div>

      <div className="stack" style={{ gap: 28 }}>
        {LESSON_PARTS.map((part) => (
          <section key={part}>
            <h2 style={{ marginTop: 0 }}>{t(`part.${part}`)}</h2>
            <div className="grid two">
              {LESSONS.filter((l) => l.part === part).map((l) => {
                const isDone = done.includes(l.id);
                return (
                  <Card
                    key={l.id}
                    title={t(`lesson.${l.id}.title`)}
                    note={`${t('course.minutes', { n: l.minutes })}${isDone ? ` · ${t('course.complete')}` : ''}`}
                    actions={isDone ? <span className="tag ok">✓</span> : null}
                  >
                    <p style={{ marginBottom: 12 }}>{t(`lesson.${l.id}.summary`)}</p>
                    <button
                      className="btn"
                      onClick={() => { window.location.hash = `#/course/${l.id}`; }}
                    >
                      {isDone ? t('course.revisit') : t('course.start')}
                    </button>
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
