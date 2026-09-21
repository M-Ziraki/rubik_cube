/**
 * Evaluate the question definitions against the dataset.
 *
 *   npm run jev:eval             # needs TYPESAFE_API_KEY; makes real calls
 *   npm run jev:eval -- --dry    # prints what would be sent, calls nothing
 *
 * Reports accuracy, the abstention rate at the current thresholds, and a
 * per-case table, because an aggregate number hides exactly the cases worth
 * looking at. Persian and English are reported separately: the docs make no
 * claim about non-English performance, so it has to be measured rather than
 * assumed.
 */

import { TypeSafeClient, type Questions } from '@typesafe-ai/sdk';
import {
  commandQuestions, commandState, misconceptionQuestions, misconceptionState, THRESHOLDS,
} from '../src/jev/questions';
import { resolveCommand, resolveMisconception, ruleBasedCommand } from '../src/jev/decisions';
import { COMMAND_CASES, MISCONCEPTION_CASES } from './dataset';

const dry = process.argv.includes('--dry');

interface Row {
  id: string;
  language: string;
  expected: string;
  got: string;
  confidence: number;
  extra: string;
  verdict: 'hit' | 'tolerated' | 'miss' | 'abstained';
}

function verdictOf(
  expected: string, tolerant: readonly string[] | undefined, got: string, uncertain: boolean,
): Row['verdict'] {
  if (uncertain) return 'abstained';
  if (got === expected) return 'hit';
  if (tolerant?.includes(got)) return 'tolerated';
  return 'miss';
}

async function main(): Promise<void> {
  if (dry) {
    const c = MISCONCEPTION_CASES[0];
    console.log('--- one misconception request, as it would be sent ---');
    console.log(JSON.stringify({
      state: misconceptionState(c.promptId, c.answer, c.language),
      questions: misconceptionQuestions(c.promptId),
    }, null, 2));
    console.log('\n--- one command request ---');
    console.log(JSON.stringify({
      state: commandState(COMMAND_CASES[0].utterance, 'en'),
      questions: commandQuestions(),
    }, null, 2));
    console.log(`\ncases: ${MISCONCEPTION_CASES.length} misconception, ${COMMAND_CASES.length} command`);
    console.log('thresholds:', JSON.stringify(THRESHOLDS));
    return;
  }

  if (!process.env.TYPESAFE_API_KEY?.trim()) {
    console.error('TYPESAFE_API_KEY is not set. Use --dry to inspect the requests without calling.');
    process.exit(2);
  }

  const client = new TypeSafeClient({ timeout: 20_000 });
  const rows: Row[] = [];

  for (const c of MISCONCEPTION_CASES) {
    const { answers } = await client.systemOne({
      state: misconceptionState(c.promptId, c.answer, c.language) as never,
      questions: misconceptionQuestions(c.promptId) as unknown as Questions,
    });
    const diagnosis = answers.diagnosis as { choice: string; confidence: number };
    const onTopic = (answers.on_topic as { noul: number }).noul;
    const resolved = resolveMisconception(
      c.promptId, diagnosis.choice, diagnosis.confidence, onTopic,
    );
    rows.push({
      id: c.id,
      language: c.language,
      expected: c.expected,
      got: resolved.label,
      confidence: diagnosis.confidence,
      extra: `onTopic=${onTopic.toFixed(2)}`,
      verdict: verdictOf(c.expected, c.tolerant, resolved.label, resolved.uncertain),
    });
  }

  for (const c of COMMAND_CASES) {
    const { answers } = await client.systemOne({
      state: commandState(c.utterance, c.language) as never,
      questions: commandQuestions() as unknown as Questions,
    });
    const action = answers.action as { choice: string; confidence: number };
    const unambiguous = (answers.unambiguous as { noul: number }).noul;
    const resolved = resolveCommand(action.choice as never, action.confidence, unambiguous);
    rows.push({
      id: c.id,
      language: c.language,
      expected: c.expected,
      got: resolved.action,
      confidence: action.confidence,
      extra: `unambiguous=${unambiguous.toFixed(2)} confirm=${resolved.needsConfirmation}`
        + ` rule=${ruleBasedCommand(c.utterance, c.language)}`,
      verdict: verdictOf(c.expected, c.tolerant, resolved.action, false),
    });
  }

  const pad = (s: string, n: number): string => s.padEnd(n).slice(0, n);
  console.log(
    `${pad('case', 22)}${pad('lang', 5)}${pad('expected', 20)}${pad('got', 20)}`
    + `${pad('conf', 6)}${pad('verdict', 11)}detail`,
  );
  for (const r of rows) {
    console.log(
      `${pad(r.id, 22)}${pad(r.language, 5)}${pad(r.expected, 20)}${pad(r.got, 20)}`
      + `${pad(r.confidence.toFixed(2), 6)}${pad(r.verdict, 11)}${r.extra}`,
    );
  }

  const summarise = (label: string, subset: Row[]): void => {
    if (!subset.length) return;
    const hit = subset.filter((r) => r.verdict === 'hit').length;
    const tol = subset.filter((r) => r.verdict === 'tolerated').length;
    const abs = subset.filter((r) => r.verdict === 'abstained').length;
    const miss = subset.filter((r) => r.verdict === 'miss').length;
    console.log(
      `${pad(label, 18)} n=${subset.length}  exact=${hit}  acceptable=${hit + tol}  `
      + `abstained=${abs}  wrong=${miss}`,
    );
  };

  console.log('');
  summarise('overall', rows);
  summarise('english', rows.filter((r) => r.language === 'en'));
  summarise('persian', rows.filter((r) => r.language === 'fa'));
  summarise('misconception', rows.filter((r) => r.id.startsWith('inv-') || r.id.startsWith('map-')
    || r.id.startsWith('god-') || r.id.startsWith('short-')));
  summarise('command', rows.filter((r) => r.id.startsWith('cmd-')));

  if (rows.some((r) => r.verdict === 'miss')) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
