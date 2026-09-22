import { useEffect, useMemo, useState } from 'react';
import { Card, Meter } from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { PageBar } from '../components/PageBar';
import { actions, useAppState } from '../state/store';
import { LESSONS, LESSON_PARTS, lessonIndex, type Lesson } from '../lessons/registry';
import { useI18n } from '../i18n/I18nProvider';
import { parseSequence } from '../cube/notation';
import { SOLVED_FACELETS } from '../cube/defs';
import { go, readSubRoute } from '../state/navigation';
import { session } from '../state/session';
import { usePublishAssistantContext } from '../jev/assistantContext';

/**
 * The course, and one lesson at a time.
 *
 * The thing that was missing was a way out of the reading and back into it.
 * A lesson about inverse moves that cannot show you an inverse move on the
 * real cube is a page about a cube; a lesson that hands the cube to the Atlas,
 * set up, and brings you back where you left off is a lesson.
 *
 * `startDemo` is the whole mechanism, and it is deliberately small: the
 * sequence is parsed by the same parser the move box uses, applied to the same
 * store the Atlas reads, and queued rather than applied, so the learner
 * watches it happen rather than arriving after the fact. Lesson progress is
 * untouched by any of it.
 */
/**
 * The lesson the address names, if it names one.
 *
 * Exported so the section above can tell whether a lesson has taken over the
 * page before it draws a tab strip the learner has already navigated past.
 */
export function openLesson(): Lesson | null {
  const raw = readSubRoute();
  return (raw && LESSONS.find((l) => l.id === raw)) || null;
}

