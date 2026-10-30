# Pipelean

[![npm version](https://img.shields.io/npm/v/pipelean.svg)](https://www.npmjs.com/package/pipelean)
[![Build Status](https://github.com/ildella/pipelean/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/ildella/pipelean/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Sequential async pipelines with **first-class error handling**. Eager execution,
structured results, plain JavaScript — no framework, no scheduler, no monads to
learn.

## Why Pipelean?

Every async pipeline ends up hand-writing the same three things: the loop, the
`try/catch`, and the accumulator. Pipelean gives each one a name and a tested
implementation — and it never swallows an error.

```js
// Before: the failure policy is an accident
const results = []
for await (const page of pages(db)) {
  try {
    results.push(await importPage(page))
  } catch (error) {
    logger.error({page, error}) // swallow? abort? keep the rest?
  }
}
```

```js
// After: the failure policy is an explicit choice
import {series, collect} from 'pipelean'

const {results, errors} = await series(pages(db), importPage, {
  strategy: collect,
  onError: ({item, error}) => logger.error({item, error}),
})
// results: every page that worked
// errors:  [{item, error, index}] — data, not an exception
```

## How to choose

Two questions: **am I folding many items or one input?** and **do I need every
step, or only the last?**

|  | keep every intermediate | keep only the final |
|---|---|---|
| fold over **items** (many inputs) | `scan` | `reduce` |
| fold over **steps** (one input) | — | `enrich` |

Three tools sit outside the table:

| need | tool |
|---|---|
| items are independent | `series` |
| value in → value out, one item | `pipe` |
| a few named tasks, at the same time | `join` |

Rule of thumb: if step N needs step N-1's output, you are **folding**. Count
your inputs: many inputs → `scan` or `reduce`; one input with many enrichments →
`enrich`.

---

## Sequential work over many items: `series()`

The default. Consumes arrays and any async iterable, one item at a time, and
returns `{results, errors, sourceErrors, failure}`.

**Use when** items are independent: import/sync jobs, API fan-in with a rate
limit, paging generators, anything with a progress bar.

```js
import {series, collect} from 'pipelean'

async function* pages(db) {
  let cursor
  do {
    const page = await db.nextPage(cursor)
    cursor = page.cursor
    yield page
  } while (cursor)
}

const {results, errors, sourceErrors} = await series(pages(db), importPage, {
  strategy: collect,
  pause: 200,                       // spacing between successful items
  onProgress: ({index, total}) => setStatus(`imported ${index + 1}`),
  onError: ({item, error}) => reportPage(item, error),
  onSourceError: ({error, index}) => log.warn('pager died', {error, index}),
})
```

- `onProgress` fires live after each kept item and is awaited before the next.
- `total` is omitted when the source has no cheap length.
- A source that dies mid-stream is a **source error**, distinct from an item
  error: partial `results` survive, `sourceErrors` records the context.

**Don't use when** item N needs item N-1's output (`reduce` / `scan`), you have
one input with many enrichments (`enrich`), or you need a fixed set of different
tasks running together (`join`).

**Gotchas** — returning `undefined` from the mapper **drops the item** (that is
how `filter` and select-in-pipe work). `take`, `pause` and `onProgress` exist
only on `series`/`filter`, not on `scan`/`reduce`. There is no `AbortSignal`
support: cancel through `stopWhen()` plus your own controller inside the
operation.

### Filtering

```js
import {filter, findSync, where} from 'pipelean'

await filter(users, user => user.active)      // or: filter(users, where({active: true}))
findSync(users, {active: true})               // first match, stops early
```

---

## Vertical composition: `pipe()`

One value through ordered steps, left to right. `pipe` returns a function you can
reuse, and it composes into `series` mappers.

```js
import {series, pipe} from 'pipelean'

const normalizeActiveUser = pipe(
  user => user.active ? user : undefined, // undefined = drop
  user => user.email,
  email => email.toLowerCase(),
)

await series(users, normalizeActiveUser)
```

**Use when** the steps transform one value and any step may bail:
validation/normalisation chains, reusable `series` mappers.

**Don't use when** the steps need the state accumulated so far (`enrich`), or
you want failures captured as data instead of a silent stop (`series` with a
strategy, or `tryCatch`).

**Gotchas** — `pipe` catches nothing: a thrown error escapes to the caller.
Only `undefined` short-circuits; `null`, `false`, `0`, `''` are values and keep
flowing. This is composition in the `Maybe`/`Option` sense (`A => Option<B>`),
not plain composition as in Ramda or fp-ts `flow`.

---

## Stateful accumulation: two folds, not three

There is no third accumulation primitive. `scan` folds **items** and keeps every
step, `reduce` folds **items** and keeps the last, and `enrich` folds **steps**
over one input:

```js
enrich(ops)(input) === reduce(ops, (state, op) => ({...state, ...op(state)}), input)
```

So: `enrich` **is** a `reduce` over your operations. `scan` and `reduce` share
one engine and differ only in what they return.

### `scan()` — items, every intermediate

**Use when** each item depends on the previous one **and** every intermediate
value is useful: chained insert IDs, a running total rendered as a timeline, a
replayable audit trail.

```js
import {scan} from 'pipelean'

// The API needs the previous track's ID to insert the next one
const {results, failure} = await scan(
  playlistTracks,
  (previousId, track) => mediaRenderer.insert(track, {after: previousId}),
  0,
)
```

**Don't use when** you only need the last value (`reduce`), items are
independent (`series`), or the collection being folded is your operation list
(`enrich`).

**Gotchas** — the default strategy is `failFast`, and under `failFast` the
`results` array is **cleared** on failure: you get `failure`, not partials. Use
`collect` or `failLate` when partial progress matters. No `pause`, `take` or
`onProgress`.

### `reduce()` — items, final value only

**Use when** the last value is all you need: sums, counts, concatenation, folding
into a growing record, or a daemon loop built with `forever()` + `stopWhen()`.

```js
import {reduce} from 'pipelean'

const {value: totalDuration} = await reduce(
  tracks,
  (total, {duration}) => total + duration,
  0,
)
```

**Don't use when** intermediate accumulators matter (`scan`), or the thing you
are folding is a list of functions (`enrich`).

**Gotchas** — same engine and defaults as `scan` (`failFast`); `value` is the
last successful accumulator and is preserved when the source dies mid-stream.

### `enrich()` — steps, final value

One input, many enrichment steps. Each step receives the current state and
returns an **object patch** that is shallow-merged in. The pipeline is defined
once and reused with different inputs.

```js
import {enrich} from 'pipelean'

const prepareAlbum = state => ({title: state.rawTitle.trim()})
const extractYear = state => ({year: parseYear(state.rawYear)})
const extractArtists = state => ({artists: state.artists ?? []})

const processAlbum = enrich([prepareAlbum, extractYear, extractArtists])

const {value, errors, failure} = await processAlbum(input)
// value = {title, year, artists, ...input}
```

**Use when** one input passes through several steps that each add or override
fields and need to see everything added so far: raw payload → normalised entity,
request → enriched context, form → validated model.

**Don't use when** steps return plain values rather than patches (`pipe`), there
are many inputs (`series` + `pipe`), or you need every intermediate state — if
you genuinely do, fold the patches with `scan`.

**Gotchas** — the merge is **shallow**: later patches overwrite top-level keys,
nested objects are not deep-merged. Every step must return a non-null, non-array
object; return `{}` for a no-op, because `undefined` is **not** a no-op here.
The default strategy is `collect`: a failed step is skipped and later steps run
on the state without its patch (`value` is always the last successful state).
Errors are named after the function (`extractYear`) or by position.

`assign(property, parse)` builds an `enrich` step that sets a property only when
`parse(state)` is not `undefined`:

```js
import {assign, enrich} from 'pipelean'

const process = enrich([
  assign('name', state => state.rawName.trim()),
  assign('year', state => {
    const n = Number.parseInt(state.rawYear, 10)
    return Number.isNaN(n) ? undefined : n
  }),
])
```

---

## Named concurrency: `join()`

A handful of **named, heterogeneous** async tasks that should run at the same
time and be reported together. Every branch starts immediately and `join` waits
for all of them; the result shape never depends on completion order.

```js
import {join} from 'pipelean'

const {value, errors, failure} = await join({
  ping: () => pingHost('api.example.com'),
  scan: () => scanPort('api.example.com', 443),
})
// all good:     value = {ping: <ms>, scan: <bool>}, errors = [], failure = false
// ping failed:  value = {scan: <bool>},
//               errors = [{operation: 'ping', error, index: 0}], failure = false
```

**Use when** the branches are few, different from each other, and each one
deserves a name in the report.

**Don't use when** you need a concurrent map over a homogeneous collection — use
p-map; `join` has no concurrency cap, no scheduler and no cancellation.
`failFast` behaves as `failLate` here, because the branches already started.

---

## Sources and loops: `stopWhen()`, `forever()`

`stopWhen(items, predicate)` stops pulling from any iterable as soon as the
predicate is truthy — checked **before** the item is offered downstream. It
composes with every consumer, no option changes.

```js
import {reduce, forever, stopWhen} from 'pipelean'

await series(enrichOne, {pause: DELAY})(stopWhen(albums, shouldStop))
```

Stopping is a clean shorter run (`failure: false`, no source error), and the
abandoned source's cleanup still runs. `forever()` yields `0, 1, 2, …` with no
end: the two halves make a daemon loop, with `stopWhen` supplying the length and
`reduce` carrying the state. See [patterns](docs/patterns.md#pattern-10-daemon-loop-with-forever--stopwhen).

---

## Resilience wrappers: `retry()`, `tryCatch()`

These wrap a single function and compose into `pipe`/`series`. They are **not**
error strategies — strategies belong to the iterators.

```js
import {pipe, retry, series, tryCatch} from 'pipelean'

const pipeline = pipe(
  retry(downloadTrack, {attempts: 3, delay: 200}),
  processTrack,
  tryCatch(updateDb, {onError: error => report(error)}),
)

await series(tracks, pipeline, {strategy: collect})
```

- `retry(fn, {attempts = 3, delay = 0})` re-throws the last error once attempts
  are exhausted, so the surrounding strategy still sees the failure.
- `tryCatch(fn, {onStart, onSuccess, onError, onFinally})` returns `undefined`
  on failure — the same drop signal used everywhere else — so a failed step
  short-circuits `pipe` and drops the item in `series`.

---

## Error strategies

Every iterator accepts the same five strategies:

| strategy | `errors` | `failure` | stops? |
|---|---|---|---|
| `collect` | all handled errors | `false` | no |
| `failLate` | all handled errors | `{errors}` at the end | no |
| `failFast` (aliases `fail`, `stopOnError`) | `[]` | `{item, error, index}` | on first error |
| `skip` | `[]` | `false` | no |
| `rethrow` | throws | — | on first error |

Defaults: `series`, `filter`, `enrich` and `join` use `collect`;
`scan` and `reduce` use `failFast`, because a half-finished fold is usually
meaningless. Pass a strategy explicitly whenever the default is not the policy
you mean.

`onError` is a **callback**, not a strategy. It fires for handled item errors and
never changes control flow.

## Result shapes

| function | returns |
|---|---|
| `series`, `filter`, `scan` | `{results, errors, sourceErrors, failure}` |
| `reduce` | `{value, errors, sourceErrors, failure}` |
| `enrich`, `join` | `{value, errors, failure}` |
| `findSync` | `{result, errors, failure}` |

`enrich` and `join` fold a known list of steps/branches, so a "source error" is
impossible there and the field is not returned.

## Synchronous variants

`seriesSync`, `filterSync`, `findSync`, `scanSync`, `reduceSync`, `enrichSync`,
`pipeSync` and `tryCatchSync` mirror the async API with the same strategies,
shapes and callbacks — they just return directly instead of a `Promise`.

## Coming from Elixir, Scala/cats, or Haskell?

| Pipelean | Elixir | Scala / cats / Akka | Haskell |
|---|---|---|---|
| `series` | `Enum.map` + `Task` | `Source.mapAsync(1)` | `traverse` / `mapM` |
| `scan` | `Enum.scan` | `scanLeft` | `scanl` |
| `reduce` | `Enum.reduce` | `foldLeft`, `Source.runFold` | `foldl` / `foldM` |
| `pipe` | `with` | `Option.andThen` | Kleisli `>=>` for `Maybe` |
| `enrich` | `Enum.reduce(ops, acc, &Map.merge(&2, &1.(&2)))` | `foldLeft` over `A => A` | `foldl` over patches |
| `join` | `Task.async` + `Task.await_many` | `Future.sequence` on a record | `traverse` on a record |
| `stopWhen` | `Stream.take_while` | `Source.takeWhile` | `takeWhile` |

These are **shapes, not laws**. `pipe`'s Maybe is not lawful (`null` is a value;
only `undefined` is a drop), and iterators return records rather than an
`Either`. Full mapping, with the caveats: [docs/fp-mapping.md](docs/fp-mapping.md).

---

## Tooling

### ESLint plugin

Flags `.forEach()`, `.reduce()`, `.map(async ...)`, non-generator loops and
`Promise.*` combinators, suggesting pipelean equivalents. Separate entry point —
importing it does not pull in the runtime.

```js
import pipeleanConfig from 'pipelean/eslint/config'

export default [
  pipeleanConfig,
  {
    rules: {
      'pipelean/no-loop-without-yield': 'warn',
      'pipelean/no-promise-combinators': 'warn',
    },
  },
]
```

### Agent skills

Pipelean ships **Skills** for AI assistants (Claude, Gemini CLI, Cursor, …):

```sh
npx skills add https://github.com/ildella/pipelean/tree/master/skills
```

Installs `pipelean-core` and `pipelean-functional-programming`. With
[skills-npm](https://github.com/antfu/skills-npm/): `yarn add -D skills-npm &&
yarn skills-npm`.

## Limitations

Worth knowing before you adopt it:

- **Eager execution.** Work starts immediately; there are no lazy pipelines. For
  a lazy producer, write a normal async generator and let it yield.
- **Sequential by design.** The only concurrency is `join`, which has no cap, no
  scheduler and no cancellation.
- **No `AbortSignal` plumbing.** Cancel through `stopWhen()` and keep
  intra-item cancellation in your own operation.
- **`undefined` is the drop sentinel**, so you cannot map an item to `undefined`.
- **Two error layers.** Strategies belong to the iterators; `retry`/`tryCatch`
  are function wrappers. Mixing them up is the most common mistake.
- **No TypeScript declarations yet.**
- **Not a stream adapter.** Anything `for await` accepts works; Node
  `ReadableStream` glue is yours.

## Documentation

- [Architecture](docs/architecture.md) — philosophy and design principles.
- [Guide](docs/guide.md) — core concepts and usage patterns.
- [Examples](docs/examples.md) — practical examples for every function.
- [Reference](docs/reference.md) — full API contracts.
- [FP mapping](docs/fp-mapping.md) — the table above, in depth.
- [Patterns](docs/patterns.md) — error-handling recipes, daemon loops.
- [Migration](docs/migration.md) — upgrading from earlier versions.
