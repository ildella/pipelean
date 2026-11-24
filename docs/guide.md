# Guide

This guide teaches Pipelean's **mental model**: the problem first, then the API.
Each chapter answers one question — what kind of work do I have, how do steps
relate, what happens when something fails, how does a run live and stop. For
exact contracts (signatures, options, return shapes) use the
[reference](reference.md); for recipes see [patterns](patterns.md) and
[examples](examples.md).

Chapters:

1. [The mental model](#the-mental-model) — four kinds of work
2. [Independent vs dependent operations](#independent-vs-dependent-operations)
3. [Sequential vs concurrent](#sequential-vs-concurrent)
4. [Pipeline composition](#pipeline-composition)
5. [Accumulation vs enrichment](#accumulation-vs-enrichment)
6. [Errors as data vs errors as exceptions](#errors-as-data-vs-errors-as-exceptions)
7. [Lifecycle, cancellation, recovery](#lifecycle-cancellation-recovery)

## The mental model

Pipelean has four kinds of work. Find the shape of your problem and you know
which tools to look at:

| Kind of work | Shape | Tools |
|---|---|---|
| **Independent items** | many inputs, no dependency between them | `series`, `filter`, `mapSeries` |
| **Accumulation** | many inputs, each needs the previous result | `scan`, `reduce`, `foldSync` |
| **Enrichment** | one input, many steps that add fields | `enrich` |
| **Composition & concurrency** | one value through steps, or a few named tasks at once | `pipe`, `join` |

The first distinction is **independent vs dependent**: if step N needs step
N-1's output you are **folding**; count the inputs. Many inputs → `scan` /
`reduce`. One input, many enrichments → `enrich`. A pure sync fold → `foldSync`.

The second distinction is **what you keep**. Pipelean provides tools on two
axes: **what you are folding** and **what you keep**.

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

### Which fold?

`foldSync` is the raw sync fold over items: it keeps the final value and returns
it directly, so any throw propagates. `reduce` keeps the final value as a
managed report; `scan` keeps every intermediate in `results`; `enrich` folds
over the **steps** of one input and keeps the final state. The full comparison —
inputs, outputs, defaults — is the matrix in
[How to choose](reference.md#how-to-choose).

`scan` and `reduce` are one engine with two result shapes. `enrich` is a `reduce`
over **operations** rather than items:

```js
enrich(ops)(input) === reduce(ops, (state, op) => ({...state, ...op(state)}), input)
```

### Picking a tool

The comparative table lives in the reference:
[How to choose](reference.md#how-to-choose) lists every public combinator and
source adapter, sync twins included, with its model (items, steps, value,
tasks, source), input, output, default strategy and `undefined` handling. Read
it when you are choosing between two APIs; the chapters below explain the mental
model behind it, and [Errors as data vs errors as
exceptions](#errors-as-data-vs-errors-as-exceptions) explains the strategy
column.

> **Sync variants** — the iteration functions also have synchronous
> counterparts: `seriesSync`, `filterSync`, `findSync`, `scanSync`,
> `reduceSync`, `stopWhenSync`; `pipeSync`, `enrichSync`, `mapSeriesSync` and
> `tryCatchSync` exist too. Same strategies and shapes, direct return instead of
> a `Promise`. `foldSync` is the raw sync fold: no options, no report.
> `signal`, `pause` and `pauseOnErrors` are async-only: passing them to a sync
> variant throws a `TypeError`. Callbacks must be sync too: a mapper, predicate,
> scanner, reducer, operation, hook, telemetry callback (`onError`, `onFailure`,
> `onSourceError`, `onProgress`) or wrapped function returning a Promise — or
> any thenable — throws a `TypeError` pointing at the async twin. The violation
> is fatal: it escapes the strategy, never collected as item data. Full
> contract: [Sync variants](reference.md#sync-variants).

### When plain JavaScript is clearer

Pipelean earns its place when a run needs at least one of: an explicit
**failure policy**, a **lifecycle** (progress, pacing, cancellation), a
**structured report** to inspect, or a **reusable pipeline**. When none of
these apply, plain JavaScript is clearer and you should keep it:

- **A single operation** — one `await` with a `try/catch` at a boundary is
  already explicit; wrapping it adds indirection, not safety. `tryCatch` is
  for when you want the wrapper itself: a reusable execution boundary with
  uniform observation, lifecycle hooks and an explicit failure policy
  (`recover`).
- **A pure sync transformation with no failure policy** — `items.map(x => x.id)`
  or `items.filter(Boolean)` says exactly what it does. A pure sync *fold* is
  the exception: `foldSync` is its canonical form, and `no-array-reduce`
  points at it.
- **A loop inside a generator** — yielding producers are where loops belong;
  `no-loop-without-yield` only flags loops that are not sources.

The ESLint rules are advisory: a warning is a prompt to apply this gate, not
an order to rewrite. If the native code passes the gate, keep it and suppress
the rule at that site — see [ESLint plugin](eslint.md). For rewriting a loop
that *does* pass the gate, the before/after checklist is
[Rewriting a hand-rolled loop safely](patterns.md#rewriting-a-hand-rolled-loop-safely).

## Independent vs dependent operations

**The question**: does item N need item N-1's output? If not, the items are
independent and you want a sequential map or filter. If yes, you are folding —
go to [Accumulation vs enrichment](#accumulation-vs-enrichment).

### Independent items: series and filter

**Use `series` when** items are independent: import/sync jobs, API fan-in with a
rate limit, paging generators, anything with a progress bar. **Don't use it
when** item N needs item N-1's output (`reduce` / `scan`), you have one input
with many enrichments (`enrich`), or you need a fixed set of different tasks
running together (`join`).

* **Universal input**
  - Works on arrays, generators, and any async iterable (`for await`).
  - Not a Node/`ReadableStream` adapter — pass something `for await` can consume.

* **Universal mapper**
  - Handles sync and async mapper functions automatically.
  - Returning `undefined` **drops the item** — this is how selection works in
    `series` and `pipe`; it is not a valid value to map to.
  - `filter` accepts patterns via `where()`: `filter(users, {active: true})` is
    equivalent to `filter(users, where({active: true}))`.
  - `findSync` accepts the same predicate forms and stops at the first match.

* **`series` / `filter` only**
  - `onProgress({item, result, index, total})` after each kept success (awaited, live).
  - `take` to process a prefix (including infinite generators).
  - `total` for progress math; omitted when the size is unknown.
  - `scan` and `reduce` do **not** have `onProgress` or `take`.

* **Error strategies** — built-in and first-class; see
  [Errors as data vs errors as exceptions](#errors-as-data-vs-errors-as-exceptions).

Pacing (`pause`), cancellation (`signal`) and source adapters (`stopWhen`,
`forever`) apply to every iterator, not just `series` — see
[Lifecycle, cancellation, recovery](#lifecycle-cancellation-recovery).

### When failure must throw: mapSeries / mapSeriesSync

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
explicit `TypeError` naming `mapSeries()`, and its callbacks — the mapper and
`onProgress` alike — fall under the shared sync rule: a returned thenable is a
fatal `TypeError` ([Sync variants](reference.md#sync-variants)).

Reach for plain `series` when a failure is data you want to collect; reach for
`mapSeries` when a failure is a bug that must surface. An async fold keeps
`reduce` + `strategy: rethrow` — there is no async `foldSync`, because async
folds need `recover`, `signal` and `pause`.

## Sequential vs concurrent

**The question**: do the tasks need to run one at a time, or at the same time?

Pipelean is **sequential by design**, with an **order guarantee**: execution is
sequential, so output order strictly matches input order. Work is eager — it
starts when you call, there are no lazy pipelines. The only concurrency is
`join`, and it is deliberately small.

### Fork/join: join

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

## Pipeline composition

**The question**: how do I turn several small steps into one reusable operation?

### Composition: pipe

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
`tryCatch` with `recover`).

### Wrappers: retry and tryCatch

Pipelean provides lightweight wrappers that add behavior to **individual
functions**. They compose with `pipe` and `series`.

- **`tryCatch(fn, options?)`**
  The composable execution boundary for one operation. `onStart` gates the call
  and `recover` is the only seam that substitutes a failure; the other hooks
  report what happened and never mask the operation outcome. Each hook and
  `recover` receive one context object — `onStart({args, name})`,
  `onSuccess({result, args, name})`, `onError({error, args, name})`,
  `onFinally({args, name})` — where `args` is a copy of the invocation's
  argument list and `name` is the optional `name` label. **By default a failure
  is rethrown** — the wrapper never swallows.
  `recover({error}) => value` is the explicit seam that turns a failure into a
  value; `recover: () => undefined` is the spelled-out drop that short-circuits
  `pipe` and drops the item in `series`. Without `recover`, a `tryCatch` inside
  `series` just observes and the run's strategy still decides policy. A hook
  failure never masks the operation error: on the failure path it is attached as
  `error.hookErrors` best effort, and dropped if the primary cannot carry it;
  on the success path the hook error is thrown as itself.

- **`retry(fn, options?)`**
  Automatic retries: `attempts` (default 3), `delay` in ms (default 0). Re-throws
  the last error once attempts are exhausted, so the surrounding strategy still
  sees the failure.

Neither wrapper is an error strategy: strategies belong to the iterators.

## Accumulation vs enrichment

**The question**: when step N needs what came before, am I folding over **items**
or over **steps**? Many inputs that build on each other → accumulation (`scan`,
`reduce`, `foldSync`). One input that many operations enrich → `enrich`.

### Folding items: scan, reduce, foldSync

`scan` folds items and keeps every intermediate accumulator; `reduce` folds items
and keeps only the last. Both take `(iterable, scanner, initialValue, opts?)`
where the scanner is `(accumulator, item, index) => newAccumulator`.

**Use `scan` when** each item depends on the previous one **and** every
intermediate value is useful: chained insert IDs, a running total rendered as a
timeline, a replayable audit trail. **Use `reduce` when** you need the last
value **plus the report**: the accumulator, the errors, and a failure policy for
a fold whose input can be bad (a price that is missing, a record that fails
validation). A daemon loop built with `forever()` + `signal` also belongs here:
it needs the policy even though the value is data. **Don't use either when**
items are independent (`series`), or the collection being folded is your
operation list (`enrich`).

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
Both folds support `pause`, `pauseOnErrors`, `signal` and the fold `recover`
seam; `take` and `onProgress` remain `series`-only.

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
twins). See [Fold recovery](#fold-recovery-recover).

### Folding steps: enrich

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

`enrich` returns `{value, errors, sourceErrors, failure}` — no `results` array,
and `sourceErrors` is always `[]` (the steps are a fixed array, so a source error
is impossible). The default strategy is `collect`.

**Use `enrich` when** one input passes through several steps that each add or
override fields and need to see everything added so far: raw payload →
normalised entity, request → enriched context, form → validated model. **Don't
use it when** steps return plain values rather than patches (`pipe`), there are
many inputs (`series` + `pipe`), or you need every intermediate state — if you
genuinely do, fold the patches with `scan`.

#### Per-step hooks: `onStepStart` / `onStepSuccess`

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
`enrichSync` requires **sync** hooks and operations — a returned Promise is
rejected with a `TypeError` pointing at `enrich`, never silently ignored.
Options bind at build time, and hooks fire on every run of the returned
pipeline.

#### Conditional property assignment with `assign`

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
- The result is structured: `{value, errors, sourceErrors, failure}` — it never
  throws on handled errors.

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

## Errors as data vs errors as exceptions

**The question**: is a thrown error a **bug** ("this cannot happen") or **data**
("this record is bad")? A bug belongs in `foldSync`, `mapSeries` or `rethrow`,
where it escapes to the caller. Data belongs in a strategy: record it, keep what
worked, report at the end. Pipelean's default bet is **errors as data** — you
inspect a structured result instead of writing consumer-side `try/catch`.

* **Structured results**
  - Iterators return `{results, errors, sourceErrors, failure}`; `reduce` returns
    `{value, errors, sourceErrors, failure}`.
  - Errors are data, removing the need for consumer-side `try/catch`.

* **Shared callbacks**
  - `onError({item, error, index, total})` runs for handled item errors.
  - `onFailure` runs when `failure` is truthy (`failFast` / `failLate`).
  - `onSourceError({error, index})` runs when the iterable itself throws.

`onError` is a **callback**, not a strategy: it never changes control flow.

### Error strategies

All iteration functions (`series`, `filter`, `scan`, `reduce`) support five error
strategies:

**failFast** (aliases: `fail`, `stopOnError` — deprecated in 0.16, removal planned for 0.18; use `failFast`)
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
  the `.failure` attachment (non-writable property, setter-less accessor, or a
  throwing Proxy trap) cannot carry the property: `assertOk` falls back to
  `Error('pipelean: operation failed', {cause})` with `.failure` attached.

It asserts **no failure**, not "no errors": under `collect` / `skip`, `failure`
is `false` even with entries in `errors`, so `assertOk` returns the result. Use
`failFast` / `failLate` when an ignored failure must be impossible, and
`assertOk` to make sure the outcome is not ignored.

### The error tools are not layers

Each error tool owns one scope, and they do not stack into a hierarchy:

- **Strategies** own the run's policy (this chapter).
- **The fold `recover` option** is a fold-local seam: one scanner error → the
  next accumulator — see [Fold recovery](#fold-recovery-recover).
- **`retry` / `tryCatch`** wrap a single function — see
  [Wrappers](#wrappers-retry-and-trycatch).
- **`assertOk`** guards a finished result that would otherwise be ignored.

## Lifecycle, cancellation, recovery

**The question**: how does a run pace itself, stop cleanly, and survive a failed
step? Three mechanisms, three jobs: `pause` owns the cadence, `signal` and
`stopWhen` own the two kinds of stop, `recover` owns fold-level survival.

### Pacing and cancellation (all iterators)

- `pause` spaces work: a number, or a function that receives
  `(item, index)` on `series`/`filter` and `(accumulator, item, index)` on
  folds, resolved after the state update.
- `pauseOnErrors` also pauses after handled errors (`skip` always pauses on
  `series`).
- `signal: AbortSignal` stops the run before the next item and cuts a pending
  `pause` short. Aborting is clean (`failure: false`, no source errors) and
  keeps the completed result/accumulator; it never interrupts the in-flight
  mapper/scanner. Sync variants reject all three options with a `TypeError`.

### Source adapters: stopWhen and forever

- `stopWhen(items, predicate)` stops pulling as soon as the predicate is
  truthy — checked *before* the item is offered downstream. The predicate may
  be sync or async; when it returns a Promise the adapter awaits it, so a
  `Promise<false>` keeps the item.
- Composes with every consumer (`series`, `scan`, `reduce`, `filter`, raw
  `for await`) with no option changes:
  `series(fn, opts)(stopWhen(items, shouldStop))`.
- Cancel is a clean shorter run (`failure: false`), never a source error.
- `stopWhenSync` is the sync twin: its predicate must stay sync — a returned
  Promise is a `TypeError` naming `stopWhen()`.

`forever()` yields `0, 1, 2, …` with no end — the unbounded counterpart of
`stopWhen`. A daemon loop passes `signal` and `pause` to the consumer instead of
wrapping the source:

```js
import {reduce, forever, rethrow} from 'pipelean'

await reduce(forever(), async state => {
  await runRound(state)
  return state
}, {}, {
  signal: controller.signal,   // lifecycle stop, between rounds
  pause: everyMs,              // loop cadence, abort-aware
  strategy: rethrow,
})
```

Two stop mechanisms, two jobs: **`signal`** is the lifecycle stop — user
cancel, shutdown, a parent request ending; it ends the run cleanly at the next
item or during `pause`, keeping the completed step. **`stopWhen`** is a
source-level condition — a batch limit (`() => count >= limit`), a content
sentinel (`page.isLast`), or any predicate over the item; it works with raw
`for await` too and needs no consumer options. They compose freely. See
[patterns](patterns.md#pattern-10-daemon-loop-with-forever--signal).

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
- The fold `recover` option is not supported elsewhere: `series`, `filter`,
  `findSync`, `enrich`, `join` and `pipe` throw a `TypeError` if given one.
  `enrich` points you at `reduce`. (`tryCatch` has its own single-operation
  `recover`, with no accumulator.)
- In `scanSync` / `reduceSync` it must be synchronous; a thenable is rejected
  with a `TypeError`.

A service loop that survives failed rounds — `forever()` + `signal` + `recover`
+ backoff — is worked out in
[patterns](patterns.md#pattern-11-service-loop-that-survives-failed-rounds).

---

## Key principles

1. **`onError` ≠ error strategy**: `onError` is a callback, not a strategy.
2. **`failure` is truthy for**: `failFast` (`{item, error, index}`) and `failLate`
   (`{errors}`). In `join()`, `failFast` behaves as `failLate`.
3. **`failure` is falsy for**: `collect`, `skip`, and `rethrow` on success.
4. **`throw` does not return on error**: it propagates to the caller.
5. **Strategy selection**: choose based on whether failures are acceptable.
6. **`enrich()` returns `{value, errors, sourceErrors, failure}`**: it never
   throws on handled errors unless you pick `rethrow`. `value` is the last
   successful state; `sourceErrors` is always `[]`.
7. **Patches are shallow-merged in `enrich()`**: top-level keys are overwritten;
   nested objects are not deep-merged. Return `{}` (not `undefined`) for a no-op.
8. **`undefined` is the drop signal** in `series`, `filter`, `pipe`, `mapSeries`
   and `mapSeriesSync`; it is not a valid value to map to. In `enrich` it is the
   opposite — an invalid patch — so return `{}` for a no-op. Full rule:
   [the `undefined` sentinel](reference.md#the-undefined-sentinel).
9. **Bug or data?** A thrown error that means "this cannot happen" belongs in
   `foldSync`, `mapSeries` / `mapSeriesSync`, or `rethrow`. A thrown error that
   means "this record is bad" is data: use `reduce` / `scan` / `series` with a
   strategy. To get the value out of a managed result, use `assertOk(result)`,
   never `{strategy: rethrow}`.

Check out [patterns.md](./patterns.md) for recipes, and the
[reference](reference.md) for exact contracts.