export function CoursePage(): JSX.Element {
  const { t } = useI18n();
  const done = useAppState((s) => s.progress.lessonsDone);
  const [openId, setOpenId] = useState<string | null>(() => {
    const raw = readSubRoute();
    return raw && LESSONS.some((l) => l.id === raw) ? raw : null;
  });

  useEffect(() => {
    const onHash = (): void => {
      const raw = readSubRoute();
      setOpenId(raw && LESSONS.some((l) => l.id === raw) ? raw : null);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const open = useMemo(() => LESSONS.find((l) => l.id === openId) ?? null, [openId]);

  // The first lesson that has not been finished. Purely from the record, with
  // no judgment involved - it is the answer to "where was I", not to "what
  // should I do next", and the two are different questions.
  const resume = useMemo(
    () => LESSONS.find((l) => !done.includes(l.id)) ?? null,
    [done],
  );

  usePublishAssistantContext(() => ({
    labelKey: open ? 'nav.course' : 'nav.course',
    actions: [
      ...(open?.demo ? [{
        id: 'demo',
        labelKey: 'assist.act.demo',
        noteKey: 'assist.act.demo.note',
        run: () => startDemo(open),
      }] : []),
      ...(resume ? [{
        id: 'resume',
        labelKey: 'assist.act.resume',
        noteKey: 'assist.act.resume.note',
        run: () => go(`#/learn/${resume.id}`),
      }] : []),
      {
        id: 'practise',
        labelKey: 'assist.act.practise',
        noteKey: 'assist.act.practise.note',
        run: () => go('#/practise'),
      },
    ],
  }), [open?.id, resume?.id]);

  if (open) return <LessonView lesson={open} done={done} />;

  return (
    <>
      <PageHeader
        eyebrow={t('course.eyebrow')}
        title={t('course.title')}
        lede={t('course.lede')}
      >
        <div style={{ maxWidth: 360 }}>
          <Meter
            value={done.length}
            max={LESSONS.length}
            label={t('course.progress', { done: done.length, total: LESSONS.length })}
          />
        </div>
      </PageHeader>

      {/*
        "Where was I" belongs on the course page and is answered from the
        record alone. "What should I study next" is a judgment and lives in the
        study panel, where it is available from every page rather than only
        from this one. Keeping them apart stops the page claiming a
        recommendation is a bookmark, or the other way round.
      */}
      {resume ? (
        <Card className="resume-card" style={{ marginBottom: 24 }}>
          <div className="resume-row">
            <div>
              <div className="card-note">
                {done.length ? t('course.resume.eyebrow') : t('course.resume.eyebrowNew')}
              </div>
              <strong className="resume-title">{t(`lesson.${resume.id}.title`)}</strong>
              <p className="card-note" style={{ margin: '2px 0 0' }}>
                {t(`lesson.${resume.id}.summary`)}
              </p>
            </div>
            <button className="btn primary" data-course="resume" onClick={() => go(`#/learn/${resume.id}`)}>
              {done.length ? t('course.resume.continue') : t('course.start')}
            </button>
          </div>
        </Card>
      ) : (
        <Card className="resume-card" style={{ marginBottom: 24 }}>
          <div className="resume-row">
            <div>
              <div className="card-note">{t('course.resume.eyebrow')}</div>
              <strong className="resume-title">{t('course.allDone')}</strong>
              <p className="card-note" style={{ margin: '2px 0 0' }}>{t('course.allDoneNote')}</p>
            </div>
            <button className="btn primary" onClick={() => go('#/practise')}>
              {t('assist.act.practise')}
            </button>
          </div>
        </Card>
      )}

      <div className="stack" style={{ gap: 28 }}>
        {LESSON_PARTS.map((part) => {
          const inPart = LESSONS.filter((l) => l.part === part);
          const doneHere = inPart.filter((l) => done.includes(l.id)).length;
          return (
            <section key={part}>
              <div className="part-head">
                <h2 style={{ marginTop: 0, marginBottom: 0 }}>{t(`part.${part}`)}</h2>
                <span className="card-note mono-ltr">{doneHere}/{inPart.length}</span>
              </div>
              <div className="grid two">
                {inPart.map((l) => {
                  const isDone = done.includes(l.id);
                  const isNext = resume?.id === l.id;
                  return (
                    <Card
                      key={l.id}
                      className={`lesson-card${isNext ? ' next' : ''}`}
                      title={t(`lesson.${l.id}.title`)}
                      note={t('course.minutes', { n: l.minutes })}
                      actions={isDone ? <span className="tag ok">✓ {t('course.complete')}</span>
                        : isNext ? <span className="tag">{t('course.resume.next')}</span> : null}
                    >
                      <p style={{ marginBottom: 12 }}>{t(`lesson.${l.id}.summary`)}</p>
                      <button
                        className={`btn ${isNext ? 'primary' : ''}`}
                        onClick={() => go(`#/learn/${l.id}`)}
                      >
                        {isDone ? t('course.revisit') : t('course.start')}
                      </button>
                    </Card>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

/**
 * Sets the Atlas up with a lesson's sequence and records the way back.
 *
 * The moves are queued rather than applied: the learner arrives at the solved
 * cube with the sequence loaded and presses play, which is what makes it a
 * demonstration rather than a fait accompli.
 */
function startDemo(lesson: Lesson): void {
  if (!lesson.demo) return;
  const { moves } = parseSequence(lesson.demo.sequence);
  actions.setPosition(SOLVED_FACELETS, []);
  actions.queueMoves(moves);
  session.startErrand({
    returnTo: `#/learn/${lesson.id}`,
    fromKey: `lesson.${lesson.id}.title`,
    aboutKey: `lesson.${lesson.id}.title`,
  }, '#/cube');
}

function LessonView({ lesson, done }: { lesson: Lesson; done: string[] }): JSX.Element {
  const { t } = useI18n();
  const idx = lessonIndex(lesson.id);
  const prev = LESSONS[idx - 1];
  const next = LESSONS[idx + 1];
  const Body = lesson.component;
  const isDone = done.includes(lesson.id);

  return (
    <>
      <PageBar
        title={t(`lesson.${lesson.id}.title`)}
        status={(
          <span className="card-note mono-ltr">{idx + 1} / {LESSONS.length}</span>
        )}
        actions={(
          <>
            {lesson.demo ? (
              <button className="btn" data-lesson="demo" onClick={() => startDemo(lesson)}>
                {t('course.tryInAtlas')}
              </button>
            ) : null}
            <button className="btn ghost" onClick={() => go('#/learn')}>
              {t('course.allLessons')}
            </button>
          </>
        )}
      >
        <div className="lesson-progress">
          <div className="meter" aria-hidden="true">
            <i style={{ width: `${((idx + 1) / LESSONS.length) * 100}%` }} />
          </div>
        </div>
      </PageBar>

      <p className="lede" style={{ marginBottom: 20 }}>{t(`lesson.${lesson.id}.summary`)}</p>

      <Body />

      {/*
        The end of a lesson is where a learner decides whether to keep going,
        so it carries the decision rather than a single button: finish and move
        on, step back, or step forward without marking it.
      */}
      <div className="lesson-foot">
        <button
          className={`btn ${isDone ? '' : 'primary'}`}
          data-lesson="complete"
          onClick={() => {
            actions.markLesson(lesson.id);
            go(next ? `#/learn/${next.id}` : '#/learn');
          }}
        >
          {isDone
            ? t('course.alreadyComplete')
            : next ? t('course.markCompleteAndContinue') : t('course.markComplete')}
        </button>
        {isDone ? <span className="tag ok">{t('course.complete')}</span> : null}
        <div className="spacer" />
        {prev ? (
          <button className="btn small" onClick={() => go(`#/learn/${prev.id}`)}>
            <span className="tdir" aria-hidden="true">◀</span> {t(`lesson.${prev.id}.title`)}
          </button>
        ) : null}
        {next ? (
          <button className="btn small" onClick={() => go(`#/learn/${next.id}`)}>
            {t(`lesson.${next.id}.title`)} <span className="tdir" aria-hidden="true">▶</span>
          </button>
        ) : null}
      </div>
    </>
  );
}
