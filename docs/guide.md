# Guide

## Core concepts

Pipelean provides tools on two axes: **what you are folding** and **what you
keep**.

|  | keep every intermediate | keep only the final |
|---|---|---|
| fold over **items** (many inputs) | `scan` | `reduce` |
| fold over **steps** (one input) | — | `enrich` |

Outside the table:

- **`series`** — many items, no dependency between them (map + drop, with
  progress, pause and take).
- **`pipe`** — one value through ordered steps, value in / value out.
- **`join`** — a few named, different tasks running at the same time.

So: if step N needs step N-1's output you are folding; count the inputs. Many
inputs → `scan` / `reduce`. One input, many enrichments → `enrich`.

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
5. `pipe` — one item, composition of value-in/value-out steps
6. `enrich` — one item, stateful accumulation of object patches
7. `join` — named concurrent tasks, one structured outcome
8. `stopWhen` / `forever` — source adapters (predicate stop, unbounded ticks)
9. `assign` — helper for building `enrich` steps
10. `where`, `findSync` — search helpers

> **Sync variants** — the iteration functions also have synchronous
> counterparts: `seriesSync`, `filterSync`, `findSync`, `scanSync`,
> `reduceSync`, `stopWhenSync`; `pipeSync`, `enrichSync` and `tryCatchSync`
> exist too. Same strategies and shapes, direct return instead of a `Promise`.

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
- Does NOT call `onError` or `onFailure`
- Useful for "let it crash" / fail-early patterns where the caller handles errors externally

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
  - `pause` / `pauseOnErrors` for rate limiting.
  - `take` to process a prefix (including infinite generators).
  - `total` for progress math; omitted when the size is unknown.
  - `scan` and `reduce` do **not** have `onProgress`, `pause`, or `take`.

* **Source adapters**
  - `stopWhen(items, predicate)` stops pulling as soon as the predicate is
    truthy — checked *before* the item is offered downstream.
  - Composes with every consumer (`series`, `scan`, `reduce`, `filter`, raw
    `for await`) with no option changes:
    `series(fn, opts)(stopWhen(items, shouldStop))`.
  - Cancel is a clean shorter run (`failure: false`), never a source error.

* **Order guarantee**
  - Execution is sequential, so output order strictly matches input order.

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

`scan` defaults to `failFast`, and under `failFast` the `results` array is
cleared on failure. Use `collect`/`failLate` when partial progress matters.
Neither supports `pause`, `take`, or `onProgress`: if you need those, the work is
probably `series` plus its own accumulator.

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
  pipelines.

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
8. **`undefined` is the drop signal** in `series`, `filter` and `pipe`; it is not
   a valid value to map to.

Check out [patterns.md](./patterns.md).
