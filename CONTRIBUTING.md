# Contributing to Cube Atlas

Pull requests are welcome — bug fixes, lessons, translations, solver
improvements, accessibility work. For anything larger than a fix, open an issue
first so we can agree on the shape before you spend the time.

## Setting up

```bash
git clone https://github.com/M-Ziraki/rubik_cube.git && cd rubik_cube
npm install
npm run dev          # http://localhost:5173
```

Node 18 or newer. No API key and no network access are needed for anything
except the optional Jev integration (see [docs/how-it-works.md](docs/how-it-works.md#the-optional-jev-integration)).

## Before you open a pull request

```bash
npm test             # engine, solvers, playback, i18n and Jev — must pass
npm run build        # also checks filename casing, translation coverage and types
```

If you changed anything a person can see, run the browser checks against a
production build as well:

```bash
npm run build && npm run preview     # in one terminal, then in another:
npm run verify           # rendering, playback, languages, three screen widths
npm run verify:ux        # user journeys and the phone layout
npm run verify:contrast  # WCAG 2.2 text contrast, both themes, both languages
npm run acceptance       # the sticker map, and dragging a face both ways
```

If you touched `src/solver/`, rerun `npm run bench` and say in the pull request
whether the numbers moved.

## Ground rules

These are what the project is built on, so a change that breaks one will be
asked to change.

- **Never overclaim.** A solution is not "optimal" unless the algorithm that
  produced it proves it. Published figures are labelled as published; anything
  judged by a model is labelled as a judgment. See
  [Honesty about claims](docs/how-it-works.md#honesty-about-claims).
- **The cube engine is the only authority on the cube.** Nothing else —
  including the optional AI integration — computes moves, validates positions or
  changes the cube's state.
- **Every user-visible string goes through `src/i18n/en.ts`,** with a Persian
  entry in `src/i18n/fa.ts`. The build fails on hardcoded English. Wrap move
  notation in prose with `<T>` so it stays left-to-right in Persian.
- **Tests for behaviour, not just for code.** A fix for something you could see
  should come with a test that would have failed before it.
- **Secrets never touch the repository.** Copy `.env.example` to `.env` for a
  local key; `.env` is ignored.

## Commit messages

Say what changed and why, in the imperative: "Turn the face the way the pointer
pulled it", not "fixed drag bug". The body is for the reasoning a reviewer would
otherwise have to reconstruct.

## License

By contributing you agree that your contributions are licensed under the
[MIT License](LICENSE).
