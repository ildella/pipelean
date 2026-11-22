# Guide

## Core concepts

Pipelean provides tools on two axes: **what you are folding** and **what you
keep**.

|  | keep every intermediate | keep only the final |
|---|---|---|
| fold over **items** (many inputs) | `scan` | `reduce` |
| fold over **steps** (one input) | — | `enrich` |

A pure sync fold with no report to inspect is `foldSync` — see
[Which fold?](#which-fold) below.

Outside the table:

- **`series`** — many items, no dependency between them (map + drop, with
  progress, pause and take).
- **`mapSeries` / `mapSeriesSync`** — the sequential map with the strategy
  locked to `rethrow`: a bare array or a thrown original error.
- **`pipe`** — one value through ordered steps, value in / value out.
- **`join`** — a few named, different tasks running at the same time.

So: if step N needs step N-1's output you are folding; count the inputs. Many
inputs → `scan` / `reduce`. One input, many enrichments → `enrich`. A pure sync
fold → `foldSync`.

### Which fold?

| tool | folds | keeps | returns |
|---|---|---|---|
| `foldSync` | items, sync, raw | the final value | the value (any throw propagates) |
| `reduce` | items | the final value | `{value, errors, sourceErrors, failure}` |
| `scan` | items | every intermediate | `{results, errors, sourceErrors, failure}` |
| `enrich` | steps (one input) | the final state | `{value, errors, failure}` |

`scan` and `reduce` are one engine with two result shapes. `enrich` is a `reduce`
over **operations** rather than items:

```js
enrich(ops)(input) === reduce(ops, (state, op) => ({...state, ...op(state)}), input)
```

### Picking a tool

1. `series` — many items, Stateless transformation
2. `filter` — many items, selection (keep/drop)
3. `scan` — many items, stateful fold, every intermediate result
4. `reduce` — many items, stateful fold, final value only
5. `foldSync` — many items, pure sync fold, the value itself (raw)
6. `pipe` — one item, composition of value-in/value-out steps
7. `enrich` — one item, stateful accumulation of object patches
8. `mapSeries` / `mapSeriesSync` — many items, sequential map, throw on failure
9. `join` — named concurrent tasks, one structured outcome
10. `stopWhen` / `forever` — source adapters (predicate stop, unbounded ticks)
11. `signal` — cancellation option on every async iterator
12. `assign` — helper for building `enrich` steps
13. `where`, `findSync` — search helpers
14. `assertOk` — guard a result whose failure would otherwise be ignored

> **Sync variants** — the iteration functions also have synchronous
> counterparts: `seriesSync`, `filterSync`, `findSync`, `scanSync`,
> `reduceSync`, `stopWhenSync`; `pipeSync`, `enrichSync`, `mapSeriesSync` and
> `tryCatchSync` exist too. Same strategies and shapes, direct return instead of
> a `Promise`. `foldSync` is the raw sync fold: no options, no report.
> `signal`, `pause` and `pauseOnErrors` are async-only: passing them to a sync
> variant throws a `TypeError`.

## Error strategies

All iteration functions (`series`, `filter`, `scan`, `reduce`) support five error
strategies:

**failFast** (aliases: `fail`, `stopOnError`)
- Sets `failure: {item, error, index}` on first error
- Calls `onError({item, error, index, total})`, then `onFailure({item, error, index})` immediately
- Stops iteration; results array is empty on failure

**rethrow** (strategy name is `'throw'`)
- Throws the error on first failure
- Does NOT return a structured result on failure
- Does NOT call `onError`, `onFailure` or `onSourceError` (a fold item error
  with `recover` present is the exception: `onError` fires before the seam)
- **Raw async mode, not a value extractor.** Use it when a thrown error is a
  *bug or an infrastructure failure* and the caller handles it outside: async I/O
  with no meaningful partial report, a daemon loop that must exit, "let it
  crash". Do not use it to turn a fold into a value-returning expression — that
  is `foldSync` for a pure sync fold, or `assertOk(result)` for a managed result.
  If your thrown errors are *data* (one bad record among many), use a collecting
  strategy instead: `rethrow` bypasses all callbacks, so `onError` next to it is
  dead configuration.

**failLate**
- Collects all errors in `errors` array
- Sets `failure: {errors}` after the loop completes (only if `errors.length > 0`)
- Calls `onFailure({errors})` if `failure` is truthy

**collect** (default for `series`, `filter`, `enrich`, `join`)
- Collects all errors in `errors` array
- Sets `failure: false`
- Does NOT call `onFailure`

**skip**
- Ignores errors (no collection, `errors` stays empty)
- Sets `failure: false`
- Does NOT call `onFailure`

### Fold recovery (`recover`)

`scan` and `reduce` (plus their sync twins) accept one extra option, `recover`.
It is **not** a strategy: it is a seam that runs when the scanner throws, before
the strategy decides anything. It receives
`{error, item, index, state, total?}` — `state` is the accumulator passed into
the scanner for that item — and returns the **next accumulator**, sync or async.

```js
import {reduce, rethrow} from 'pipelean'

await reduce(rounds, async state => {
  return {...state, ok: await runRound(state)}
}, {failures: 0, ok: true}, {
  strategy: rethrow,
  onError: ({error}) => log.warn(error.message),
  recover: ({state}) => ({...state, failures: state.failures + 1}),
})
```

- `onError` fires **first**, even under `rethrow`: with recovery in place the
  error is handled, so telemetry is not suppressed. Without `recover`, `rethrow`
  behaves as before and does not call `onError`.
- A recovered error is **consumed**: `errors` stays empty, `failure` stays
  `false`, `onFailure` is not called, and `scan` pushes the recovered
  accumulator into `results`.
- If `recover` itself throws, that error becomes the item error and the normal
  strategy handles it. The original scanner error was already reported, so two
  `onError` reports may be observed for one item.
- Source errors (a generator dying mid-stream) bypass `recover`.
- `pause` runs after a successful recovery regardless of `pauseOnErrors`; an
  abort during recovery keeps the recovered accumulator, skips the pause and
  stops.
- `recover` is fold-only: `series`, `filter`, `findSync`, `enrich`, `join` and
  `pipe` throw a `TypeError` if given one. `enrich` points you at `reduce`.
- In `scanSync` / `reduceSync` it must be synchronous; a thenable is rejected
  with a `TypeError`.

### Guarding ignored outcomes (`assertOk`)

`failFast` is the fold default, and its failure is data: the run stops and
returns `failure`, but nothing throws. If the caller never looks at the result,
the job stops silently — the most common way to misuse `failFast`.

`assertOk(result)` closes that gap:

```js
import {assertOk, reduce} from 'pipelean'

const {value} = assertOk(await reduce(items, scanner, initial))
```

- falsy `failure`: returns the same result object;
- truthy `failure`: throws the **original** error — `failure.error`, or the
  first error of a `failLate` aggregate — with the structured failure attached
  as `error.failure`. Identity, message, stack and `instanceof` survive; the
  attachment mutates the thrown error.
- a primitive throw value, a frozen / non-extensible error, or one that rejects
  the `.failure` attachment (non-writable property, Proxy trap) cannot carry the
  property: `assertOk` falls back to
  `Error('pipelean: operation failed', {cause})` with `.failure` attached.

It asserts **no failure**, not "no errors": under `collect` / `skip`, `failure`
is `false` even with entries in `errors`, so `assertOk` returns the result. Use
`failFast` / `failLate` when an ignored failure must be impossible, and
`assertOk` to make sure the outcome is not ignored.

### Defaults

`series`, `filter`, `enrich` and `join` default to **`collect`**: keep what
worked, report the rest. `scan` and `reduce` default to **`failFast`**: a
half-finished fold is usually meaningless, so stop at the first error. Pass a
strategy explicitly whenever the default is not the policy you mean.

### Source errors

Errors thrown by the **iteration itself** (e.g. an async generator dying
mid-stream) are treated separately from operation errors: they never reach the
error strategies' `onError`, and instead are reported through
`onSourceError({error, index})` and the additive `sourceErrors` result field — so
partial progress survives a dead source under every strategy except `rethrow`.
See the [Source errors section in the reference](reference.md#source-errors) for
details.

---

## Features

#### Iteration: series / scan / reduce / filter

* **Error strategies** — built-in and first-class (see above).

* **Universal input**
  - Works on arrays, generators, and any async iterable (`for await`).
  - Not a Node/`ReadableStream` adapter — pass something `for await` can consume.

* **Universal mapper**
  - Handles sync and async mapper functions automatically.
  - `filter` accepts patterns via `where()`: `filter(users, {active: true})` is
    equivalent to `filter(users, where({active: true}))`.
  - `findSync` accepts the same predicate forms and stops at the first match.

* **Structured results**
  - Iterators return `{results, errors, sourceErrors, failure}`; `reduce` returns
    `{value, errors, sourceErrors, failure}`.
  - Errors are data, removing the need for consumer-side `try/catch`.

* **Shared callbacks**
  - `onError({item, error, index, total})` runs for handled item errors.
  - `onFailure` runs when `failure` is truthy (`failFast` / `failLate`).
  - `onSourceError({error, index})` runs when the iterable itself throws.

* **`series` / `filter` only**
  - `onProgress({item, result, index, total})` after each kept success (awaited, live).
  - `take` to process a prefix (including infinite generators).
  - `total` for progress math; omitted when the size is unknown.
  - `scan` and `reduce` do **not** have `onProgress` or `take`.

* **Async loop control (all iterators)**
  - `pause` spaces work: a number, or a function that receives
    `(item, index)` on `series`/`filter` and `(accumulator, item, index)` on
    folds, resolved after the state update.
  - `pauseOnErrors` also pauses after handled errors (`skip` always pauses on
    `series`).
  - `signal: AbortSignal` stops the run before the next item and cuts a pending
    `pause` short. Aborting is clean (`failure: false`, no source errors) and
    keeps the completed result/accumulator; it never interrupts the in-flight
    mapper/scanner. Sync variants reject all three options with a `TypeError`.

* **Source adapters**
  - `stopWhen(items, predicate)` stops pulling as soon as the predicate is
    truthy — checked *before* the item is offered downstream.
  - Composes with every consumer (`series`, `scan`, `reduce`, `filter`, raw
    `for await`) with no option changes:
    `series(fn, opts)(stopWhen(items, shouldStop))`.
  - Cancel is a clean shorter run (`failure: false`), never a source error.

* **Order guarantee**
  - Execution is sequential, so output order strictly matches input order.

#### Sequential map: mapSeries / mapSeriesSync

`series` is the default and returns a report. When a sequential map's only
acceptable outcome is success — one failure must reject the whole run — use
`mapSeries`, which locks the strategy to `rethrow` and unwraps `.results`:

```js
import {mapSeries, mapSeriesSync} from 'pipelean'

const rows = await mapSeries(files, file => parseFile(file))
// a throw rejects with the ORIGINAL error; no report object to inspect

const cached = mapSeriesSync(paths, path => cache.get(path))
// same contract, returns directly

// Both call forms:
const parseAll = mapSeries(file => parseFile(file))
await parseAll(files)
```

Every other option passes through (`take`, `total`, `onProgress`, `pause`,
`pauseOnErrors`, `signal`), so it is still a *sequential* map with progress and
pacing (`mapSeriesSync` rejects the async-only `pause`, `pauseOnErrors` and
`signal` with a `TypeError`, like every sync twin). A
`strategy` other than `rethrow` / `'throw'` is a `TypeError` rather than a silent
override, and `onError` / `onFailure` / `onSourceError` are rejected with a
`TypeError` naming the offending key: under the locked `rethrow` they could never
fire, so they are dead configuration. Two inherited behaviors matter: returning
`undefined` **drops** the item (this is not `Array.prototype.map`), and a failure
throws before any callback. `mapSeriesSync` rejects an async iterable with an
explicit `TypeError` naming `mapSeries()`.

Reach for plain `series` when a failure is data you want to collect; reach for
`mapSeries` when a failure is a bug that must surface. An async fold keeps
`reduce` + `strategy: rethrow` — there is no async `foldSync`, because async
folds need `recover`, `signal` and `pause`.

#### Composition: pipe

Compose ordered steps into a single reusable function for `series()`:

```js
import { series, pipe } from 'pipelean'

const normalizeActiveUser = pipe(
  user => user.active ? user : undefined,
  user => user.email,
  email => email.toLowerCase()
)

const result = await series(users, normalizeActiveUser)
```

`pipe()` chains functions left-to-right and preserves Pipelean's drop signal:
when any step returns `undefined`, the remaining steps are skipped and
`undefined` propagates out. Combined with `series` (which drops items whose mapper
returns `undefined`), this merges transformation and selection in one pass:

```js
import { series, pipe } from 'pipelean'

const result = await series(numbers, pipe(
  x => x % 2 === 0 ? x : undefined, // select: drop odds
  x => x * 2,                        // transform: double
))
// result.results = [4, 8, 12] from inputs [2, 4, 6]
```

`pipe` does **not** catch errors: a throw escapes to the caller. Only `undefined`
short-circuits — `null`, `false`, `0` and `''` are values. This is composition in
the `Maybe`/`Option` sense (`A => Option<B>`), not plain composition as in Ramda
or fp-ts `flow`.

**Use `pipe` when** one value goes through value-in/value-out steps and any step
may bail. **Don't use it when** steps need the state accumulated so far
(`enrich`), or you want failures captured as data (`series` strategy or
`tryCatch`).

#### Stateful accumulation: scan, reduce, enrich

`scan` folds items and keeps every intermediate accumulator; `reduce` folds items
and keeps only the last. Both take `(iterable, scanner, initialValue, opts?)`
where the scanner is `(accumulator, item, index) => newAccumulator`.

```js
import {scan, reduce} from 'pipelean'

// scan: every intermediate value matters (each insert needs the previous ID)
const {results} = await scan(playlistTracks, insertAfter, 0)

// reduce: only the total matters
const {value: totalDuration} = await reduce(
  tracks, (total, {duration}) => total + duration, 0,
)
```

A fold with no failure policy to decide — a pure sync `foldl` where a throw is a
bug — is `foldSync`, which returns the value itself:

```js
import {foldSync} from 'pipelean'

const totalDuration = foldSync(
  tracks, (total, {duration}) => total + duration, 0,
)
```

`foldSync` takes exactly three arguments (a fourth is a `TypeError`), throws the
original error, and keeps `undefined` as a legal accumulator. Use `reduce` when
the fold's input can be bad as data, or when you need `recover`, `signal` or
`pause`. `scan` and `reduce` default to `failFast`. Under `failFast` the
`results` array is cleared on failure (the `value` of a `reduce` survives: only
`results` is cleared), so use `collect`/`failLate` when partial progress matters.
Both folds support `pause`, `pauseOnErrors`, `signal` and the fold-only
`recover` seam; `take` and `onProgress` remain `series`-only.

`recover` is what lets a fold survive a failed step while keeping the
accumulator moving:

```js
const {value} = await reduce(items, scanner, {failures: 0}, {
  strategy: rethrow,
  onError: ({error}) => log.warn(error.message),
  recover: ({state}) => ({...state, failures: state.failures + 1}),
})
```

It is not a strategy and not available outside `scan` / `reduce` (and their sync
twins). See [Fold recovery](#fold-recovery-recover) above.

`enrich` folds **steps** over one input. Each step receives the current state and
returns an object patch that gets shallow-merged in. Define the pipeline once and
reuse it:

```js
import { enrich } from 'pipelean'

const prepareAlbum = state => ({title: state.rawTitle.trim()})
const extractYear = state => ({year: parseYear(state.rawYear)})
const extractArtists = state => ({artists: state.artists ?? []})

const processAlbum = enrich([prepareAlbum, extractYear, extractArtists])

const {value, errors, failure} = await processAlbum(input)
// value = {title, year, artists, ...input}
```

`enrich` returns `{value, errors, failure}` — no `results` array, no
`sourceErrors` (the steps are a fixed array, so a source error is impossible).
The default strategy is `collect`.

##### Per-step hooks: `onStepStart` / `onStepSuccess`

`enrich` and `enrichSync` accept two optional telemetry hooks, so a UI can show
progress without hand-rolling the fold:

- `onStepStart({operation, index, total})` fires **before** `operation(state)`.
- `onStepSuccess({operation, patch, index, total})` fires **after** the patch is
  validated and merged. `patch` is what the operation returned, pre-merge.

```js
import {enrich} from 'pipelean'

const processAlbum = enrich([prepareAlbum, extractYear, extractArtists], {
  onStepStart: ({operation, index, total}) =>
    ui.setStep(`running ${operation}`, index + 1, total),
  onStepSuccess: ({operation, patch}) => ui.done(operation, patch),
  onError: ({operation, error}) => ui.fail(operation, error),
})

const {value, errors, failure} = await processAlbum(input)
```

Errors stay on `onError` — there is no `onStepError`. A hook that throws is a
failed step and flows into the strategy like a throwing operation (so `failFast`
stops later hooks, `collect` keeps going). `enrich` **awaits** its hooks;
`enrichSync` calls them fire-and-forget, consistent with its other callbacks, so
its hooks must be **sync** — an async hook's rejection is never observed by the
strategy (a synchronous throw still is). Options bind at build time, and hooks
fire on every run of the returned pipeline.

##### Conditional property assignment with `assign`

`assign(property, parse)` builds an `enrich` step that sets a property only when
`parse(state)` is not `undefined`:

```js
import { assign, enrich } from 'pipelean'

const extractName = assign('name', state => state.rawName.trim())
const extractYear = assign('year', state => {
  const n = Number.parseInt(state.rawYear, 10)
  return Number.isNaN(n) ? undefined : n
})

const {value} = await enrich([extractName, extractYear])({
  rawName: '  Alice  ',
})
// value = {rawName: '  Alice  ', name: 'Alice'}
// year is skipped because rawYear was missing
```

`assign()` skips only on `undefined` — `null`, `false`, `0` and `""` are assigned
normally.

`enrich` differs from `pipe` in three ways:

- The pipeline is defined upfront and reused with different inputs.
- Each step receives the **current accumulated state**, not the previous step's
  return value.
- The result is structured: `{value, errors, failure}` — it never throws on
  handled errors.

Operations can be sync or async. Return an empty object `{}` when a step has
nothing to add — `undefined` is **not** a no-op signal here. The merge is
**shallow**: a later patch overwrites a top-level key but does not deep-merge
nested objects.

#### Don't hand-roll spreads: use `enrich()`

If you find yourself writing `pipe(...lotsOfFunctionsThatReturnObjects)` and
merging the results by hand, you want `enrich()`:

```js
// Before: hand-rolled accumulation
const step1 = prepare(input)
const step2 = {...step1, ...enrichOne(step1)}
const step3 = {...step2, ...finalize(step2)}

// After: the pipeline is defined once
const process = enrich([prepare, enrichOne, finalize])
const {value} = await process(input)
```

#### Fork/join: join

When a handful of **named, heterogeneous** tasks can run at the same time, use
`join()`. Every branch starts immediately and `join()` waits for all of them to
settle. The result is one structured object, with each failure reported as data
under its name.

```js
import { join } from 'pipelean'

const {value, errors, failure} = await join({
  api: () => ping('api.example.com'),
  cdn: () => ping('cdn.example.com'),
})

// value = {api: 200, cdn: 200}, errors = [], failure = false
// a failed branch: value keeps the successes, errors names the failure
```

`join()` uses the same error strategies as `enrich()` (default `collect`).
`failFast` behaves as `failLate` here: branches already started and there is no
cancellation. `join()` is deliberately *not* a concurrent map — for that, use
p-map.

#### Wrappers

Pipelean provides lightweight wrappers that add behavior to **individual
functions**. They compose with `pipe` and `series`.

- **`tryCatch(fn, options?)`**
  Protects a single function with lifecycle hooks: `onStart`, `onSuccess`,
  `onError`, `onFinally`. Returns `undefined` on failure — the same drop signal
  used everywhere else — so a failed step short-circuits `pipe` and drops the
  item in `series`. Ideal for centralized error reporting even outside
  pipelines. An `onError` that throws (or rejects) **propagates**: it replaces the
  original error, and `onFinally` still runs, so you can augment-and-rethrow from
  the hook.

- **`retry(fn, options?)`**
  Automatic retries: `attempts` (default 3), `delay` in ms (default 0). Re-throws
  the last error once attempts are exhausted, so the surrounding strategy still
  sees the failure.

Neither wrapper is an error strategy: strategies belong to the iterators.

---

## Key principles

1. **`onError` ≠ error strategy**: `onError` is a callback, not a strategy.
2. **`failure` is truthy for**: `failFast` (`{item, error, index}`) and `failLate`
   (`{errors}`). In `join()`, `failFast` behaves as `failLate`.
3. **`failure` is falsy for**: `collect`, `skip`, and `rethrow` on success.
4. **`throw` does not return on error**: it propagates to the caller.
5. **Strategy selection**: choose based on whether failures are acceptable.
6. **`enrich()` returns `{value, errors, failure}`**: it never throws on handled
   errors unless you pick `rethrow`. `value` is the last successful state.
7. **Patches are shallow-merged in `enrich()`**: top-level keys are overwritten;
   nested objects are not deep-merged. Return `{}` (not `undefined`) for a no-op.
8. **`undefined` is the drop signal** in `series`, `filter`, `pipe`, `mapSeries`
   and `mapSeriesSync`; it is not a valid value to map to.
9. **Bug or data?** A thrown error that means "this cannot happen" belongs in
   `foldSync`, `mapSeries` / `mapSeriesSync`, or `rethrow`. A thrown error that
   means "this record is bad" is data: use `reduce` / `scan` / `series` with a
   strategy. To get the value out of a managed result, use `assertOk(result)`,
   never `{strategy: rethrow}`.

Check out [patterns.md](./patterns.md).
