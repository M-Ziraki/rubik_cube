import { useEffect, useMemo, useState } from 'react';
import { Card, Meter } from '../components/ui';
import { actions, useAppState } from '../state/store';
import { LESSONS, LESSON_PARTS, lessonIndex } from '../lessons/registry';

export function CoursePage(): JSX.Element {
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
          <div className="eyebrow">{open.part} · lesson {idx + 1} of {LESSONS.length}</div>
          <h1>{open.title}</h1>
          <p className="lede">{open.summary}</p>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn ghost" onClick={() => { window.location.hash = '#/course'; }}>← All lessons</button>
            <div className="spacer" />
            {prev ? <button className="btn" onClick={() => { window.location.hash = `#/course/${prev.id}`; }}>← {prev.title}</button> : null}
            {next ? <button className="btn" onClick={() => { window.location.hash = `#/course/${next.id}`; }}>{next.title} →</button> : null}
          </div>
        </header>

        <Body />

        <div className="row" style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--line)' }}>
          <button
            className={`btn ${isDone ? '' : 'primary'}`}
            onClick={() => {
              actions.markLesson(open.id);
              if (next) window.location.hash = `#/course/${next.id}`;
              else window.location.hash = '#/course';
            }}
          >
            {isDone ? 'Already marked complete' : 'Mark complete'}{next ? ' and continue' : ''}
          </button>
          {isDone ? <span className="tag ok">complete</span> : null}
        </div>
      </>
    );
  }

  return (
    <>
      <header className="page-head">
        <div className="eyebrow">Start here</div>
        <h1>The course</h1>
        <p className="lede">
          Eleven lessons from "which way round is R&rsquo;" to "here is how God&rsquo;s number was
          proved, and here is the same proof carried out in your browser". Each one has something to
          try, and each one ends with a question that is only answerable if you understood it.
        </p>
        <div style={{ maxWidth: 360, marginTop: 14 }}>
          <Meter value={done.length} max={LESSONS.length} label={`${done.length} of ${LESSONS.length} complete`} />
        </div>
      </header>

      <div className="stack" style={{ gap: 28 }}>
        {LESSON_PARTS.map((part) => (
          <section key={part}>
            <h2 style={{ marginTop: 0 }}>{part}</h2>
            <div className="grid two">
              {LESSONS.filter((l) => l.part === part).map((l) => {
                const isDone = done.includes(l.id);
                return (
                  <Card
                    key={l.id}
                    title={l.title}
                    note={`${l.minutes} min${isDone ? ' · complete' : ''}`}
                    actions={isDone ? <span className="tag ok">✓</span> : null}
                  >
                    <p style={{ marginBottom: 12 }}>{l.summary}</p>
                    <button className="btn" onClick={() => { window.location.hash = `#/course/${l.id}`; }}>
                      {isDone ? 'Revisit' : 'Start'}
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
