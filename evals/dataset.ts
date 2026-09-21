/**
 * The cases the question definitions are judged against.
 *
 * Written before the thresholds were chosen, and deliberately including the
 * awkward ones: a half-right answer, a right answer phrased badly, a confident
 * wrong answer, and the same content in both languages. An evaluation set made
 * only of clean examples tells you nothing you did not already believe.
 *
 * `expected` is what a careful human marker would say. `tolerant` lists
 * additional labels that would not be *wrong* - some answers really do sit
 * between two diagnoses, and scoring those as failures would push the
 * thresholds in the wrong direction.
 */

import type { CommandAction, MisconceptionLabel } from '../src/jev/protocol';

export interface MisconceptionCase {
  id: string;
  promptId: string;
  language: 'en' | 'fa';
  answer: string;
  expected: MisconceptionLabel;
  tolerant?: MisconceptionLabel[];
  /** What this case is here to catch. */
  note: string;
}

export const MISCONCEPTION_CASES: MisconceptionCase[] = [
  /* ------------------------------------------------- inverse moves, English */
  {
    id: 'inv-correct-1',
    promptId: 'inverse',
    language: 'en',
    answer:
      "Because R' is the exact opposite turn of R. The second turn undoes the permutation the "
      + 'first one applied, so every piece ends up back where it started.',
    expected: 'correct',
    note: 'Textbook correct answer.',
  },
  {
    id: 'inv-correct-informal',
    promptId: 'inverse',
    language: 'en',
    answer: 'u turn it one way then turn it back the same amount so nothing changed',
    expected: 'correct',
    note: 'Right idea, no technical vocabulary, poor spelling. Must not be marked down for style.',
  },
  {
    id: 'inv-confusion-1',
    promptId: 'inverse',
    language: 'en',
    answer:
      "R and R' are the same move, so doing it twice is like R2, which is a half turn and that "
      + 'is symmetric so the cube looks the same.',
    expected: 'inverse-confusion',
    note: 'Confidently wrong about what a prime means.',
  },
  {
    id: 'inv-direction-1',
    promptId: 'inverse',
    language: 'en',
    answer:
      'R turns the right face anticlockwise when you look at it, and the prime turns it '
      + 'clockwise, so together they cancel.',
    expected: 'notation-direction',
    tolerant: ['correct'],
    note: 'Correct conclusion, reversed convention. The direction error is the thing to catch.',
  },
  {
    id: 'inv-insufficient-1',
    promptId: 'inverse',
    language: 'en',
    answer: 'because they cancel out',
    expected: 'insufficient',
    tolerant: ['correct'],
    note: 'Restates the question. Little to go on either way.',
  },
  {
    id: 'inv-unrelated-1',
    promptId: 'inverse',
    language: 'en',
    answer: 'I have a red cube from when I was a kid and one of the stickers fell off.',
    expected: 'unrelated',
    note: 'On the subject of cubes, not of the question.',
  },

  /* ------------------------------------------------- inverse moves, Persian */
  {
    id: 'inv-correct-fa',
    promptId: 'inverse',
    language: 'fa',
    answer:
      'چون ’R دقیقاً چرخش وارون R است. حرکت دوم همان جایگشتی را که حرکت اول اعمال کرده بود '
      + 'خنثی می‌کند، پس هر قطعه به جای اولش برمی‌گردد.',
    expected: 'correct',
    note: 'The English case inv-correct-1, in Persian.',
  },
  {
    id: 'inv-confusion-fa',
    promptId: 'inverse',
    language: 'fa',
    answer:
      'چون R و ’R یک حرکت‌اند و انجام دو باره‌شان مثل R2 است، یعنی نیم‌دور، و نیم‌دور متقارن '
      + 'است پس مکعب همان‌طور می‌ماند.',
    expected: 'inverse-confusion',
    note: 'The English case inv-confusion-1, in Persian.',
  },

  /* --------------------------------------------- sticker map versus graph */
  {
    id: 'map-correct-1',
    promptId: 'map-vs-graph',
    language: 'en',
    answer:
      'The sticker map is a picture of one position: 54 dots, one per sticker, and turning a '
      + 'face recolours them. The state-space graph has one vertex per whole configuration, so a '
      + 'single vertex there corresponds to an entire sticker map.',
    expected: 'correct',
    note: 'Both halves stated correctly.',
  },
  {
    id: 'map-confusion-1',
    promptId: 'map-vs-graph',
    language: 'en',
    answer:
      'They are the same graph drawn at different zoom levels. Each of the 54 dots is one of the '
      + 'possible configurations of the cube.',
    expected: 'sticker-vs-state',
    note: 'The exact confusion the Atlas page was rebuilt to prevent.',
  },
  {
    id: 'map-confusion-fa',
    promptId: 'map-vs-graph',
    language: 'fa',
    answer:
      'هر دو یک گراف‌اند که با بزرگ‌نمایی متفاوت رسم شده‌اند. هر کدام از ۵۴ نقطه یکی از '
      + 'پیکربندی‌های ممکن مکعب است.',
    expected: 'sticker-vs-state',
    note: 'The same confusion, in Persian.',
  },
  {
    id: 'map-insufficient-1',
    promptId: 'map-vs-graph',
    language: 'en',
    answer: 'one is small and one is big',
    expected: 'insufficient',
    note: 'True but says nothing about what either object is.',
  },

  /* -------------------------------------------------------- God's number */
  {
    id: 'god-correct-1',
    promptId: 'gods-number',
    language: 'en',
    answer:
      'It means no position needs more than 20 face turns, and at least one position really does '
      + 'need 20. It is a fact about the graph, not about people.',
    expected: 'correct',
    note: 'Both halves of the theorem, plus the distinction from human solving.',
  },
  {
    id: 'god-human-1',
    promptId: 'gods-number',
    language: 'en',
    answer:
      'It means anyone who learns the right algorithms can solve any cube in 20 moves. That is '
      + 'the target speedcubers train for.',
    expected: 'gods-number-human',
    note: 'The headline misreading: a bound treated as human performance.',
  },
  {
    id: 'god-human-fa',
    promptId: 'gods-number',
    language: 'fa',
    answer:
      'یعنی هر کسی که الگوریتم‌های درست را یاد بگیرد می‌تواند هر مکعبی را در ۲۰ حرکت حل کند. '
      + 'همان هدفی که سرعت‌حل‌کننده‌ها برایش تمرین می‌کنند.',
    expected: 'gods-number-human',
    note: 'The same misreading, in Persian.',
  },
  {
    id: 'god-optimal-1',
    promptId: 'gods-number',
    language: 'en',
    answer:
      'It means every solution a solver finds is at most 20 moves, so any answer you get back is '
      + 'the shortest one.',
    expected: 'any-vs-optimal',
    tolerant: ['gods-number-human'],
    note: 'Slides from a bound into optimality.',
  },

  /* ------------------------------------------------ any versus shortest */
  {
    id: 'short-correct-1',
    promptId: 'any-vs-shortest',
    language: 'en',
    answer:
      'Only that the shortest solution is at most 18. It could be 18, or it could be shorter - '
      + 'you would need a search that ruled out every shorter length to know.',
    expected: 'correct',
    note: 'The upper-bound reading, stated exactly.',
  },
  {
    id: 'short-wrong-1',
    promptId: 'any-vs-shortest',
    language: 'en',
    answer: 'That the position is exactly 18 moves from solved.',
    expected: 'any-vs-optimal',
    note: 'The distinction the whole Solvers page is built around.',
  },
  {
    id: 'short-wrong-fa',
    promptId: 'any-vs-shortest',
    language: 'fa',
    answer: 'اینکه آن وضعیت دقیقاً ۱۸ حرکت از حل‌شده فاصله دارد.',
    expected: 'any-vs-optimal',
    note: 'The same error, in Persian.',
  },
  {
    id: 'short-unrelated-1',
    promptId: 'any-vs-shortest',
    language: 'en',
    answer: 'asdf',
    expected: 'unrelated',
    note: 'Nonsense must not be forced into a misconception.',
  },
];

