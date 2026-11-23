# Pipelean Reference Documentation

**Overview**

Pipelean is a pragmatic library for sequential async operations with first-class
error handling: eager execution, structured results, plain JavaScript — plus
`join()` for concurrent fork/join over named tasks. No heavy abstractions, no
scheduler, no monads.

**How to read this reference**

Every function entry follows the same layout, for lookup:

- **Signature** and **Call forms** — how to call it (immediate / curried).
- **Returns** — the exact result shape.
- **Default strategy** — the failure policy when none is passed.
- **Options** and **Callbacks** — what you can pass.
- **Failure behavior** — what happens when something throws.
- **Caveats** — sync/async rules, validation, inherited surprises.
- **Example** — minimal working code.

Shared behavior that applies to many functions lives in
[Shared behavior](#shared-behavior) (cancellation, source errors); the
[Sync variants](#sync-variants) section has one entry per synchronous twin.
For the mental model see the [guide](guide.md); for recipes see
[patterns](patterns.md).

---

## Table of Contents

- [How to choose](#how-to-choose) — the decision matrix
- [Result shapes](#result-shapes) — what each function returns

### Error strategies

- [failFast](#failfast) — stop on first error (aliases: `fail`, `stopOnError`)
- [rethrow](#rethrow) — throw on first error
- [failLate](#faillate) — collect, report failure at the end
- [collect](#collect) — collect, keep going
- [skip](#skip) — ignore errors
- [Callbacks](#callbacks) — `onError`, `onFailure`, `onSourceError`, `onProgress`

### Iterators

- [series](#series) — stateless sequential execution
- [filter](#filter) — stateless selection
- [mapSeries](#mapseries) — sequential map with locked `rethrow`
- [scan](#scan) — fold keeping every intermediate
- [reduce](#reduce) — fold keeping the final value
- [foldSync](#foldsync) — raw synchronous fold
- [findSync](#findsync) — first match, early exit (sync-only)
- [stopWhen](#stopwhen) — source adapter for predicate-based early exit
- [forever](#forever) — source adapter for unbounded ticking
- [recover](#recover) — fold-only error recovery option (`scan` / `reduce`)

### Composition

- [pipe](#pipe) — vertical composition (value in / value out)
- [enrich](#enrich) — fold steps over one input (stateful enrichment)
- [join](#join) — fork/join over named concurrent tasks

### Helpers and guards

- [assign](#assign) — conditional property assignment for `enrich`
- [where](#where) — object-pattern predicate
- [assertOk](#assertok) — guard against an ignored failure
- [retry](#retry) — configurable retry logic
- [tryCatch](#trycatch) — single-function lifecycle hooks
- [delay](#delay) — Promise-based wait

### Shared behavior

- [Cancellation with signal](#cancellation-with-signal)
- [Source errors](#source-errors)

### Sync variants

- [Sync rules](#sync-variants) — what every `*Sync` twin shares
- [seriesSync](#seriessync) · [filterSync](#filtersync) · [scanSync](#scansync) ·
  [reduceSync](#reducesync) · [mapSeriesSync](#mapseriessync) ·
  [pipeSync](#pipesync) · [enrichSync](#enrichsync) ·
  [tryCatchSync](#trycatchsync) · [stopWhenSync](#stopwhensync) ·
  [foreverSync](#foreversync)
- Sync-only functions with a full entry above: [findSync](#findsync),
  [foldSync](#foldsync)

---

## How to choose

|  | keep every intermediate | keep only the final |
|---|---|---|
| fold over **items** (many inputs) | `scan` | `reduce` |
| fold over **steps** (one input) | — | `enrich` |

- `foldSync` — many items, pure **sync** fold, returns the value directly.
- `mapSeries` / `mapSeriesSync` — many items, sequential map that throws on the
  first failure and returns a bare array.
- `series` — many items, independent work per item.
- `pipe` — one value, value-in / value-out composition.
- `join` — a few named tasks, at the same time.

**Bug or data?** `foldSync`, `mapSeries` / `mapSeriesSync` and `rethrow` are for
errors that are bugs or infrastructure failures: the run must not continue and
the caller handles the throw. `reduce` / `scan` / `series` with a strategy are
for errors that are data: record them, keep what worked, report at the end. To
recover the value from a managed result, use `assertOk(result)`; `rethrow` is raw
async mode, not a value extractor.

`enrich(ops)(input)` is `reduce(ops, (state, op) => ({...state, ...op(state)}), input)`.

Defaults: `series`, `filter`, `enrich`, `join` use `collect`; `scan` and `reduce`
use `failFast`.

---

## Result shapes

| function | returns |
|---|---|
| `series`, `filter`, `scan` | `{results, errors, sourceErrors, failure}` |
| `reduce` | `{value, errors, sourceErrors, failure}` |
| `enrich`, `join` | `{value, errors, failure}` |
| `findSync` | `{result, errors, sourceErrors, failure}` |
| `mapSeries`, `mapSeriesSync` | the mapped `Array`, or throws the original error |
| `foldSync` | the final accumulator, or throws the original error |

`enrich` and `join` fold a known list of steps/branches, so a "source error" is
impossible there and the field is not returned.

---

## Error strategies

### failFast

**Purpose**: Error strategy identifier that stops immediately on the first error.

**Aliases**: `fail`, `stopOnError`

**Use when**: Critical operations where failure means the entire pipeline is invalid.

**Behavior**:
- Sets `failure: {item, error, index}` on first error
- Calls `onError({item, error, index, total})`, then `onFailure({item, error, index})` immediately
- Stops iteration

**Return Format**: `{results: [], errors: [], sourceErrors: [], failure: {item, error, index}}`

**Example**:
```javascript
import {series, failFast} from 'pipelean'

const result = await series([1, 2, 3], async item => {
  if (item === 2) throw new Error('Error')
  return item * 2
}, {strategy: failFast})

// result = {results: [], errors: [], failure: {item: 2, error: Error(...), index: 1}}
```

---

### rethrow

**Purpose**: Error strategy identifier that throws the error immediately on the first failure. Does NOT return a structured result on failure.

**Use when**: "Let it crash" / fail-early patterns where the caller is expected to handle errors externally (e.g. via try/catch) — async I/O with no meaningful partial report, a daemon loop that must exit, an error that is a bug rather than data.

**Not for**: extracting a value from a fold. For a pure sync fold use `foldSync`; for a managed result you must not ignore use `assertOk(result)`. `rethrow` bypasses every callback, so `onError`, `onFailure` and `onSourceError` on a `rethrow` run never fire (with `recover`, `onError` fires before the seam — see [recover](#recover)).

**Behavior**:
- Throws the error on first failure
- Does NOT call `onFailure`
- Does NOT call `onError` in `series`
- Does NOT call `onSourceError`

**Return Format**: On success: `{results, errors: [], sourceErrors: [], failure: false}`

**Example**:
```javascript
import {series, rethrow} from 'pipelean'

try {
  const result = await series([1, 2, 3], async item => {
    if (item === 2) throw new Error('Error')
    return item * 2
  }, {strategy: rethrow})
} catch (error) {
  // error = Error('Error')
}
```

---

### collect

**Purpose**: Error strategy identifier that collects all errors and continues processing (default for `series`, `filter`, `enrich`, `join`).

**Use when**: Batch operations, logging scenarios, background tasks.

**Behavior**:
- Collects all errors in `errors` array
- Sets `failure: false`
- Does NOT call `onFailure`

**Return Format**: `{results, errors: [{item, error, index}], sourceErrors, failure: false}`

**Example**:
```javascript
import {series, collect} from 'pipelean'

const result = await series([1, 2, 3], async item => {
  if (item === 2) throw new Error('Error')
  return item * 2
}, {strategy: collect})

// result = {results: [2, 6], errors: [{item: 2, error: ..., index: 1}], failure: false}
```

---

### failLate

**Purpose**: Error strategy identifier that collects all errors and returns `failure: {errors}` at the end.

**Use when**: Application-layer needs to detect if *any* error occurred.

**Behavior**:
- Collects all errors in `errors` array
- Sets `failure: {errors}` after loop completes (only if `errors.length > 0`)
- Calls `onFailure({errors})` if `failure` is truthy

**Return Format**: `{results, errors: [{item, error, index}], sourceErrors, failure: {errors}}` (if any errors occurred)

**Example**:
```javascript
import {series, failLate} from 'pipelean'

const result = await series([1, 2, 3], async item => {
  if (item === 2) throw new Error('Error')
  return item * 2
}, {strategy: failLate})

// result = {results: [2, 6], errors: [{item: 2, error: ..., index: 1}], failure: {errors}}
```

---

### skip

**Purpose**: Error strategy identifier that ignores errors entirely (no collection), but `onError` is still called if present.

**Use when**: Best-effort processing, some failures are acceptable.

**Behavior**:
- Ignores errors (no collection, `errors` stays empty)
- Sets `failure: false`
- Does NOT call `onFailure`

**Return Format**: `{results, errors: [], sourceErrors: [], failure: false}`

**Example**:
```javascript
import {series, skip} from 'pipelean'

const result = await series([1, 2, 3], async item => {
  if (item === 2) throw new Error('Error')
  return item * 2
}, {strategy: skip})

// result = {results: [2, 6], errors: [], failure: false}
```

---

## Callbacks

Callbacks are telemetry and application-layer hooks. They never change control
flow — the [strategy](#error-strategies) owns the policy.

### onError

Optional callback for verification/telemetry (logging, metrics).

- Called for every handled item error in `series`
- Does NOT affect control flow
- Receives `{item, error, index, total}`; `total` is omitted when unknown
- Use for: logging, metrics, external error reporting

```javascript
await series(items, fn, {
  strategy: skip,
  onError: ({item, error}) => console.error('Error:', item.id, error.message)
})
```

In `enrich` and `join` the payload is normalized: `{operation, error, index}`
(plus `total` in `enrich`), where `operation` is the step name or branch name.
Under `rethrow` it never fires — except a fold item error with `recover`
present, where it fires before the seam (see [recover](#recover)).

---

### onFailure

Optional callback for application-layer error handling (UI updates, notifications).

- Called when `failure` is truthy
- Depends on strategy:
  - `failFast`: called with `{item, error, index}`
  - `failLate`: called with `{errors}`
  - `collect` / `skip`: NOT called (failure is false)

```javascript
await series(items, fn, {
  strategy: failLate,
  onFailure: (failure) => {
    if (failure.errors) {
      showToast('Some items failed')
    } else {
      showToast(`Item ${failure.item} failed: ${failure.error.message}`)
    }
  }
})
```

---

### onSourceError

Optional telemetry callback for errors thrown by the **iteration itself** (a
source error), not by your function on an item.

- Receives `{error, index}` — no `item` key, because a source error has no item
- Same contract as `onError`; mutually exclusive with it per error
- Never called under `rethrow`
- Available on `series`, `filter`, `scan`, `reduce` and their sync twins,
  including `findSync`

See [Source errors](#source-errors) for the full per-strategy behavior.

---

### onProgress

Optional live progress callback, **`series` / `filter` only** (and
`mapSeries` / `mapSeriesSync`, which pass it through).

- Receives `{item, result, index, total}` after each **kept** success
- NOT called for errors or `undefined` drops
- Awaited before the next item; `total` is omitted when the size is unknown
- `scan` and `reduce` do **not** support it

```javascript
await series(items, saveItem, {
  onProgress: ({index, total}) => updateProgress(index + 1, total),
})
```

---

## Iterators

### series

Stateless sequential execution over an iterable. Runs a function on each item,
one at a time.

**Signature**: `series(items, fn, opts?) => Promise<{results, errors, sourceErrors, failure}>`

**Call forms**:
- Immediate: `series(items, fn, opts?)`
- Curried: `series(fn, opts?) => (items) => Promise<Outcome>`

**Parameters**:
- `items`: An iterable (array, async iterable, generator)
- `fn(item, index)`: The function to apply. Returns the mapped value, or throws, or returns `undefined` to drop the item.

**Returns**: `{results, errors, sourceErrors, failure}` where `failure` is `false` on success. Collected `errors` are `{item, error, index}`. `sourceErrors` is an array of source-error contexts, empty when the source completed cleanly (see [Source errors](#source-errors)).

**Default strategy**: `collect`

**Options**:
- `strategy`: Error strategy (default: `collect`). `failFast`, `collect`, `failLate`, `skip`, `rethrow`.
- `take`: Limit items processed.
- `total`: Explicit planned input count for progress/error callbacks. If omitted, `series` uses a cheap known input size when available. If `take` is set, callback `total` is limited to `Math.min(take, knownTotal)`. If no total is known, the `total` key is omitted.
- `pause`: Spacing between items — a number of milliseconds, or `(item, index) => number | Promise<number>` resolved after the result update. `0`, a negative number, `undefined` or `NaN` means no wait.
- `pauseOnErrors`: Whether to also pause after handled errors (default: `false`). Under `skip`, the pause always applies.
- `signal`: An `AbortSignal`. Checked before each item and while waiting in `pause`; aborting ends the run cleanly — `failure: false`, no `sourceErrors` — with collected `results` preserved. It never interrupts the in-flight mapper or a pending `source.next()`. See [Cancellation with signal](#cancellation-with-signal).
- `recover`: **not** supported by `series`. It is a fold-only seam — see [recover](#recover).

**Callbacks**:
- `onProgress({item, result, index, total})`: Called after each successful item. NOT called for errors or `undefined` drops.
- `onError({item, error, index, total})`: Called for each handled item error. Does not affect control flow.
- `onFailure(failure)`: Called when failure is truthy. Receives `{item, error, index}` for `failFast`, `{errors}` for `failLate`.
- `onSourceError({error, index})`: Called when the iteration itself throws (a source error). Never called under `rethrow`; mutually exclusive with `onError`.

**Failure behavior**: per [strategy](#error-strategies); a dead source is a
[source error](#source-errors), distinct from an item error.

**Caveats**:
- Returning `undefined` from `fn` **drops the item** — the output can be shorter
  than the input.
- Works on anything `for await` accepts; not a Node/`ReadableStream` adapter.
- Sync twin: [seriesSync](#seriessync).

**Example**:
```javascript
import { series, failFast } from 'pipelean'

// Basic: double each number
const { results } = await series([1, 2, 3], x => x * 2)
// results = [2, 4, 6]

// With failFast: stop on first error
const result = await series(items, fn, { strategy: failFast })

// With pause for rate limiting
const result = await series(endpoints, fn, { pause: 500 })

// Pause with a per-item function, abortable through a signal
const result = await series(endpoints, fn, {
  signal: controller.signal,
  pause: (item, index) => (index % 10 === 0 ? 1000 : 100),
})

// With UI progress
await series(items, saveItem, {
  onProgress: ({index, total}) => updateProgress(index + 1, total),
  onError: ({item, error}) => reportItemError(item.id, error),
})

// Curried: create a reusable transform
const double = series(x => x * 2)
const { results } = await double([1, 2, 3])

// Integration with pipe for filtering
import { pipe } from 'pipelean'
const { results } = await series(items, pipe(
  x => x.active ? x : undefined,  // drop inactive
  x => x.name,                     // extract name
))
```

---

### filter

Stateless selection: keeps the original items whose predicate is truthy.
Delegates to `series` internally — the predicate becomes a transform that
returns the item (keep) or `undefined` (drop).

**Signature**: `filter(items, predicate, opts?) => Promise<{results, errors, sourceErrors, failure}>`

**Call forms**:
- Immediate: `filter(items, predicate, opts?)`
- Curried: `filter(predicate, opts?) => (items) => Promise<Outcome>`

**Parameters**:
- `items`: The iterable to filter
- `predicate`: A function `(item, index) => truthy | falsy`, or a plain object
  pattern (converted via [where](#where)): `filter(users, {active: true})` is
  equivalent to `filter(users, where({active: true}))`. Anything implementing
  the iteration protocols (arrays, generators, source adapters like `stopWhen`)
  is always treated as a source, never as a pattern.

**Returns**: `{results, errors, sourceErrors, failure}` — same shape as `series`.
`results` holds the **original items** where the predicate returned truthy; the
predicate's return value is never placed into `results`.

**Default strategy**: `collect`

**Options / Callbacks**: same as [series](#series) — `strategy`, `onError`,
`onFailure`, `onSourceError`, `take`, `total`, `onProgress`, `pause`,
`pauseOnErrors`, `signal`. `recover` is **not** supported: it is fold-only
(`scan` / `reduce`).

**Failure behavior**: per [strategy](#error-strategies), as `series`.

**Caveats**: sync twin [filterSync](#filtersync); for the first match only, use
[findSync](#findsync) (sync, early exit).

**Example**:
```javascript
import { filter } from 'pipelean'

const adults = await filter(
  users,
  user => user.age >= 18,
)
// result.results = [user1, user3, ...] — original items, not predicate output
```

---

### mapSeries

Sequential map whose failure policy is fixed: `series` with the strategy locked
to `rethrow` and the report unwrapped. Resolves to a bare array of results, or
rejects with the **original** error. The answer to "map these items one at a
time, and if any one fails the whole thing must fail".

**Signature**: `mapSeries(items, fn, opts?) => Promise<Array>`

**Call forms**:
- Immediate: `mapSeries(items, fn, opts?)`
- Curried: `mapSeries(fn, opts?) => (items) => Promise<Array>`

**Parameters**:
- `items`: An iterable (array, async iterable, generator)
- `fn(item, index)`: The mapper, sync or async. Returning `undefined` drops the
  item.

**Returns**: `Promise<Array>` of the kept mapped values, in input order. No
report object.

**Default strategy**: `rethrow` (locked).

**Options**: every `series` option except a conflicting `strategy` and the three
error callbacks. `take`, `total`, `onProgress`, `pause`, `pauseOnErrors` and
`signal` pass through untouched. `recover` is not supported (it is fold-only).

**Failure behavior**:
- **Stops at the first failure**: no later item runs, and the error is the
  original throw (identity preserved).
- **The rethrow is silent**: a failed item throws before any callback runs,
  exactly as in `series(..., {strategy: rethrow})`.
- An abort via `signal` is not a failure: it resolves with the results completed
  so far.

**Caveats / validation**:
- **Strategy lock**: passing `strategy: rethrow`, `strategy: 'throw'`, or
  omitting it is fine. Any other strategy throws a `TypeError` at build time
  (`'mapSeries() always rethrows on the first error; remove the "collect" strategy'`)
  instead of being silently overridden.
- **Rejected options**: `onError`, `onFailure` and `onSourceError` are rejected
  with a `TypeError` naming the offending key —
  `'mapSeries() rethrows on the first error; onError never fires — remove it or use series/seriesSync with a strategy'`.
  Both call forms validate, so the curried form fails at build time. These
  callbacks could never fire under the locked `rethrow`, so accepting them would
  be dead configuration.
- **`undefined` drops the item**: the result can be shorter than the input. This
  is **not** `Array.prototype.map`.
- Sync twin: [mapSeriesSync](#mapseriessync).

**When to use `mapSeries` vs `series`**: use `mapSeries` when a failure must
surface as an exception and the caller wants no report. Use `series` when a
failure is data to collect, count or report per item. For a *concurrent* map,
neither: use p-map.

**When to use `reduce` + `rethrow` instead**: when the step needs the previous
step's accumulated value (a fold, not a map), and the run is async. There is no
async raw fold: async folds need `recover`, `signal` and `pause`, which is the
managed API.

**Example**:
```javascript
import {mapSeries} from 'pipelean'

// All-or-nothing sequential map
const parsed = await mapSeries(files, file => parseFile(file))
// any parseFile throw rejects with that original error

// Reusable pipeline, options still apply
const fetchAll = mapSeries(id => api.get(id), {
  pause: 100,
  onProgress: ({index, total}) => updateBar(index + 1, total),
})
const records = await fetchAll(ids)

// Selection still works: undefined drops
const adults = await mapSeries(users, user => user.age >= 18 ? user : undefined)
```

---

### scan

Fold over data items, keeping every intermediate accumulator. Use it when each
item depends on the previous one **and** the intermediate values are themselves
useful. Use `reduce` when only the last value matters.

**Signature**: `scan(iterable, scanner, initialValue, opts?) => Promise<{results, errors, sourceErrors, failure}>`

**Parameters**:
- `iterable`: An async iterable (array, generator, or any object implementing the iteration protocol)
- `scanner`: A function with signature `(accumulator, item, index) => newAccumulator`
- `initialValue`: The starting value for the accumulator

**Returns**:
- `results`: Array of intermediate results (or `[]` on failFast failure)
- `errors`: Array of errors encountered (empty for failFast, skip, throw)
- `sourceErrors`: Array of `{error, index}` contexts for errors thrown by the iteration itself; empty when the source completed cleanly
- `failure`: `false` on success; `{item, error, index}` for failFast; `{errors}` for failLate (source errors are merged into the aggregated errors array)

**Default strategy**: `failFast`

**Options**:
- `strategy`: Error strategy (default: `failFast`). `failFast`, `collect`, `failLate`, `skip`, `rethrow`.
- `pause`: Spacing after each successful scanner call — a number or `(accumulator, item, index) => number | Promise<number>` resolved after the accumulator update.
- `pauseOnErrors`: Also pause after a handled error (including `skip`); default `false`.
- `signal`: `AbortSignal` checked before each item and during `pause`; aborting keeps the current accumulator and ends cleanly.
- `recover(context)`: Fold-only recovery seam, called when the scanner throws. See [recover](#recover).
- `scan` does **not** support `onProgress` or `take`.

**Callbacks**: `onError` (each handled item error, no control-flow effect),
`onFailure` (when `failure` is truthy), `onSourceError` (when the iterable
itself throws).

**Failure behavior**:
- **Careful — `failFast` clears `results`**: on the first error the returned
  `results` array is `[]`. That is the point of fail-fast, but it surprises
  people who reach for `scan` exactly because they want partial progress. Use
  `collect` or `failLate` when partials matter.
- **Source errors**: when the iterable itself throws mid-stream (e.g. an async
  generator dying), the accumulator and partial results collected so far are
  preserved per strategy and the context is reported through `onSourceError`
  instead of `onError`. See [Source errors](#source-errors) for the full
  per-strategy behavior.

**Key Characteristics**:
- **Stateful**: Each transformation depends on the previous result
- **Accumulates**: Both successful results and errors for inspection
- **Index Tracking**: Provides index of each item for correlation

**Caveats**: sync twin [scanSync](#scansync); same engine as [reduce](#reduce),
different result shape.

**Example**:
```javascript
import { scan } from 'pipelean'

// Track insertions in a database
const { results, errors } = await scan(
  records,
  async (acc, record) => {
    const inserted = await db.insert(record)
    return acc + inserted  // Accumulate count
  },
  0  // Initial count
)
```

---

### reduce

Fold over data items and keep only the final accumulated value. Same engine and
default strategy as `scan`; different return shape.

**Signature**: `reduce(iterable, scanner, initialValue, opts?) => Promise<{value, errors, sourceErrors, failure}>`

**Parameters**:
- `iterable`: An async iterable (array, generator, or any object implementing the iteration protocol)
- `scanner`: A function with signature `(accumulator, item, index) => newAccumulator`
- `initialValue`: The starting value for the accumulator

**Returns**:
- `value`: The final accumulated value. Preserved under every strategy except `rethrow`, even when the source dies mid-stream
- `errors`: Array of errors encountered (empty for failFast, skip, throw)
- `sourceErrors`: Array of `{error, index}` contexts for errors thrown by the iteration itself; empty when the source completed cleanly
- `failure`: `false` on success; `{item, error, index}` for failFast; `{errors}` for failLate

**Default strategy**: `failFast`

**Options**:
- `strategy`: Error strategy (default: `failFast`). `failFast`, `collect`, `failLate`, `skip`, `rethrow`.
- `pause`: Spacing after each successful scanner call — a number or `(accumulator, item, index) => number | Promise<number>` resolved after the accumulator update.
- `pauseOnErrors`: Also pause after a handled error (including `skip`); default `false`.
- `signal`: `AbortSignal` checked before each item and during `pause`; aborting keeps the current accumulator and ends cleanly.
- `recover(context)`: Fold-only recovery seam, called when the scanner throws. See [recover](#recover).
- `reduce` does **not** support `onProgress` or `take`.

**Callbacks**: `onError` (each handled item error, no control-flow effect),
`onFailure` (when `failure` is truthy), `onSourceError` (when the iterable
itself throws).

**Failure behavior**: **`value` survives `failFast`.** On the first error
`results` is cleared (irrelevant here) but the last successful accumulator is
kept: `{value, errors: [], failure: {item, error, index}}`. That preserved
partial value is **not** a reason to use `rethrow` to get it: `rethrow` still
throws and gives you no result. If the value is all you need and the fold is
pure sync, `foldSync` returns it directly; if the value plus report is what you
want, inspect `value` here.

**Key Characteristics**:
- **Single value**: Returns `{value, errors, sourceErrors, failure}` instead of intermediate results
- **No boilerplate**: No need for `results.at(-1) || 0` — the final value is direct
- **Error handling**: Same error strategies as `scan` and `series`

**When to use**:
- Summing, counting, concatenating
- Any reduction where you only need the final result
- When `scan`'s intermediate results array is unnecessary overhead

**When to use `scan` instead**:
- When you need every intermediate accumulator value (e.g. dependent sequential operations where each step's output is meaningful)

**Caveats**: sync twin [reduceSync](#reducesync); for a pure sync fold with no
report, [foldSync](#foldsync).

**Example**:
```javascript
import { reduce } from 'pipelean'

// Sum track durations into album total
const {value: totalDuration} = await reduce(
  tracks,
  (accumulator, {duration}) => accumulator + duration,
  0,
)
// totalDuration = 22 (no intermediate array, no .at(-1))
```

---

### foldSync

A raw synchronous fold. Returns the last accumulator directly — no options, no
strategy, no report, no callbacks. For a pure fold it is behavior-identical to
`reduceSync(items, reducer, initial, {strategy: rethrow}).value`, with nothing to
unwrap.

**Signature**: `foldSync(iterable, reducer, initialValue) => value` (synchronous)

**Call forms**: immediate only, exactly three arguments.

**Parameters**:
- `iterable`: A **sync** iterable — array, `Set`, generator, any object with `Symbol.iterator`. An async iterable is rejected.
- `reducer(accumulator, item, index)`: The fold function. It is **not awaited**: an async reducer produces a Promise accumulator.
- `initialValue`: The starting accumulator. `undefined` is a legal accumulator — folds never drop.

**Returns**: the final accumulator, whatever type it is.

**Default strategy**: none — raw. A throw is a bug and propagates.

**Failure behavior**: errors thrown by the reducer or by the iterable propagate
**unchanged** — same identity, no wrapping, no strategy consulted, no callback.
This is the point: a throw here is a bug, and a bug should not be collected as
data.

**Caveats / validation** (all `TypeError`, before iteration):
- a fourth argument: `foldSync() takes 3 arguments; it accepts no options` — a stray `{strategy: rethrow}` fails loudly instead of being ignored;
- a non-function reducer: `foldSync() requires a reducer function`;
- an async iterable: `foldSync() does not support async iterables; use reduce()`;
- a non-iterable (including `null` / `undefined`): `foldSync() requires a sync iterable`.

**Sync only**: like `findSync`, there is no async twin. Async folds need
`recover`, `signal` and `pause`, so their home is `reduce`. There is deliberately
no async `fold`.

**When to use it**: the fold is pure and synchronous and a throw means an
impossible state, a broken invariant or a programmer mistake. **When not to**:
the input can contain bad records you want to report and continue past
(`reduce` with `collect` / `failLate`), the run needs `recover` / `signal` /
`pause` (async `reduce`), or you are folding steps over one input (`enrich`).

**Example**:
```javascript
import {foldSync} from 'pipelean'

const totalDuration = foldSync(
  tracks,
  (total, {duration}, index) => total + duration,
  0,
)

// Build an index in one pass
const byArtist = foldSync(tracks, (acc, track) => {
  acc[track.artist] = [...(acc[track.artist] ?? []), track]
  return acc
}, {})

// Empty input returns the initial value; a Set or generator is fine
foldSync(new Set([1, 2, 3]), (acc, n) => acc + n, 0) // 6
foldSync([], (acc, n) => acc + n, 42)                // 42
```

**Migration**: a pure `reduceSync(items, reducer, initial, {strategy: rethrow}).value`
becomes `foldSync(items, reducer, initial)` — a textual rewrite with identical
behavior. `reduceSync(items, reducer, initial).value` also becomes
`foldSync(...)`, but with a behavior delta: a `failFast` failure that was
previously ignored now throws. See
[migration](migration.md#0140-foldsync-mapseries-per-step-enrich-hooks).

---

### findSync

First match with early exit: walks a **sync** iterable and stops at the first
item satisfying the predicate. Sync-only — there is no async `find`.

**Signature**: `findSync(items, predicate, opts?) => {result, errors, sourceErrors, failure}`

**Call forms**:
- Immediate: `findSync(items, predicate, opts?)`
- Curried: `findSync(predicate, opts?) => (items) => Outcome`

**Parameters**:
- `items`: A sync iterable
- `predicate`: The same forms as [filterSync](#filtersync) — a function
  `(item, index) => truthy | falsy` or an object pattern via [where](#where).

**Returns**: `{result, errors, sourceErrors, failure}`. `result` is the first
matching item; when no item matches,
`{result: undefined, errors: [], sourceErrors: [], failure: false}`.

**Default strategy**: `collect`

**Options / Callbacks**: a subset of [seriesSync](#seriessync) options —
`strategy`, `take`, `total`, `onError`, `onFailure`, `onSourceError` (no
`onProgress`). `signal`, `pause` and `pauseOnErrors` are async-only and rejected
with a `TypeError`.

**Failure behavior**: exits as soon as the first match is found. For a dying
source, behaves like `seriesSync`: accepts `onSourceError({error, index})` and
reports the failure in `sourceErrors` (ignored under `skip`, rethrown under
`throw`). See [Source errors](#source-errors).

**Example**:
```javascript
import { findSync } from 'pipelean'

const users = [
  {id: 1, active: false},
  {id: 2, active: true},
  {id: 3, active: true},
]

const {result, errors, sourceErrors, failure} = findSync(users, {active: true})

// result: {id: 2, active: true}
// errors: []
// sourceErrors: []
// failure: false
```

---

### stopWhen

Source adapter that stops pulling from an iterable as soon as a predicate is
truthy. The standard way to cancel or predicate-stop any source consumed by
`series`, `scan`, `reduce`, `filter`, or a raw `for await`.

**Signature**: `stopWhen(items, predicate?) => asyncIterable`

**Parameters**:
- `items`: An array or (async) iterable — generators and paging sources included
- `predicate(item, index)`: Checked **before** each item is yielded. Truthy → stop. Defaults to `() => false` (never stops). Sync only.

**Returns**: an async iterable wrapper — consumers see a source that ends early.

**Key Characteristics**:
- **Check before yield**: the triggering item is pulled from the source but never offered downstream — "cancel before work"
- **Pull-lazy**: once stopped, the underlying source is abandoned mid-stream; native cleanup (`iterator.return()`, generator `finally`) still runs
- **Clean completion, not an error**: consumers see a finished source — `failure: false`, empty `sourceErrors`. Cancel is a shorter run, not a source death
- **Composable**: zero changes in `series` / `scan` / `reduce` / `filter`; they just see an iterable that ends early. Works with raw `for await` too
- **Length forwarding**: when the source has a numeric `length` (arrays), it is forwarded on the wrapper so `series` keeps progress totals without an explicit `total`. Generators have no cheap size — `total` stays omitted
- **Predicate throws are source errors**: reported through `onSourceError` / `sourceErrors`, never `onError`
- This is **not** intra-item abort: work already started on an item is not interrupted (use `AbortController` in your operation for that)

**Caveats**: sync twin [stopWhenSync](#stopwhensync); for lifecycle cancellation
prefer `signal` — see [Cancellation with signal](#cancellation-with-signal).

**Example**:
```javascript
import { series, stopWhen } from 'pipelean'

const {results} = await series(enrichOne, {
  total: albums.length,
  pause: ENRICH_DELAY_MS,
  onProgress: onItem,
})(stopWhen(albums, shouldStop))

// limit-style: close over counters instead of the item
stopWhen(folders, () => count >= limit)
```

---

### forever

Source adapter that yields the natural numbers 0, 1, 2, ... with no end — the
unbounded counterpart of `stopWhen`. Use it to build a daemon loop: repeat a
step until an abort signal says stop, with `pause` owning the cadence.
`stopWhen` remains available for domain limits (a max number of rounds) layered
on top.

**Signature**: `forever() => asyncIterable<number>`

**Parameters**: none.

**Returns**: an async iterable of tick indices.

**Key Characteristics**:
- **Unbounded**: yields forever until the consumer stops pulling — every consumption must be bounded by `signal`, `stopWhen`, `take`, or a `break`. A bare `collect(forever())` never ends
- **Composable**: `stopWhen(forever(), predicate)` is a predicate-stopped tick source; the predicate (usually a domain limit) is checked before each tick. For lifecycle cancellation prefer `reduce(..., {signal, pause, strategy})`
- **Index semantics**: the yielded numbers are the tick indices a consumer receives — a cycle counter for free
- **Non-accumulating consumers recommended**: a daemon has no items, so `reduce`/`scan` (stateful, no `results` array) fit better than `series`, which would otherwise rely on the `undefined` drop signal every tick

**Caveats**: sync twin [foreverSync](#foreversync).

**Example**:
```javascript
import { reduce, rethrow, forever } from 'pipelean'

// daemon loop: one round, pause, repeat until the controller aborts
const { value: state } = await reduce(
  forever(),
  async (state, index) => {
    await runRound({ index, state })
    return {...state, cycles: state.cycles + 1}
  },
  { cycles: 0, failures: 0 },
  {
    signal: controller.signal,   // lifecycle stop, checked between rounds
    pause: everyMs,              // cadence, abort-aware
    strategy: rethrow,           // infrastructure failure exits the loop
  },
)
```

The abort lands between rounds: an in-flight round completes and its
accumulator is kept, then the run stops without waiting the remaining pause.
`pause` may also be `(accumulator, item, index) => ms` when the cadence varies.

---

### recover

A fold-local recovery seam (an **option**, not a strategy). When the scanner
throws, `recover` turns that error into the **next accumulator** instead of
letting the error strategy consume the iteration. It sits between the item
error and the strategy and gives `scan` / `reduce` a way to keep folding through
a failed step.

**Signature**: `recover(context) => nextAccumulator` — sync or async in the
async folds.

**Applies to**: `scan`, `reduce`, `scanSync`, `reduceSync`. It is **not**
supported by `series`, `filter`, `findSync`, `enrich`, `join`, or `pipe` — those
have no accumulator to recover into. Passing `recover` to any of them throws a
`TypeError` (`enrich` raises its own message pointing at `reduce`).

**Context**: `{error, item, index, state, total?}`

- `error`: the error the scanner threw.
- `item` / `index`: the item being folded and its iteration index.
- `state`: the accumulator that was passed **into** the scanner for this item (not a partially updated value).
- `total`: the planned item count when known (an array has a length; a generator does not), otherwise omitted.

**Returns**: the **next accumulator**, not a patch. It is used exactly as if the
scanner had returned it.

**Semantics**:

- **`onError` fires first, even under `rethrow`.** With `recover` present the item error is handled, so `rethrow` must not suppress the telemetry. Without `recover`, `rethrow` behaves as before and does not call `onError`.
- **A successfully recovered error is consumed**: it is not appended to `errors`, it does not make `failure` truthy, `onFailure` is not called for it, and `scan` pushes the recovered accumulator into `results`. It is a successful intermediate state.
- **`recover` throwing** makes that throw the item error, handled by the normal strategy: `failFast` stops, `collect` / `failLate` record it, `skip` ignores it, `rethrow` rejects. The original scanner error has already gone through `onError`, so in this edge two reports can be observed for one item: the original through the recovery path, then the recover error through the normal path.
- **Source errors bypass `recover`.** A generator dying mid-stream is still a source error: `onSourceError` / `sourceErrors` / `rethrow`, never `recover`.
- **A throwing `pause` is not recoverable.** It stays a source/config error, as with any fold.
- **`pause` runs after a successful recovery**, regardless of `pauseOnErrors`, because a recovery is a successful iteration. If `recover` throws, the error path follows `pauseOnErrors` as usual.
- **`signal` during `recover`**: the recovered accumulator is kept, then the pause is skipped and the loop stops, consistent with an abort during an in-flight scanner.

**Validation**: `recover` must be a function. A non-function throws a
`TypeError` before iteration starts. In the sync folds `recover` must be
synchronous: a returned thenable is rejected with a `TypeError`.

**Example**:
```javascript
import {reduce, rethrow, forever} from 'pipelean'

const {value} = await reduce(
  forever(),
  async state => {
    const results = await runner.sync({full: state.full})
    return {...state, full: false, failures: failed(results) ? state.failures + 1 : 0}
  },
  {failures: 0, full: true},
  {
    signal: controller.signal,
    strategy: rethrow,
    onError: ({error}) => log.warn(error.message),
    recover: ({state}) => ({...state, full: false, failures: state.failures + 1}),
    pause: state => backoff({base: everyMs, failures: state.failures}),
  },
)
```

The thrown round is logged by `onError`, converted into the next accumulator by
`recover`, and the pause sees the recovered state. The loop survives failed
rounds with no `try/catch` inside the scanner.

**recover vs the other error tools**:

| Tool | Scope | Direction |
| --- | --- | --- |
| `recover` | one fold item | error → next accumulator, then keep folding |
| `strategy: collect` | the whole run | record the error, continue with the *previous* accumulator |
| `tryCatch` | one function | swallow, return `undefined` (the drop signal) |
| `retry` | one function | retry the same call, then rethrow |
| `assertOk` | one finished result | throw the original error if `failure` is truthy, with `.failure` attached |

---

## Composition

### pipe

Pipelean operation composer — chains functions left-to-right and preserves
Pipelean's `undefined` drop signal.

**Signature**: `pipe(...fns) => (input) => Promise<ReturnType<LastFn>>`

**Parameters**:
- Variadic arguments: Any number of sync or async functions to execute sequentially
- `input`: The initial value passed to the first function

**Returns**: a reusable function; calling it returns a Promise that resolves to
the final result.

**Key Characteristics**:
- Functions execute **left-to-right** (first argument is applied to `input`)
- Output of one function becomes input to the next
- Supports both synchronous and asynchronous functions
- Natural data flow from input through transformations
- Designed for composing reusable operations passed to `series()` or used directly
- **Undefined Short-Circuit**: If any step returns `undefined`, remaining steps are skipped and `undefined` is returned. This enables selection within a composed operation — see [series](#series) drop behavior.

**Best practice**: use `pipe()` when you need to chain operations that form a
coherent data processing pipeline.

**Failure behavior**: `pipe` does **not** catch errors: a throw escapes to the
caller. Only `undefined` short-circuits — `null`, `false`, `0` and `''` are
values and keep flowing. This is composition in the `Maybe`/`Option` sense
(`A => Option<B>`), not plain composition as in Ramda or fp-ts `flow`.

**Caveats**: sync twin [pipeSync](#pipesync); for failures captured as data use
a `series` strategy or [tryCatch](#trycatch); for steps that need the accumulated
state use [enrich](#enrich).

**Example**:
```javascript
import { pipe } from 'pipelean'

const normalizeUser = pipe(
  async id => validateUserId(id),
  async id => fetchUser(id),
  user => user.active ? user : undefined,
  user => ({...user, email: user.email.toLowerCase()}),
)

const user = await normalizeUser(userId)

// Compose operations in a readable pipeline
const result = await pipe(
  async data => validate(data),
  async data => transform(data),
  async data => persist(data),
)(input)
```

**Selection in pipe** (via undefined short-circuit):
```javascript
import { pipe, series } from 'pipelean'

// Merge filter and transform in a single operation
const result = await series(items, pipe(
  x => x.active ? x : undefined,  // drop inactive items
  x => x.name,                     // extract name
))
// Items where active is false are skipped entirely
```

---

### enrich

Fold over a list of **steps** that enrich one accumulated value. Each successful
operation returns an object patch. Errors are handled per operation using
Pipelean strategies.

`enrich` is literally `reduce` over your operations:

```js
enrich(ops)(input) === reduce(ops, (state, op) => ({...state, ...op(state)}), input)
```

The difference is ergonomics and reporting: `enrich` fixes the fold step
(shallow merge), validates patches, and names failures after the operation
instead of its index.

**Signature**: `enrich(operations, options?) => (initialState) => Promise<{value, errors, failure}>`

**Parameters**:
- `operations`: An array of functions. Each function `operation(state)` must return a non-null, non-array object (the patch to merge into the state). Operations can be sync or async.
- `options` (optional):
  - `strategy`: Error strategy (default: `collect`). `failFast`, `collect`, `failLate`, `skip`, `rethrow`.
  - `onError({operation, error, index, total})`: Called for each handled operation error. Receives a normalized shape where `operation` is the function's `name` (or `operation-${index}` for anonymous functions) and `total` is the operation count.
  - `onFailure(failure)`: Called when `failure` is truthy. Receives `{operation, error, index}` for `failFast` and `{errors}` for `failLate` — both normalized.
  - `onStepStart({operation, index, total})`: Called **before** each operation runs. Same `operation` normalization and `total` as `onError`.
  - `onStepSuccess({operation, patch, index, total})`: Called **after** the patch is validated and merged. `patch` is the object the operation returned, pre-merge.
  - `recover`: **not** supported. `enrich` uses `reduce` internally but rejects `recover` explicitly; use `reduce` if you need fold recovery.

**Returns**: A function `(initialState) => Promise<{value, errors, failure}>`.

The returned function:
- Validates `initialState` (non-null, non-array object) and throws `TypeError` otherwise.
- Executes each operation in order, passing the **current accumulated state** to each one.
- Shallow-merges the returned patch into the state.
- Treats an invalid operation return (null, array, primitive) as that operation throwing a `TypeError`, so the selected strategy applies.
- Returns `{value, errors, failure}` where:
  - `value`: The final accumulated state. Even under `failFast`, this is the last successful accumulated state.
  - `errors`: Array of `{operation, error, index}` (normalized). Empty for `skip` and `failFast`.
  - `failure`: `false` for `collect` and `skip`; `{operation, error, index}` for `failFast`; `{errors}` for `failLate`. For `rethrow`, the original error is thrown instead of returning a result.

**Default strategy**: `collect`

**Key Characteristics**:
- **A fold over steps**: The operations are the collection; the state is the accumulator. In FP terms it is a `foldLeft` over `State -> Patch` functions with a `merge` combiner.
- **Shallow merge**: `{...state, ...patch}` — top-level keys are overwritten, nested objects are not deep-merged.
- **Reusable pipeline**: The pipeline is defined once. The returned function is called with different inputs.
- **Same error strategies as `series` / `scan` / `reduce`**: All five strategies work, with the same `onError` / `onFailure` semantics. Default is `collect`.
- **No intermediate states**: Only the final accumulated value is returned. There is no `results` array.
- **Empty operations array** is valid and returns the initial state untouched.

**Caveats**:
- Return `{}` for a no-op — `undefined` is **not** a no-op signal here (it is an
  invalid patch).
- No `sourceErrors`: the steps are a fixed array, so a source error is
  impossible.
- Options bind at build time (`enrich(ops, opts)`); hooks fire on every run.
- Sync twin: [enrichSync](#enrichsync) (hooks must be sync there).

**When to use `enrich()` vs `pipe()` vs `series()` vs `scan()`/`reduce()`**:
- `enrich()`: One input, many enrichments, final accumulated object. The steps are the collection being folded.
- `pipe()`: One input, value-in / value-out. Each step transforms the previous step's return value; nothing is merged. No error capture.
- `series()`: Many inputs, independent work per input. Transforms and drops items.
- `scan()` / `reduce()`: Many inputs where each item depends on the previous accumulator. `scan` keeps every intermediate, `reduce` keeps the last.
- `enrich()` and `reduce()` are the same fold; the difference is *what* is being folded (steps vs items).

**Error callback payload** (always normalized):
- `onError({operation, error, index, total})` — `operation` is the function's `name` if set, otherwise `operation-${index}`. `total` is the operations array length.
- `onFailure({operation, error, index})` for `failFast`.
- `onFailure({errors})` for `failLate`, where each entry is `{operation, error, index}`.

**Example**:
```javascript
import { enrich, collect, failFast } from 'pipelean'

const prepareAlbum = state => ({title: state.rawTitle.trim()})
const extractYear = state => ({year: parseYear(state.rawYear)})
const extractArtists = state => ({artists: state.artists ?? []})

const processAlbum = enrich([
  prepareAlbum,
  extractYear,
  extractArtists,
])

const {value, errors, failure} = await processAlbum(input)
// value = {title, year, artists, rawTitle, rawYear, ...input}

// Strategy and callbacks are bound when the pipeline is defined
const processOrStop = enrich(
  [prepareAlbum, extractYear, extractArtists],
  {
    strategy: failFast,
    onError: ({operation, error, index, total}) =>
      logger.error({operation, error, index, total}),
  },
)

const result = await processOrStop(input)

// Reuse the same pipeline with different inputs
const album1 = await processAlbum(rawAlbum1)
const album2 = await processAlbum(rawAlbum2)
```

#### Per-step hooks (`onStepStart` / `onStepSuccess`)

Two telemetry hooks let a caller follow the fold step by step — enough to drive a
per-step UI status without hand-rolling the accumulation. They are options of the
pipeline, bound at `enrich(operations, opts)`, and they fire on **every** run of
the returned function.

| hook | when | payload |
|---|---|---|
| `onStepStart(context)` | before `operation(state)` | `{operation, index, total}` |
| `onStepSuccess(context)` | after patch validation + merge | `{operation, patch, index, total}` |

- `operation` is the function's `name`, or `operation-${index}` for an anonymous
  operation — the same normalization as `onError`.
- `patch` is the object the operation returned, **before** the merge. The other
  fields identify the step; `total` is `operations.length`.
- Timing: `enrich` **awaits** both hooks before moving on; `enrichSync` calls
  them and moves on (fire-and-forget), consistent with its other callbacks.
  Hooks in `enrichSync` must be **sync**: the return value of an async hook is
  not awaited, so a rejection is never observed by the strategy. A synchronous
  throw still is.
- `onStepSuccess` fires only when the patch was valid and merged. A throwing
  operation, or an invalid patch (`null`, an array, a primitive), goes to
  `onError` and fires **no** success hook.
- Errors stay on `onError`: there is deliberately no `onStepError`.
- A hook that throws is treated like a throwing step and flows into the
  strategy: `failFast` stops (so later hooks never fire), `collect` / `failLate`
  record it and continue, `skip` drops it, `rethrow` throws it. A throwing
  `onStepSuccess` fails the step, so its patch is **not** committed.
- With `failFast`, the step that fails stops the run before later hooks. With
  `collect`, every step's hooks run.

```javascript
import {enrich} from 'pipelean'

const processAlbum = enrich(
  [prepareAlbum, extractYear, extractArtists],
  {
    onStepStart: ({operation, index, total}) =>
      status.update({phase: 'running', operation, index, total}),
    onStepSuccess: ({operation, patch, index, total}) =>
      history.append({operation, patch, index, total}),
    onError: ({operation, error, index}) => report(operation, error, index),
  },
)

const {value, errors, failure} = await processAlbum(input)
```

`enrichSync` accepts the same two options with the same payloads and the same
strategy path; only the dispatch differs (sync, not awaited). Its hooks are
fire-and-forget: use synchronous hooks, because an async hook's rejection is
never observed by the strategy (a synchronous throw still is).

---

### join

Fork/join over a record of **named** async tasks. Every branch starts
immediately and `join` waits for all of them to settle, returning one structured
result. Errors are data, per branch, using the same strategies as `enrich`.
This is not a concurrency runtime: no cancellation, no scheduler, no ordering
guarantee.

**Signature**: `join(tasks, options?) => Promise<{value, errors, failure}>`

**Parameters**:
- `tasks`: A non-null, non-array object mapping a branch **name** to a function `task(key, index)`. Each function can be sync or async. The name is the stable key for that branch in the result.
- `options` (optional):
  - `strategy`: Error strategy (default: `collect`). `collect`, `failLate`, `skip`, `rethrow`, and `failFast`.
  - `onError({operation, error, index})`: Called for each handled branch error. `operation` is the branch name.
  - `onFailure(failure)`: Called (and awaited) when `failure` is truthy. Receives `{errors}` for `failLate` / `failFast`.

**Returns**: `Promise<{value, errors, failure}>`:
- `value`: Object mapping the **successful** branch names to their resolved values, in declaration order. A branch resolving `undefined` is still a success (`value[key] === undefined`).
- `errors`: Array of `{operation, error, index}`, ordered by declaration (not completion). Empty for `skip` (and for `rethrow`, which throws instead).
- `failure`: `false` for `collect` and `skip`; `{errors}` for `failLate` and `failFast`. For `rethrow`, the original error of the first failed branch is thrown instead of returning a result.

**Default strategy**: `collect`

**Failure behavior / strategies**:
- `collect` (default): keep successes in `value`, failures in `errors`, `failure: false`.
- `failLate`: like `collect`, then `failure: {errors}` if anything failed.
- `failFast` (alias `fail`, `stopOnError`): behaves as `failLate`. Branches already started and cannot be stopped without an `AbortSignal`.
- `skip`: `errors` stays empty, but `onError` still fires.
- `rethrow`: throw the original error of the first failed branch, by declaration order, once every branch has settled.

**Caveats / validation**:
- **Throws (before any branch starts)**: `TypeError` if `tasks` is not a non-null, non-array object, if any value is not a function, or if it is a thenable (e.g. an un-awaited `Promise`).
- **All branches settle**: `join` starts from a resolved promise, so a synchronous throw becomes a rejection; `allSettled` always captures it and nothing is left unhandled.
- **Completion order is irrelevant**: `value` keys follow declaration order, and so does `errors`.
- **No drop signal**: `undefined` is a legitimate branch value, unlike in `series` / `pipe`.
- **Empty record** is valid: resolves to `{value: {}, errors: [], failure: false}`.
- **Not a concurrent map**: for a homogeneous collection use p-map.
- No `sourceErrors`: the branches are a fixed record.

**When to use `join()` vs `series()`**:
- `join()`: A handful of named, heterogeneous tasks that run at the same time. One structured outcome, errors per branch.
- `series()`: Many homogeneous items processed one at a time. Horizontal, ordered, with `pause` / `take` / `onProgress`.

**Example**:
```javascript
import { join, failLate } from 'pipelean'

const ping = host => fetch(`https://${host}/health`).then(r => r.status)
const whoami = () => fetch('/whoami').then(r => r.json())

const { value, errors, failure } = await join({
  api: () => ping('api.example.com'),
  cdn: () => ping('cdn.example.com'),
  session: () => whoami(),
})

// value  = { api: 200, cdn: 200, session: {...} }
// errors = [] ; failure = false

// A failed branch stays named and leaves the rest intact
const down = await join({
  api: () => ping('api.example.com'),
  cdn: () => { throw new Error('unreachable') },
})
// down.value  = { api: 200 }
// down.errors = [{ operation: 'cdn', error: Error('unreachable'), index: 1 }]

// Treat any branch failure as a failure of the join
const strict = await join(
  { api: () => ping('api.example.com') },
  { strategy: failLate },
)
```

---

## Helpers and guards

### assign

Creates an `enrich()` operation that conditionally assigns a property to state.
If `parse(state)` returns `undefined`, the property is skipped (empty patch).
Otherwise the property is set to the parsed value.

**Signature**: `assign(property, parse) => (state) => {} | {[property]: value}`

**Parameters**:
- `property`: The property name (string) to set on state.
- `parse`: A function `(state) => value | undefined`. Return `undefined` to skip the property.

**Returns**: A function suitable as an `enrich()` operation. Returns `{}` when
the parse is skipped, or `{[property]: value}` to merge into the accumulated
state.

**Key Characteristics**:
- **Conditional assignment**: Only sets the property when `parse` returns a non-undefined value.
- **Skip sentinel**: Only `undefined` triggers skip — `null`, `false`, `0`, `""` are all assigned normally.
- **Composable**: Multiple `assign()` calls compose naturally inside `enrich()`.

**Example**:
```javascript
import { assign, enrich } from 'pipelean'

const extractName = assign('name', state => state.rawName.trim())
const extractYear = assign('year', state => {
  const n = Number.parseInt(state.rawYear, 10)
  return Number.isNaN(n) ? undefined : n
})

const {value} = await enrich([extractName, extractYear])({
  rawName: '  Alice  ',
  rawYear: '1995',
})
// value = {rawName: '  Alice  ', rawYear: '1995', name: 'Alice', year: 1995}
```

---

### where

Creates a predicate function for strict equality object matching. Primarily
used with `filter` for pattern-based selection.

**Signature**: `where(pattern) => (item) => boolean`

**Parameters**:
- `pattern`: A plain object with key-value pairs to match against.

**Returns**: A predicate function.

**Example**:
```javascript
import { where, filter } from 'pipelean'

const isAdmin = where({role: 'admin'})
const admins = await filter(users, isAdmin)

// Or use pattern directly with filter
const adults = await filter(users, {active: true})
```

---

### assertOk

Guard against an ignored failure. `failFast` reports a failure as data and stops
the run; it never throws. If the caller forgets to inspect the result, a
critical job can stop silently. `assertOk` converts that ignored outcome into an
exception.

**Signature**: `assertOk(result) => result` (synchronous; throws on failure)

**Parameters**:
- `result`: an **awaited** Pipelean result — `series`, `filter`, `scan`,
  `reduce`, `enrich`, `join`, `findSync`, or any of their sync twins. Both
  `{results, ...}` and `{value, ...}` shapes work, as does `findSync`'s
  `{result, ...}`. It must be a result object with a `failure` property.

**Returns**: the **same result object**, unchanged, when `result.failure` is
falsy.

**Failure behavior**: when `result.failure` is truthy, `assertOk` throws the
**original underlying error**:

- for a normal failure that is `failure.error`; for a `failLate` aggregate it is
  the first error, `failure.errors[0].error`;
- the thrown value is the same object the operation threw, so its identity,
  message, stack and class (`instanceof`) survive — there is no wrapper;
- the structured failure is attached as `error.failure` (the `{errors}`
  aggregate for `failLate`). **Attaching it mutates the original error**: an
  error object reused across results keeps only the latest `.failure`.

**Fallback for values that cannot carry a property.** A primitive throw value
(`string`, number, `undefined`, `null`), a frozen / non-extensible error object,
or an object that rejects the `.failure` attachment (a non-writable `failure`
own property, a setter-less accessor, a Proxy with a throwing trap) cannot take
`.failure`. In that case `assertOk` throws
`Error('pipelean: operation failed', {cause: underlying})` with `.failure`
attached. Code that matches on the stable `'pipelean: operation failed'` message
or reads `error.cause` only ever sees this fallback path (see the
[migration guide](migration.md#0150-assertok-throws-the-original-error)).

The result object is not mutated; only the thrown error is (and that is the
original error object).

**Caveats / validation**:
- **Throws `TypeError` before inspecting `failure`** when the argument is not a
  result:
  - an un-awaited Promise (any thenable) throws
    `TypeError('assertOk() expects an awaited result, not a Promise')` — otherwise
    the guard would silently return the Promise;
  - `undefined`, `null`, a primitive, an array, or a plain object without a
    `failure` property throws `TypeError('assertOk() expects a pipelean result')`.
- **`failure`, not `errors`**: `assertOk` asserts **no failure**, not "no
  errors". Under `collect` and `skip`, `failure` is `false` even when `errors` is
  non-empty, so `assertOk` returns the result untouched. It is a guard for
  ignored outcomes, not a way to turn `collect` into `rethrow`: choose
  `failFast` / `failLate` when you want a silent outcome to be impossible.
- Not a sync variant: it is synchronous and works on both async and sync
  results, so it is usable on either side of the sync/async split.
- Not an error strategy and does not change strategy defaults: it only decides
  whether a finished outcome is acceptable to ignore. `retry` and `tryCatch`
  remain the single-function wrappers; `recover` remains the fold-local seam.

**Example**:
```javascript
import {assertOk, series} from 'pipelean'

const result = assertOk(await series(jobs, importJob, {strategy: 'failFast'}))
// No failure: returns the same {results, errors, sourceErrors, failure: false}.

try {
  assertOk(await series(jobs, importJob, {strategy: 'failFast'}))
} catch (error) {
  console.error(error.message)      // the original mapper error's message
  console.error(error)              // same object the mapper threw
  console.error(error.failure)      // {item, error, index}
}
```

---

### retry

Retry async functions with configurable attempts and delays between attempts.

**Signature**: `retry(fn, options?) => retryFunction`

**Parameters**:
- `fn`: The async function to retry (required)
- `options`: Configuration object with the following properties:
  - `attempts`: `number` (default: `3`) - Number of retry attempts
  - `delay`: `number` (default: `0`) - Delay between retry attempts in milliseconds

**Returns**: a wrapper function with the same signature as `fn`.

**Failure behavior**:
- Retries on each attempt until successful or exhausted
- Throws the last error after exhausting all attempts
- No delay before first attempt
- Applies configured delay between subsequent attempts

**Caveats**: not an error strategy — the surrounding iterator's strategy still
sees the final failure. Composes into `pipe` / `series`.

**Example**:
```javascript
import {retry} from 'pipelean'

const flakyOperation = async () => {
  if (Math.random() > 0.5)
    throw new Error('transient')
  return 'ok'
}

const robust = retry(flakyOperation, {attempts: 5, delay: 1000})
const result = await robust()
```

---

### tryCatch

Wraps individual async functions with lifecycle hooks for comprehensive error
handling and telemetry. Always catches errors — returns `undefined` on failure,
the library-wide drop signal.

**Signature**: `tryCatch(fn, options?) => wrapperFunction`

**Parameters**:
- `fn`: The async function to wrap
- `options`: Configuration object with the following properties:
  - `onStart: () => void` — Called before function execution (no arguments)
  - `onSuccess: (result) => void | Promise<void>` — Called on successful completion (result only)
  - `onError: (error) => void` — Called on error (error only)
  - `onFinally: () => void` — Called regardless of success/failure (no arguments)

**Returns**: a wrapper function with the same signature as `fn`. Returns
`undefined` on error. Because `undefined` is the drop signal, a failed step
short-circuits `pipe` and drops the item when used as a `series` mapper.

**Failure behavior**:
- Automatic `async/await` wrapping; preserves original function signature
- Comprehensive lifecycle: onStart → onSuccess/onError → onFinally
- Deep telemetry support for debugging
- **A throwing (or rejecting) `onError` propagates.** It is awaited inside the
  `catch`, so an `onError` that throws replaces the original error as the
  rejection, and `onFinally` still runs. This is how you augment-and-rethrow:
  `onError: error => { throw Object.assign(error, {operation: 'charge'}) }`
  rejects with the *original* object, now carrying extra fields. A plain
  `onError` (logs, returns) still swallows and returns `undefined`.
  `tryCatchSync` has the same contract.

**Caveats**: not an error strategy — strategies belong to the iterators.
Composes with `pipe` (short-circuit) and `series` (drop) through the `undefined`
return. Sync twin: [tryCatchSync](#trycatchsync).

**Example**:
```javascript
import { tryCatch } from 'pipelean'

const safeFetch = tryCatch(
  async (url) => {
    const response = await fetch(url)
    return await response.json()
  },
  {
    onError: (error) => {
      console.error('Fetch failed:', error)
    }
  }
)

const data = await safeFetch('https://api.example.com')
// data is the parsed JSON on success, undefined on error
```

---

### delay

Promise-based wait.

**Signature**: `delay(ms) => Promise<void>`

**Returns**: a Promise that resolves after `ms` milliseconds.

**Example**:
```javascript
import {delay} from 'pipelean'

await delay(200)
```

For spacing between items inside a run, prefer the iterator's `pause` option —
it is abort-aware through `signal`; a bare `delay` is not.

---

## Shared behavior

### Cancellation with `signal`

`signal` (an `AbortSignal`) stops the run at the next safe boundary. It is checked before each item is processed and while a `pause` is pending. Aborting is a clean completion, not an error: it adds no `sourceErrors` and, with no earlier failure, the outcome is `failure: false`. Every result (or accumulator) completed before the abort is preserved.

- An aborted signal before the first item returns zero items and, for folds, the initial accumulator.
- Aborting during a `pause` resolves the wait immediately, then the loop stops without running another item.
- Aborting during an in-flight mapper or scanner does **not** interrupt it: the step finishes, its result/accumulator is kept, then the run stops before the pause.
- A pending `source.next()` is not interrupted either; the item it produces is fetched but not processed.
- `signal` composes with `stopWhen()` and `take` — they are independent stop conditions.

Callers inspect their own signal; there is no `aborted` field in the outcome.

Sync variants reject `signal` (and `pause`, `pauseOnErrors`) with a `TypeError`.

---

### Source errors

A **source error** is an error thrown by the iteration itself — the `for await` step (e.g. an async generator dying mid-stream because a DB connection was lost). This is distinct from an **operation error**, which is your `fn` throwing on an item.

A dead source is terminal: no more items can arrive, so iteration ends under every strategy. The error never reaches `onError`.

Every return path gains one additive field:

- `sourceErrors`: array of `{error, index}` contexts — no `item` key, because a source error has no item. `index` is the iteration index of the failed `.next()` call (a generator that yields 2 items then throws produces `index: 2`). Empty array when the source completed cleanly.

New option:

- `onSourceError({error, index})`: telemetry callback with the same contract as `onError`. Never called under `rethrow`. `onError` and `onSourceError` are mutually exclusive per error.

Per-strategy behavior when the source dies:

| Strategy | Behavior |
| --- | --- |
| `collect` | Results preserved, context recorded in `sourceErrors`, `failure: false` |
| `failFast` | `failure` = the source context, results cleared, accumulator (`value` in reduce mode) preserved |
| `failLate` | Results preserved, source contexts merged into end-of-run aggregation: `failure = {errors: [...errors, ...sourceErrors]}` |
| `skip` | Source errors ignored entirely: `sourceErrors: []`, results preserved, `failure: false` |
| `rethrow` | Throws immediately; no callbacks called |

```javascript
async function* pages(db) {
  while (true)
    yield await db.nextPage() // throws when the connection drops
}

const result = await series(pages(db), processPage, {
  strategy: collect,
  onSourceError: ({error, index}) => log.warn('source died', {error, index}),
})
// result.results holds every page processed before the drop
// result.sourceErrors = [{error, index}]
```

Cleanup follows native generator semantics: the generator's own `finally` runs during propagation, early exit via `take` still closes the iterator through `iterator.return()`, and if a `finally` itself throws, that error supersedes the original source error.

The sync variants handle source errors with the same semantics: `seriesSync`,
`filterSync`, `findSync`, `scanSync` and `reduceSync` accept
`onSourceError({error, index})` and report errors thrown by the iteration itself
in the `sourceErrors` field.

---

## Sync variants

`seriesSync`, `filterSync`, `findSync`, `scanSync`, `reduceSync`, `mapSeriesSync`,
`pipeSync`, `enrichSync`, and `tryCatchSync` are synchronous counterparts of the
core functions. `stopWhenSync` and `foreverSync` are the sync source adapters;
`foldSync` is the raw sync fold (no async twin).

They use the same error strategies and structured return conventions as the
async iteration functions, but return values directly instead of wrapped in a
Promise. Use them when your data and operations are synchronous and you still
want Pipelean's structured error collection.

**Shared rules**:

- Same strategies, same result shapes, same callbacks as the async twin — each
  entry below links to it.
- **Not supported in sync variants**:
  - `signal`, `pause` and `pauseOnErrors`, because they depend on async waiting and timers. Passing any of them throws a `TypeError` — they are never silently ignored
  - async iterables, because sync variants use plain synchronous iteration
- Source errors: same semantics as the async twins — see
  [Source errors](#source-errors).
- `scanSync` and `reduceSync` also support the fold-only `recover` option. It
  must be synchronous: returning a thenable is treated as the recover error (a
  `TypeError`) and handled by the active strategy.
- `assertOk` is not a sync variant: it is synchronous and works on both async
  and sync results, so it is usable on either side of the sync/async split.

### seriesSync

Sync twin of [series](#series): same options, callbacks, strategies and shape,
returning directly.

**Signature**: `seriesSync(items, fn, opts?) => {results, errors, sourceErrors, failure}` · curried: `seriesSync(fn, opts?)(items)`

**Default strategy**: `collect`

**Caveats**: sync iterables only; `signal` / `pause` / `pauseOnErrors` throw a
`TypeError`.

**Example**:
```javascript
import { seriesSync, collect } from 'pipelean'

const {results, errors, failure} = seriesSync([1, 2, 3], x => {
  if (x === 2)
    throw new Error('bang')
  return x * 10
}, {strategy: collect})

// results: [10, 30]
// errors: [{item: 2, error: Error('bang'), index: 1}]
// failure: false
```

---

### filterSync

Sync twin of [filter](#filter): keeps the original items whose predicate is
truthy; same predicate forms (function or object pattern via `where`).

**Signature**: `filterSync(items, predicate, opts?) => {results, errors, sourceErrors, failure}` · curried: `filterSync(predicate, opts?)(items)`

**Default strategy**: `collect`

**Caveats**: sync iterables only; async-only options rejected with a
`TypeError`. For the first match with early exit use [findSync](#findsync).

**Example**:
```javascript
import {filterSync} from 'pipelean'

const {results} = filterSync(users, {active: true})
```

---

### scanSync

Sync twin of [scan](#scan): fold keeping every intermediate accumulator.

**Signature**: `scanSync(iterable, scanner, initialValue, opts?) => {results, errors, sourceErrors, failure}`

**Default strategy**: `failFast` (clears `results` on failure, as `scan`)

**Caveats**: sync iterables only; async-only options rejected; `recover` must be
synchronous (a thenable is a `TypeError`). No `onProgress` / `take`.

**Example**:
```javascript
import {scanSync} from 'pipelean'

const {results} = scanSync([1, 2, 3], (acc, n) => acc + n, 0)
// results = [1, 3, 6]
```

---

### reduceSync

Sync twin of [reduce](#reduce): fold keeping the final accumulator.

**Signature**: `reduceSync(iterable, scanner, initialValue, opts?) => {value, errors, sourceErrors, failure}`

**Default strategy**: `failFast` (`value` survives, as `reduce`)

**Caveats**: sync iterables only; async-only options rejected; `recover` must be
synchronous. For a pure sync fold with no report, use [foldSync](#foldsync) —
`reduceSync(items, reducer, initial, {strategy: rethrow}).value` is exactly
`foldSync(items, reducer, initial)` (the `no-fold-rethrow` ESLint rule flags it).

**Example**:
```javascript
import {reduceSync} from 'pipelean'

const {value} = reduceSync([1, 2, 3], (acc, n) => acc + n, 0)
// value = 6
```

---

### mapSeriesSync

Sync twin of [mapSeries](#mapseries): sequential map with the strategy locked to
`rethrow`, returning a bare array.

**Signature**: `mapSeriesSync(items, fn, opts?) => Array` · curried: `mapSeriesSync(fn, opts?)(items)`

**Returns**: `Array` of the kept mapped values, in input order, or throws the
original error.

**Caveats / validation**:
- Sync iterables only: an async iterable is rejected with an explicit
  `TypeError` naming the async twin —
  `'mapSeriesSync() does not support async iterables; use mapSeries()'` —
  before iteration starts.
- `pause`, `pauseOnErrors` and `signal` are rejected with a `TypeError`, like
  every sync twin.
- Does not reject an async mapper: it is **not awaited**, so the returned
  Promise is stored as the value.
- Same strategy lock and rejected error callbacks as [mapSeries](#mapseries);
  `undefined` still drops the item.

**Example**:
```javascript
import {mapSeriesSync} from 'pipelean'

const rows = mapSeriesSync(records, record => toRow(record))
```

---

### pipeSync

Sync twin of [pipe](#pipe): composes synchronous functions left-to-right.

**Signature**: `pipeSync(...fns) => (input) => value`

**Caveats**: same `undefined` short-circuit as `pipe`; no error capture. An
async step is not awaited — its Promise flows as a value.

**Example**:
```javascript
import {pipeSync} from 'pipelean'

const normalize = pipeSync(x => x.trim(), x => x.toLowerCase())
normalize('  ABC  ') // 'abc'
```

---

### enrichSync

Sync twin of [enrich](#enrich): runs a state-enrichment pipeline synchronously.
Same strategies, same `onError` / `onFailure` semantics, same normalized error
shapes, and the same per-step hooks (`onStepStart` / `onStepSuccess`).

**Signature**: `enrichSync(operations, opts?) => (initialState) => {value, errors, failure}`

**Default strategy**: `collect`

**Caveats**: the hooks are called **fire-and-forget** rather than awaited, so
they must be synchronous — an async hook's rejection is never observed by the
strategy (a synchronous throw still is). Use it when your operations and inputs
are synchronous.

**Example**:
```javascript
import { enrichSync, collect } from 'pipelean'

const processAlbumSync = enrichSync([
  state => ({title: state.rawTitle.trim()}),
  state => ({year: parseYear(state.rawYear)}),
])

const {value, errors, failure} = processAlbumSync(input)
// value: the shallow-merged final state
// errors: []
// failure: false
```

---

### tryCatchSync

Sync twin of [tryCatch](#trycatch): wraps a synchronous function with lifecycle
hooks (`onStart`, `onSuccess`, `onError`, `onFinally`).

**Signature**: `tryCatchSync(fn, options?) => wrapperFunction`

**Returns**: `undefined` on failure (the drop signal). A throwing `onError`
propagates — same contract as `tryCatch`.

**Example**:
```javascript
import {tryCatchSync} from 'pipelean'

const safeParse = tryCatchSync(JSON.parse, {onError: e => log.warn(e.message)})
safeParse('{bad json') // undefined
```

---

### stopWhenSync

Sync twin of [stopWhen](#stopwhen): same contract, sync iterables only.

**Signature**: `stopWhenSync(items, predicate?) => iterable`

**Caveats**: the predicate is checked before each item is yielded; stopping is a
clean shorter run, and the abandoned source's cleanup still runs.

**Example**:
```javascript
import {stopWhenSync, seriesSync} from 'pipelean'

const {results} = seriesSync(stopWhenSync([1, 2, 3, 4], n => n > 2), n => n)
// results = [1, 2]
```

---

### foreverSync

Sync twin of [forever](#forever): unbounded ticks `0, 1, 2, …` for sync daemon
loops.

**Signature**: `foreverSync() => iterable<number>`

**Caveats**: every consumption must be bounded (`stopWhenSync`, `take`, or a
`break`); pair with `reduceSync` / `scanSync` for a stateful loop.

**Example**:
```javascript
import {foreverSync, stopWhenSync, reduceSync} from 'pipelean'

const {value} = reduceSync(
  stopWhenSync(foreverSync(), i => i >= 3),
  (acc, i) => acc + i,
  0,
)
// value = 3 — ticks 0, 1, 2
```

---

## Related Documentation

- **[README.md](../README.md)** - Project overview and quick start
- **[guide.md](guide.md)** - Core concepts and usage patterns
- **[examples.md](examples.md)** - Practical usage examples for all functions
- **[patterns.md](patterns.md)** - Error-handling recipes, daemon loops
- **[eslint.md](eslint.md)** - ESLint plugin rules and setup
- **[fp-mapping.md](fp-mapping.md)** - Pipelean for functional programmers
- **[architecture.md](architecture.md)** - Philosophy and design principles
- **[migration.md](migration.md)** - Upgrading from earlier versions