/* --------------------------------------------------------- command cases --- */

export interface CommandCase {
  id: string;
  language: 'en' | 'fa';
  utterance: string;
  expected: CommandAction;
  tolerant?: CommandAction[];
  note: string;
}

export const COMMAND_CASES: CommandCase[] = [
  {
    id: 'cmd-scramble-en', language: 'en', utterance: 'mix the cube up for me',
    expected: 'scramble', note: 'Plain phrasing, no keyword overlap.',
  },
  {
    id: 'cmd-scramble-fa', language: 'fa', utterance: 'مکعب را به‌هم بریز',
    expected: 'scramble', note: 'The same in Persian.',
  },
  {
    id: 'cmd-graph-en', language: 'en', utterance: 'show me the graph where each dot is a whole position',
    expected: 'show-state-space', note: 'Needs the distinction between the two pictures.',
  },
  {
    id: 'cmd-map-en', language: 'en', utterance: 'I want to see the 54 stickers laid out flat',
    expected: 'show-sticker-map', note: 'Describes the map without naming it.',
  },
  {
    id: 'cmd-inverse-en', language: 'en',
    utterance: "why do R and R prime undo each other",
    expected: 'explain-inverse', note: 'A question, not an instruction.',
  },
  {
    id: 'cmd-inverse-fa', language: 'fa', utterance: 'چرا R و وارونش همدیگر را خنثی می‌کنند؟',
    expected: 'explain-inverse', note: 'The same in Persian.',
  },
  {
    id: 'cmd-notation-fa', language: 'fa', utterance: 'می‌خواهم دوباره نمادگذاری را تمرین کنم',
    expected: 'open-notation-lesson', tolerant: ['open-training'],
    note: 'Practise plus notation; either destination is defensible.',
  },
  {
    id: 'cmd-step-en', language: 'en', utterance: 'go forward one move',
    expected: 'step-forward', note: 'Must not be confused with play.',
  },
  {
    id: 'cmd-none-en', language: 'en', utterance: 'what is the weather like today',
    expected: 'none', note: 'Nothing fits; must say so rather than guess.',
  },
  {
    id: 'cmd-none-vague', language: 'en', utterance: 'do the thing',
    expected: 'none', tolerant: ['scramble', 'solve'],
    note: 'Too vague to act on. Even if routed, it must need confirmation.',
  },
];
